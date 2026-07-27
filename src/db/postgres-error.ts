const MAX_CAUSE_DEPTH = 16;

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function readProperty(value: object, property: 'code' | 'cause'): unknown {
  try {
    return (value as Record<string, unknown>)[property];
  } catch {
    return undefined;
  }
}

export function hasPostgresErrorCode(error: unknown, code: string): boolean {
  const seen = new Set<object>();
  let current = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!isObject(current) || seen.has(current)) return false;
    seen.add(current);

    if (readProperty(current, 'code') === code) return true;
    current = readProperty(current, 'cause');
  }

  return false;
}
