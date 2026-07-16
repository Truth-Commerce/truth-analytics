/**
 * Decide se um href é navegação interna do App Router (next/link) ou precisa
 * de <a> cru: /api/* é resposta binária/download (PDF), // é protocol-relative
 * (externo), hash puro é âncora na própria página.
 */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/api/');
}
