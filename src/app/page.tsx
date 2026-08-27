'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/auth/useAuth';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils/cn';
import { 
  Rocket, BarChart3, Trophy, Zap, TrendingUp,
  Music, ArrowRight, Play, Users, Globe, Sparkles, X
} from 'lucide-react';
import { EarningsMarquee } from '@/components/landing/EarningsMarquee';
import { PartnersMarquee } from '@/components/landing/PartnersMarquee';
import { HowItWorksAnimated } from '@/components/landing/HowItWorksAnimated';

// Task 18 fix: this used to be a plain "Welcome back" heading that
// rendered unconditionally on every visit to '/' -- which is what
// product owner was seeing as a banner "opening for every artist on
// every login." The heading itself staying persistent is fine/normal;
// what's new here is a SEPARATE, genuinely one-time success banner
// gated on a `?welcome=1` param that complete-profile/page.tsx only
// appends right after a successful (not skipped) submit. It's read
// once, shown, and the param is stripped from the URL immediately via
// router.replace so a refresh, back-button, or re-sharing the link
// can't replay it.
function HomePageContent() {
  const { user, isAuthenticated } = useAuth();
  const { points } = useAppStore();
  const [mounted, setMounted] = useState(false);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (searchParams.get('welcome') === '1') {
      setShowWelcomeBanner(true);
      router.replace('/', { scroll: false });
    }
  }, [searchParams, router]);

  if (!mounted) return null;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[700px] h-[700px] bg-[var(--accent)]/[0.05] rounded-full blur-3xl animate-ambient" />
          <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-[var(--emerald)]/[0.06] rounded-full blur-3xl animate-ambient-slow" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[var(--accent-dark)]/[0.035] rounded-full blur-3xl animate-ambient-fast" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24">
          {/* Hero */}
          <div className="text-center pt-12 sm:pt-20 pb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card text-[var(--accent-light)] text-xs font-medium tracking-wide mb-6 border-[var(--accent)]/25">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              The artist growth platform
            </div>
            <h1 className="font-display text-4xl sm:text-6xl font-semibold tracking-tight leading-tight">
              From <span className="gradient-text-shine">zero</span> to <span className="gradient-text-shine">trending</span>
            </h1>
            <p className="text-[var(--muted-foreground)] text-base sm:text-lg mt-4 max-w-xl mx-auto">
              Promote your music with real playlist pushes. Track growth with cinematic, studio-grade analytics. Get heard.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
              <Link 
                href="/promote"
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-[var(--accent-light)] to-[var(--accent)] text-[var(--background)] font-semibold hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--accent)]/25"
              >
                <Rocket className="w-5 h-5" />
                Start Promoting
              </Link>
              <Link 
                href="/leaderboard"
                className="w-full sm:w-auto px-6 py-3 rounded-xl glass-card text-[var(--foreground)] font-semibold hover:bg-[var(--accent)]/5 transition-all flex items-center justify-center gap-2"
              >
                <Trophy className="w-5 h-5 text-[var(--accent)]" />
                View Rankings
              </Link>
            </div>
          </div>

          {/* Live earnings marquee, with the (placeholder) supporting-partners
              strip layered directly beneath it. */}
          <div className="-mx-4 sm:-mx-6 mb-3">
            <EarningsMarquee />
          </div>
          <div className="-mx-4 sm:-mx-6 mb-14">
            <PartnersMarquee />
          </div>

          {/* Features grid */}
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { 
                icon: Rocket, 
                title: 'Playlist Push', 
                desc: 'Real views delivered organically over time. No bots, no fake numbers.' 
              },
              { 
                icon: BarChart3, 
                title: 'Live Analytics', 
                desc: 'A studio-grade dashboard. Track streams, geography, growth.' 
              },
              { 
                icon: Trophy, 
                title: 'Leaderboards', 
                desc: 'See where you rank. Compete with other artists. Climb the charts.' 
              },
            ].map((feat) => (
              <div key={feat.title} className="glass-strong rounded-2xl p-5 card-hover">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/25 flex items-center justify-center mb-4">
                  <feat.icon className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <h3 className="font-display font-semibold mb-1">{feat.title}</h3>
                <p className="text-sm text-[var(--muted-foreground)]">{feat.desc}</p>
              </div>
            ))}
          </div>

          {/* How it works — fully animated: typewriter URL, live-filling
              slider, dripping delivery, and a growing line chart. */}
          <div className="mt-16">
            <h2 className="font-display text-xl font-semibold text-center mb-8">How It Works</h2>
            <HowItWorksAnimated />
          </div>
        </div>
      </div>
    );
  }

  // Authenticated dashboard view
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-[var(--accent)]/[0.05] rounded-full blur-3xl animate-ambient" />
        <div className="absolute -bottom-40 -left-40 w-[420px] h-[420px] bg-[var(--emerald)]/[0.05] rounded-full blur-3xl animate-ambient-slow" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-5">
        {/* One-time welcome banner — see Task 18 note above. Only
            renders right after a fresh, successful complete-profile
            submit; gone for good after that page load. */}
        {showWelcomeBanner && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl glass-card border-[var(--accent)]/25 bg-[var(--accent)]/[0.06]">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--accent-light)]">
              <Sparkles className="w-4 h-4 flex-shrink-0" />
              Profile complete — welcome to Mavins! 🎉
            </div>
            <button
              onClick={() => setShowWelcomeBanner(false)}
              className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Welcome */}
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Welcome back, <span className="gradient-text">{user?.artistName || 'Artist'}</span>
          </h1>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">
            Here is what is happening with your campaigns
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction 
            icon={Rocket} 
            label="New Campaign" 
            href="/promote" 
            color="bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/25" 
          />
          <QuickAction 
            icon={BarChart3} 
            label="Analytics" 
            href="/analytics" 
            color="bg-[var(--emerald)]/12 text-[#2fae82] border-[var(--emerald)]/30" 
          />
          <QuickAction 
            icon={Trophy} 
            label="Leaderboard" 
            href="/leaderboard" 
            color="bg-[var(--accent-light)]/10 text-[var(--accent-light)] border-[var(--accent-light)]/20" 
          />
          <QuickAction 
            icon={Zap} 
            label="Wallet" 
            href="/earnings" 
            color="bg-[var(--accent-dark)]/12 text-[var(--accent)] border-[var(--accent-dark)]/30" 
          />
        </div>

        {/* Recent activity */}
        <div className="glass-strong rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm">Recent Activity</h3>
            <Link href="/analytics" className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="text-center py-8 text-[var(--muted-foreground)] text-sm">
            <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
            <p className="text-xs mt-1">Create your first campaign to see activity here</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, href, color }: { icon: any; label: string; href: string; color: string }) {
  return (
    <Link 
      href={href}
      className="flex flex-col items-center gap-2 p-4 rounded-xl glass-card hover:bg-[var(--accent)]/[0.04] transition-all"
    >
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center border', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}
