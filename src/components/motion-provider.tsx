'use client';

import { MotionConfig } from 'framer-motion';

/** Respeita prefers-reduced-motion em TODAS as animações framer da árvore. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
