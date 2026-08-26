'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Fully-animated "How It Works" demos for the landing page. Every value
 * shown (the URL, the view target, the drip count, the chart) is
 * illustrative dummy data driven by a looping progress clock — it demos
 * the *shape* of the product flow, not a live/real campaign.
 */

// Obviously-placeholder link — not a real video ID.
const DEMO_URL = 'youtube.com/watch?v=demoTrack01';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** 0→1 progress that loops every `durationMs`, driven by requestAnimationFrame. */
function useLoopProgress(durationMs: number): number {
  const reducedMotion = usePrefersReducedMotion();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      setProgress(1);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = (ts - start) % durationMs;
      setProgress(elapsed / durationMs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, reducedMotion]);

  return progress;
}

/** Types `text` out, pauses, deletes, and loops. Falls back to static text
 * (no animation) when the user prefers reduced motion. */
function useTypewriter(text: string, typeMs = 65, pauseMs = 1400, deleteMs = 30): string {
  const reducedMotion = usePrefersReducedMotion();
  const [display, setDisplay] = useState('');

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(text);
      return;
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    const type = () => {
      setDisplay(text.slice(0, i));
      if (i <= text.length) {
        i++;
        timer = setTimeout(type, typeMs);
      } else {
        timer = setTimeout(del, pauseMs);
      }
    };
    const del = () => {
      setDisplay(text.slice(0, i));
      if (i >= 0) {
        i--;
        timer = setTimeout(del, deleteMs);
      } else {
        i = 0;
        timer = setTimeout(type, 500);
      }
    };

    type();
    return () => clearTimeout(timer);
  }, [text, typeMs, pauseMs, deleteMs, reducedMotion]);

  return display;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function StepCard({
  step,
  title,
  desc,
  children,
}: {
  step: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center flex flex-col items-center">
      <span className="font-display text-3xl font-semibold text-[var(--accent)]/25">{step}</span>
      <h4 className="font-medium mt-2">{title}</h4>
      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{desc}</p>
      {children}
    </div>
  );
}

function PasteUrlDemo() {
  const typed = useTypewriter(DEMO_URL);
  return (
    <div className="mt-3 w-full max-w-[180px] px-2.5 py-2 rounded-lg glass-card border border-white/5 text-left">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#ff0000]/70 flex-shrink-0" />
        <span className="text-[9px] text-[var(--subtle-foreground)]">Link</span>
      </div>
      <p className="font-mono text-[10px] text-[var(--foreground)] truncate min-h-[14px]">
        {typed}
        <span className="typewriter-caret">|</span>
      </p>
    </div>
  );
}

function SetViewsDemo() {
  const progress = useLoopProgress(2800);
  const eased = easeOutQuad(progress);
  const target = 25000;
  const value = Math.round(eased * target);

  return (
    <div className="mt-3 w-full max-w-[180px] text-left">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] text-[var(--subtle-foreground)]">Target views</span>
        <span className="text-[10px] font-semibold text-[var(--accent)] tabular-nums">
          {value.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden relative">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)]"
          style={{ width: `${eased * 100}%` }}
        />
        <div
          className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-[var(--accent-light)] shadow -translate-y-1/2 -translate-x-1/2"
          style={{ left: `${eased * 100}%` }}
        />
      </div>
    </div>
  );
}

function WeDripDemo() {
  const progress = useLoopProgress(3000);
  const reducedMotion = usePrefersReducedMotion();
  const fillPct = Math.min(100, progress * 118);
  const dropCount = 5;

  return (
    <div className="mt-3 w-full max-w-[180px] flex flex-col items-center gap-1.5">
      <div className="relative h-6 w-full flex items-end justify-center gap-2.5">
        {[...Array(dropCount)].map((_, i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[var(--accent-light)]"
            style={
              reducedMotion
                ? { opacity: 0.6 }
                : { animation: `drip-fall 3s ease-in ${(i / dropCount) * 3}s infinite` }
            }
          />
        ))}
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full bg-[var(--emerald)]" style={{ width: `${fillPct}%` }} />
      </div>
    </div>
  );
}

// Normalized chart points (0-100 viewBox), gently trending up-right — a
// stand-in growth curve, not real analytics data.
const CHART_POINTS: [number, number][] = [
  [4, 46],
  [18, 39],
  [30, 41],
  [44, 30],
  [56, 32],
  [68, 16],
  [80, 20],
  [92, 8],
];

function WatchGrowDemo() {
  const progress = useLoopProgress(3400);
  const eased = easeOutQuad(progress);
  const target = 118400;
  const value = Math.round(eased * target);

  const path = CHART_POINTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const pathLength = 100; // normalized via the SVG `pathLength` attribute
  const dashOffset = pathLength - pathLength * eased;

  const segment = eased * (CHART_POINTS.length - 1);
  const idx = Math.min(CHART_POINTS.length - 2, Math.floor(segment));
  const t = segment - idx;
  const [x1, y1] = CHART_POINTS[idx];
  const [x2, y2] = CHART_POINTS[idx + 1];
  const dotX = x1 + (x2 - x1) * t;
  const dotY = y1 + (y2 - y1) * t;

  return (
    <div className="mt-3 w-full max-w-[180px]">
      <svg viewBox="0 0 96 52" className="w-full h-12" aria-hidden>
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={pathLength}
          strokeDasharray={pathLength}
          strokeDashoffset={dashOffset}
        />
        <circle cx={dotX} cy={dotY} r="2.75" fill="var(--accent-light)" />
      </svg>
      <p className="text-[10px] font-semibold text-[var(--accent)] tabular-nums mt-0.5">
        {value.toLocaleString()} views
      </p>
    </div>
  );
}

export function HowItWorksAnimated() {
  return (
    <div className="grid sm:grid-cols-4 gap-4">
      <StepCard step="01" title="Paste URL" desc="Drop your YouTube link">
        <PasteUrlDemo />
      </StepCard>
      <StepCard step="02" title="Set Views" desc="Slide to your target">
        <SetViewsDemo />
      </StepCard>
      <StepCard step="03" title="We Drip" desc="Organic delivery over time">
        <WeDripDemo />
      </StepCard>
      <StepCard step="04" title="Watch Grow" desc="Real-time analytics">
        <WatchGrowDemo />
      </StepCard>
    </div>
  );
}
