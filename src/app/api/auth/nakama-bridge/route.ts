// src/app/api/auth/nakama-bridge/route.ts
//
// Task 48-c Part 1 (handover.md) — the server-side half of "wire all
// real users authenticated through the Nakama instance." A client
// that has already authenticated directly against Nakama (via
// @heroiclabs/nakama-js's authenticateEmail/authenticateCustom/
// authenticateDevice, wherever Part 2 ends up calling that from) POSTs
// its resulting Nakama session token here; this route verifies that
// token against the real Nakama server, then finds-or-creates a linked
// Supabase identity and returns a real Supabase session for it.
//
// Deliberately NOT wired into any UI yet — that's Part 2's job (the
// client-side Nakama SDK integration; nothing in this codebase calls
// the Nakama SDK's own authenticate methods today, confirmed via grep
// before writing this). This route exists and is independently
// testable/callable without Part 2 existing yet.

import { NextRequest, NextResponse } from 'next/server';
import { nakamaService } from '@/services/nakama/nakama.service';
import { resolveOrLinkNakamaIdentity } from '@/lib/auth/nakamaBridge';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nakamaToken, email } = body;

    if (!nakamaToken || typeof nakamaToken !== 'string') {
      return NextResponse.json({ error: 'nakamaToken is required' }, { status: 400 });
    }

    // The one real security boundary this whole route exists to
    // enforce: never trust a client-supplied Nakama user id directly.
    // This call makes Nakama itself validate the token and hand back
    // the authoritative id for whoever it actually belongs to.
    const verified = await nakamaService.verifyClientSession(nakamaToken);
    if (!verified) {
      return NextResponse.json({ error: 'Invalid or expired Nakama session' }, { status: 401 });
    }

    // Email is required to provision the backing Supabase Auth
    // identity on first contact (see resolveOrLinkNakamaIdentity's own
    // doc comment for why this isn't decided/defaulted inside that
    // function). Not required at all for an ALREADY-linked identity —
    // only used on first contact, so an existing Nakama user signing
    // in again doesn't need to keep resending it.
    if (email !== undefined && (typeof email !== 'string' || !EMAIL_RE.test(email))) {
      return NextResponse.json({ error: 'email, if provided, must be a valid email address' }, { status: 400 });
    }

    if (!email) {
      // Might still be fine if this identity is already linked --
      // resolveOrLinkNakamaIdentity only actually needs `email` on the
      // create-new-account path. Rather than duplicate that branching
      // logic here, just require it unconditionally for now (simplest
      // correct behavior for Part 1) -- Part 2's own client integration
      // decides where a real email actually comes from for a given
      // Nakama auth method and should always send one.
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    const result = await resolveOrLinkNakamaIdentity(verified.nakamaUserId, email, verified.username);

    if (!result.session) {
      // Account exists/was created, but session minting failed --
      // same degraded-but-not-broken posture as guestCheckout.ts's own
      // equivalent case. Client should fall back to a normal
      // email/password login rather than treat this as a hard failure.
      return NextResponse.json(
        {
          success: true,
          userId: result.userId,
          isNewAccount: result.isNewAccount,
          session: null,
          warning: 'Account resolved but session could not be minted automatically. Please log in normally.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      userId: result.userId,
      isNewAccount: result.isNewAccount,
      session: result.session,
    });
  } catch (err: any) {
    console.error('Nakama bridge route error:', err);
    return NextResponse.json({ error: err.message || 'Failed to bridge Nakama identity' }, { status: 500 });
  }
}
