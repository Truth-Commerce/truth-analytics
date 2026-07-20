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
