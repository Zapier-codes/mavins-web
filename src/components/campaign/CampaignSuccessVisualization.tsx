'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

/**
 * Task 33 Part 3 (handover.md): "Shared user/admin success screen with
 * an animated country-interconnection pipeline visualization (central
 * hub node, animated links out to each selected target country) shown
 * on confirmed payment."
 *
 * "Shared user/admin" means one component, reused by both an
 * authenticated artist's synchronous createCampaign() success and a
 * guest's async webhook-confirmed direct-pay success — not a
 * separate admin-only screen. promote/page.tsx already tracks both
 * moments (showSuccess / showGuestCampaignSuccess) as plain text
 * banners; this replaces both banners' content, not the trigger logic
 * around them.
 *
 * Follows the same conventions as
 * src/components/landing/HowItWorksAnimated.tsx (the only other
 * SVG-driven looping animation in this codebase): a local
 * usePrefersReducedMotion/useLoopProgress pair (not shared/exported
 * anywhere yet, so duplicated here rather than introducing a new
 * shared-hooks module for two call sites), pathLength-normalized SVG
 * strokes for draw-in animation, and CSS var-driven color (no new
 * palette introduced — this reuses --accent/--accent-light exactly as
 * the rest of the app does, deliberately not a bespoke "success
 * screen" palette).
 */

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

function useLoopProgress(durationMs: number, reducedMotion: boolean): number {
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

export interface SuccessCountry {
  code: string;
  country: string;
  flag: string;
}

// Beyond this many nodes the ring gets too crowded to read (this
// screen has to work for an admin's larger, uncapped selection, not
// just a free user's MAX_COUNTRIES_FREE-capped one) — the rest
// collapse into a single "+N more" node rather than being dropped
// silently.
const MAX_VISIBLE_NODES = 7;

const SIZE = 300;
const CENTER = SIZE / 2;
const HUB_RADIUS = 26;
const NODE_RADIUS = 115;

function nodePosition(index: number, total: number) {
  // -90deg start so the first node sits at 12 o'clock, matching how a
  // clock/compass reads rather than starting at 3 o'clock (SVG's 0deg
  // default) — a small deliberate choice, not the default angle.
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return {
    x: CENTER + NODE_RADIUS * Math.cos(angle),
    y: CENTER + NODE_RADIUS * Math.sin(angle),
  };
}

function CountryNode({
  country,
  index,
  total,
  reducedMotion,
  drawProgress,
  pulseProgress,
}: {
  country: SuccessCountry | { flag: string; country: string; code: 'more' };
  index: number;
  total: number;
  reducedMotion: boolean;
  drawProgress: number;
  pulseProgress: number;
}) {
  const { x, y } = nodePosition(index, total);
  // Percent-based, so the HTML label layer lines up with the SVG
  // layer regardless of the container's actual rendered width.
  const leftPct = (x / SIZE) * 100;
  const topPct = (y / SIZE) * 100;

  const pathLength = 100;
  const dashOffset = pathLength - pathLength * drawProgress;

  // A small pulse dot travels hub -> node once the line has finished
  // drawing in, looping continuously — the "signal is actively
  // flowing to this country" read the task asks for, not just a
  // static connected-dot diagram.
  const pulseT = drawProgress >= 1 ? pulseProgress : 0;
  const pulseX = CENTER + (x - CENTER) * pulseT;
  const pulseY = CENTER + (y - CENTER) * pulseT;

  return (
    <>
      <line
        x1={CENTER}
        y1={CENTER}
        x2={x}
        y2={y}
        stroke="var(--accent)"
        strokeOpacity={0.35}
        strokeWidth={1.5}
        pathLength={pathLength}
        strokeDasharray={pathLength}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
      />
      {!reducedMotion && drawProgress >= 1 && (
        <circle cx={pulseX} cy={pulseY} r={3} fill="var(--accent-light)" />
      )}
      <circle
        cx={x}
        cy={y}
        r={reducedMotion || drawProgress >= 1 ? 5 : 0}
        fill="var(--accent-light)"
        style={{ transition: 'r 300ms ease-out' }}
      />
    </>
  );
}

export function CampaignSuccessVisualization({
  title,
  subtitle,
  targetCountries,
}: {
  title: string;
  subtitle: string;
  targetCountries: SuccessCountry[];
}) {
  const reducedMotion = usePrefersReducedMotion();
  // One full draw-in over 1.4s, staggered per node below via each
  // node's own delayed start rather than delaying the shared clock —
  // keeps a single RAF loop instead of one per node.
  const drawClock = useLoopProgress(1400, reducedMotion || targetCountries.length === 0);
  // Separate, slower, continuously-looping clock for the traveling
  // pulse once a line has finished drawing.
  const pulseClock = useLoopProgress(1800, reducedMotion);

  const overflow = Math.max(0, targetCountries.length - MAX_VISIBLE_NODES);
  const visible: Array<SuccessCountry | { code: 'more'; country: string; flag: string }> =
    overflow > 0
      ? [...targetCountries.slice(0, MAX_VISIBLE_NODES - 1), { code: 'more', country: `+${overflow + 1} more`, flag: '🌍' }]
      : targetCountries;

  const total = Math.max(1, visible.length);

  return (
    <div className="glass-strong rounded-2xl p-5 sm:p-6 border border-[#1db954]/30 bg-[#1db954]/5 space-y-4">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-[#1db954] flex-shrink-0" />
        <div>
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-[var(--subtle-foreground)]">{subtitle}</p>
        </div>
      </div>

      {targetCountries.length > 0 && (
        <div className="relative w-full max-w-[280px] mx-auto aspect-square">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full" aria-hidden>
            {visible.map((c, i) => {
              // Staggered draw-in: each node's own line starts a
              // little later than the last, so the pipeline reads as
              // "reaching out" one country at a time rather than every
              // line snapping in at once.
              const startDelay = i / total;
              const localProgress = reducedMotion
                ? 1
                : Math.min(1, Math.max(0, (drawClock - startDelay * 0.5) / (1 - startDelay * 0.5)));
              return (
                <CountryNode
                  key={c.code}
                  country={c}
                  index={i}
                  total={total}
                  reducedMotion={reducedMotion}
                  drawProgress={localProgress}
                  pulseProgress={pulseClock}
                />
              );
            })}
            {/* Hub, drawn last so it sits above every line's origin point. */}
            <circle cx={CENTER} cy={CENTER} r={HUB_RADIUS} fill="var(--accent)" fillOpacity={0.18} />
            <circle cx={CENTER} cy={CENTER} r={HUB_RADIUS * 0.55} fill="var(--accent)" />
          </svg>

          {/* HTML label layer, positioned to match the SVG node
              coordinates above (see nodePosition/leftPct/topPct) —
              flags and country names render far more legibly as real
              text than as SVG <text>, same reasoning WatchGrowDemo's
              numeric label uses HTML alongside its SVG chart. */}
          {visible.map((c, i) => {
            const { x, y } = nodePosition(i, total);
            return (
              <div
                key={c.code}
                className="absolute -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-none"
                style={{ left: `${(x / SIZE) * 100}%`, top: `${(y / SIZE) * 100}%`, transform: 'translate(-50%, 6px)' }}
              >
                <span className="text-base leading-none">{c.flag}</span>
                <span className="text-[9px] font-medium text-[var(--subtle-foreground)] whitespace-nowrap max-w-[64px] truncate">
                  {c.country}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
