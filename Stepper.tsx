/**
 * Stepper.tsx
 * Indicador de los cuatro pasos del asistente.
 */

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

import type { WizardStep } from '../types';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'upload', label: 'Cargar plantilla' },
  { key: 'audit', label: 'Diagnóstico' },
  { key: 'register', label: 'Registro oficial' },
  { key: 'history', label: 'Bitácora' },
];

interface StepperProps {
  current: WizardStep;
  reachable: WizardStep[];
  onSelect: (step: WizardStep) => void;
}

export function Stepper({ current, reachable, onSelect }: StepperProps) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);

  return (
    <nav aria-label="Progreso" className="flex flex-wrap items-center gap-1">
      {STEPS.map((step, index) => {
        const isCurrent = step.key === current;
        const isDone = index < currentIndex;
        const isReachable = reachable.includes(step.key);

        return (
          <div key={step.key} className="flex items-center">
            <button
              type="button"
              disabled={!isReachable}
              onClick={() => onSelect(step.key)}
              aria-current={isCurrent ? 'step' : undefined}
              className={[
                'relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition',
                isCurrent ? 'font-semibold text-navy-900' : 'text-slate-500',
                isReachable ? 'hover:bg-slate-100' : 'cursor-not-allowed opacity-50',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  isDone
                    ? 'bg-emerald-600 text-white'
                    : isCurrent
                      ? 'bg-navy-800 text-white'
                      : 'bg-slate-200 text-slate-600',
                ].join(' ')}
              >
                {isDone ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              {/* En móvil el rótulo se oculta a la vista pero sigue anunciándose:
                  con `hidden` el botón se quedaría sin nombre accesible. */}
              <span className="sr-only sm:not-sr-only">{step.label}</span>
              {isCurrent && (
                <motion.span
                  layoutId="stepper-underline"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-navy-800"
                />
              )}
            </button>
            {index < STEPS.length - 1 && (
              <span aria-hidden className="mx-1 h-px w-4 bg-slate-300 sm:w-6" />
            )}
          </div>
        );
      })}
    </nav>
  );
}
