'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/auth/useAuth';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils/cn';
import { 
  Rocket, BarChart3, Trophy, Zap, TrendingUp,
  Music, ArrowRight, Play, Users, Globe, Sparkles
} from 'lucide-react';

export default function HomePage() {
  const { user, isAuthenticated } = useAuth();
  const { points } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[700px] h-[700px] bg-[#1db954]/4 rounded-full blur-3xl animate-ambient" />
          <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-[#3d91f4]/4 rounded-full blur-3xl animate-ambient-slow" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#a855f7]/3 rounded-full blur-3xl animate-ambient-fast" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24">
          {/* Hero */}
          <div className="text-center pt-12 sm:pt-20 pb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card text-[#1db954] text-xs font-medium mb-6 border-[#1db954]/20">
              <Sparkles className="w-3.5 h-3.5" />
              The artist growth platform
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight">
              From <span className="gradient-text">zero</span> to <span className="gradient-text">trending</span>
            </h1>
            <p className="text-[#a0a0b0] text-base sm:text-lg mt-4 max-w-xl mx-auto">
              Promote your music with real playlist pushes. Track growth with Spotify-style analytics. Get heard.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
              <Link 
                href="/promote"
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#1db954] text-black font-semibold hover:bg-[#1ed760] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#1db954]/20"
              >
                <Rocket className="w-5 h-5" />
                Start Promoting
              </Link>
              <Link 
                href="/leaderboard"
                className="w-full sm:w-auto px-6 py-3 rounded-xl glass-card text-white font-semibold hover:bg-white/5 transition-all flex items-center justify-center gap-2"
              >
                <Trophy className="w-5 h-5" />
                View Rankings
              </Link>
            </div>
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
                desc: 'Spotify-for-Artists-style dashboard. Track streams, geography, growth.' 
              },
              { 
                icon: Trophy, 
                title: 'Leaderboards', 
                desc: 'See where you rank. Compete with other artists. Climb the charts.' 
              },
            ].map((feat) => (
              <div key={feat.title} className="glass-strong rounded-2xl p-5 card-hover">
                <div className="w-10 h-10 rounded-xl bg-[#1db954]/10 border border-[#1db954]/20 flex items-center justify-center mb-4">
                  <feat.icon className="w-5 h-5 text-[#1db954]" />
                </div>
                <h3 className="font-bold mb-1">{feat.title}</h3>
                <p className="text-sm text-[#6b6b7b]">{feat.desc}</p>
              </div>
            ))}
          </div>

          {/* How it works */}
          <div className="mt-16">
            <h2 className="text-xl font-bold text-center mb-8">How It Works</h2>
            <div className="grid sm:grid-cols-4 gap-4">
              {[
                { step: '01', title: 'Paste URL', desc: 'Drop your YouTube link' },
                { step: '02', title: 'Set Views', desc: 'Slide to your target' },
                { step: '03', title: 'We Drip', desc: 'Organic delivery over time' },
                { step: '04', title: 'Watch Grow', desc: 'Real-time analytics' },
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <span className="text-3xl font-bold text-[#1db954]/20">{item.step}</span>
                  <h4 className="font-medium mt-2">{item.title}</h4>
                  <p className="text-xs text-[#6b6b7b] mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated dashboard view
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-[#1db954]/4 rounded-full blur-3xl animate-ambient" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-5">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Welcome back, {user?.artistName || 'Artist'}
          </h1>
          <p className="text-[#a0a0b0] text-sm mt-1">
            Here is what is happening with your campaigns
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction 
            icon={Rocket} 
            label="New Campaign" 
            href="/promote" 
            color="bg-[#1db954]/10 text-[#1db954] border-[#1db954]/20" 
          />
          <QuickAction 
            icon={BarChart3} 
            label="Analytics" 
            href="/analytics" 
            color="bg-[#3d91f4]/10 text-[#3d91f4] border-[#3d91f4]/20" 
          />
          <QuickAction 
            icon={Trophy} 
            label="Leaderboard" 
            href="/leaderboard" 
            color="bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20" 
          />
          <QuickAction 
            icon={Zap} 
            label="Earnings" 
            href="/earnings" 
            color="bg-[#f43f5e]/10 text-[#f43f5e] border-[#f43f5e]/20" 
          />
        </div>

        {/* Recent activity */}
        <div className="glass-strong rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm">Recent Activity</h3>
            <Link href="/analytics" className="text-xs text-[#1db954] hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="text-center py-8 text-[#6b6b7b] text-sm">
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
      className="flex flex-col items-center gap-2 p-4 rounded-xl glass-card hover:bg-white/[0.04] transition-all"
    >
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center border', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}
