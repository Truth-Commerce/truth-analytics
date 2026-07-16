'use client';

import React from 'react';
import { m } from 'framer-motion';

import { fadeLift } from '@/lib/motion';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  'data-testid'?: string;
}

/** Seção com scroll-reveal (fade+lift ao entrar na viewport, uma vez). */
export function Reveal({ children, className = '', id, ...rest }: RevealProps) {
  return (
    <m.section
      id={id}
      variants={fadeLift}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      className={className}
      {...rest}
    >
      {children}
    </m.section>
  );
}
