'use client';

import { m } from 'framer-motion';

import { EASE_TRUTH } from '@/lib/motion';

/** Transição de rota da área: fade + lift 0.3s com o easing assinatura. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_TRUTH }}
    >
      {children}
    </m.div>
  );
}
