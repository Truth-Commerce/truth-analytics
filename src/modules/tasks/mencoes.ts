/**
 * Convenção de menção (H5/T3): `@handle` no texto do comentário, onde
 * `handle` é a PARTE LOCAL do e-mail do usuário (antes do "@"), comparado
 * case-insensitive contra os e-mails dos usuários da org (ver
 * `handleFromEmail` + `notificarMencoes` em task-notifications.ts).
 * Ex.: usuário financeiro@bazarmattos.com.br é mencionado como `@financeiro`.
 *
 * Para não confundir uma menção real com um e-mail solto no texto (ex.:
 * "manda pro financeiro@bazarmattos.com.br"), só conta como menção o "@"
 * que NÃO é precedido por um caractere de palavra — ou seja, precisa vir no
 * início da string ou depois de espaço/pontuação. Isso distingue
 * "@financeiro" (menção) de "financeiro@dominio.com" (e-mail em prosa, onde o
 * "@" é precedido por "o", um caractere de palavra).
 */
const MENCAO_RE = /(?<!\w)@([a-zA-Z0-9._+-]+)/g;

/** Extrai `@handle`s únicos (lowercase) de um texto livre, na ordem de primeira aparição. */
export function extrairMencoes(texto: string): string[] {
  if (!texto) return [];

  const vistos = new Set<string>();
  for (const match of texto.matchAll(MENCAO_RE)) {
    const bruto = match[1];
    if (!bruto) continue;
    // Pontuação de fim de frase (., _, -, +) colada ao handle não faz parte dele.
    const handle = bruto.replace(/[._+-]+$/, '');
    if (!handle) continue;
    vistos.add(handle.toLowerCase());
  }
  return [...vistos];
}

/** Parte local do e-mail (antes do "@"), em minúsculas — o "handle" de menção do usuário. */
export function handleFromEmail(email: string): string {
  return (email.split('@')[0] ?? '').toLowerCase();
}

export type SegmentoMencao = { tipo: 'texto'; valor: string } | { tipo: 'mencao'; valor: string };

/**
 * Divide um texto livre em segmentos alternando texto comum e `@handle`
 * (mesma convenção/regex de `extrairMencoes`) — insumo para renderizar o
 * handle destacado em componentes React SEM `dangerouslySetInnerHTML` (H5/T5,
 * ver `TaskComments.tsx`). O valor do segmento `mencao` preserva a grafia
 * original (inclui o "@"), só sem a pontuação de fim de frase colada (mesmo
 * trim de `extrairMencoes` — o texto destacado é exatamente o que dispara
 * `notificarMencoes`, nem mais nem menos).
 */
export function dividirPorMencoes(texto: string): SegmentoMencao[] {
  if (!texto) return [];

  const segmentos: SegmentoMencao[] = [];
  let cursor = 0;

  for (const match of texto.matchAll(MENCAO_RE)) {
    const inicio = match.index ?? 0;
    const bruto = match[0];
    const pontuacaoFinal = /[._+-]+$/.exec(bruto)?.[0] ?? '';
    const mencao = pontuacaoFinal ? bruto.slice(0, bruto.length - pontuacaoFinal.length) : bruto;
    if (mencao === '@') continue; // handle vazio após tirar a pontuação (ex.: "@.") não é destaque real

    if (inicio > cursor) segmentos.push({ tipo: 'texto', valor: texto.slice(cursor, inicio) });
    segmentos.push({ tipo: 'mencao', valor: mencao });
    cursor = inicio + mencao.length;
  }

  if (cursor < texto.length) segmentos.push({ tipo: 'texto', valor: texto.slice(cursor) });

  return segmentos;
}
