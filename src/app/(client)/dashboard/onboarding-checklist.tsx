import React from 'react';
import Link from 'next/link';

import {
  onboardingCompleto,
  onboardingSteps,
  type OnboardingInput,
} from '@/modules/reports/onboarding-model';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

/** Checklist de primeiros passos — some sozinho quando tudo está feito. */
export function OnboardingChecklist(props: OnboardingInput) {
  if (onboardingCompleto(props)) return null;
  const steps = onboardingSteps(props);
  const feitos = steps.filter((s) => s.done).length;

  return (
    <Card data-testid="onboarding-checklist" className="border-brand/20">
      <CardHeader>
        <CardTitle as="h2" className="text-base">Primeiros passos</CardTitle>
        <span className="font-mono text-xs text-muted">
          {feitos}/{steps.length}
        </span>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2">
          {steps.map((step) => (
            <li key={step.id} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${
                  step.done
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-bg-elevated text-dim'
                }`}
              >
                {step.done ? '✓' : ''}
              </span>
              {step.done ? (
                <span className="text-sm text-muted line-through decoration-white/20">
                  {step.label}
                </span>
              ) : (
                <Link
                  href={step.href}
                  className="text-sm text-ink outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  {step.label} →
                </Link>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
