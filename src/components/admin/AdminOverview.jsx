import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DollarSign, Users, Ticket, CalendarDays, Rocket, ClipboardList,
  PenSquare, UserSquare2, Trophy, Plus, Receipt, UserPlus, ArrowRight, Inbox,
  AlertTriangle, CheckCircle2, Circle, Gauge, RefreshCw, Clock3, MapPin,
  ClipboardCheck, UsersRound,
} from 'lucide-react';
import AdminStatCard from './AdminStatCard';
import {
  getDashboardStats, getSoftLaunchSettings, getDefaultSettings,
  getBusinessStats, getRecentOrders, adminRecentMembers,
  getAllCoaches, getAllEvents, getAllSiteContent, getAdminDailyOperations,
} from '@/lib/adminData';
import { getAvailableSessions } from '@/lib/bookingData';
import { ADMIN_OVERVIEW_REFRESH_INTERVAL_MS, shouldRefreshAdminData } from '@/lib/adminFreshness';
import { activityFromSettled, readinessFromSettled } from '@/lib/adminOverview';
import { buildAdminActionQueue } from '@/lib/adminActionQueue';

function getCountdown(targetDate) {
  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return 'Launched';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return `${days}d`;
}

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const QUICK_ACTIONS = [
  { key: 'calendar', label: 'New Class', icon: CalendarDays, hint: 'Schedule & publish' },
  { key: 'coaches', label: 'Add Coach', icon: UserSquare2, hint: 'Team profiles' },
  { key: 'events', label: 'Add Event', icon: Trophy, hint: 'SE QLD calendar' },
  { key: 'content', label: 'Edit Site Copy', icon: PenSquare, hint: 'Hero, contact, FAQ' },
];

const ACTION_ICONS = {
  'pending-bookings': Inbox,
  'pt-requests': ClipboardList,
  waitlists: Users,
  'trainer-applicants': UserSquare2,
  'partner-enquiries': UserPlus,
};

const ACTION_TONES = {
  urgent: { color: '#f0a1a1', border: 'rgba(201,78,68,0.32)', background: 'rgba(201,78,68,0.08)' },
  attention: { color: '#e0b36a', border: 'rgba(224,179,106,0.3)', background: 'rgba(224,179,106,0.08)' },
  standard: { color: '#7BA7BC', border: 'rgba(123,167,188,0.22)', background: 'rgba(16,24,32,0.6)' },
};

function TodayOperationsDesk({ rows, available, error, onOpen }) {
  return (
    <section aria-labelledby="today-operations-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="today-operations-heading" className="font-display text-xs uppercase tracking-[0.2em]" style={{ color: 'rgba(123,167,188,0.6)' }}>
            Today&apos;s Classes
          </h2>
          <p className="mt-1 font-body text-xs" style={{ color: 'rgba(209,221,230,0.42)' }}>
            Brisbane time · rosters, queues and roll call
          </p>
        </div>
        {available && rows.length > 0 && (
          <span className="font-display text-sm tabular-nums text-xert-steel">{rows.length} class{rows.length === 1 ? '' : 'es'}</span>
        )}
      </div>

      {!available ? (
        <div className="flex items-start gap-3 border border-amber-500/25 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="font-body text-sm text-amber-200/80">Install the admin daily operations migration to activate this desk.</p>
        </div>
      ) : error ? (
        <div role="status" className="flex items-start gap-3 border border-amber-500/25 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="font-body text-sm text-amber-200/80">Today&apos;s class workload is unavailable: {error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-3 border border-xert-steel/15 bg-xert-ink/60 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
          <p className="font-body text-sm text-xert-pale/70">No non-draft classes are scheduled today.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rows.map(session => {
            const activeCount = Number(session.requested_count || 0) + Number(session.confirmed_count || 0);
            const attendanceCount = Number(session.attended_count || 0) + Number(session.no_show_count || 0);
            const action = session.attendance_due ? 'attendance' : 'roster';
            return (
              <article key={session.session_id} className="border border-xert-steel/15 bg-xert-ink/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 font-body text-[11px] uppercase tracking-wider text-xert-steel">
                        <Clock3 className="h-3.5 w-3.5" />
                        {new Date(session.start_time).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span className="border border-xert-steel/25 px-2 py-0.5 font-body text-[10px] uppercase text-xert-pale/55">{session.status}</span>
                    </div>
                    <h3 className="truncate font-display text-xl uppercase text-xert-offwhite">{session.title}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-xs text-xert-pale/45">
                      {session.coach_name && <span>{session.coach_name}</span>}
                      {session.location_zone && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{session.location_zone}</span>}
                    </p>
                  </div>
                  <button type="button" onClick={() => onOpen(session.session_id, action)}
                    className="inline-flex min-h-11 shrink-0 items-center gap-2 bg-xert-steel px-4 font-display text-sm uppercase text-xert-navy transition-colors hover:bg-xert-pale">
                    {session.attendance_due ? <ClipboardCheck className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
                    {session.attendance_due ? 'Roll call' : 'Roster'}
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="border-l-2 border-xert-steel/50 pl-2"><strong className="block font-display text-lg text-xert-offwhite">{activeCount}{session.capacity ? `/${session.capacity}` : ''}</strong><span className="font-body text-[10px] uppercase text-xert-pale/40">Active</span></div>
                  <div className="border-l-2 border-amber-400/50 pl-2"><strong className="block font-display text-lg text-xert-offwhite">{Number(session.waitlist_count || 0)}</strong><span className="font-body text-[10px] uppercase text-xert-pale/40">Waiting</span></div>
                  <div className="border-l-2 border-xert-steel/25 pl-2"><strong className="block font-display text-lg text-xert-offwhite">{Number(session.public_request_count || 0)}</strong><span className="font-body text-[10px] uppercase text-xert-pale/40">Enquiries</span></div>
                  <div className="border-l-2 border-green-400/40 pl-2"><strong className="block font-display text-lg text-xert-offwhite">{attendanceCount}</strong><span className="font-body text-[10px] uppercase text-xert-pale/40">Marked</span></div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function AdminOverview({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [biz, setBiz] = useState(null);
  const [activity, setActivity] = useState(null);
  const [launch, setLaunch] = useState(null);
  const [fillRates, setFillRates] = useState(null);
  const [settings, setSettings] = useState(getDefaultSettings());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');
  const [businessWarning, setBusinessWarning] = useState('');
  const [partialWarning, setPartialWarning] = useState('');
  const [dailyOperations, setDailyOperations] = useState([]);
  const [dailyOperationsAvailable, setDailyOperationsAvailable] = useState(true);
  const [dailyOperationsError, setDailyOperationsError] = useState('');
  const requestIdRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(Number.NaN);

  const load = useCallback(async ({ initial = false } = {}) => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');
    setBusinessWarning('');
    setPartialWarning('');
    setDailyOperationsError('');

    const readinessRequest = Promise.allSettled([
      getAllCoaches(), getAllEvents(), getAllSiteContent(), getAvailableSessions()
    ]);

    try {
      const [s, settingsResult, businessResult, feed, dailyResult] = await Promise.all([
        getDashboardStats(),
        getSoftLaunchSettings()
          .then(data => ({ data, error: null }))
          .catch(error => ({ data: null, error })),
        getBusinessStats()
          .then(data => ({ data, error: null }))
          .catch(error => ({ data: null, error })),
        Promise.allSettled([getRecentOrders(6), adminRecentMembers(6)]).then(activityFromSettled),
        getAdminDailyOperations()
          .then(data => ({ data, error: null }))
          .catch(error => ({ data: null, error }))
      ]);
      if (requestId !== requestIdRef.current) return;
      setStats(s);
      if (s.errors?.length) {
        setPartialWarning(current => [current, `Dashboard metrics incomplete: ${s.errors.join(' | ')}`].filter(Boolean).join(' '));
      }
      if (s.insightsSampled) {
        setPartialWarning(current => [current, `Interest insights use the latest ${s.insightSampleSize.toLocaleString('en-AU')} of ${s.totalMembers.toLocaleString('en-AU')} leads.`].filter(Boolean).join(' '));
      }
      if (settingsResult.data) setSettings(settingsResult.data);
      if (settingsResult.error) {
        setPartialWarning(current => [current, `Launch settings unavailable: ${settingsResult.error.message || 'check Supabase permissions.'}`].filter(Boolean).join(' '));
      }
      setBiz(businessResult.data);
      setBusinessWarning(businessResult.error ? `Business metrics unavailable: ${businessResult.error.message || 'check Supabase permissions.'}` : '');
      setActivity(feed.feed);
      if (feed.errors.length) setPartialWarning(current => [current, `Recent activity incomplete: ${feed.errors.join(' | ')}`].filter(Boolean).join(' '));
      if (dailyResult.data) {
        setDailyOperations(dailyResult.data.rows);
        setDailyOperationsAvailable(dailyResult.data.available);
      }
      if (dailyResult.error) setDailyOperationsError(dailyResult.error.message || 'Check Supabase permissions.');
      setLastUpdated(new Date());
    } catch (loadError) {
      if (requestId === requestIdRef.current) setError(loadError.message);
    }

    const readiness = readinessFromSettled(await readinessRequest);
    if (requestId === requestIdRef.current) {
      setFillRates(readiness.data.classes);
      setLaunch(readiness.launch);
      if (readiness.errors.length) {
        setPartialWarning(current => [current, `Readiness incomplete: ${readiness.errors.join(' | ')}`].filter(Boolean).join(' '));
      }
      setLoading(false);
      setRefreshing(false);
      lastRefreshAtRef.current = Date.now();
    }
    requestInFlightRef.current = false;
  }, []);

  useEffect(() => {
    void load({ initial: true });
    return () => {
      requestIdRef.current += 1;
      requestInFlightRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (shouldRefreshAdminData({
        visibilityState: document.visibilityState,
        lastRefreshAt: lastRefreshAtRef.current,
        minimumAgeMs: ADMIN_OVERVIEW_REFRESH_INTERVAL_MS
      })) {
        void load();
      }
    };

    const intervalId = window.setInterval(refreshWhenVisible, ADMIN_OVERVIEW_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [load]);

  const countdown = getCountdown(settings.target_launch_date);
  const actionQueue = buildAdminActionQueue(stats);

  return (
    <div className="p-6 space-y-8">
      {error && (
        <div className="p-4" style={{ backgroundColor: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.3)' }}>
          <p className="font-body text-sm" style={{ color: '#f0a1a1' }}>Supabase error: {error}</p>
        </div>
      )}
      {businessWarning && (
        <div className="p-4" style={{ backgroundColor: 'rgba(224,179,106,0.1)', border: '1px solid rgba(224,179,106,0.28)' }}>
          <p className="font-body text-sm" style={{ color: '#e0b36a' }}>{businessWarning}</p>
        </div>
      )}
      {partialWarning && (
        <div role="status" className="p-4 flex items-start gap-3" style={{ backgroundColor: 'rgba(224,179,106,0.1)', border: '1px solid rgba(224,179,106,0.28)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#e0b36a' }} />
          <p className="font-body text-sm" style={{ color: '#e0b36a' }}>{partialWarning}</p>
        </div>
      )}

      {/* ── Header strip ── */}
      <div className="relative p-6 overflow-hidden"
        style={{
          background: 'linear-gradient(120deg, rgba(50,72,90,0.4) 0%, rgba(16,24,32,0.7) 60%)',
          border: '1px solid rgba(123,167,188,0.2)',
        }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(123,167,188,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(123,167,188,0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-body text-[11px] uppercase tracking-[0.25em] mb-2" style={{ color: '#7BA7BC' }}>
              {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <h2 className="font-display text-3xl uppercase leading-none" style={{ color: '#F1F3F4' }}>
              Beat Your Best.
            </h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="font-body text-[10px] uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.4)' }} aria-live="polite">
                  Updated {lastUpdated.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
              <button type="button" onClick={() => void load()} disabled={loading || refreshing} aria-label="Refresh dashboard" title="Refresh dashboard" className="p-2 border border-xert-steel/25 text-xert-steel hover:border-xert-steel transition-colors disabled:opacity-40">
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {countdown && (
            <div className="flex items-center gap-3 px-4 py-3"
              style={{ backgroundColor: 'rgba(123,167,188,0.12)', border: '1px solid rgba(123,167,188,0.35)' }}>
              <Rocket className="w-5 h-5" style={{ color: '#7BA7BC' }} />
              <div>
                <p className="font-display text-xl leading-none tabular-nums" style={{ color: '#F1F3F4' }}>{countdown}</p>
                <p className="font-body text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'rgba(209,221,230,0.5)' }}>
                  to launch · {settings.target_launch_date}
                </p>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Daily action queue ── */}
      {!loading && stats && (
        <section aria-labelledby="admin-action-queue-heading">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 id="admin-action-queue-heading" className="font-display text-xs uppercase tracking-[0.2em]" style={{ color: 'rgba(123,167,188,0.6)' }}>
                Needs Your Attention
              </h2>
              <p className="font-body text-xs mt-1" style={{ color: 'rgba(209,221,230,0.42)' }}>
                {actionQueue.length > 0 ? `${actionQueue.length} active work queue${actionQueue.length === 1 ? '' : 's'}` : 'No outstanding member or applicant work'}
              </p>
            </div>
          </div>

          {actionQueue.length === 0 ? (
            <div className="flex items-center gap-3 p-4" style={{ backgroundColor: 'rgba(126,201,143,0.08)', border: '1px solid rgba(126,201,143,0.22)' }}>
              <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#7ec98f' }} />
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.72)' }}>All operational queues are caught up.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {actionQueue.map(action => {
                const Icon = ACTION_ICONS[action.key] || Inbox;
                const tone = ACTION_TONES[action.tone] || ACTION_TONES.standard;
                return (
                  <button
                    type="button"
                    key={action.key}
                    onClick={() => onNavigate?.(action.target)}
                    className="min-h-28 p-4 text-left flex items-start gap-4 transition-colors group"
                    style={{ backgroundColor: tone.background, border: `1px solid ${tone.border}` }}
                    aria-label={`${action.title}: ${action.detail}`}
                  >
                    <div className="w-10 h-10 shrink-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(11,18,24,0.52)' }}>
                      <Icon className="w-5 h-5" style={{ color: tone.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-display text-lg uppercase leading-tight" style={{ color: '#F1F3F4' }}>{action.title}</p>
                        <span className="font-display text-2xl tabular-nums leading-none" style={{ color: tone.color }}>{action.count}</span>
                      </div>
                      <p className="font-body text-xs leading-relaxed mt-2" style={{ color: 'rgba(209,221,230,0.52)' }}>{action.detail}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 self-center shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: tone.color }} />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {!loading && (
        <TodayOperationsDesk
          rows={dailyOperations}
          available={dailyOperationsAvailable}
          error={dailyOperationsError}
          onOpen={(session, action) => onNavigate?.('calendar', { session, action })}
        />
      )}

      {/* Business milestones + class fill rate. Operational go/no-go lives in Operations Health. */}
      {launch && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Checklist */}
          {(() => {
            const items = [
              { done: launch.classes, label: 'Schedule & publish your first classes', target: 'calendar' },
              { done: launch.coaches, label: 'Add your coaching team', target: 'coaches' },
              { done: launch.events, label: 'Load the 2026 event calendar', target: 'events' },
              { done: launch.content, label: 'Review site copy & hero photos', target: 'content' },
              { done: (biz?.memberCount || 0) > 0, label: 'First member signup', target: 'gym-members' },
              { done: (biz?.paidOrders || 0) > 0, label: 'First pack sale', target: 'orders' },
            ];
            const doneCount = items.filter(i => i.done).length;
            const pct = Math.round((doneCount / items.length) * 100);
            return (
              <div className="p-5" style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.16)' }}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display text-xs uppercase tracking-[0.2em]" style={{ color: 'rgba(123,167,188,0.6)' }}>
                    Business Milestones
                  </h3>
                  <span className="font-display text-sm tabular-nums" style={{ color: '#7BA7BC' }}>{doneCount}/{items.length}</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden mb-4" style={{ backgroundColor: 'rgba(123,167,188,0.15)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#7BA7BC' }} />
                </div>
                <div className="space-y-1">
                  {items.map(item => (
                    <button type="button" key={item.label} disabled={item.done === null} onClick={() => item.done === false && onNavigate?.(item.target)}
                      className="w-full flex items-center gap-2.5 py-1.5 text-left group"
                      style={{ cursor: item.done ? 'default' : 'pointer' }}>
                      {item.done === true
                        ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#7ec98f' }} />
                        : item.done === null
                          ? <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#e0b36a' }} />
                          : <Circle className="w-4 h-4 shrink-0" style={{ color: 'rgba(123,167,188,0.4)' }} />}
                      <span className="font-body text-sm" style={{
                        color: item.done === true ? 'rgba(209,221,230,0.35)' : item.done === null ? '#e0b36a' : '#D1DDE6',
                        textDecoration: item.done === true ? 'line-through' : 'none',
                      }}>
                        {item.label}
                      </span>
                      {item.done === false && (
                        <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#7BA7BC' }} />
                      )}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => onNavigate?.('health')}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-between border border-xert-steel/20 px-3 font-body text-xs uppercase tracking-wider text-xert-steel">
                  Open launch go/no-go gate
                  <ArrowRight className="size-4" />
                </button>
              </div>
            );
          })()}

          {/* Fill rate */}
          <div className="p-5" style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.16)' }}>
            <h3 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em] mb-4" style={{ color: 'rgba(123,167,188,0.6)' }}>
              <Gauge className="w-3.5 h-3.5" /> Upcoming Class Fill
            </h3>
            {fillRates === null ? (
              <p className="font-body text-sm" style={{ color: '#e0b36a' }}>Class fill data is unavailable. Refresh the dashboard to retry.</p>
            ) : fillRates.length === 0 ? (
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>
                No published upcoming classes yet — publish classes and live booking numbers appear here.
              </p>
            ) : (
              <div className="space-y-3">
                {fillRates.slice(0, 6).map(s => {
                  const cap = s.capacity || 0;
                  const pct = cap > 0 ? Math.min(100, Math.round((Number(s.booked_count) / cap) * 100)) : 0;
                  return (
                    <div key={s.id}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-body text-sm truncate" style={{ color: '#D1DDE6' }}>
                          {s.title || s.class_type}
                          <span className="text-[11px] ml-2" style={{ color: 'rgba(209,221,230,0.35)' }}>
                            {new Date(s.start_time).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                        </p>
                        <span className="font-display text-xs tabular-nums shrink-0" style={{ color: pct >= 100 ? '#e0b36a' : '#7BA7BC' }}>
                          {s.booked_count}/{cap || '∞'}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(123,167,188,0.15)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#e0b36a' : '#7BA7BC' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map(a => {
          const Icon = a.icon;
          return (
            <button key={a.key} onClick={() => onNavigate?.(a.key)}
              className="flex items-center gap-3 p-4 text-left transition-all group"
              style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.16)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#7BA7BC'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(123,167,188,0.16)'}>
              <div className="w-9 h-9 shrink-0 flex items-center justify-center transition-colors"
                style={{ backgroundColor: 'rgba(123,167,188,0.14)' }}>
                <Icon className="w-4 h-4" style={{ color: '#7BA7BC' }} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm uppercase leading-none flex items-center gap-1.5" style={{ color: '#F1F3F4' }}>
                  {a.label}
                  <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#7BA7BC' }} />
                </p>
                <p className="font-body text-[11px] mt-1 truncate" style={{ color: 'rgba(209,221,230,0.4)' }}>{a.hint}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Business ── */}
      <div>
        <h2 className="font-display text-xs uppercase tracking-[0.2em] mb-4" style={{ color: 'rgba(123,167,188,0.6)' }}>Business</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <AdminStatCard icon={DollarSign} label="Revenue (total)" value={biz ? `$${(biz.totalRevenueCents / 100).toFixed(0)}` : undefined} loading={loading} accent />
          <AdminStatCard icon={DollarSign} label="Revenue this month" value={biz ? `$${(biz.monthRevenueCents / 100).toFixed(0)}` : undefined} loading={loading} />
          <AdminStatCard icon={Users} label="Registered members" value={biz?.memberCount} loading={loading} />
          <AdminStatCard icon={Ticket} label="Active class credits" value={biz?.activeCredits} loading={loading} />
        </div>
      </div>

      {/* ── Activity + insights ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent activity */}
        <div className="p-5" style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.16)' }}>
          <h3 className="font-display text-xs uppercase tracking-[0.2em] mb-4" style={{ color: 'rgba(123,167,188,0.6)' }}>Recent Activity</h3>
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse" style={{ backgroundColor: 'rgba(50,72,90,0.4)' }} />)}</div>
          ) : !activity || activity.length === 0 ? (
            <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>
              Nothing yet — purchases and new members will appear here.
            </p>
          ) : (
            <div className="space-y-1">
              {activity.map((a, i) => (
                <div key={i} className="flex items-center gap-3 py-2" style={{ borderBottom: i < activity.length - 1 ? '1px solid rgba(123,167,188,0.08)' : 'none' }}>
                  <div className="w-7 h-7 shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: a.type === 'order' ? 'rgba(123,167,188,0.18)' : 'rgba(50,72,90,0.4)' }}>
                    {a.type === 'order'
                      ? <Receipt className="w-3.5 h-3.5" style={{ color: '#7BA7BC' }} />
                      : <UserPlus className="w-3.5 h-3.5" style={{ color: 'rgba(209,221,230,0.6)' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm truncate" style={{ color: '#D1DDE6' }}>{a.title}</p>
                    <p className="font-body text-[11px] truncate" style={{ color: 'rgba(209,221,230,0.35)' }}>{a.sub}</p>
                  </div>
                  <span className="font-body text-[11px] shrink-0 tabular-nums" style={{ color: 'rgba(123,167,188,0.5)' }}>{timeAgo(a.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Launch + pipeline snapshot */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <AdminStatCard icon={ClipboardList} label="Member leads" value={stats?.totalMembers} loading={loading} />
            <AdminStatCard icon={UserPlus} label="New this week" value={stats?.newThisWeek} loading={loading} />
            <AdminStatCard icon={CalendarDays} label="Upcoming classes" value={biz?.upcomingClasses} loading={loading} />
            <AdminStatCard icon={Inbox} label="Pending bookings" value={stats?.pendingBookings} loading={loading} />
            <AdminStatCard icon={CheckCircle2} label="Attended (30 days)" value={stats?.attended30Days} loading={loading} />
            <AdminStatCard
              icon={AlertTriangle}
              label="No-show rate (30 days)"
              value={stats?.attendanceRate30Days === null || stats?.attendanceRate30Days === undefined
                ? stats?.attendanceRate30Days
                : `${100 - stats.attendanceRate30Days}%`}
              loading={loading}
            />
          </div>
          <button onClick={() => onNavigate?.('members')}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors"
            style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.16)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#7BA7BC'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(123,167,188,0.16)'}>
            <span className="font-body text-xs uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.6)' }}>
              Review all leads & interest breakdown
            </span>
            <ArrowRight className="w-4 h-4" style={{ color: '#7BA7BC' }} />
          </button>
        </div>
      </div>

      {/* ── Top insights ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { title: 'Most Requested Training Times', rows: stats?.topTimes, keyName: 'time' },
          { title: 'Most Common Training Goals', rows: stats?.topGoals, keyName: 'goal' },
        ].map(panel => (
          <div key={panel.title} className="p-5" style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.16)' }}>
            <h3 className="font-display text-xs uppercase tracking-[0.2em] mb-4" style={{ color: 'rgba(123,167,188,0.6)' }}>{panel.title}</h3>
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-8 animate-pulse" style={{ backgroundColor: 'rgba(50,72,90,0.4)' }} />)}</div>
            ) : panel.rows?.length > 0 ? (
              <div className="space-y-3">
                {panel.rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="font-body text-sm" style={{ color: '#D1DDE6' }}>{r[panel.keyName]}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(123,167,188,0.15)' }}>
                        <div className="h-full rounded-full" style={{
                          backgroundColor: '#7BA7BC',
                          width: `${Math.min(100, (r.count / (panel.rows[0]?.count || 1)) * 100)}%`,
                        }} />
                      </div>
                      <span className="font-display text-sm tabular-nums w-6 text-right" style={{ color: 'rgba(209,221,230,0.5)' }}>{r.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>No data yet.</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
