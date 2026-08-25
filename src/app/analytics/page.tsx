'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { getArtistDashboard, getArtistCampaigns } from '@/services/campaign/campaign.service';
import { formatNumber, formatCompactNumber, formatCents } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import { 
  TrendingUp, Target, Calendar, Zap, Award
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

const STAGE_COLORS: Record<string, string> = {
  planting: '#10b981',
  germination: '#3b82f6',
  root_system: '#8b5cf6',
  branching: '#f59e0b',
  full_bloom: '#f43f5e',
  completed: '#6b7280',
};

const GEO_COLORS = ['#1db954', '#3d91f4', '#f59e0b', '#f43f5e', '#8b5cf6', '#10b981'];

export default function AnalyticsPage() {
  const { user, isAuthenticated } = useAuth();
  const [dashboard, setDashboard] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setIsLoading(false); return; }

    Promise.all([
      getArtistDashboard(user.id),
      getArtistCampaigns(user.id),
    ]).then(([dashData, campData]) => {
      setDashboard(dashData);
      setCampaigns(campData);
      setIsLoading(false);
    });
  }, [user?.id]);

  const chartData = useMemo(() => {
    if (!dashboard?.campaigns) return [];
    const allMetrics: any[] = [];
    dashboard.campaigns.forEach((c: any) => {
      (c.daily_metrics || []).forEach((m: any) => {
        allMetrics.push({ date: m.date, streams: m.streams || 0, saves: m.saves || 0 });
      });
    });
    const grouped: Record<string, any> = {};
    allMetrics.forEach((m) => {
      if (!grouped[m.date]) grouped[m.date] = { date: m.date, streams: 0, saves: 0 };
      grouped[m.date].streams += m.streams;
      grouped[m.date].saves += m.saves;
    });
    return Object.values(grouped).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [dashboard]);

  const geoData = useMemo(() => {
    if (!dashboard?.campaigns) return [];
    const geo: Record<string, number> = {};
    dashboard.campaigns.forEach((c: any) => {
      (c.daily_metrics || []).forEach((m: any) => {
        const breakdown = m.geo_breakdown || {};
        Object.entries(breakdown).forEach(([country, count]: [string, any]) => {
          geo[country] = (geo[country] || 0) + (parseInt(count) || 0);
        });
      });
    });
    return Object.entries(geo)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [dashboard]);

  const totalStreams = dashboard?.total_streams || 0;
  const activeCampaigns = dashboard?.active_campaigns || 0;
  const totalSpent = dashboard?.total_spent_cents || 0;
  const totalBudget = dashboard?.total_budget_cents || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1db954]/30 border-t-[#1db954] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
        <div className="glass-strong rounded-2xl p-8 text-center max-w-sm">
          <TrendingUp className="w-12 h-12 text-[#6b6b7b] mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Sign in to view analytics</h2>
          <p className="text-[#a0a0b0] text-sm">Track your campaign performance in real-time</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#1db954]/3 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-[#3d91f4]/3 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="text-[#a0a0b0] text-sm mt-1">Track your growth across all campaigns</p>
          </div>
          <div className="flex items-center gap-2">
            {(['7d', '30d', '90d', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-medium transition-all',
                  timeRange === range
                    ? 'bg-[#1db954] text-black'
                    : 'glass-card text-[#a0a0b0]'
                )}
              >
                {range === 'all' ? 'All time' : range}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Streams" value={formatCompactNumber(totalStreams)} icon={TrendingUp} />
          <StatCard label="Active Campaigns" value={activeCampaigns.toString()} icon={Zap} />
          <StatCard label="Total Spent" value={formatCents(totalSpent)} icon={Target} />
          <StatCard label="Budget Remaining" value={formatCents(totalBudget - totalSpent)} icon={Calendar} />
        </div>

        {/* Main Chart — Glass */}
        <div className="glass-strong rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm">Stream Growth</h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#1db954]" />
                Streams
              </span>
            </div>
          </div>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="streamGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1db954" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#1db954" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#6b6b7b" 
                  fontSize={11}
                  tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis stroke="#6b6b7b" fontSize={11} tickFormatter={formatCompactNumber} />
                <Tooltip 
                  contentStyle={{ 
                    background: 'rgba(18, 18, 24, 0.9)', 
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.08)', 
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}
                  formatter={(value: number) => [formatNumber(value), 'Streams']}
                />
                <Area 
                  type="monotone" 
                  dataKey="streams" 
                  stroke="#1db954" 
                  strokeWidth={2}
                  fill="url(#streamGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Geo Breakdown — Glass */}
          <div className="glass-strong rounded-2xl p-5">
            <h3 className="font-bold text-sm mb-4">Geography</h3>
            {geoData.length > 0 ? (
              <>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={geoData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {geoData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={GEO_COLORS[index % GEO_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          background: 'rgba(18, 18, 24, 0.9)', 
                          backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(255,255,255,0.08)', 
                          borderRadius: '12px',
                          fontSize: '12px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {geoData.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-2 h-2 rounded-full" 
                          style={{ background: GEO_COLORS[i % GEO_COLORS.length] }}
                        />
                        <span className="capitalize">{item.name}</span>
                      </div>
                      <span className="text-[#a0a0b0]">{formatNumber(item.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-56 flex items-center justify-center text-[#6b6b7b] text-sm">
                No geographic data yet
              </div>
            )}
          </div>

          {/* Campaign List — Glass */}
          <div className="glass-strong rounded-2xl p-5">
            <h3 className="font-bold text-sm mb-4">Campaigns</h3>
            <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-hide">
              {(dashboard?.campaigns || []).map((c: any) => (
                <div 
                  key={c.id} 
                  className="p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.source_url}</p>
                      <p className="text-xs text-[#6b6b7b] mt-0.5">
                        {formatNumber(c.streams)} streams · {formatCents(c.spent_cents)} spent
                      </p>
                    </div>
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: STAGE_COLORS[c.stage] || '#6b7280' }}
                    />
                  </div>
                  <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${Math.min((c.spent_cents / (c.total_budget_cents || 1)) * 100, 100)}%`,
                        background: STAGE_COLORS[c.stage] || '#6b7280'
                      }}
                    />
                  </div>
                </div>
              ))}
              {(!dashboard?.campaigns || dashboard.campaigns.length === 0) && (
                <div className="text-center py-8 text-[#6b6b7b] text-sm">
                  No campaigns yet. Create your first one!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Milestones — Glass */}
        {dashboard?.milestones && dashboard.milestones.length > 0 && (
          <div className="glass-strong rounded-2xl p-5">
            <h3 className="font-bold text-sm mb-4">Milestones</h3>
            <div className="flex flex-wrap gap-2">
              {dashboard.milestones.map((m: any, i: number) => (
                <div 
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1db954]/10 border border-[#1db954]/20 text-[#1db954] text-xs font-medium"
                >
                  <Award className="w-3.5 h-3.5" />
                  {m.type.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[#6b6b7b] mb-1">{label}</p>
          <p className="text-xl sm:text-2xl font-bold">{value}</p>
        </div>
        <div className="w-8 h-8 rounded-lg glass-card flex items-center justify-center">
          <Icon className="w-4 h-4 text-[#6b6b7b]" />
        </div>
      </div>
    </div>
  );
}
