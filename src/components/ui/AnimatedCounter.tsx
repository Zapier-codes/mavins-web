// src/components/ui/AnimatedCounter.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  formatFn?: (n: number) => string;
  className?: string;
}

/**
 * Counts up to `value` once the element scrolls into view.
 *
 * Perf notes:
 * - Only runs while on screen (IntersectionObserver, observed once then disconnected).
 * - Single requestAnimationFrame loop per instance, cancelled on unmount.
 * - Skips straight to the final value for prefers-reduced-motion users.
 * - Re-triggers animation when `value` changes after the initial mount, so
 *   placeholder→real-value patterns (e.g. wallet page loading) animate correctly.
 */
export function AnimatedCounter({
  value,
  duration = 1600,
  prefix = '',
  suffix = '',
  decimals = 0,
  formatFn,
  className,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const elRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    // If the value prop changed (e.g. placeholder 0 → real balance),
    // reset the animation gate so the new value animates in.
    if (value !== prevValueRef.current) {
      hasAnimatedRef.current = false;
      prevValueRef.current = value;
    }

    const el = elRef.current;
    if (!el) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const runAnimation = () => {
      if (hasAnimatedRef.current) return;
      hasAnimatedRef.current = true;

      if (prefersReducedMotion) {
        setDisplay(value);
        return;
      }

      const start = performance.now();
      const from = display; // animate from current display value, not 0

      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutExpo — fast start, gentle settle, feels "alive" not mechanical
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        setDisplay(from + (value - from) * eased);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplay(value);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            runAnimation();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const rendered = formatFn
    ? formatFn(display)
    : display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <span ref={elRef} className={className}>
      {prefix}
      {rendered}
      {suffix}
    </span>
  );
}
