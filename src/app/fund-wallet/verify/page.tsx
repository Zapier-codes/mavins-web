'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

type Status = 'checking' | 'success' | 'failed';

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState('Confirming your payment…');

  useEffect(() => {
    let reference = searchParams.get('reference');
    let redirectTo = searchParams.get('redirect') || '/';

    // Fallback if Korapay's redirect stripped our query params.
    if (!reference) {
      try {
        const saved = sessionStorage.getItem('mavins_pending_verify');
        if (saved) {
          const parsed = JSON.parse(saved);
          reference = parsed.reference;
          redirectTo = parsed.redirect || redirectTo;
        }
      } catch {}
    }

    if (!reference) {
      setStatus('failed');
      setMessage('Missing payment reference.');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/payments/verify/${encodeURIComponent(reference!)}`);
        const data = await res.json();

        try { sessionStorage.removeItem('mavins_pending_verify'); } catch {}

        if (!res.ok || !data.success || data.status !== 'successful') {
          setStatus('failed');
          setMessage(data.error || 'Payment was not successful.');
          return;
        }

        // Brand-new guest account: apply the session we were handed so
        // the browser is actually logged in for what comes next.
        if (data.session) {
          const { error } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          if (error) console.error('Failed to apply guest session:', error);
        }

        setStatus('success');

        if (data.account?.created) {
          setMessage('Payment confirmed — your account is ready.');
          router.replace(`/complete-profile?redirect=${encodeURIComponent(redirectTo)}`);
          return;
        }

        if (data.requiresLogin) {
          setMessage('Payment confirmed. Log in to see your updated balance.');
          router.replace(`/login?notice=fund-credited&redirect=${encodeURIComponent(redirectTo)}`);
          return;
        }

        setMessage('Payment confirmed.');
        router.replace(redirectTo);
      } catch (err: any) {
        setStatus('failed');
        setMessage(err.message || 'Something went wrong confirming your payment.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        {status === 'checking' && <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-emerald-500" />}
        {status === 'success' && <CheckCircle2 className="w-10 h-10 mx-auto mb-4 text-emerald-500" />}
        {status === 'failed' && <XCircle className="w-10 h-10 mx-auto mb-4 text-red-500" />}
        <p className="text-sm text-muted-foreground">{message}</p>
        {status === 'failed' && (
          <a href="/fund-wallet" className="inline-block mt-4 text-sm font-medium text-emerald-500 hover:underline">
            Try again
          </a>
        )}
      </div>
    </div>
  );
}

export default function FundWalletVerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  );
}
