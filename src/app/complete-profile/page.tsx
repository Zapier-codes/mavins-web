'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';

const GENRES = [
  'Afrobeats', 'Amapiano', 'Hip-Hop', 'R&B', 'Pop',
  'Electronic', 'Reggae', 'Gospel', 'Highlife', 'Jazz',
  'Rock', 'Afro-fusion', 'Drill', 'Dancehall',
];

// This writes onto the EXISTING users row (artist_name, primary_genre,
// profile_completed) -- there is no separate profile table. Skipping
// just leaves profile_completed at its default (false) and moves on;
// it's a nudge that can be finished later from Settings, not a wall.
function CompleteProfileForm() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';

  const [artistName, setArtistName] = useState('');
  const [genre, setGenre] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setError('Session not ready yet — please try again in a moment.');
      return;
    }
    setIsSaving(true);
    setError('');

    const { error: updateError } = await supabase
      .from('users')
      .update({
        artist_name: artistName.trim() || null,
        primary_genre: genre || null,
        profile_completed: true,
      })
      .eq('id', user.id);

    setIsSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Task 18: only the actual "successfully completed" path gets the
    // one-time welcome banner -- append `welcome=1` so the destination
    // page can show it exactly once and strip the param immediately
    // (see src/app/page.tsx), rather than it re-showing on every future
    // visit/login the way the old unconditional page header did.
    const separator = redirectTo.includes('?') ? '&' : '?';
    router.replace(`${redirectTo}${separator}welcome=1`);
  };

  const handleSkip = () => {
    router.replace(redirectTo);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 mb-4">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">You're in 🎉</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Add a couple of details so fans and the leaderboard know who you are — or skip and do this later from Settings.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Artist name</label>
            <input
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="How fans see you"
              className="w-full px-4 py-3 rounded-xl border bg-background"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Primary genre</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border bg-background"
            >
              <option value="">Select a genre</option>
              {GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={isSaving}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white',
              'bg-gradient-to-r from-violet-500 to-purple-500 hover:opacity-90 transition-opacity',
              isSaving && 'opacity-60 cursor-not-allowed'
            )}
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                Save and continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Skip for now
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={null}>
      <CompleteProfileForm />
    </Suspense>
  );
}
