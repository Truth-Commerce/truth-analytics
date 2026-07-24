/**
 * Motion system Truth — easing assinatura do truthcommerce.com.br,
 * variants reutilizáveis e count-up. prefers-reduced-motion é respeitado
 * globalmente via <MotionProvider> (MotionConfig reducedMotion="user");
 * useCountUp checa o hook useReducedMotion diretamente.
 */
import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';

export const EASE_TRUTH = [0.16, 1, 0.3, 1] as const;

export const DUR = { fast: 0.18, base: 0.22, slow: 0.4 } as const;

/** Entrada padrão de cards/seções: fade + lift. */
export const fadeLift: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.base, ease: EASE_TRUTH },
  },
};

/** Container que escalona a entrada dos filhos (usar com fadeLift nos filhos). */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

/**
 * Anima um número de 0 até `target` (Space Mono nos consumidores).
 * Com prefers-reduced-motion, retorna `target` direto (sem animação).
 */
export function useCountUp(target: number, durationS = 1.1): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const controls = animate(0, target, {
      duration: durationS,
      ease: EASE_TRUTH,
      onUpdate: (v) => setValue(v),
    });
    return () => controls.stop();
  }, [target, durationS, reduced]);

  return value;
}
