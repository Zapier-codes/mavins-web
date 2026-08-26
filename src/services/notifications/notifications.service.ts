// src/services/notifications/notifications.service.ts
/**
 * Notifications service.
 *
 * Reads/writes the `notifications` table that every gamification, withdrawal,
 * and webhook route already inserts into (streak/update, tasks/claim,
 * tier/check, withdrawal/request, webhooks/nakama) — this was previously
 * write-only, since nothing in the UI ever read it back.
 *
 * Row shape (as inserted elsewhere in the codebase):
 *   { id, user_id, type, content: { text, ... }, read, created_at }
 */

import { supabase } from '@/lib/supabase/client';

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  content: { text: string; [key: string]: any };
  read: boolean;
  created_at: string;
}

const TYPE_META: Record<string, { emoji: string; label: string }> = {
  milestone: { emoji: '🔥', label: 'Streak' },
  points_earned: { emoji: '💰', label: 'Points' },
  tier_upgrade: { emoji: '🏆', label: 'Tier' },
  withdrawal_requested: { emoji: '💸', label: 'Withdrawal' },
  system: { emoji: '🔔', label: 'System' },
};

export function getNotificationMeta(type: string) {
  return TYPE_META[type] || TYPE_META.system;
}

export async function getNotifications(userId: string, limit = 30): Promise<AppNotification[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[notifications] getNotifications error:', error.message);
    return [];
  }
  return (data || []) as AppNotification[];
}

export async function getUnreadCount(userId: string): Promise<number> {
  if (!userId) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    console.warn('[notifications] getUnreadCount error:', error.message);
    return 0;
  }
  return count || 0;
}

export async function markAsRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) console.warn('[notifications] markAsRead error:', error.message);
}

export async function markAllAsRead(userId: string): Promise<void> {
  if (!userId) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) console.warn('[notifications] markAllAsRead error:', error.message);
}
