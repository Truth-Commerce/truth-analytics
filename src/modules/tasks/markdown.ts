/**
 * Markdown leve e seguro para descrição de ticket (H5/T4). XSS é o risco
 * central: a ORDEM importa — este módulo primeiro escapa TODO o HTML da
 * entrada (então qualquer `<script>`, `<img onerror>`, aspas etc. do usuário
 * viram entidades inertes) e só DEPOIS aplica as transformações de markdown
 * sobre o texto já escapado. Como as transformações rodam em cima de texto
 * escapado, o único HTML que aparece no resultado é o que ESTE módulo emite
 * (`<p>`, `<strong>`, `<em>`, `<ul>/<li>`, `<a>`, `<br>`) — nunca HTML do
 * usuário.
 *
 * Sem lib nova: parser mínimo por regex, suficiente para negrito/itálico/
 * lista/link/quebra de linha. Sem robustez de markdown completo de propósito
 * (ex.: `*` sem par vira texto literal; não há blockquote/código/tabela).
 */

/**
 * Escapa caracteres especiais de HTML. Mesma lógica de
 * `modules/notifications/templates.ts#escapeHtml`, duplicada aqui (não
 * importada) para manter este módulo puro e sem acoplamento entre domínios
 * (tasks não depende de notifications). A ordem importa: `&` primeiro,
 * senão os `&amp;` gerados pelas trocas seguintes seriam escapados de novo
 * (double-escaping).
 */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Só http:// e https:// passam — qualquer outro esquema (javascript:, data:, relativo, protocol-relative) é rejeitado. */
const HTTP_URL_RE = /^https?:\/\/\S+$/i;

/**
 * Aplica negrito/itálico/link sobre uma linha JÁ ESCAPADA (nunca chamar com
 * texto cru). Ordem interna: negrito antes de itálico (senão os `**` seriam
 * lidos como dois `*` de itálico); link por último, para que o rótulo `[texto]`
 * já chegue com negrito/itálico resolvidos.
 */
function transformarInline(linhaEscapada: string): string {
  let out = linhaEscapada;

  // **negrito** — non-greedy, não cruza quebra de linha (linha já é uma única linha).
  out = out.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');

  // *itálico* — o que sobrou de `*` isolado (conteúdo não pode ter outro `*`).
  out = out.replace(/\*([^\n*]+?)\*/g, '<em>$1</em>');

  // [texto](url) — só vira âncora real se a url for http(s); senão, neutraliza
  // (sobra só o texto visível, sem nenhum vestígio do esquema/valor da url).
  // O grupo da url aceita 1 nível de parênteses balanceados dentro dela (ex.:
  // "javascript:alert(1)" ou uma URL real tipo ".../wiki/Foo_(bar)") — sem
  // isso, o primeiro ")" interno fecharia o link cedo e vazaria o ")" restante
  // como texto solto depois do link.
  out = out.replace(/\[([^\]\n]*)\]\(((?:[^()\n]|\([^()\n]*\))*)\)/g, (_all, rotulo: string, url: string) => {
    const alvo = url.trim();
    if (HTTP_URL_RE.test(alvo)) {
      return `<a href="${alvo}" target="_blank" rel="noopener noreferrer nofollow">${rotulo}</a>`;
    }
    return rotulo;
  });

  return out;
}

/**
 * Renderiza markdown leve (negrito/itálico/lista/link/quebras de linha) de
 * descrição de ticket para HTML SEGURO para injetar via
 * `dangerouslySetInnerHTML` (ver `components/ui/Markdown.tsx`). Todo o HTML
 * de entrada é escapado antes de qualquer transformação — ver comentário de
 * topo do arquivo.
 */
export function renderMarkdownSeguro(texto: string): string {
  if (!texto) return '';

  const escapado = escapeHtml(texto);
  const linhas = escapado.split('\n');

  const blocos: string[] = [];
  let listaAtual: string[] = [];
  let paragrafoAtual: string[] = [];

  const fecharLista = () => {
    if (listaAtual.length === 0) return;
    blocos.push(`<ul>${listaAtual.map((li) => `<li>${li}</li>`).join('')}</ul>`);
    listaAtual = [];
  };
  const fecharParagrafo = () => {
    if (paragrafoAtual.length === 0) return;
    blocos.push(`<p>${paragrafoAtual.join('<br>')}</p>`);
    paragrafoAtual = [];
  };

  for (const linhaBruta of linhas) {
    const linha = linhaBruta.trim();

    if (linha === '') {
      fecharLista();
      fecharParagrafo();
      continue;
    }

    const itemLista = /^-\s+(.*)$/.exec(linha);
    if (itemLista) {
      fecharParagrafo();
      listaAtual.push(transformarInline(itemLista[1] ?? ''));
    } else {
      fecharLista();
      paragrafoAtual.push(transformarInline(linha));
    }
  }

  fecharLista();
  fecharParagrafo();

  return blocos.join('');
}
