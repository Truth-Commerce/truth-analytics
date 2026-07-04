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
