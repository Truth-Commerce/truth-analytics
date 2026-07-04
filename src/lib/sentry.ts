import { serverEnv } from '@/lib/env';

/** Extrai do DSN (https://<key>@<host>/<projectId>) a URL da store API + a key. */
function parseDsn(dsn: string): { url: string; key: string } | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    if (!u.username || !projectId) return null;
    return { url: `${u.protocol}//${u.host}/api/${projectId}/store/`, key: u.username };
  } catch {
    return null;
  }
}

/**
 * Envia a exceção para o Sentry via store API (fetch puro, sem dependência).
 * SENTRY_DSN ausente = no-op. Nunca lança — observabilidade não quebra fluxo.
 */
export async function captureException(
  err: unknown,
  ctx?: Record<string, unknown>,
): Promise<void> {
  const dsn = serverEnv.SENTRY_DSN;
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) return;
  try {
    // Dentro do try: String(err) pode lançar (toString hostil) — nunca propaga.
    const e = err instanceof Error ? err : new Error(String(err));
    await fetch(parsed.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.key}, sentry_client=truth-analytics/1.0`,
      },
      body: JSON.stringify({
        message: e.message,
        level: 'error',
        platform: 'node',
        exception: { values: [{ type: e.name, value: e.message }] },
        extra: ctx ?? {},
        timestamp: Date.now() / 1000,
      }),
    });
  } catch {
    // nunca propaga
  }
}
