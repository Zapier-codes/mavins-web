'use client';

import React, { useState } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { useTheme } from '@/components/providers/ThemeProvider';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { 
  User, Bell, Shield, Palette, Globe, 
  ChevronRight, Save, CheckCircle2
} from 'lucide-react';

export default function SettingsPage() {
  const { user, isAuthenticated } = useAuth();
  const { mode, toggleTheme } = useTheme();
  const [artistName, setArtistName] = useState(user?.artistName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [location, setLocation] = useState(user?.location || '');
  const [genre, setGenre] = useState(user?.primaryGenre || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    { id: 'profile', icon: User, label: 'Profile', active: true },
    { id: 'notifications', icon: Bell, label: 'Notifications', active: false },
    { id: 'security', icon: Shield, label: 'Security', active: false },
    { id: 'appearance', icon: Palette, label: 'Appearance', active: false },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#3d91f4]/5 rounded-full blur-3xl animate-ambient" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-[#a0a0b0] text-sm mt-1">Manage your account and preferences</p>
        </div>

        {/* Settings nav (mobile) */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {sections.map((s) => (
            <button
              key={s.id}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all',
                s.active ? 'bg-[#1db954]/15 text-[#1db954] border border-[#1db954]/20' : 'glass-card text-[#a0a0b0]'
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
              {user?.artistName?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            <div>
              <h3 className="font-bold">Profile</h3>
              <p className="text-xs text-[#6b6b7b]">Update your artist information</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#a0a0b0] mb-1.5">Artist Name</label>
              <input
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                placeholder="Your artist name"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[#6b6b7b]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#a0a0b0] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[#6b6b7b]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#a0a0b0] mb-1.5">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[#6b6b7b]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#a0a0b0] mb-1.5">Primary Genre</label>
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="e.g. Afrobeats"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[#6b6b7b]"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#1db954] text-black font-semibold text-sm hover:bg-[#1ed760] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : saved ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>

        {/* Appearance */}
        <div className="glass-strong rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#3d91f4]/10 flex items-center justify-center">
                <Palette className="w-5 h-5 text-[#3d91f4]" />
              </div>
              <div>
                <h3 className="font-bold">Appearance</h3>
                <p className="text-xs text-[#6b6b7b]">Theme preferences</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                mode === 'dark' ? 'bg-[#1db954] text-black' : 'glass-card text-[#a0a0b0]'
              )}
            >
              {mode === 'dark' ? 'Dark' : 'Light'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
