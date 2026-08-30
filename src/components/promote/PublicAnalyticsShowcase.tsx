// src/components/promote/PublicAnalyticsShowcase.tsx
'use client';

import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Users, Radio, Globe2, Activity } from 'lucide-react';
import { SiYoutube, SiSpotify, SiTiktok, SiInstagram, SiSoundcloud } from 'react-icons/si';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { getPublicSeedStats, type PublicSeedStats } from '@/services/stats/publicStats.service';
import { formatCompactNumber } from '@/lib/campaign/pricing';

// react-icons' IconType returns React.ReactNode, which React 18's stricter
// function-component typing won't accept directly as a JSX tag — cast once
// here to a concrete component type instead of sprinkling `as any` below.
type BrandIcon = ComponentType<{ className?: string; style?: CSSProperties }>;

const PLATFORM_ICONS: Record<string, { Icon: BrandIcon; color: string }> = {
  youtube: { Icon: SiYoutube as BrandIcon, color: '#ff0000' },
  spotify: { Icon: SiSpotify as BrandIcon, color: '#1db954' },
  tiktok: { Icon: SiTiktok as BrandIcon, color: '#ff0050' },
  instagram: { Icon: SiInstagram as BrandIcon, color: '#e1306c' },
  soundcloud: { Icon: SiSoundcloud as BrandIcon, color: '#ff7700' },
};

function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-xl shimmer glass-card"
      style={{ height }}
      aria-hidden
    />
  );
}

/**
 * Only mounts recharts (and starts polling live stats) once this section is
 * actually scrolled near-view. Keeps the initial promote-page paint light,
 * which is most of the mobile "lag" — recharts + two chart instances is not
 * cheap to hydrate on first paint if nobody has scrolled to it yet.
 */
export function PublicAnalyticsShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [stats, setStats] = useState<PublicSeedStats | null>(null);
  const [barsIn, setBarsIn] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    getPublicSeedStats().then((data) => {
      if (cancelled) return;
      setStats(data);
      // Defer the demographic bar-width transition one frame so the CSS
      // transition actually animates from 0 instead of snapping in.
      requestAnimationFrame(() => setBarsIn(true));
    });
    return () => {
      cancelled = true;
    };
  }, [isVisible]);

  const maxPlatformValue = stats ? Math.max(...stats.platforms.map((p) => p.value)) : 1;

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            Live Network Signals
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1db954] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1db954]" />
            </span>
          </h2>
          <p className="text-xs text-[var(--subtle-foreground)] mt-0.5">
            Real activity across the Mavins growth network, updated continuously.
          </p>
        </div>
      </div>

      {/* Headline counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: Users,
            label: 'Seeded Listeners',
            value: stats?.totalSeededUsers ?? 0,
            color: '#1db954',
          },
          {
            icon: Activity,
            label: 'Streams Delivered',
            value: stats?.totalStreamsDelivered ?? 0,
            color: '#3d91f4',
            compact: true,
          },
          {
            icon: Radio,
            label: 'Active Campaigns',
            value: stats?.activeCampaigns ?? 0,
            color: '#a855f7',
          },
          {
            icon: Globe2,
            label: 'Countries Reached',
            value: stats?.countriesReached ?? 0,
            color: '#f59e0b',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="glass-card rounded-xl p-3.5 sm:p-4 flex flex-col gap-2 min-w-0"
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${stat.color}1a`, color: stat.color }}
            >
              <stat.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-xl font-bold tabular-nums truncate">
                {stats ? (
                  <AnimatedCounter
                    value={stat.value}
                    formatFn={stat.compact ? formatCompactNumber : undefined}
                    decimals={0}
                  />
                ) : (
                  <span className="inline-block w-12 h-5 rounded shimmer glass-card align-middle" />
                )}
              </p>
              <p className="text-[11px] text-[var(--subtle-foreground)] leading-tight mt-0.5">
                {stat.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Live trend chart */}
      <div className="glass-strong rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">7-Day Streaming Signal</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-[#1db954]/10 text-[#1db954] border border-[#1db954]/20">
            {stats?.isLive ? 'Live' : 'Network avg'}
          </span>
        </div>
        {!stats ? (
          <ChartSkeleton />
        ) : (
          <div className="h-[200px] sm:h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="signalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1db954" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#1db954" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--subtle-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--subtle-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCompactNumber(v)}
                  width={40}
                />
                <Tooltip
                  formatter={(value: number) => [formatCompactNumber(value), 'Streams']}
                  contentStyle={{
                    background: 'rgba(20,20,24,0.92)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'var(--muted-foreground)' }}
                />
                <Area
                  type="monotone"
                  dataKey="streams"
                  stroke="#1db954"
                  strokeWidth={2}
                  fill="url(#signalFill)"
                  isAnimationActive
                  animationDuration={1400}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Platform distribution — bar chart with brand icons */}
      <div className="glass-strong rounded-2xl p-4 sm:p-5">
        <h3 className="text-sm font-bold mb-1">Where Growth Is Happening</h3>
        <p className="text-xs text-[var(--subtle-foreground)] mb-4">
          Seeded engagement distributed across platforms this week
        </p>

        {!stats ? (
          <ChartSkeleton height={200} />
        ) : (
          <>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.platforms} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" hide />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--subtle-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCompactNumber(v)}
                    width={40}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCompactNumber(value), 'Interactions']}
                    contentStyle={{
                      background: 'rgba(20,20,24,0.92)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[8, 8, 0, 0]}
                    isAnimationActive
                    animationDuration={1200}
                    animationEasing="ease-out"
                  >
                    {stats.platforms.map((p) => (
                      <Cell key={p.key} fill={PLATFORM_ICONS[p.key]?.color || '#1db954'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Platform legend with real brand icons/logos */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
              {stats.platforms.map((p) => {
                const meta = PLATFORM_ICONS[p.key];
                const pct = Math.round((p.value / maxPlatformValue) * 100);
                return (
                  <div
                    key={p.key}
                    className="glass-card rounded-lg p-2.5 flex flex-col items-center gap-1.5 text-center"
                  >
                    <meta.Icon className="w-4 h-4" style={{ color: meta.color }} />
                    <span className="text-[11px] font-medium truncate w-full">{p.label}</span>
                    <span className="text-[10px] text-[var(--subtle-foreground)]">
                      <AnimatedCounter value={p.value} formatFn={formatCompactNumber} duration={1200} />
                      <span className="hidden sm:inline"> · {pct}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Demographics — animated horizontal bars */}
      <div className="glass-strong rounded-2xl p-4 sm:p-5">
        <h3 className="text-sm font-bold mb-1">Listener Demographics</h3>
        <p className="text-xs text-[var(--subtle-foreground)] mb-4">
          Top countries by seeded listener share
        </p>

        {!stats ? (
          <div className="space-y-2.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 rounded-lg shimmer glass-card" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {stats.demographics.map((d, i) => (
              <div key={d.code} className="flex items-center gap-3">
                <span className="text-lg w-6 flex-shrink-0" aria-hidden>
                  {d.flag}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">{d.country}</span>
                    <span className="text-xs font-semibold text-[var(--muted-foreground)] tabular-nums">
                      <AnimatedCounter value={d.percent} suffix="%" duration={1400} />
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#1db954] to-[#3d91f4] transition-[width] ease-out"
                      style={{
                        width: barsIn ? `${d.percent}%` : '0%',
                        transitionDuration: '1200ms',
                        transitionDelay: `${i * 80}ms`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
