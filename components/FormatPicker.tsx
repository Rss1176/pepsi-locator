'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FORMATS } from '@/lib/catalog';
import type { PackFormat } from '@/lib/types';

interface FormatPickerProps {
  value: PackFormat;
  onChange: (format: PackFormat) => void;
}

/** Segmented control with a knob that slides between the selected segments. */
export default function FormatPicker({ value, onChange }: FormatPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const selected = container.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!selected) return;

    setKnob({ left: selected.offsetLeft, width: selected.offsetWidth });
  }, []);

  useLayoutEffect(measure, [measure, value]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div className="segmented" role="tablist" aria-label="Pack format" ref={containerRef}>
      {knob && (
        <span
          className="segmented-knob"
          aria-hidden="true"
          style={{ width: knob.width, transform: `translateX(${knob.left - 3}px)` }}
        />
      )}
      {FORMATS.map((format) => (
        <button
          key={format.id}
          type="button"
          role="tab"
          className="segment"
          aria-selected={format.id === value}
          onClick={() => onChange(format.id)}
        >
          {format.label}
        </button>
      ))}
    </div>
  );
}
