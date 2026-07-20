import { describe, expect, it } from 'vitest';

import { renderMarkdownSeguro } from '@/modules/tasks/markdown';

describe('renderMarkdownSeguro', () => {
  describe('happy paths', () => {
    it('texto puro vira parágrafo', () => {
      expect(renderMarkdownSeguro('Olá mundo')).toBe('<p>Olá mundo</p>');
    });

    it('negrito **x**', () => {
      expect(renderMarkdownSeguro('isso é **importante** aqui')).toBe(
        '<p>isso é <strong>importante</strong> aqui</p>',
      );
    });

    it('itálico *x*', () => {
      expect(renderMarkdownSeguro('isso é *sutil* aqui')).toBe('<p>isso é <em>sutil</em> aqui</p>');
    });

    it('negrito e itálico na mesma linha', () => {
      expect(renderMarkdownSeguro('**forte** e *leve*')).toBe('<p><strong>forte</strong> e <em>leve</em></p>');
    });

    it('lista de itens "- "', () => {
      expect(renderMarkdownSeguro('- item 1\n- item 2\n- item 3')).toBe(
        '<ul><li>item 1</li><li>item 2</li><li>item 3</li></ul>',
      );
    });

    it('link http:// vira âncora real', () => {
      expect(renderMarkdownSeguro('[ver relatório](http://ok.com)')).toBe(
        '<p><a href="http://ok.com" target="_blank" rel="noopener noreferrer nofollow">ver relatório</a></p>',
      );
    });

    it('link https:// vira âncora real', () => {
      expect(renderMarkdownSeguro('[ver relatório](https://ok.com/x)')).toBe(
        '<p><a href="https://ok.com/x" target="_blank" rel="noopener noreferrer nofollow">ver relatório</a></p>',
      );
    });

    it('quebra de linha simples dentro do mesmo parágrafo vira <br>', () => {
      expect(renderMarkdownSeguro('linha 1\nlinha 2')).toBe('<p>linha 1<br>linha 2</p>');
    });

    it('linha em branco separa parágrafos', () => {
      expect(renderMarkdownSeguro('primeiro\n\nsegundo')).toBe('<p>primeiro</p><p>segundo</p>');
    });

    it('texto + lista + texto vira parágrafo, lista, parágrafo', () => {
      expect(renderMarkdownSeguro('antes\n- a\n- b\ndepois')).toBe(
        '<p>antes</p><ul><li>a</li><li>b</li></ul><p>depois</p>',
      );
    });

    it('string vazia retorna string vazia', () => {
      expect(renderMarkdownSeguro('')).toBe('');
    });

    it('marcador aninhado/adjacente razoável: negrito envolvendo link', () => {
      expect(renderMarkdownSeguro('**[abrir](http://ok.com)**')).toBe(
        '<p><strong><a href="http://ok.com" target="_blank" rel="noopener noreferrer nofollow">abrir</a></strong></p>',
      );
    });

    it('marcador aninhado/adjacente razoável: link com negrito no texto', () => {
      expect(renderMarkdownSeguro('[**abrir**](http://ok.com)')).toBe(
        '<p><a href="http://ok.com" target="_blank" rel="noopener noreferrer nofollow"><strong>abrir</strong></a></p>',
      );
    });
  });

  describe('segurança — escape ANTES de transformar (XSS é o risco central)', () => {
    it('escapa <script> cru: nunca vira tag viva', () => {
      const out = renderMarkdownSeguro('<script>alert(1)</script>');
      expect(out).not.toContain('<script');
      expect(out).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    });

    it('escapa <img onerror=...>', () => {
      const out = renderMarkdownSeguro('<img src=x onerror="alert(1)">');
      expect(out).not.toMatch(/<img(?!\s*&)/); // nunca uma tag <img real
      expect(out).toContain('&lt;img');
      expect(out).not.toContain('onerror="alert');
    });

    it('escapa aspas duplas e & isoladamente', () => {
      expect(renderMarkdownSeguro('Tom & Jerry "aventuras"')).toBe(
        '<p>Tom &amp; Jerry &quot;aventuras&quot;</p>',
      );
    });

    it('escapa aspas simples', () => {
      expect(renderMarkdownSeguro("o cliente disse 'ok'")).toBe('<p>o cliente disse &#39;ok&#39;</p>');
    });

    it('link javascript: é neutralizado — sobra só o texto, sem esquema perigoso', () => {
      const out = renderMarkdownSeguro('[clique](javascript:alert(1))');
      expect(out).not.toContain('javascript:');
      expect(out).not.toContain('<a ');
      expect(out).toBe('<p>clique</p>');
    });

    it('link data: é neutralizado', () => {
      const out = renderMarkdownSeguro('[abrir](data:text/html,<script>alert(1)</script>)');
      expect(out).not.toContain('data:');
      expect(out).not.toContain('<a ');
    });

    it('link protocol-relative (//) não vira âncora', () => {
      const out = renderMarkdownSeguro('[abrir](//evil.com)');
      expect(out).not.toContain('<a ');
      expect(out).toBe('<p>abrir</p>');
    });

    it('link relativo (/x) não vira âncora', () => {
      const out = renderMarkdownSeguro('[abrir](/relative)');
      expect(out).not.toContain('<a ');
      expect(out).toBe('<p>abrir</p>');
    });

    it('link com espaço/maiúsculas ao redor do esquema ainda é neutralizado se não for http(s)', () => {
      const out = renderMarkdownSeguro('[abrir](  javascript:alert(1)  )');
      expect(out).not.toContain('javascript:');
    });
  });

  describe('invariante anti-XSS (bateria de entradas maliciosas)', () => {
    const entradasMaliciosas = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '[x](javascript:alert(1))',
      '[x](JaVaScRiPt:alert(1))',
      '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
      '**<script>alert(1)</script>**',
      '*<img src=x onerror=alert(1)>*',
      '- <script>alert(1)</script>',
      '[<script>alert(1)</script>](http://ok.com)',
      '"><script>alert(1)</script>',
      '\'><script>alert(1)</script>',
      '<a href="javascript:alert(1)">x</a>',
      '<div onclick="alert(1)">x</div>',
    ];

    // Nota: checar a string toda por substrings cruas como "javascript:" ou
    // "onload=" dá falso positivo, porque essas palavras NÃO têm caractere
    // HTML especial (não são tocadas por escapeHtml) — elas sobrevivem como
    // TEXTO INERTE dentro de `<p>...</p>` (ex.: "&lt;svg onload=...&gt;"),
    // o que é seguro (não há "<" cru ali, só a entidade "&lt;"). O invariante
    // real de segurança é: (1) nunca um `<script` CRU (tag viva) — só pode
    // vir de HTML do usuário, que já foi escapado; (2) nunca um `href="..."`
    // com esquema != http(s) — checa a URL de qualquer âncora REAL emitida;
    // (3) nunca um atributo `on\w+=` dentro de uma tag CRUA (viva) — distingue
    // de "onload=" aparecendo como texto solto dentro de uma tag já escapada.
    it.each(entradasMaliciosas)('nunca emite <script vivo, href com esquema perigoso, ou on\\w+= em tag viva: %s', (entrada) => {
      const out = renderMarkdownSeguro(entrada);

      // (1) nenhuma tag <script> crua (o `<` de "<script" do usuário sempre
      // vira "&lt;script" — só nós emitimos "<" cru, e nunca para "script").
      expect(out).not.toMatch(/<script/i);

      // (2) toda âncora REAL emitida (<a href="...">) tem esquema http(s).
      for (const href of out.matchAll(/<a href="([^"]*)"/gi)) {
        expect(href[1]).toMatch(/^https?:\/\//i);
      }
      expect(out).not.toMatch(/href\s*=\s*"\s*javascript:/i);

      // (3) nenhuma tag viva (delimitada por `<...>` cru) carrega atributo
      // de evento — distinto de "onload="/"onclick=" aparecerem como texto
      // solto (já escapado) dentro de um <p>.
      expect(out).not.toMatch(/<[a-z][^>]*\son\w+\s*=/i);
    });
  });
});
