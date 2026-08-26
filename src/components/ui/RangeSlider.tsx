'use client';

import { useRef, useCallback, useEffect, memo } from 'react';
import { cn } from '@/lib/utils/cn';

interface RangeSliderProps {
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  onChange: (value: number) => void;
  className?: string;
  labels?: string[];
}

/**
 * Performance-optimized range slider.
 *
 * Problem it solves: dragging a native range input inside a React form
 * normally re-renders the entire parent on every input event, causing
 * cards below to twitch / flash / drop frames.
 *
 * Solution: the slider owns its own DOM state during drag.  It updates
 * the fill bar and the numeric display via refs (zero React re-renders).
 * Only when the user releases the thumb does it call `onChange`, which
 * lifts the value up to the parent exactly once.
 */
export const RangeSlider = memo(function RangeSlider({
  min,
  max,
  step,
  defaultValue,
  onChange,
  className,
  labels,
}: RangeSliderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);

  const pct = (val: number) => ((val - min) / (max - min)) * 100;

  const updateVisuals = useCallback((val: number) => {
    const p = pct(val);
    if (fillRef.current) fillRef.current.style.width = `${p}%`;
    if (valueRef.current) valueRef.current.textContent = formatSliderValue(val);
    if (inputRef.current) {
      inputRef.current.style.setProperty('--value-percent', `${p}%`);
    }
  }, [min, max]);

  // Sync once on mount if defaultValue differs from min
  useEffect(() => {
    updateVisuals(defaultValue);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    const val = Number((e.target as HTMLInputElement).value);
    draggingRef.current = true;
    updateVisuals(val);
  }, [updateVisuals]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    draggingRef.current = false;
    updateVisuals(val);
    onChange(val);
  }, [onChange, updateVisuals]);

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (inputRef.current) {
      onChange(Number(inputRef.current.value));
    }
  }, [onChange]);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">Target Views</span>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/25">
          <svg className="w-3.5 h-3.5 text-[#d4af37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
          <span ref={valueRef} className="text-lg font-bold tabular-nums text-[#f4e4bc]">
            {formatSliderValue(defaultValue)}
          </span>
        </div>
      </div>

      <div className="relative h-5 flex items-center" style={{ touchAction: 'pan-y' }}>
        {/* Track background */}
        <div className="absolute inset-x-0 h-[5px] rounded-full bg-white/10" />
        {/* Fill bar — updated via ref during drag */}
        <div
          ref={fillRef}
          className="absolute left-0 h-[5px] rounded-full bg-gradient-to-r from-[#d4af37] to-[#f4e4bc]"
          style={{ width: `${pct(defaultValue)}%` }}
        />
        {/* Native input — visually transparent, captures all pointer events */}
        <input
          ref={inputRef}
          type="range"
          min={min}
          max={max}
          step={step}
          defaultValue={defaultValue}
          onInput={handleInput}
          onChange={handleChange}
          onPointerUp={handlePointerUp}
          onTouchEnd={handlePointerUp}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Target views"
        />
        {/* Visual thumb — follows the fill width */}
        <div
          className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `var(--value-percent, ${pct(defaultValue)}%)`, transform: 'translate(-50%, -50%)' }}
        >
          <div className="w-[22px] h-[22px] rounded-full bg-gradient-to-br from-[#f4e4bc] to-[#d4af37] shadow-[0_0_16px_rgba(212,175,55,0.55),0_0_32px_rgba(212,175,55,0.25)] border-2 border-white/25 transition-transform duration-150" />
        </div>
      </div>

      {labels && labels.length > 0 && (
        <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-[var(--subtle-foreground)]">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
});

function formatSliderValue(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toLocaleString('en-US');
}
