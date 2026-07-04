import { describe, expect, it } from 'vitest';

import { addToast, removeToast, type ToastItem } from '@/components/ui/toast-store';

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
});
