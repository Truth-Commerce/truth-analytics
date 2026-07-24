import React from 'react';

import { renderMarkdownSeguro } from '@/modules/tasks/markdown';

interface MarkdownProps {
  texto: string;
  className?: string;
}

/**
 * Renderiza descrição de ticket em markdown leve (negrito/itálico/lista/
 * link/quebras de linha). SEGURANÇA: este é o ÚNICO lugar do app que usa
 * `dangerouslySetInnerHTML`, e ele SÓ recebe o output de
 * `renderMarkdownSeguro` (que já escapou todo HTML da entrada antes de
 * aplicar as transformações de markdown — ver `modules/tasks/markdown.ts`).
 * Nunca passar `texto` bruto do usuário direto para `dangerouslySetInnerHTML`
 * em nenhum outro componente — sempre passar por `renderMarkdownSeguro`.
 */
export function Markdown({ texto, className = '' }: MarkdownProps) {
  const html = renderMarkdownSeguro(texto);
  return (
    <div
      className={`text-sm text-ink-soft [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-0.5 [&_a]:text-brand-strong [&_a]:underline [&_strong]:font-semibold [&_strong]:text-ink ${className}`}
      // eslint-disable-next-line react/no-danger -- único uso permitido: html vem de renderMarkdownSeguro (já escapado)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
