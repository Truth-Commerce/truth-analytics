import type { z } from 'zod';
import type { OlistRequestPriority } from './rate-governor.repository';
import { getValidAccessTokenForProvider } from '@/modules/connections/provider-connection.repository';
import { observeOlistRateHeaders, reserveOlistRequest } from './rate-governor.repository';

export const WORST_CASE_OLIST_REQUEST_MS = 60_000;
export class OlistDataError extends Error { constructor(public readonly code: string, public readonly kind: 'transient' | 'permanent' | 'auth', public readonly status?: number) { super(code); } }
export async function fetchOlistJson<T>(input: { orgId: string; priority: OlistRequestPriority; path: string; query?: Record<string, string>; schema: z.ZodType<T>; accountFingerprint?: string; signal?: AbortSignal }): Promise<T> {
  if (!input.path.startsWith('/') || input.path.startsWith('//')) throw new OlistDataError('olist_path_invalid', 'permanent');
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), WORST_CASE_OLIST_REQUEST_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
  try {
    const url = new URL(input.path, process.env.OLIST_API_BASE ?? 'https://api.erp.olist.com');
    for (const [key, value] of Object.entries(input.query ?? {})) url.searchParams.set(key, value);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal.aborted) throw new OlistDataError('olist_deadline_exceeded', 'transient');
      if (input.accountFingerprint) await reserveOlistRequest({ accountFingerprint: input.accountFingerprint, priority: input.priority });
      const token = await getValidAccessTokenForProvider(input.orgId, 'olist');
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
      try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: requestSignal });
        if (signal.aborted) throw new OlistDataError('olist_deadline_exceeded', 'transient');
        if (input.accountFingerprint) await observeOlistRateHeaders(input.accountFingerprint, response.headers);
        if (response.status === 401) throw new OlistDataError('olist_nao_autorizado', 'auth', 401);
        if (response.status === 429 || response.status >= 500) {
          if (attempt === 0) continue;
          throw new OlistDataError('olist_indisponivel', 'transient', response.status);
        }
        if (!response.ok) throw new OlistDataError('olist_resposta_invalida', 'permanent', response.status);
        const parsed = input.schema.safeParse(await response.json());
        if (!parsed.success) throw new OlistDataError('olist_payload_invalido', 'permanent', response.status);
        return parsed.data;
      } catch (error) {
        if (error instanceof OlistDataError) throw error;
        if (attempt === 1 || signal.aborted) throw new OlistDataError('olist_indisponivel', 'transient');
      }
    }
    throw new OlistDataError('olist_indisponivel', 'transient');
  } finally { clearTimeout(deadline); }
}
