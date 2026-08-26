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
  // NOTE: /leaderboard is intentionally NOT protected. The rankings are public
  // by design (get_leaderboard is granted to the `anon` role in Supabase) so
  // visitors can see real participation and gamification progress before
  // signing up.
  const isProtectedRoute = req.nextUrl.pathname.startsWith('/dashboard') ||
                          req.nextUrl.pathname.startsWith('/profile') ||
                          req.nextUrl.pathname.startsWith('/earnings') ||
                          req.nextUrl.pathname.startsWith('/api/protected');

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
    '/earnings/:path*',
    '/api/:path*',
    '/login/:path*',
    '/share/:path*',
    '/api/share/:path*',
    '/api/deeplink/:path*',
  ],
};

