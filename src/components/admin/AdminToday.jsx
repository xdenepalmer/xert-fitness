import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CalendarPlus, CheckCircle2, ChevronRight, ClipboardCheck,
  Clock3, Inbox, MapPin, RefreshCw, ShieldCheck, Users, UsersRound,
} from 'lucide-react';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { getAdminDailyOperations, getDashboardStats, getSoftLaunchSettings } from '@/lib/adminData';
import { buildAdminActionQueue } from '@/lib/adminActionQueue';
import { ADMIN_QUICK_ACTIONS } from '@/lib/adminWorkspaces';
import { ADMIN_BUTTON, ADMIN_PAGE, ADMIN_PANEL, ADMIN_TEXT } from '@/components/admin/ui';

// ─── Today ───────────────────────────────────────────────────────────────────
// The owner opens the app mid-shift for three things: the class about to run,
// whatever is waiting on a decision, and the handful of actions they take
// every day. That is the whole screen. Revenue and totals live in Business.

const ACTION_ICONS = { 'pending-bookings': Inbox, 'pt-requests': ClipboardCheck, waitlists: Users };

function greeting(now) {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstName(profile, user) {
  const full = String(profile?.full_name || '').trim();
  if (full) return full.split(/\s+/)[0];
  return String(user?.email || '').split('@')[0] || 'there';
}

/** The class the owner should be looking at: running now or next up, else the last one today. */
export function pickFocusClass(rows, now = Date.now()) {
  const sorted = [...(rows || [])]
    .filter(row => row?.start_time)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  if (sorted.length === 0) return null;
  const graceMs = 90 * 60 * 1000;
  return sorted.find(row => new Date(row.start_time).getTime() + graceMs > now) || sorted[sorted.length - 1];
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

function daysUntil(targetDate) {
  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return null;
  return Math.ceil(diff / 86_400_000);
}

function Stat({ value, label, tone = 'text-xert-offwhite' }) {
  return (
    <div className="rounded-xl bg-black/20 px-3 py-2">
      <p className={`font-display text-2xl leading-none tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 font-body text-[11px] text-xert-pale/50">{label}</p>
    </div>
  );
}

export default function AdminToday({ onNavigate, preview = null }) {
  const { profile, user } = useSupabaseAuth();
  const [stats, setStats] = useState(preview?.stats ?? null);
  const [ops, setOps] = useState(preview?.ops ?? { rows: [], available: true });
  const [launch, setLaunch] = useState(preview?.launch ?? null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (preview) return;
    setLoading(true);
    const [statsResult, opsResult, launchResult] = await Promise.allSettled([
      getDashboardStats(), getAdminDailyOperations(), getSoftLaunchSettings(),
    ]);
    if (statsResult.status === 'fulfilled') setStats(statsResult.value);
    if (opsResult.status === 'fulfilled') setOps(opsResult.value);
    if (launchResult.status === 'fulfilled') setLaunch(launchResult.value);
    const failed = [statsResult, opsResult, launchResult].filter(result => result.status === 'rejected');
    setError(failed.length ? (failed[0].reason?.message || 'Some of today could not load.') : '');
    setLoading(false);
  }, [preview]);

  useEffect(() => { void load(); }, [load]);

  const now = new Date();
  const focus = useMemo(() => pickFocusClass(ops.rows, now.getTime()), [ops.rows, now]);
  const queue = useMemo(() => buildAdminActionQueue(stats), [stats]);
  const todayCount = ops.rows?.length || 0;
  const countdown = daysUntil(launch?.target_launch_date);
  const name = preview?.name || firstName(profile, user);

  return (
    <div className={`${ADMIN_PAGE} space-y-8`}>
      {/* Greeting */}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-body text-sm text-xert-pale/50">
            {now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h2 className={`${ADMIN_TEXT.pageTitle} mt-1`}>{greeting(now)}, {name}</h2>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh today"
          className={`${ADMIN_BUTTON.ghost} mt-1 shrink-0 px-3`}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {error && (
        <p role="status" className="flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 font-body text-sm text-amber-200/80">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> {error}
        </p>
      )}

      {/* Next class */}
      <section aria-labelledby="today-next-class">
        <h3 id="today-next-class" className={`${ADMIN_TEXT.sectionHeading} mb-3`}>
          {focus && new Date(focus.start_time).getTime() <= now.getTime() ? 'On now' : 'Next class'}
        </h3>
        {loading && !focus ? (
          <div className="h-48 animate-pulse rounded-2xl bg-white/[0.03]" />
        ) : !ops.available ? (
          <div className={`${ADMIN_PANEL} p-5 font-body text-sm text-xert-pale/60`}>
            Today's classes aren't connected yet. Open <button type="button" className="text-xert-steel underline-offset-2 hover:underline" onClick={() => onNavigate?.('health')}>System status</button> to see what's missing.
          </div>
        ) : !focus ? (
          <div className={`${ADMIN_PANEL} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between`}>
            <div>
              <p className="font-display text-2xl text-xert-offwhite">No classes today</p>
              <p className="mt-1 font-body text-sm text-xert-pale/50">Nothing published for today. Add one and it appears here.</p>
            </div>
            <button type="button" onClick={() => onNavigate?.('calendar', { action: 'create' })} className={ADMIN_BUTTON.primary}>
              <CalendarPlus className="h-4 w-4" /> Add a class
            </button>
          </div>
        ) : (
          <article className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-xert-deep/70 via-xert-navy to-[#0b1218] p-5 shadow-2xl shadow-black/40 sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-xert-steel/15 blur-3xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-5">
              <div className="min-w-0 flex-1">
                <p className="inline-flex items-center gap-2 font-body text-sm font-semibold text-xert-steel">
                  <Clock3 className="h-4 w-4" /> {formatTime(focus.start_time)}
                  {focus.status && focus.status !== 'published' && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium capitalize text-xert-pale/70">{focus.status}</span>
                  )}
                </p>
                <h4 className="mt-2 font-display text-3xl leading-tight text-xert-offwhite sm:text-4xl">{focus.title}</h4>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-body text-sm text-xert-pale/55">
                  {focus.coach_name && <span>with {focus.coach_name}</span>}
                  {focus.location_zone && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{focus.location_zone}</span>}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button type="button" onClick={() => onNavigate?.('calendar', { session: focus.session_id, action: 'roster' })}
                  className={`${ADMIN_BUTTON.ghost} w-full sm:w-auto`}>
                  <UsersRound className="h-4 w-4" /> Roster
                </button>
                <button type="button" onClick={() => onNavigate?.('calendar', { session: focus.session_id, action: 'attendance' })}
                  className={`${focus.attendance_due ? ADMIN_BUTTON.primary : ADMIN_BUTTON.ghost} w-full sm:w-auto`}>
                  <ClipboardCheck className="h-4 w-4" /> Roll call
                </button>
              </div>
            </div>
            <div className="relative mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
              <Stat value={`${Number(focus.confirmed_count || 0)}${focus.capacity ? `/${focus.capacity}` : ''}`} label="Confirmed" />
              <Stat value={Number(focus.requested_count || 0) + Number(focus.public_request_count || 0)} label="Requested" tone="text-amber-200" />
              <Stat value={Number(focus.waitlist_count || 0)} label="Waiting" tone="text-xert-steel" />
            </div>
            {todayCount > 1 && (
              <button type="button" onClick={() => onNavigate?.('calendar')}
                className="relative mt-5 inline-flex items-center gap-1.5 font-body text-sm font-medium text-xert-steel hover:text-xert-pale">
                {todayCount - 1} more {todayCount - 1 === 1 ? 'class' : 'classes'} today <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </article>
        )}
      </section>

      {/* Needs you */}
      <section aria-labelledby="today-needs-you">
        <h3 id="today-needs-you" className={`${ADMIN_TEXT.sectionHeading} mb-3`}>Needs you</h3>
        {loading && !stats ? (
          <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.03]" />)}</div>
        ) : queue.length === 0 ? (
          <div className={`${ADMIN_PANEL} flex items-center gap-3 p-5`}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-green-400/15 text-green-400"><CheckCircle2 className="h-5 w-5" /></span>
            <p className="font-body text-sm text-xert-pale/70">Nothing waiting on you. Nice.</p>
          </div>
        ) : (
          <ul className={`${ADMIN_PANEL} divide-y divide-white/[0.06] overflow-hidden`}>
            {queue.map(action => {
              const Icon = ACTION_ICONS[action.key] || Inbox;
              const urgent = action.tone === 'urgent';
              return (
                <li key={action.key}>
                  <button type="button" onClick={() => onNavigate?.(action.target)}
                    className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-white/[0.04] sm:px-5">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${urgent ? 'bg-amber-300/15 text-amber-300' : 'bg-xert-steel/15 text-xert-steel'}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-body text-base font-semibold text-xert-offwhite">{action.title}</span>
                      <span className="block truncate font-body text-sm text-xert-pale/50">{action.detail}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 font-display text-lg leading-none tabular-nums ${urgent ? 'bg-amber-300/15 text-amber-200' : 'bg-white/[0.06] text-xert-offwhite'}`}>{action.count}</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-xert-pale/30" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Quick actions */}
      <section aria-labelledby="today-actions">
        <h3 id="today-actions" className={`${ADMIN_TEXT.sectionHeading} mb-3`}>Quick actions</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ADMIN_QUICK_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <button key={action.key} type="button" onClick={() => onNavigate?.(action.key, action.params)}
                className={`${ADMIN_PANEL} group flex min-h-[6.5rem] flex-col items-start justify-between p-4 text-left transition-colors hover:border-xert-steel/40 hover:bg-white/[0.06]`}>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-xert-steel/15 text-xert-steel transition-colors group-hover:bg-xert-steel group-hover:text-xert-navy">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="font-body text-sm font-semibold leading-snug text-xert-offwhite">{action.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Footer strip */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5 font-body text-sm text-xert-pale/45">
        {countdown ? (
          <span>Opening in <strong className="font-semibold text-xert-pale">{countdown} {countdown === 1 ? 'day' : 'days'}</strong>
            {launch?.target_launch_date && <> · {new Date(launch.target_launch_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}</>}
          </span>
        ) : <span />}
        <button type="button" onClick={() => onNavigate?.('health')} className="inline-flex items-center gap-1.5 hover:text-xert-pale">
          <ShieldCheck className="h-4 w-4" /> System status
        </button>
      </footer>
    </div>
  );
}
