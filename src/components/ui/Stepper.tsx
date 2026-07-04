'use client';

import React from 'react';
import { motion } from 'framer-motion';

import { EASE_TRUTH } from '@/lib/motion';

export interface StepperStep {
  id: string;
  label: string;
}

interface StepperProps {
  steps: readonly StepperStep[];
  /** Índice do passo ativo; steps.length = todos concluídos. */
  activeIndex: number;
  failed?: boolean;
  className?: string;
}

export function Stepper({ steps, activeIndex, failed = false, className = '' }: StepperProps) {
  return (
    <ol className={`flex flex-col ${className}`} data-testid="stepper">
      {steps.map((step, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex && activeIndex < steps.length;
        const isFailed = failed && active;
        return (
          <li
            key={step.id}
            aria-current={active ? 'step' : undefined}
            className="flex items-stretch gap-3"
          >
            <div className="flex flex-col items-center">
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border font-mono text-[10px] transition-colors duration-300 ${
                  done
                    ? 'border-brand bg-brand text-[#04150a]'
                    : isFailed
                      ? 'border-danger-border bg-danger-tint text-danger-fg'
                      : active
                        ? 'border-brand bg-brand-glow text-brand shadow-glow'
                        : 'border-line bg-bg-elevated text-dim'
                }`}
              >
                {done ? '✓' : isFailed ? '✕' : i + 1}
              </span>
              {i < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`w-px flex-1 ${done ? 'bg-brand/50' : 'bg-line'}`}
                />
              ) : null}
            </div>
            <div className="flex min-h-10 items-start pb-3">
              <span
                className={`text-sm transition-colors duration-300 ${
                  done
                    ? 'text-white/80'
                    : isFailed
                      ? 'text-danger-fg'
                      : active
                        ? 'font-medium text-white'
                        : 'text-dim'
                }`}
              >
                {step.label}
                {active && !isFailed ? (
                  <motion.span
                    aria-hidden="true"
                    className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle"
                    animate={{ opacity: [1, 0.25, 1] }}
                    transition={{ duration: 1.4, ease: EASE_TRUTH, repeat: Infinity }}
                  />
                ) : null}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
