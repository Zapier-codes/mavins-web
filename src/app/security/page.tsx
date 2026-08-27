'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import {
  Shield, ChevronLeft, Lock, LogOut, CheckCircle2, Eye, EyeOff,
} from 'lucide-react';

const MIN_PASSWORD_LENGTH = 8;

export default function SecurityPage() {
  const { user, isAuthenticated, isLoading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const handleChangePassword = async () => {
    setError(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);

    if (updateError) {
      setError(updateError.message || 'Could not update password');
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    router.push('/');
  };

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <Shield className="w-10 h-10 mx-auto mb-3 text-[var(--muted-foreground)] opacity-50" />
          <h1 className="font-display text-xl font-semibold">Sign in to manage security</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1.5">
            Update your password and manage your session from here.
          </p>
          <Link
            href="/login"
            className="inline-flex mt-5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--accent-light)] to-[var(--accent)] text-[var(--background)] font-semibold text-sm"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#3d91f4]/5 rounded-full blur-3xl animate-ambient" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="p-2 -ml-2 rounded-xl glass-card md:hidden"
            aria-label="Back to Settings"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Security</h1>
            <p className="text-[var(--muted-foreground)] text-sm mt-1">
              Manage your password and account session
            </p>
          </div>
        </div>

        {/* Change password */}
        <div className="glass-strong rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-[#3d91f4]/15 flex items-center justify-center">
              <Lock className="w-4 h-4 text-[#3d91f4]" />
            </div>
            <div>
              <h3 className="font-bold">Change Password</h3>
              <p className="text-xs text-[var(--subtle-foreground)]">
                Signed in as {user?.email || 'your account'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  className="w-full px-4 py-3 pr-11 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Confirm New Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
              />
            </div>

            {error && (
              <p className="text-xs text-[#e0574a]">{error}</p>
            )}

            <button
              onClick={handleChangePassword}
              disabled={saving || !newPassword || !confirmPassword}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#1db954] text-black font-semibold hover:bg-[#1ed760] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              {saved ? 'Password Updated!' : saving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>

        {/* Session */}
        <div className="glass-strong rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-[#e0574a]/15 flex items-center justify-center">
              <LogOut className="w-4 h-4 text-[#e0574a]" />
            </div>
            <div>
              <h3 className="font-bold">Session</h3>
              <p className="text-xs text-[var(--subtle-foreground)]">Sign out of this device</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className={cn(
              'w-full sm:w-auto px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50',
              'bg-[#e0574a]/10 text-[#e0574a] hover:bg-[#e0574a]/20'
            )}
          >
            {signingOut ? (
              <div className="w-4 h-4 border-2 border-[#e0574a]/30 border-t-[#e0574a] rounded-full animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            {signingOut ? 'Signing Out...' : 'Sign Out'}
          </button>
        </div>
      </div>
    </div>
  );
}
