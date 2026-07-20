/** Máximo de caracteres por label (cada label é capada nesse tamanho). */
const MAX_LABEL_CHARS = 20;

/** Máximo de labels distintas por task. */
const MAX_LABELS = 10;

/** Máximo de sugestões devolvidas por `sugerirLabels`. */
const MAX_SUGESTOES = 10;

/** Coage um item bruto de `raw` para string, ou null se não for coagível com segurança. */
function coagirItem(item: unknown): string | null {
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
    return String(item);
  }
  return null; // null/undefined/objetos/arrays não são coagidos (evita "[object Object]" etc.)
}

/**
 * Normaliza labels vindas de qualquer entrada não confiável (form, API, IA):
 * aceita só array; coage string/number/boolean para string (demais tipos são
 * descartados); trima espaços e descarta vazios; capa cada label em
 * MAX_LABEL_CHARS chars; dedup case-insensitive mantendo a primeira
 * ocorrência (com a grafia original); limita a MAX_LABELS labels no total.
 */
export function normalizarLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const vistas = new Set<string>();
  const resultado: string[] = [];

  for (const item of raw) {
    if (resultado.length >= MAX_LABELS) break;

    const coagido = coagirItem(item);
    if (coagido === null) continue;

    const trimada = coagido.trim();
    if (!trimada) continue;

    const capada = trimada.slice(0, MAX_LABEL_CHARS);
    const chave = capada.toLowerCase();
    if (vistas.has(chave)) continue;

    vistas.add(chave);
    resultado.push(capada);
  }

  return resultado;
}

/**
 * Sugere labels a partir das já usadas na org: recebe `tasks.labels` de
 * várias tasks (`usadas`), agrega por frequência (case-insensitive, mantendo
 * a grafia da primeira ocorrência) e devolve as top MAX_SUGESTOES mais
 * frequentes (desc). Empates preservam a ordem de primeira aparição (sort
 * estável).
 */
export function sugerirLabels(usadas: string[][]): string[] {
  const contagem = new Map<string, { display: string; freq: number }>();

  for (const labels of usadas) {
    for (const label of labels) {
      const trimada = typeof label === 'string' ? label.trim() : '';
      if (!trimada) continue;
      const chave = trimada.toLowerCase();
      const atual = contagem.get(chave);
      if (atual) {
        atual.freq += 1;
      } else {
        contagem.set(chave, { display: trimada, freq: 1 });
      }
    }
  }

  return [...contagem.values()]
    .sort((a, b) => b.freq - a.freq)
    .slice(0, MAX_SUGESTOES)
    .map((v) => v.display);
}
