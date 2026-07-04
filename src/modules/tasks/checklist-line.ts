// ---------------------------------------------------------------------------
// toggleChecklistLine — helper puro, exportado para unit test.
// Reescreve a linha `index` de uma descrição em markdown-checklist
// (`- [ ] item` / `- [x] item`). Index fora do range, ou linha que não é um
// item de checklist, deixa a string intacta.
//
// Vive fora de `tasks.actions.ts` (arquivo `'use server'`) porque, a partir da
// Task 8, esse módulo passou a ser importado por um Client Component
// (`AchadosParaTasks`) — e o Next exige que TODO export de um arquivo
// `'use server'` seja uma server action (função async). Uma função pura
// síncrona ali quebra o build assim que o arquivo entra no bundle do cliente.
// ---------------------------------------------------------------------------
export const CHECKLIST_UNCHECKED = '- [ ] ';
export const CHECKLIST_CHECKED = '- [x] ';

export function toggleChecklistLine(descricao: string, index: number): string {
  const lines = descricao.split('\n');
  if (index < 0 || index >= lines.length) return descricao;

  const line = lines[index]!;
  if (line.startsWith(CHECKLIST_UNCHECKED)) {
    lines[index] = CHECKLIST_CHECKED + line.slice(CHECKLIST_UNCHECKED.length);
  } else if (line.startsWith(CHECKLIST_CHECKED)) {
    lines[index] = CHECKLIST_UNCHECKED + line.slice(CHECKLIST_CHECKED.length);
  } else {
    return descricao; // não é uma linha de checklist — intacta
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// parseChecklist — extrai os itens de checklist de uma descrição em
// markdown (`- [ ] item` / `- [x] item`), na ordem em que aparecem. Linhas
// de texto livre (incluindo em branco) são ignoradas. Descrição sem itens
// de checklist retorna lista vazia.
//
// `linha` é o índice da linha CRUA em `descricao.split('\n')` — não a
// posição no array já filtrado. É esse índice que deve ser enviado de volta
// a `toggleChecklistLine`, que opera sobre as linhas cruas da descrição; se
// a descrição tiver texto livre antes do checklist, a posição no array
// filtrado e o índice de linha divergem.
// ---------------------------------------------------------------------------
export function parseChecklist(descricao: string): Array<{ texto: string; feito: boolean; linha: number }> {
  return descricao
    .split('\n')
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => line.startsWith(CHECKLIST_UNCHECKED) || line.startsWith(CHECKLIST_CHECKED))
    .map(({ line, i }) => {
      const feito = line.startsWith(CHECKLIST_CHECKED);
      const texto = line.slice(feito ? CHECKLIST_CHECKED.length : CHECKLIST_UNCHECKED.length);
      return { texto, feito, linha: i };
    });
}
