// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  
  // Create Supabase client for middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // Get session for auth check
  const { data: { session } } = await supabase.auth.getSession();

  // --- SHARE ROUTE HANDLING ---
  const isShareRoute = req.nextUrl.pathname.startsWith('/share/');
  const isShareApiRoute = req.nextUrl.pathname.startsWith('/api/share/');
  const isDeeplinkRoute = req.nextUrl.pathname.startsWith('/api/deeplink/');

  // Skip auth check for share and deeplink routes
  if (isShareRoute || isShareApiRoute || isDeeplinkRoute) {
    if (isShareRoute) {
      res.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    }
    
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('X-XSS-Protection', '1; mode=block');
    res.headers.set('Access-Control-Allow-Origin', '*');
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    
    return res;
  }

  // --- PROTECTED ROUTES ---
  // The whole artist-facing product is intentionally public: home,
  // leaderboard, analytics, other artists' performance/spikes/graphs,
  // activity, and earnings pages all render for anonymous visitors
  // (get_leaderboard etc. are granted to the `anon` role in Supabase)
  // so guests can see real participation and gamification progress
  // before ever creating an account. The only thing that stays gated
  // is the internal admin console -- "public app" means the product,
  // not the ops panel.
  //
  // Pages that show a signed-in user's OWN data (e.g. /earnings) are
  // still expected to render a generic/guest state client-side rather
  // than someone else's private ledger -- that's handled in the page
  // itself via useAuth(), not by blocking the route here.
  const isProtectedRoute = req.nextUrl.pathname.startsWith('/admin');

  if (isProtectedRoute && !session) {
    const redirectUrl = new URL('/login', req.url);
    redirectUrl.searchParams.set('redirect', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // --- AUTH ROUTES ---
  const isAuthRoute = req.nextUrl.pathname.startsWith('/login');
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // --- API ROUTE HANDLING ---
  if (req.nextUrl.pathname.startsWith('/api/')) {
    res.headers.set('Access-Control-Allow-Origin', '*');
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { 
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }
  }

  // --- SECURITY HEADERS ---
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return res;
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/earnings/:path*',
    '/api/:path*',
    '/login/:path*',
    '/share/:path*',
    '/api/share/:path*',
    '/api/deeplink/:path*',
  ],
};

