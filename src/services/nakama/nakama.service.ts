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
        undefined,
        true, // create if not exists
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
      await this.client.writeLeaderboardRecord(
        session,
        leaderboardId,
        score,
        subscore,
        metadata ? JSON.stringify(metadata) : undefined
      );
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
        ownerIds || [],
        undefined,
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
          user_id: userId,
          value: JSON.stringify(value),
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
      const ids = keys
        ? keys.map((k) => ({ collection, key: k, userId }))
        : [{ collection, key: '*', userId }];

      const result = await this.client.readStorageObjects(session, ids);
      return (result.objects || []).map((obj) => ({
        ...obj,
        value: obj.value ? JSON.parse(obj.value) : null,
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
          value: obj.value ? JSON.parse(obj.value) : null,
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
    try {
      // This is a simplified approximation — real presence requires socket
      const session = await this.authenticateServer();
      const result = await this.client.listUsers(session, [], 1);
      return result.users?.length || 0;
    } catch {
      return 0;
    }
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
