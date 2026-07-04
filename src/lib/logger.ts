import { captureException } from '@/lib/sentry';

type Nivel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = {
  requestId?: string;
  orgId?: string;
  reportId?: string;
  [key: string]: unknown;
};

function emit(nivel: Nivel, msg: string, ctx?: LogContext, err?: unknown): void {
  const ts = new Date().toISOString();
  let out: string;
  try {
    // TODA a montagem fica dentro do try: o spread avalia getters do ctx,
    // e String(err) pode lançar (toString hostil) — logger nunca lança.
    const linha: Record<string, unknown> = { ts, nivel, msg, ...ctx };
    if (err !== undefined) {
      linha.erro =
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : String(err);
    }
    out = JSON.stringify(linha);
  } catch {
    // ctx/err não serializável (getter hostil, referência circular, BigInt,
    // toString/toJSON que lança): observabilidade nunca quebra o fluxo.
    out = JSON.stringify({ ts, nivel, msg, ctxSerializationError: true });
  }
  if (nivel === 'error') console.error(out);
  else if (nivel === 'warn') console.warn(out);
  else console.log(out);
  if (nivel === 'error') void captureException(err ?? new Error(msg), ctx);
}

export const logger = {
  debug: (msg: string, ctx?: LogContext): void => emit('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext): void => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext, err?: unknown): void => emit('warn', msg, ctx, err),
  error: (msg: string, ctx?: LogContext, err?: unknown): void => emit('error', msg, ctx, err),
};

export type Logger = typeof logger;

export function createLogger(base: LogContext): Logger {
  return {
    debug: (msg, ctx) => emit('debug', msg, { ...base, ...ctx }),
    info: (msg, ctx) => emit('info', msg, { ...base, ...ctx }),
    warn: (msg, ctx, err) => emit('warn', msg, { ...base, ...ctx }, err),
    error: (msg, ctx, err) => emit('error', msg, { ...base, ...ctx }, err),
  };
}
