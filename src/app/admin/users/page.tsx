'use client';

// Task 46d (handover.md): split verbatim from the old admin/page.tsx
// monolith's 'users' tab, originally read-only.
//
// Task 46f-c (this session, 2026-08-30): replaces that read-only
// table with real actions wired to /api/admin/users/[id] (46f-b) —
// wallet adjustment, starting-capital grant, and root-only role
// assignment. Same inline-expandable-row convention
// admin/campaigns/page.tsx already established for its own 46c
// actions (Fragment + a conditional colSpan row directly under the
// relevant data row) — followed deliberately, not a modal, for visual
// consistency across the two admin pages that both do this.
//
// Wallet adjustment reuses TypeToConfirm (46e) on the amount, per
// 46f-c's own explicit instruction ("that's exactly the kind of
// high-stakes, easy-to-fat-finger action that component exists for").
// Starting-capital grant and role assignment stay a plain confirm —
// 46f-c's own text only named wallet-adjustment for the TypeToConfirm
// treatment; a grant is a fixed one-directional credit (nothing to
// mistype into a wrong sign the way a +/- adjustment has), and a role
// change is explicitly framed as "lower-stakes/more reversible" in
// that same note.
//
// Capability picker for 'custom' role assignment: NOT built here —
// 46f-c's own text says it should be "built from whatever concrete
// list 46f-d produces," and 46f-d (capability-key taxonomy) hasn't run
// yet. 'custom' is still selectable in the role dropdown below (so the
// UI doesn't silently hide a real enum value), but shows a plain
// placeholder explaining why no picker exists yet instead of a fake
// one — see the roleEditingId block's own comment.

import { useState, Fragment } from 'react';
import { AlertCircle, Wallet, Gift, Shield, Check, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { isRootAdmin } from '@/lib/auth/isAdmin';
import { useAdminDashboardData } from '../useAdminDashboardData';
import { TypeToConfirm, isConfirmed } from '@/components/admin/TypeToConfirm';

type AdminRole = 'full' | 'monitor' | 'custom';

export default function AdminUsersPage() {
  const { users, isLoading, loadError, reload } = useAdminDashboardData();
  const { user: viewer } = useAuth();
  // isRootAdmin() is deliberately called client-side here purely to
  // decide whether to RENDER the role-assignment control at all — the
  // real enforcement is server-side in the route (a non-root admin
  // gets a 403 there regardless of what this page shows them). Hiding
  // a control that would just 403 is a UX improvement, not the
  // security boundary itself.
  const viewerIsRoot = isRootAdmin(viewer ? { email: viewer.email } : null);

  const [walletEditingId, setWalletEditingId] = useState<string | null>(null);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletReason, setWalletReason] = useState('');
  const [walletConfirm, setWalletConfirm] = useState('');
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [grantAmount, setGrantAmount] = useState('');
  const [grantSaving, setGrantSaving] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  const [roleEditingId, setRoleEditingId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<AdminRole>('full');
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const walletAmountNumber = Number(walletAmount);
  const walletAmountValid = walletAmount.trim() !== '' && Number.isFinite(walletAmountNumber) && Number.isInteger(walletAmountNumber) && walletAmountNumber !== 0;
  const walletConfirmed = !walletAmountValid || isConfirmed(walletConfirm, walletAmountNumber);

  function openWalletEdit(userId: string) {
    setWalletEditingId(userId);
    setWalletAmount('');
    setWalletReason('');
    setWalletConfirm('');
    setWalletError(null);
  }
  function closeWalletEdit() {
    setWalletEditingId(null);
    setWalletError(null);
  }

  async function submitWalletAdjustment(userId: string) {
    if (!walletAmountValid || !walletConfirmed || walletReason.trim() === '') return;
    setWalletSaving(true);
    setWalletError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'adjust_wallet', amountCents: walletAmountNumber, reason: walletReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      closeWalletEdit();
      reload();
    } catch (e: any) {
      setWalletError(e.message || 'Failed to adjust wallet');
    } finally {
      setWalletSaving(false);
    }
  }

  function openGrant(userId: string) {
    setGrantingId(userId);
    setGrantAmount('');
    setGrantError(null);
  }
  function closeGrant() {
    setGrantingId(null);
    setGrantError(null);
  }

  async function submitGrant(userId: string) {
    const amount = Number(grantAmount);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) return;
    setGrantSaving(true);
    setGrantError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant_starting_capital', amountCents: amount }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      closeGrant();
      reload();
    } catch (e: any) {
      setGrantError(e.message || 'Failed to grant starting capital');
    } finally {
      setGrantSaving(false);
    }
  }

  function openRoleEdit(u: any) {
    setRoleEditingId(u.id);
    setRoleDraft((u.admin_role as AdminRole) || 'full');
    setRoleError(null);
  }
  function closeRoleEdit() {
    setRoleEditingId(null);
    setRoleError(null);
  }

  async function submitRole(userId: string) {
    setRoleSaving(true);
    setRoleError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // adminPermissions intentionally omitted for 'custom' here —
        // see this file's own header comment on why no picker exists
        // yet. The route itself requires an array when adminRole is
        // 'custom' (its own validation), so submitting 'custom' from
        // this page today would 400 rather than silently persist an
        // empty/undefined permission set — a real capability picker
        // (46f-d) needs to exist before 'custom' is actually usable
        // end-to-end, not just selectable in this dropdown.
        body: JSON.stringify({ action: 'set_role', adminRole: roleDraft }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      closeRoleEdit();
      reload();
    } catch (e: any) {
      setRoleError(e.message || 'Failed to update role');
    } finally {
      setRoleSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[#1db954]/30 border-t-[#1db954] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="glass-strong rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[var(--muted-foreground)]">
                <th className="text-left px-4 py-3 font-medium">Artist</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Admin Role</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 font-medium">{u.artist_name || '—'}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.role === 'admin' ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#1db954]/10 text-[#1db954]">
                          {u.admin_role || 'admin'}
                        </span>
                      ) : (
                        <span className="text-[var(--subtle-foreground)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--subtle-foreground)]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => (walletEditingId === u.id ? closeWalletEdit() : openWalletEdit(u.id))}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                          title="Adjust wallet balance"
                        >
                          <Wallet className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => (grantingId === u.id ? closeGrant() : openGrant(u.id))}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                          title="Grant starting capital"
                        >
                          <Gift className="w-4 h-4" />
                        </button>
                        {viewerIsRoot && u.role === 'admin' && (
                          <button
                            onClick={() => (roleEditingId === u.id ? closeRoleEdit() : openRoleEdit(u))}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            title="Assign admin role (root only)"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {walletEditingId === u.id && (
                    <tr className="border-b border-white/5 bg-white/5">
                      <td colSpan={5} className="px-4 py-4">
                        <div className="space-y-3">
                          <p className="text-xs text-[var(--subtle-foreground)]">
                            Support-case wallet correction — positive to credit, negative to debit. Logged to the audit trail.
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs">
                              <span className="block text-[var(--muted-foreground)] mb-1">Amount (cents, +/-)</span>
                              <input
                                value={walletAmount}
                                onChange={(e) => { setWalletAmount(e.target.value); setWalletConfirm(''); }}
                                placeholder="e.g. -500 or 1000"
                                className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs focus:outline-none focus:border-[#1db954]/50"
                              />
                            </label>
                            <label className="text-xs">
                              <span className="block text-[var(--muted-foreground)] mb-1">Reason (required)</span>
                              <input
                                value={walletReason}
                                onChange={(e) => setWalletReason(e.target.value)}
                                placeholder="e.g. refund for failed campaign"
                                className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs focus:outline-none focus:border-[#1db954]/50"
                              />
                            </label>
                          </div>
                          {walletAmountValid && (
                            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                              <TypeToConfirm
                                expectedValue={walletAmountNumber}
                                label={`Type ${walletAmountNumber} to confirm this wallet adjustment`}
                                value={walletConfirm}
                                onChange={setWalletConfirm}
                                disabled={walletSaving}
                              />
                            </div>
                          )}
                          {walletError && <p className="text-xs text-rose-400">{walletError}</p>}
                          <div className="flex items-center gap-2">
                            <button
                              disabled={walletSaving || !walletAmountValid || !walletConfirmed || walletReason.trim() === ''}
                              onClick={() => submitWalletAdjustment(u.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1db954] text-black text-xs font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {walletSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                            </button>
                            <button disabled={walletSaving} onClick={closeWalletEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs font-medium disabled:opacity-50">
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {grantingId === u.id && (
                    <tr className="border-b border-white/5 bg-white/5">
                      <td colSpan={5} className="px-4 py-4">
                        <div className="space-y-3">
                          <p className="text-xs text-[var(--subtle-foreground)]">
                            One-time starting-capital credit — recorded distinctly from a wallet adjustment in the ledger.
                          </p>
                          <label className="text-xs block max-w-[200px]">
                            <span className="block text-[var(--muted-foreground)] mb-1">Amount (cents, positive)</span>
                            <input
                              value={grantAmount}
                              onChange={(e) => setGrantAmount(e.target.value)}
                              placeholder="e.g. 5000"
                              className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs focus:outline-none focus:border-[#1db954]/50"
                            />
                          </label>
                          {grantAmount.trim() !== '' && (Number(grantAmount) <= 0 || !Number.isInteger(Number(grantAmount))) && (
                            <p className="text-xs text-rose-400">Must be a positive whole number of cents.</p>
                          )}
                          {grantError && <p className="text-xs text-rose-400">{grantError}</p>}
                          <div className="flex items-center gap-2">
                            <button
                              disabled={grantSaving || !Number.isInteger(Number(grantAmount)) || Number(grantAmount) <= 0}
                              onClick={() => submitGrant(u.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1db954] text-black text-xs font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {grantSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Grant
                            </button>
                            <button disabled={grantSaving} onClick={closeGrant} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs font-medium disabled:opacity-50">
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {roleEditingId === u.id && (
                    <tr className="border-b border-white/5 bg-white/5">
                      <td colSpan={5} className="px-4 py-4">
                        <div className="space-y-3">
                          <p className="text-xs text-[var(--subtle-foreground)]">
                            Root-only. Changing an assigned admin's role is lower-stakes/more reversible than a money action — plain confirm, no type-to-confirm gate.
                          </p>
                          <div className="flex items-center gap-2">
                            {(['full', 'monitor', 'custom'] as const).map((r) => (
                              <button
                                key={r}
                                onClick={() => setRoleDraft(r)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${roleDraft === r ? 'bg-[#1db954] text-black' : 'glass-card text-[var(--muted-foreground)]'}`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                          {roleDraft === 'custom' && (
                            <p className="text-xs text-amber-400">
                              A per-capability picker isn't built yet (Task 46f-d, capability-key taxonomy, hasn't run) — saving 'custom' will be rejected by the route until that lands.
                            </p>
                          )}
                          {roleError && <p className="text-xs text-rose-400">{roleError}</p>}
                          <div className="flex items-center gap-2">
                            <button
                              disabled={roleSaving}
                              onClick={() => submitRole(u.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1db954] text-black text-xs font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {roleSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                            </button>
                            <button disabled={roleSaving} onClick={closeRoleEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs font-medium disabled:opacity-50">
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
