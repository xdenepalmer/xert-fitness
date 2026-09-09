import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CreditCard, Link2, Loader2, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { lookupFitboxUser } from '@/lib/adminData';
import {AdminBadge} from './ui';

function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
}

function money(cents) {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

async function loadMirror(member) {
  const email = String(member.email || '').trim().toLowerCase();
  const { data: link, error: linkError } = await supabase.from('fitbox_member_links')
    .select('fitbox_user_id, fitbox_status, link_method, linked_at, last_verified_at')
    .eq('lead_type', 'member_profile').eq('lead_id', member.id).maybeSingle();
  if (linkError && !['42P01', 'PGRST205'].includes(linkError.code)) throw linkError;
  let userQuery = supabase.from('fitbox_users').select('fitbox_user_id, first_name, last_name, email, phone, status, role, synced_at');
  userQuery = link?.fitbox_user_id ? userQuery.eq('fitbox_user_id', link.fitbox_user_id) : email ? userQuery.ilike('email', email) : userQuery.eq('fitbox_user_id', '__none__');
  const { data: users, error: userError } = await userQuery.limit(1);
  if (userError) {
    if (['42P01', 'PGRST205'].includes(userError.code)) return { installed: false, link: link || null, user: null, subscriptions: [], attendance: [] };
    throw userError;
  }
  const user = users?.[0] || null;
  if (!user) return { installed: true, link: link || null, user: null, subscriptions: [], attendance: [] };
  const [subscriptions, attendance] = await Promise.all([
    supabase.from('fitbox_subscriptions').select('fitbox_subscription_id, product_name, status, price_in_cents, start_date, expiration_date, sessions_count').eq('fitbox_user_id', user.fitbox_user_id).order('provider_updated_at', { ascending: false, nullsFirst: false }).limit(5),
    supabase.from('fitbox_attendance').select('fitbox_attendance_id, class_name, session_start_time, status').eq('fitbox_user_id', user.fitbox_user_id).gte('session_start_time', new Date().toISOString()).order('session_start_time', { ascending: true }).limit(3),
  ]);
  if (subscriptions.error) throw subscriptions.error;
  if (attendance.error) throw attendance.error;
  return { installed: true, link: link || null, user, subscriptions: subscriptions.data || [], attendance: attendance.data || [] };
}

/** FitBox at a glance for one XERT member: link, status, membership, next session. */
export default function FitboxMemberPanel({ member, disabled = false }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setState(await loadMirror(member));
    } catch (loadError) {
      setError(loadError.message || 'FitBox details could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [member]);

  useEffect(() => { void load(); }, [load]);

  const checkLive = async () => {
    setChecking(true);
    setError('');
    try {
      const result = await lookupFitboxUser({ email: member.email });
      if (!result.found) setError('FitBox has no user with this email yet.');
      await load();
    } catch (lookupError) {
      setError(lookupError.message);
    } finally {
      setChecking(false);
    }
  };

  const user = state?.user;
  return (
    <section className="members-card" aria-labelledby="fitbox-member-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="fitbox-member-title" className="flex flex-wrap items-center gap-2 font-display text-sm uppercase tracking-[0.2em] text-text-secondary"><Link2 className="size-3.5" /> FitBox</h4>
          <p className="mt-1 font-body text-sm text-text-secondary">Membership and billing live in FitBox. This is what FitBox last told XERT.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={disabled || loading || checking} aria-label="Refresh FitBox details" className="admin-kit-button">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {loading && !state ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 font-body text-sm text-text-secondary"><Loader2 className="size-4 animate-spin" /> Checking FitBox mirror…</p>
      ) : state?.installed === false ? (
        <p className="mt-3 font-body text-sm text-state-warning">FitBox mirror tables are not installed yet.</p>
      ) : user ? (
        <div className="mt-3 space-y-3 font-body text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-primary">{[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}</span>
            <AdminBadge status={user.status}>{user.status || 'unknown'}</AdminBadge>
            {state.link && <AdminBadge status="active">Linked · {String(state.link.link_method || '').replace(/_/g, ' ')}</AdminBadge>}
          </div>
          <p className="text-sm text-text-secondary">FitBox ID {user.fitbox_user_id} · {user.email || 'no email'} · {user.phone || 'no phone'} · synced {when(user.synced_at)}</p>
          {state.subscriptions.length > 0 ? state.subscriptions.map(row => (
            <p key={row.fitbox_subscription_id} className="flex flex-wrap items-start gap-2 text-sm text-text-secondary"><CreditCard className="mt-0.5 size-3.5 shrink-0 text-text-secondary" /> {row.product_name || 'Membership'} · {row.status} · {money(row.price_in_cents)}{row.sessions_count !== null && row.sessions_count !== undefined ? ` · ${row.sessions_count} sessions` : ''}</p>
          )) : <p className="text-sm text-text-secondary">No membership in the mirror.</p>}
          {state.attendance.length > 0 ? state.attendance.map(row => (
            <p key={row.fitbox_attendance_id} className="flex flex-wrap items-start gap-2 text-sm text-text-secondary"><CalendarCheck className="mt-0.5 size-3.5 shrink-0 text-text-secondary" /> {row.class_name || 'Class'} · {when(row.session_start_time)} · {row.status}</p>
          )) : <p className="text-sm text-text-secondary">No upcoming FitBox booking in the mirror.</p>}
        </div>
      ) : (
        <p className="mt-3 font-body text-sm text-text-secondary">No FitBox record matched this member yet.</p>
      )}
      {member.email && state?.installed !== false && (
        <button type="button" onClick={() => void checkLive()} disabled={disabled || checking || loading} className="admin-kit-button">
          {checking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} {checking ? 'Asking FitBox…' : 'Check FitBox now'}
        </button>
      )}
      {error && <p role="alert" className="mt-3 font-body text-sm text-state-danger">{error}</p>}
    </section>
  );
}
