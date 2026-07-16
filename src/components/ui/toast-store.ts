/** Fila de toasts pura — testável em node, sem React. */
export type ToastVariant = 'success' | 'error' | 'info';

export type ToastAction = { label: string; onClick: () => void };

export type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  action?: ToastAction;
};

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  action?: ToastAction;
};

const MAX_TOASTS = 4;

export const AUTO_DISMISS_MS = 5000;

/**
 * Duração do auto-dismiss por variant. Erro é PERSISTENTE (null): o usuário
 * precisa ler e agir — sumir em 5s é perder a informação.
 */
export function duracaoDoToast(variant: ToastVariant): number | null {
  return variant === 'error' ? null : AUTO_DISMISS_MS;
}

export function addToast(list: ToastItem[], input: ToastInput, id: number): ToastItem[] {
  const item: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant: input.variant ?? 'info',
    action: input.action,
  };
  return [...list, item].slice(-MAX_TOASTS);
}

export function removeToast(list: ToastItem[], id: number): ToastItem[] {
  return list.filter((t) => t.id !== id);
}
