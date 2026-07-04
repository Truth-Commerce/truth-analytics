import { describe, expect, it } from 'vitest';

import { DUR, EASE_TRUTH, fadeLift, staggerContainer } from '@/lib/motion';

describe('motion tokens', () => {
  it('EASE_TRUTH é o easing assinatura do site', () => {
    expect(EASE_TRUTH).toEqual([0.16, 1, 0.3, 1]);
  });

  it('fadeLift entra de baixo com o easing assinatura', () => {
    expect(fadeLift.hidden).toEqual({ opacity: 0, y: 16 });
    expect(fadeLift.visible).toMatchObject({
      opacity: 1,
      y: 0,
      transition: { duration: DUR.base, ease: EASE_TRUTH },
    });
  });

  it('staggerContainer escalona filhos', () => {
    expect(staggerContainer.visible).toMatchObject({
      transition: { staggerChildren: 0.08, delayChildren: 0.05 },
    });
  });
});
