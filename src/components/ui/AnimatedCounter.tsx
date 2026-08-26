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
  /** Trigger a subtle pulse animation when the value updates */
  pulseOnUpdate?: boolean;
}

/**
 * Counts up to `value` once the element scrolls into view.
 *
 * Perf notes:
 * - Only runs while on screen (IntersectionObserver, observed once then disconnected).
 * - Single requestAnimationFrame loop per instance, cancelled on unmount.
 * - Skips straight to the final value for prefers-reduced-motion users.
 * - Does not re-trigger on every parent re-render — the animation is keyed off
 *   the target `value` changing, not the component re-rendering.
 */
export function AnimatedCounter({
  value,
  duration = 1600,
  prefix = '',
  suffix = '',
  decimals = 0,
  formatFn,
  className,
  pulseOnUpdate = false,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);
  const elRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const runAnimation = () => {
      if (hasAnimatedRef.current) {
        // If we've already animated once, just update the display smoothly
        // for subsequent value changes (e.g., live data updates)
        if (prefersReducedMotion) {
          setDisplay(value);
          return;
        }

        const start = performance.now();
        const from = display;
        const to = value;
        const updateDuration = Math.min(duration, 800); // Faster for updates

        const tick = (now: number) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / updateDuration, 1);
          const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
          setDisplay(from + (to - from) * eased);

          if (progress < 1) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            setDisplay(value);
          }
        };

        rafRef.current = requestAnimationFrame(tick);

        // Trigger pulse effect
        if (pulseOnUpdate && value !== prevValueRef.current) {
          setIsPulsing(true);
          setTimeout(() => setIsPulsing(false), 600);
        }
        prevValueRef.current = value;
        return;
      }

      hasAnimatedRef.current = true;

      if (prefersReducedMotion) {
        setDisplay(value);
        return;
      }

      const start = performance.now();
      const from = 0;

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
      prevValueRef.current = value;
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
    <span 
      ref={elRef} 
      className={`${className || ''} ${isPulsing ? 'stream-tick' : ''}`}
    >
      {prefix}
      {rendered}
      {suffix}
    </span>
  );
}
