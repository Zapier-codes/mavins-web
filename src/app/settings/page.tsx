'use client';

import React, { useState, useEffect, type ComponentType, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { 
  User, Bell, Shield, Palette, Globe, 
  ChevronRight, Save, CheckCircle2, MessageCircle,
} from 'lucide-react';
import { SiInstagram, SiX, SiTiktok, SiSpotify } from 'react-icons/si';
import { PointsHistoryPanel } from '@/components/gamification/PointsHistoryPanel';

// react-icons' IconType returns React.ReactNode, which React 18's stricter
// function-component typing won't accept directly as a JSX tag — same cast
// used in PublicAnalyticsShowcase.tsx instead of sprinkling `as any` below.
type BrandIcon = ComponentType<{ className?: string; style?: CSSProperties }>;

// Real brand marks instead of generic lucide placeholders (Music2/Video/etc
// don't represent these platforms) — same react-icons/si set already used
// on the promote page's live network showcase.
const BRAND_ICONS = {
  instagram: { Icon: SiInstagram as BrandIcon, color: '#e1306c' },
  x: { Icon: SiX as BrandIcon, color: '#ffffff' },
  tiktok: { Icon: SiTiktok as BrandIcon, color: '#ff0050' },
  spotify: { Icon: SiSpotify as BrandIcon, color: '#1db954' },
};

export default function SettingsPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [artistName, setArtistName] = useState(user?.artist_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [location, setLocation] = useState(user?.location || '');
  const [genre, setGenre] = useState(user?.primary_genre || '');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp_number || '');
  const [instagram, setInstagram] = useState(user?.instagram_handle || '');
  const [twitter, setTwitter] = useState(user?.twitter_handle || '');
  const [tiktok, setTiktok] = useState(user?.tiktok_handle || '');
  const [spotifyId, setSpotifyId] = useState(user?.spotify_artist_id || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync form when user loads
  useEffect(() => {
    if (user) {
      setArtistName(user.artist_name || '');
      setEmail(user.email || '');
      setLocation(user.location || '');
      setGenre(user.primary_genre || '');
      setWhatsapp(user.whatsapp_number || '');
      setInstagram(user.instagram_handle || '');
      setTwitter(user.twitter_handle || '');
      setTiktok(user.tiktok_handle || '');
      setSpotifyId(user.spotify_artist_id || '');
    }
  }, [user]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({
        artist_name: artistName,
        email,
        location,
        primary_genre: genre,
        whatsapp_number: whatsapp,
        instagram_handle: instagram,
        twitter_handle: twitter,
        tiktok_handle: tiktok,
        spotify_artist_id: spotifyId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const sections = [
    { id: 'profile', icon: User, label: 'Profile', active: true, href: null },
    { id: 'notifications', icon: Bell, label: 'Notifications', active: false, href: '/notifications' },
    { id: 'security', icon: Shield, label: 'Security', active: false, href: '/security' },
    { id: 'appearance', icon: Palette, label: 'Appearance', active: false, href: '/appearance' },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#3d91f4]/5 rounded-full blur-3xl animate-ambient" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">Manage your account and preferences</p>
        </div>

        {/* Settings nav */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => s.href && router.push(s.href)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all',
                s.active ? 'bg-[#1db954]/15 text-[#1db954] border border-[#1db954]/20' : 'glass-card text-[var(--muted-foreground)]',
                s.href && 'cursor-pointer hover:text-[var(--foreground)]'
              )}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
            </button>
          ))}
        </div>

        {/* Profile Form */}
        <div className="glass-strong rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1db954] to-[#3d91f4] flex items-center justify-center text-sm font-bold shadow-lg shadow-[#1db954]/20">
              {user?.artist_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            <div>
              <h3 className="font-bold">Profile</h3>
              <p className="text-xs text-[var(--subtle-foreground)]">Update your artist information</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Artist Name</label>
              <input
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                placeholder="Your artist name"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Primary Genre</label>
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Afrobeats, Hip-Hop, etc."
                className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
              />
            </div>
          </div>

          {/* Social Handles */}
          <div className="pt-4 border-t border-white/5">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-[var(--muted-foreground)]" />
              Social & Contact
            </h4>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1.5 flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" /> WhatsApp Number
                </label>
                <input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+234..."
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1.5 flex items-center gap-1">
                  <BRAND_ICONS.instagram.Icon className="w-3 h-3" style={{ color: BRAND_ICONS.instagram.color }} /> Instagram Handle
                </label>
                <input
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@yourhandle"
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1.5 flex items-center gap-1">
                  <BRAND_ICONS.x.Icon className="w-3 h-3" style={{ color: BRAND_ICONS.x.color }} /> Twitter / X Handle
                </label>
                <input
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="@yourhandle"
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1.5 flex items-center gap-1">
                  <BRAND_ICONS.tiktok.Icon className="w-3 h-3" style={{ color: BRAND_ICONS.tiktok.color }} /> TikTok Handle
                </label>
                <input
                  value={tiktok}
                  onChange={(e) => setTiktok(e.target.value)}
                  placeholder="@yourhandle"
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1.5 flex items-center gap-1">
                  <BRAND_ICONS.spotify.Icon className="w-3 h-3" style={{ color: BRAND_ICONS.spotify.color }} /> Spotify Artist ID
                </label>
                <input
                  value={spotifyId}
                  onChange={(e) => setSpotifyId(e.target.value)}
                  placeholder="spotify:artist:..."
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#1db954] text-black font-semibold hover:bg-[#1ed760] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Task 48-d Part 4a — first real UI surface for points_history
            anywhere in this repo. Compact/minimal by design; a fuller
            experience is Part 4b, not attempted here. */}
        <div className="mt-6">
          <PointsHistoryPanel userId={user?.id} />
        </div>
      </div>
    </div>
  );
}
