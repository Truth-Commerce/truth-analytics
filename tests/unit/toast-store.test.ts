import { describe, expect, it } from 'vitest';

import {
  AUTO_DISMISS_MS,
  addToast,
  duracaoDoToast,
  removeToast,
  type ToastItem,
} from '@/components/ui/toast-store';

describe('toast-store', () => {
  it('addToast adiciona com defaults e id fornecido', () => {
    const list = addToast([], { title: 'Salvo' }, 1);
    expect(list).toEqual([{ id: 1, title: 'Salvo', description: undefined, variant: 'info' }]);
  });

  it('mantém no máximo 4 toasts (descarta os mais antigos)', () => {
    let list: ToastItem[] = [];
    for (let i = 1; i <= 6; i++) list = addToast(list, { title: `t${i}` }, i);
    expect(list).toHaveLength(4);
    expect(list[0].title).toBe('t3');
    expect(list[3].title).toBe('t6');
  });

  it('removeToast remove por id', () => {
    const list = addToast(addToast([], { title: 'a' }, 1), { title: 'b' }, 2);
    expect(removeToast(list, 1).map((t) => t.id)).toEqual([2]);
  });

  it('duracaoDoToast: success/info expiram em AUTO_DISMISS_MS; error é persistente (null)', () => {
    expect(duracaoDoToast('success')).toBe(AUTO_DISMISS_MS);
    expect(duracaoDoToast('info')).toBe(AUTO_DISMISS_MS);
    expect(duracaoDoToast('error')).toBeNull();
  });

  it('addToast preserva o slot de ação opcional', () => {
    const onClick = () => {};
    const list = addToast([], { title: 'Task movida', action: { label: 'Desfazer', onClick } }, 7);
    expect(list[0]!.action).toEqual({ label: 'Desfazer', onClick });
  });
});
