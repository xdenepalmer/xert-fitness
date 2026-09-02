import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DollarSign, Users, Ticket, CalendarDays, Rocket, ClipboardList,
  UserSquare2, Plus, Receipt, UserPlus, ArrowRight, Inbox,
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
import { ADMIN_QUICK_ACTIONS } from '@/lib/adminWorkspaces';

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

const QUICK_ACTION_HINTS = {
  calendar: 'Schedule and publish',
  workouts: 'Update the club TV',
  forms: 'Build and publish',
  announcements: 'Notify members',
  products: 'Set price and credits',
  coaches: 'Add a team profile',
};

const QUICK_ACTIONS = ADMIN_QUICK_ACTIONS.map(action => ({
  ...action,
  hint: QUICK_ACTION_HINTS[action.key],
}));

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
      <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4 sm:gap-4">
        <div>
          <h2 id="today-operations-heading" className="font-display text-xs uppercase tracking-[0.2em] text-xert-steel/60" >
            Today&apos;s Classes
          </h2>
          <p className="mt-1 font-body text-xs text-xert-pale/40" >
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
              <article key={session.session_id} className="border border-xert-steel/15 bg-xert-ink/60 p-3 min-[380px]:p-4">
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
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 bg-xert-steel px-4 font-display text-sm uppercase text-xert-navy transition-colors hover:bg-xert-pale min-[380px]:w-auto">
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
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessLoaded, setReadinessLoaded] = useState(false);
  const [readinessError, setReadinessError] = useState('');
  const requestIdRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(Number.NaN);
  const activityRequestRef = useRef(0);
  const activityInFlightRef = useRef(false);
  const activityLoadedRef = useRef(false);
  const activityLoadedAtRef = useRef(Number.NaN);
  const readinessRequestRef = useRef(0);
  const readinessInFlightRef = useRef(false);
  const readinessLoadedRef = useRef(false);
  const readinessLoadedAtRef = useRef(Number.NaN);

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

    try {
      const [s, settingsResult, businessResult, dailyResult] = await Promise.all([
        getDashboardStats(),
        getSoftLaunchSettings()
          .then(data => ({ data, error: null }))
          .catch(error => ({ data: null, error })),
        getBusinessStats()
          .then(data => ({ data, error: null }))
          .catch(error => ({ data: null, error })),
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
      if (dailyResult.data) {
        setDailyOperations(dailyResult.data.rows);
        setDailyOperationsAvailable(dailyResult.data.available);
      }
      if (dailyResult.error) setDailyOperationsError(dailyResult.error.message || 'Check Supabase permissions.');
      setLastUpdated(new Date());
    } catch (loadError) {
      if (requestId === requestIdRef.current) setError(loadError.message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        lastRefreshAtRef.current = Date.now();
      }
      requestInFlightRef.current = false;
    }
  }, []);

  const loadActivity = useCallback(async ({ force = false } = {}) => {
    const hasFreshActivity = activityLoadedRef.current
      && Date.now() - activityLoadedAtRef.current < ADMIN_OVERVIEW_REFRESH_INTERVAL_MS;
    if (activityInFlightRef.current || (hasFreshActivity && !force)) return;
    activityInFlightRef.current = true;
    const requestId = ++activityRequestRef.current;
    setActivityLoading(true);
    setActivityError('');
    try {
      const feed = activityFromSettled(await Promise.allSettled([getRecentOrders(6), adminRecentMembers(6)]));
      if (requestId !== activityRequestRef.current) return;
      setActivity(feed.feed);
      setActivityError(feed.errors.length ? `Recent activity incomplete: ${feed.errors.join(' | ')}` : '');
      activityLoadedRef.current = true;
      activityLoadedAtRef.current = Date.now();
      setActivityLoaded(true);
    } catch (loadError) {
      if (requestId === activityRequestRef.current) setActivityError(loadError.message || 'Recent activity is unavailable.');
    } finally {
      if (requestId === activityRequestRef.current) setActivityLoading(false);
      activityInFlightRef.current = false;
    }
  }, []);

  const loadReadiness = useCallback(async ({ force = false } = {}) => {
    const hasFreshReadiness = readinessLoadedRef.current
      && Date.now() - readinessLoadedAtRef.current < ADMIN_OVERVIEW_REFRESH_INTERVAL_MS;
    if (readinessInFlightRef.current || (hasFreshReadiness && !force)) return;
    readinessInFlightRef.current = true;
    const requestId = ++readinessRequestRef.current;
    setReadinessLoading(true);
    setReadinessError('');
    try {
      const readiness = readinessFromSettled(await Promise.allSettled([
        getAllCoaches(), getAllEvents(), getAllSiteContent(), getAvailableSessions(),
      ]));
      if (requestId !== readinessRequestRef.current) return;
      setFillRates(readiness.data.classes);
      setLaunch(readiness.launch);
      setReadinessError(readiness.errors.length ? `Readiness incomplete: ${readiness.errors.join(' | ')}` : '');
      readinessLoadedRef.current = true;
      readinessLoadedAtRef.current = Date.now();
      setReadinessLoaded(true);
    } catch (loadError) {
      if (requestId === readinessRequestRef.current) setReadinessError(loadError.message || 'Launch planning is unavailable.');
    } finally {
      if (requestId === readinessRequestRef.current) setReadinessLoading(false);
      readinessInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void load({ initial: true });
    return () => {
      requestIdRef.current += 1;
      requestInFlightRef.current = false;
      activityRequestRef.current += 1;
      activityInFlightRef.current = false;
      readinessRequestRef.current += 1;
      readinessInFlightRef.current = false;
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
  const dashboardWarnings = [
    error ? `Dashboard refresh failed: ${error}` : '',
    businessWarning,
    partialWarning,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-3 min-[360px]:p-4 sm:space-y-7 sm:p-6 xl:p-8">
      {dashboardWarnings.length > 0 && (
        <details className="group border border-amber-400/25 bg-amber-400/[0.07]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 font-body text-xs font-semibold text-amber-200 marker:content-none sm:px-4">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
            <span className="min-w-0 flex-1">Some dashboard data needs attention</span>
            <span className="rounded-full border border-amber-300/25 px-2 py-0.5 text-[10px] tabular-nums text-amber-200/75">{dashboardWarnings.length}</span>
            <span aria-hidden="true" className="text-amber-300 transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="space-y-3 border-t border-amber-300/15 px-4 py-3">
            {dashboardWarnings.map(message => (
              <p key={message} className="font-body text-xs leading-relaxed text-amber-100/70">{message}</p>
            ))}
            <button type="button" onClick={() => void load()} disabled={loading || refreshing}
              className="inline-flex min-h-11 items-center gap-2 border border-amber-300/25 px-3 font-body text-[11px] font-semibold uppercase tracking-wider text-amber-200 disabled:opacity-40">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Try refresh
            </button>
          </div>
        </details>
      )}

      {/* ── Header strip ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-xert-steel/15 pb-4 sm:items-end sm:gap-4 sm:pb-5">
          <div>
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-xert-steel sm:mb-2 sm:text-[11px] sm:tracking-[0.22em]">
              {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <h2 className="hidden font-display text-3xl uppercase leading-none text-white sm:block sm:text-4xl">
              Today at XERT
            </h2>
            <p className="mt-2 hidden font-body text-sm text-xert-pale/60 sm:block">Priorities, classes and the numbers Byron needs to run the gym.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="font-body text-[10px] uppercase tracking-wider text-xert-pale/40" aria-live="polite">
                  Updated {lastUpdated.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
              <button type="button" onClick={() => void load()} disabled={loading || refreshing} aria-label="Refresh dashboard" title="Refresh dashboard" className="inline-flex min-h-11 min-w-11 items-center justify-center border border-xert-steel/25 text-xert-steel transition-colors hover:border-xert-steel disabled:opacity-40">
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {countdown && (
            <div className="flex min-h-11 items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3 bg-xert-steel/10 border border-xert-steel/35"
>
              <Rocket className="w-5 h-5 text-xert-steel" />
              <div>
                <p className="font-display text-lg leading-none tabular-nums sm:text-xl text-xert-offwhite" >{countdown}</p>
                <p className="mt-0.5 hidden font-body text-[10px] uppercase tracking-wider min-[380px]:block text-xert-pale/50" >
                  to launch · {settings.target_launch_date}
                </p>
              </div>
            </div>
            )}
          </div>
      </div>

      {/* ── Daily action queue ── */}
      {!loading && stats && (
        <section aria-labelledby="admin-action-queue-heading">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 id="admin-action-queue-heading" className="font-display text-xs uppercase tracking-[0.2em] text-xert-steel/60" >
                Needs Your Attention
              </h2>
              <p className="font-body text-xs mt-1 text-xert-pale/40" >
                {actionQueue.length > 0 ? `${actionQueue.length} active work queue${actionQueue.length === 1 ? '' : 's'}` : 'No outstanding member or applicant work'}
              </p>
            </div>
          </div>

          {actionQueue.length === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-green-400/10 border border-green-400/20">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-green-400" />
              <p className="font-body text-sm text-xert-pale/70" >All operational queues are caught up.</p>
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
                    className="group flex min-h-[5.25rem] items-start gap-3 p-3 text-left transition-colors sm:min-h-28 sm:gap-4 sm:p-4"
                    style={{ backgroundColor: tone.background, border: `1px solid ${tone.border}` }}
                    aria-label={`${action.title}: ${action.detail}`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center sm:h-10 sm:w-10 bg-[#0b1218]/50">
                      <Icon className="w-5 h-5" style={{ color: tone.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-display text-lg uppercase leading-tight text-xert-offwhite" >{action.title}</p>
                        <span className="font-display text-2xl tabular-nums leading-none" style={{ color: tone.color }}>{action.count}</span>
                      </div>
                      <p className="font-body text-xs leading-relaxed mt-2 text-xert-pale/50" >{action.detail}</p>
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
        <details className="group border border-xert-steel/15 bg-xert-ink/40"
          onToggle={event => { if (event.currentTarget.open) void loadReadiness(); }}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-body text-xs font-semibold uppercase tracking-[0.16em] text-xert-pale/65 marker:content-none">
            <span>Launch and planning</span>
            <span className="text-xert-steel transition-transform group-open:rotate-90">›</span>
          </summary>
          {!readinessLoaded && !readinessError && (
            <div className="flex min-h-24 items-center gap-3 border-t border-xert-steel/10 p-4 font-body text-sm text-xert-pale/55" role="status">
              <RefreshCw className={`h-4 w-4 text-xert-steel ${readinessLoading ? 'animate-spin' : ''}`} />
              Loading launch milestones and class fill…
            </div>
          )}
          {readinessError && (
            <div className="flex flex-col gap-3 border-t border-amber-400/20 bg-amber-400/5 p-4 min-[420px]:flex-row min-[420px]:items-center">
              <p className="min-w-0 flex-1 font-body text-xs leading-relaxed text-amber-200/75">{readinessError}</p>
              <button type="button" onClick={() => void loadReadiness({ force: true })} disabled={readinessLoading}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-amber-300/25 px-3 font-body text-[11px] font-semibold uppercase tracking-wider text-amber-200 disabled:opacity-40">
                <RefreshCw className={`h-3.5 w-3.5 ${readinessLoading ? 'animate-spin' : ''}`} />
                Retry launch data
              </button>
            </div>
          )}
          {readinessLoaded && !readinessError && (
            <div className="flex justify-end border-t border-xert-steel/10 px-4 py-2">
              <button type="button" onClick={() => void loadReadiness({ force: true })} disabled={readinessLoading}
                className="inline-flex min-h-11 items-center gap-2 px-2 font-body text-[10px] font-semibold uppercase tracking-wider text-xert-steel disabled:opacity-40"
                aria-label="Refresh launch planning" title="Refresh launch planning">
                <RefreshCw className={`h-3.5 w-3.5 ${readinessLoading ? 'animate-spin' : ''}`} />
                Refresh planning
              </button>
            </div>
          )}
          {launch && (
          <div className="grid grid-cols-1 gap-6 border-t border-xert-steel/10 p-4 lg:grid-cols-2">
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
              <div className="p-5 bg-xert-navy/60 border border-xert-steel/15" >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display text-xs uppercase tracking-[0.2em] text-xert-steel/60" >
                    Business Milestones
                  </h3>
                  <span className="font-display text-sm tabular-nums text-xert-steel" >{doneCount}/{items.length}</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden mb-4 bg-xert-steel/15" >
                  <div className="h-full rounded-full transition-all bg-xert-steel" style={{ width: `${pct}%` }} />
                </div>
                <div className="space-y-1">
                  {items.map(item => (
                    <button type="button" key={item.label} disabled={item.done === null} onClick={() => item.done === false && onNavigate?.(item.target)}
                      className="w-full flex items-center gap-2.5 py-1.5 text-left group"
                      style={{ cursor: item.done ? 'default' : 'pointer' }}>
                      {item.done === true
                        ? <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400" />
                        : item.done === null
                          ? <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300" />
                          : <Circle className="w-4 h-4 shrink-0 text-xert-steel/40" />}
                      <span className={`font-body text-sm ${item.done === true ? 'line-through text-xert-pale/35' : item.done === null ? 'text-amber-300' : 'text-xert-pale'}`}>
                        {item.label}
                      </span>
                      {item.done === false && (
                        <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-xert-steel" />
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
          <div className="p-5 bg-xert-navy/60 border border-xert-steel/15" >
            <h3 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em] mb-4 text-xert-steel/60" >
              <Gauge className="w-3.5 h-3.5" /> Upcoming Class Fill
            </h3>
            {fillRates === null ? (
              <p className="font-body text-sm text-amber-300" >Class fill data is unavailable. Retry launch data above.</p>
            ) : fillRates.length === 0 ? (
              <p className="font-body text-sm text-xert-pale/40" >
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
                        <p className="font-body text-sm truncate text-xert-pale" >
                          {s.title || s.class_type}
                          <span className="text-[11px] ml-2 text-xert-pale/35" >
                            {new Date(s.start_time).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                        </p>
                        <span className={`font-display text-xs tabular-nums shrink-0 ${pct >= 100 ? 'text-amber-300' : 'text-xert-steel'}`}>
                          {s.booked_count}/{cap || '∞'}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden bg-xert-steel/15" >
                        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-amber-300' : 'bg-xert-steel'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
          )}
        </details>

      {/* ── Quick actions ── */}
      <div>
        <h2 className="mb-4 font-display text-xs uppercase tracking-[0.2em] text-xert-steel/70">Create & publish</h2>
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:gap-3 lg:grid-cols-3">
        {QUICK_ACTIONS.map(a => {
          const Icon = a.icon;
          return (
            <button key={a.key} onClick={() => onNavigate?.(a.key, a.params)}
              className="group flex min-h-16 items-center gap-3 p-3 text-left transition-all sm:p-4 bg-xert-navy/60 border border-xert-steel/15"
              onMouseEnter={e => e.currentTarget.style.borderColor = '#7BA7BC'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(123,167,188,0.16)'}>
              <div className="w-9 h-9 shrink-0 flex items-center justify-center transition-colors bg-xert-steel/15"
>
                <Icon className="w-4 h-4 text-xert-steel" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm uppercase leading-none flex items-center gap-1.5 text-xert-offwhite" >
                  {a.label}
                  <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-xert-steel" />
                </p>
                <p className="font-body text-[11px] mt-1 truncate text-xert-pale/40" >{a.hint}</p>
              </div>
            </button>
          );
        })}
        </div>
      </div>

      {/* ── Business ── */}
      <div>
        <h2 className="font-display text-xs uppercase tracking-[0.2em] mb-4 text-xert-steel/60" >Business</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <AdminStatCard icon={DollarSign} label="Revenue (total)" value={biz ? `$${(biz.totalRevenueCents / 100).toFixed(0)}` : undefined} loading={loading} accent />
          <AdminStatCard icon={DollarSign} label="Revenue this month" value={biz ? `$${(biz.monthRevenueCents / 100).toFixed(0)}` : undefined} loading={loading} />
          <AdminStatCard icon={Users} label="Registered members" value={biz?.memberCount} loading={loading} />
          <AdminStatCard icon={Ticket} label="Active class credits" value={biz?.activeCredits} loading={loading} />
        </div>
      </div>

      {/* ── Activity + insights ── */}
      <details className="group border border-xert-steel/15 bg-xert-ink/35"
        onToggle={event => { if (event.currentTarget.open) void loadActivity(); }}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-body text-xs font-semibold uppercase tracking-[0.16em] text-xert-pale/65 marker:content-none">
          <span>Insights and recent activity</span>
          <span className="text-xert-steel transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="space-y-6 border-t border-xert-steel/10 p-4">
      {activityError && (
        <div className="flex flex-col gap-3 border border-amber-400/20 bg-amber-400/5 p-3 min-[420px]:flex-row min-[420px]:items-center">
          <p className="min-w-0 flex-1 font-body text-xs leading-relaxed text-amber-200/75">{activityError}</p>
          <button type="button" onClick={() => void loadActivity({ force: true })} disabled={activityLoading}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-amber-300/25 px-3 font-body text-[11px] font-semibold uppercase tracking-wider text-amber-200 disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${activityLoading ? 'animate-spin' : ''}`} />
            Retry activity
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent activity */}
        <div className="p-5 bg-xert-navy/60 border border-xert-steel/15" >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-display text-xs uppercase tracking-[0.2em] text-xert-steel/60" >Recent Activity</h3>
            <button type="button" onClick={() => void loadActivity({ force: true })} disabled={activityLoading}
              className="inline-flex min-h-11 min-w-11 items-center justify-center border border-xert-steel/20 text-xert-steel disabled:opacity-40"
              aria-label="Refresh recent activity" title="Refresh recent activity">
              <RefreshCw className={`h-3.5 w-3.5 ${activityLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {activityLoading && !activityLoaded ? (
            <div className="space-y-2 bg-xert-deep/40">{[1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse" />)}</div>
          ) : !activityLoaded ? (
            <p className="font-body text-sm text-xert-pale/40" >Recent activity needs a retry.</p>
          ) : !activity || activity.length === 0 ? (
            <p className="font-body text-sm text-xert-pale/40" >
              Nothing yet — purchases and new members will appear here.
            </p>
          ) : (
            <div className="space-y-1">
              {activity.map((a, i) => (
                <div key={i} className={`flex items-center gap-3 py-2 ${i < activity.length - 1 ? 'border-b border-xert-steel/10' : ''}`}>
                  <div className={`w-7 h-7 shrink-0 flex items-center justify-center ${a.type === 'order' ? 'bg-xert-steel/20' : 'bg-xert-deep/40'}`}>
                    {a.type === 'order'
                      ? <Receipt className="w-3.5 h-3.5 text-xert-steel" />
                      : <UserPlus className="w-3.5 h-3.5 text-xert-pale/60" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm truncate text-xert-pale" >{a.title}</p>
                    <p className="font-body text-[11px] truncate text-xert-pale/35" >{a.sub}</p>
                  </div>
                  <span className="font-body text-[11px] shrink-0 tabular-nums text-xert-steel/50" >{timeAgo(a.at)}</span>
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
            className="w-full flex items-center justify-between px-4 py-3 transition-colors bg-xert-navy/60 border border-xert-steel/15"
            onMouseEnter={e => e.currentTarget.style.borderColor = '#7BA7BC'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(123,167,188,0.16)'}>
            <span className="font-body text-xs uppercase tracking-wider text-xert-pale/60" >
              Review all leads & interest breakdown
            </span>
            <ArrowRight className="w-4 h-4 text-xert-steel" />
          </button>
        </div>
      </div>

      {/* ── Top insights ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { title: 'Most Requested Training Times', rows: stats?.topTimes, keyName: 'time' },
          { title: 'Most Common Training Goals', rows: stats?.topGoals, keyName: 'goal' },
        ].map(panel => (
          <div key={panel.title} className="p-5 bg-xert-navy/60 border border-xert-steel/15" >
            <h3 className="font-display text-xs uppercase tracking-[0.2em] mb-4 text-xert-steel/60" >{panel.title}</h3>
            {loading ? (
              <div className="space-y-2 bg-xert-deep/40">{[1, 2, 3].map(i => <div key={i} className="h-8 animate-pulse" />)}</div>
            ) : panel.rows?.length > 0 ? (
              <div className="space-y-3">
                {panel.rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="font-body text-sm text-xert-pale" >{r[panel.keyName]}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 rounded-full overflow-hidden bg-xert-steel/15" >
                        <div className="h-full rounded-full bg-xert-steel" style={{
                          width: `${Math.min(100, (r.count / (panel.rows[0]?.count || 1)) * 100)}%`,
                        }} />
                      </div>
                      <span className="font-display text-sm tabular-nums w-6 text-right text-xert-pale/50" >{r.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="font-body text-sm text-xert-pale/40" >No data yet.</p>}
          </div>
        ))}
      </div>
        </div>
      </details>
    </div>
  );
}
