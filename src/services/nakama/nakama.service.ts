// src/services/nakama/nakama.service.ts
/**
 * Nakama Integration Service
 * 
 * Connects to the hosted Nakama instance at https://nakama-mmpb.onrender.com
 * Provides:
 * - Server-authenticated client for leaderboard writes
 * - Storage object CRUD for campaign metadata
 * - Real-time leaderboard fetching
 * 
 * Uses @heroiclabs/nakama-js for type-safe Nakama API access.
 */

import { Client, Session } from '@heroiclabs/nakama-js';

const NAKAMA_HOST = process.env.NEXT_PUBLIC_NAKAMA_SERVER || 'nakama-mmpb.onrender.com';
const NAKAMA_PORT = process.env.NEXT_PUBLIC_NAKAMA_PORT || '443';
const NAKAMA_KEY = process.env.NEXT_PUBLIC_NAKAMA_KEY || 'defaultkey';
const NAKAMA_USE_SSL = true;

class NakamaService {
  private client: Client;
  private serverSession: Session | null = null;

  constructor() {
    this.client = new Client(
      NAKAMA_KEY,
      NAKAMA_HOST,
      NAKAMA_PORT,
      NAKAMA_USE_SSL
    );
  }

  /**
   * Authenticate as the server (using a system user).
   * Call this before any server-side write operations.
   */
  async authenticateServer(): Promise<Session> {
    if (this.serverSession && !this.serverSession.isexpired) {
      return this.serverSession;
    }

    try {
      // Use a deterministic system ID for server auth
      const session = await this.client.authenticateCustom(
        'mavins-server-system',
        true, // create if not exists
        undefined,
        { role: 'system', source: 'mavins-web' }
      );
      this.serverSession = session;
      return session;
    } catch (err: any) {
      console.error('[Nakama] Server auth failed:', err.message);
      throw err;
    }
  }

  /**
   * Task 48-c Part 1 (handover.md): verifies a CLIENT's own Nakama
   * session token (not this service's server-authenticated session)
   * by calling Nakama's `GET /v2/account` with it as the bearer token.
   * Nakama itself validates the token's signature/expiry before
   * returning anything — a successful response here means the caller
   * genuinely holds a live Nakama session, and the `id` in the
   * response is Nakama's own authoritative user id for that session,
   * never something trusted from client-supplied input. This is the
   * verification step 48-c's bridge endpoint needs before it can
   * safely link/provision a Supabase identity for whoever this is.
   *
   * Deliberately a direct REST call rather than reconstructing a
   * nakama-js `Session` object from just a token string (that class
   * expects several fields this bridge doesn't have reason to parse
   * out of a raw client-supplied token) — same "call the REST API
   * directly" style already used in `api/nakama/route.ts`.
   */
  async verifyClientSession(clientToken: string): Promise<{ nakamaUserId: string; username: string | null } | null> {
    try {
      const response = await fetch(`https://${NAKAMA_HOST}:${NAKAMA_PORT}/v2/account`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${clientToken}` },
      });

      if (!response.ok) {
        console.warn(`[Nakama] verifyClientSession: /v2/account returned ${response.status}`);
        return null;
      }

      const account = await response.json();
      const nakamaUserId: string | undefined = account?.user?.id;
      if (!nakamaUserId) {
        console.warn('[Nakama] verifyClientSession: /v2/account response had no user.id');
        return null;
      }

      return { nakamaUserId, username: account?.user?.username ?? null };
    } catch (err: any) {
      console.warn('[Nakama] verifyClientSession failed:', err.message);
      return null;
    }
  }

  /**
   * Write a leaderboard record.
   * Used by the seed engine to sync campaign/artist stream counts.
   */
  async writeLeaderboardRecord(
    leaderboardId: string,
    ownerId: string,
    score: number,
    subscore?: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const session = await this.authenticateServer();
      await this.client.writeLeaderboardRecord(session, leaderboardId, {
        score: score.toString(),
        subscore: subscore?.toString(),
        metadata,
      });
    } catch (err: any) {
      console.warn(`[Nakama] Leaderboard write failed (${leaderboardId}):`, err.message);
    }
  }

  /**
   * List leaderboard records around a specific user.
   */
  async listLeaderboardRecords(
    leaderboardId: string,
    ownerId?: string,
    limit: number = 20
  ): Promise<any[]> {
    try {
      const session = await this.authenticateServer();
      const result = await this.client.listLeaderboardRecords(
        session,
        leaderboardId,
        ownerId ? [ownerId] : [],
        limit
      );
      return result.records || [];
    } catch (err: any) {
      console.warn(`[Nakama] Leaderboard list failed (${leaderboardId}):`, err.message);
      return [];
    }
  }

  /**
   * Write a storage object.
   * Used to persist campaign metadata, artist profiles, etc.
   */
  async writeStorageObject(
    userId: string,
    collection: string,
    key: string,
    value: Record<string, any>,
    permissionRead: number = 2, // 0=none, 1=owner, 2=public
    permissionWrite: number = 0
  ): Promise<void> {
    try {
      const session = await this.authenticateServer();
      await this.client.writeStorageObjects(session, [
        {
          collection,
          key,
          // Note: nakama-js's WriteStorageObject type has no user_id field —
          // writes always land under the authenticated (server) session's
          // own user via this client method.
          value,
          permission_read: permissionRead,
          permission_write: permissionWrite,
        },
      ]);
    } catch (err: any) {
      console.warn(`[Nakama] Storage write failed (${collection}/${key}):`, err.message);
    }
  }

  /**
   * Read storage objects for a user.
   */
  async readStorageObjects(
    userId: string,
    collection: string,
    keys?: string[]
  ): Promise<any[]> {
    try {
      const session = await this.authenticateServer();
      const objectIds = keys
        ? keys.map((k) => ({ collection, key: k, user_id: userId }))
        : [{ collection, key: '*', user_id: userId }];

      const result = await this.client.readStorageObjects(session, { object_ids: objectIds });
      return (result.objects || []).map((obj) => ({
        ...obj,
        value: obj.value ?? null,
      }));
    } catch (err: any) {
      console.warn(`[Nakama] Storage read failed (${collection}):`, err.message);
      return [];
    }
  }

  /**
   * List all storage objects in a collection.
   */
  async listStorageObjects(
    collection: string,
    limit: number = 100,
    cursor?: string
  ): Promise<{ objects: any[]; cursor?: string }> {
    try {
      const session = await this.authenticateServer();
      const result = await this.client.listStorageObjects(
        session,
        collection,
        undefined, // userId = undefined for global listing
        limit,
        cursor
      );
      return {
        objects: (result.objects || []).map((obj) => ({
          ...obj,
          value: obj.value ?? null,
        })),
        cursor: result.cursor,
      };
    } catch (err: any) {
      console.warn(`[Nakama] Storage list failed (${collection}):`, err.message);
      return { objects: [] };
    }
  }

  /**
   * Get real-time presence count (approximate online users).
   */
  async getOnlineCount(): Promise<number> {
    // Note: nakama-js's Client has no listUsers API; accurate presence
    // requires a live socket connection. Returning 0 as a safe placeholder
    // until real-time presence tracking is wired up via Socket.
    return 0;
  }

  /**
   * Initialize leaderboards if they don't exist.
   * Call once during setup.
   */
  async setupLeaderboards(): Promise<void> {
    const leaderboards = [
      { id: 'campaign_streams', sort: 'desc', operator: 'best' },
      { id: 'artist_total_streams', sort: 'desc', operator: 'best' },
      { id: 'artist_weekly_growth', sort: 'desc', operator: 'best' },
      { id: 'campaign_saves', sort: 'desc', operator: 'best' },
      { id: 'campaign_shares', sort: 'desc', operator: 'best' },
    ];

    for (const lb of leaderboards) {
      try {
        // Try to write a dummy record — this will create the leaderboard
        // if it doesn't exist (depending on Nakama config)
        await this.writeLeaderboardRecord(lb.id, 'system-init', 0);
      } catch {
        // Leaderboard might already exist or require admin creation
      }
    }
  }
}

// Singleton
export const nakamaService = new NakamaService();
