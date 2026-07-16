'use client';

import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';

/**
 * LazyMotion strict: só os features DOM entram no bundle (componente `m.` em
 * vez de `motion.` — strict LANÇA se algum `motion.` sobrar, garantindo a
 * dieta). MotionConfig respeita prefers-reduced-motion em toda a árvore.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
