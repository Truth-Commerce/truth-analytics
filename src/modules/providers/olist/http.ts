import type { z } from 'zod';
import type { OlistRequestPriority } from './rate-governor.repository';
import { getOlistAccountFingerprint, getValidAccessTokenForProvider } from '@/modules/connections/provider-connection.repository';
import { renewOlistConnection } from '@/modules/connections/olist-token-renewal';
import { observeOlistRateHeaders, reserveOlistRequest } from './rate-governor.repository';

export const WORST_CASE_OLIST_REQUEST_MS = 60_000;
export const OLIST_REQUEST_TIMEOUT_MS = 10_000;
export class OlistDataError extends Error {
  constructor(public readonly code: string, public readonly kind: 'transient' | 'permanent' | 'auth', public readonly status?: number) { super(code); }
}
export type OlistDeadlineContext = { deadlineAt: number; signal: AbortSignal };

export function createOlistDeadlineContext(input?: { signal?: AbortSignal; deadlineAt?: number }): OlistDeadlineContext {
  const controller = new AbortController();
  const deadlineAt = input?.deadlineAt ?? Date.now() + WORST_CASE_OLIST_REQUEST_MS;
  const remaining = Math.max(0, deadlineAt - Date.now());
  const timer = setTimeout(() => controller.abort(), remaining);
  const signal = input?.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return { deadlineAt, signal };
}

export async function fetchOlistJson<T>(input: { orgId: string; priority: OlistRequestPriority; path: string; query?: Record<string, string>; schema: z.ZodType<T>; signal?: AbortSignal; deadlineAt?: number }): Promise<T> {
  if (!input.path.startsWith('/') || input.path.startsWith('//')) throw new OlistDataError('olist_path_invalid', 'permanent');
  const context = createOlistDeadlineContext(input);
  try {
    const fingerprint = await abortable(getOlistAccountFingerprint(input.orgId), context);
    if (!fingerprint) throw new OlistDataError('olist_conta_nao_validada', 'auth');
    const url = new URL(input.path, process.env.OLIST_API_BASE ?? 'https://api.erp.olist.com');
    for (const [key, value] of Object.entries(input.query ?? {})) url.searchParams.set(key, value);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      ensureActive(context);
      const reservation = await abortable(reserveOlistRequest({ accountFingerprint: fingerprint, priority: input.priority, signal: context.signal }), context);
      await waitUntil(reservation.startAt.getTime(), context);
      let token = await abortable(getValidAccessTokenForProvider(input.orgId, 'olist'), context);
      let response = await request(url, token, context);
      if (response.status === 401 && attempt === 0) {
        const renewal = await abortable(renewOlistConnection(input.orgId, new Date(), { force: true, signal: context.signal, deadlineAt: context.deadlineAt }), context);
        if (renewal !== 'renewed') throw new OlistDataError('olist_nao_autorizado', 'auth', 401);
        token = await abortable(getValidAccessTokenForProvider(input.orgId, 'olist', 0), context);
        response = await request(url, token, context);
      }
      ensureActive(context);
      await abortable(observeOlistRateHeaders(fingerprint, response.headers, context.signal), context);
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 0) { await retryAfter(response.headers, context); continue; }
        throw new OlistDataError('olist_indisponivel', 'transient', response.status);
      }
      if (response.status === 401) throw new OlistDataError('olist_nao_autorizado', 'auth', 401);
      if (!response.ok) throw new OlistDataError('olist_resposta_invalida', 'permanent', response.status);
      const payload = await abortable(response.json(), context);
      const parsed = input.schema.safeParse(payload);
      if (!parsed.success) throw new OlistDataError('olist_payload_invalido', 'permanent', response.status);
      return parsed.data;
    }
    throw new OlistDataError('olist_indisponivel', 'transient');
  } catch (error) {
    if (error instanceof OlistDataError) throw error;
    if (context.signal.aborted || error instanceof DOMException && error.name === 'AbortError') throw new OlistDataError('olist_deadline_exceeded', 'transient');
    throw new OlistDataError('olist_indisponivel', 'transient');
  }
}

async function request(url: URL, token: string, context: OlistDeadlineContext): Promise<Response> {
  ensureActive(context);
  const local = AbortSignal.timeout(Math.min(OLIST_REQUEST_TIMEOUT_MS, remaining(context)));
  return abortable(fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.any([context.signal, local]) }), context);
}
function remaining(context: OlistDeadlineContext) { return Math.max(0, context.deadlineAt - Date.now()); }
function ensureActive(context: OlistDeadlineContext) { if (context.signal.aborted || remaining(context) <= 0) throw new OlistDataError('olist_deadline_exceeded', 'transient'); }
function abortable<T>(promise: Promise<T>, context: OlistDeadlineContext): Promise<T> {
  ensureActive(context);
  return new Promise((resolve, reject) => {
    const abort = () => reject(new OlistDataError('olist_deadline_exceeded', 'transient'));
    context.signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { context.signal.removeEventListener('abort', abort); if (context.signal.aborted) abort(); else resolve(value); }, error => { context.signal.removeEventListener('abort', abort); reject(error); });
  });
}
function waitUntil(at: number, context: OlistDeadlineContext): Promise<void> {
  const ms = Math.min(Math.max(0, at - Date.now()), remaining(context));
  return abortable(new Promise(resolve => setTimeout(resolve, ms)), context);
}
function retryAfter(headers: Headers, context: OlistDeadlineContext): Promise<void> {
  const seconds = Number(headers.get('retry-after'));
  return waitUntil(Date.now() + Math.min(30_000, Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : 0)), context);
}
