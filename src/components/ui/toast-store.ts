/** Fila de toasts pura — testável em node, sem React. */
export type ToastVariant = 'success' | 'error' | 'info';

export type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
};

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

const MAX_TOASTS = 4;

export function addToast(list: ToastItem[], input: ToastInput, id: number): ToastItem[] {
  const item: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant: input.variant ?? 'info',
  };
  return [...list, item].slice(-MAX_TOASTS);
}

export function removeToast(list: ToastItem[], id: number): ToastItem[] {
  return list.filter((t) => t.id !== id);
}
