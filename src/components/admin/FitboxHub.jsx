import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, CalendarCheck, CheckCircle2, ClipboardCheck, CreditCard, Link2, Loader2, RefreshCw, Search, Settings2, ShieldCheck, TriangleAlert, Users, Zap,
} from 'lucide-react';
import {
  FITBOX_SYNC_FEEDS,
  getFitboxOverview,
  listFitboxAttendance,
  listFitboxMemberLinks,
  listFitboxSubscriptions,
  listFitboxUsers,
  lookupFitboxUser,
  runFitboxSync,
} from '@/lib/adminData';
import { toast } from '@/components/ui/use-toast';
import AdminLoadError from '@/components/admin/AdminLoadError';
import FitboxReconciliation from '@/components/admin/FitboxReconciliation';
import { ADMIN_BUTTON, ADMIN_INPUT_BARE, ADMIN_PAGE, ADMIN_PANEL, ADMIN_TEXT } from '@/components/admin/ui';

const TABS = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'memberships', label: 'Memberships', icon: CreditCard },
  { key: 'bookings', label: 'Bookings', icon: CalendarCheck },
  { key: 'review', label: 'Review queue', icon: ClipboardCheck },
  { key: 'setup', label: 'Setup', icon: Settings2 },
];

const FEED_LABELS = {
  users: 'Member profiles',
  statuses: 'Member statuses',
  subscriptions: 'Memberships',
  bookings: 'Class bookings',
  cancellations: 'Cancellations',
  first_sessions: 'First sessions',
  classes: 'Classes',
  lookup: 'Lookup',
};

function readable(value) {
  return String(value || '').replace(/_/g, ' ');
}

function when(value, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-AU', options);
}

function money(cents) {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

function fullName(row) {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || `FitBox user ${row.fitbox_user_id}`;
}

function StatusChip({ value, tone }) {
  const tones = {
    good: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
    warn: 'border-amber-300/35 bg-amber-300/10 text-amber-200',
    bad: 'border-red-300/35 bg-red-300/10 text-red-200',
    quiet: 'border-white/10 bg-white/[0.04] text-xert-pale/70',
  };
  const resolved = tone || ({ active: 'good', booked: 'good', prospect: 'warn', cancelled: 'bad', archived: 'quiet', suspended: 'bad', completed: 'good', failed: 'bad', running: 'warn' }[value] || 'quiet');
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-body text-[10px] uppercase tracking-[0.14em] ${tones[resolved]}`}>
      {readable(value) || 'unknown'}
    </span>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className={`${ADMIN_PANEL} p-4`}>
      <p className={ADMIN_TEXT.sectionHeading}>{label}</p>
      <p className="mt-2 font-display text-3xl text-xert-offwhite">{value ?? '—'}</p>
      {hint && <p className="mt-1 font-body text-xs text-xert-pale/50">{hint}</p>}
    </div>
  );
}

function ReadinessRow({ ok, label, detail }) {
  return (
    <li className="flex items-start gap-3 py-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-200" />}
      <div>
        <p className="font-body text-sm text-xert-offwhite">{label}</p>
        {detail && <p className="font-body text-xs text-xert-pale/55">{detail}</p>}
      </div>
    </li>
  );
}

function useMirror(loader, deps) {
  const [state, setState] = useState({ rows: [], installed: true, loading: true, error: '' });
  const reload = useCallback(async () => {
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const result = await loader();
      setState({ rows: result.rows, installed: result.installed, loading: false, error: '' });
    } catch (error) {
      setState(current => ({ ...current, loading: false, error: error.message || 'FitBox data could not be loaded.' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return [state, reload];
}

function MirrorNotice({ installed }) {
  if (installed) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-300/35 bg-amber-300/10 p-4" role="status">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-200" />
      <p className="font-body text-sm leading-relaxed text-amber-100/80">
        The FitBox mirror tables are not installed yet. Apply <code className="font-mono text-xs">supabase/migrations/20260903000000_fitbox_live_mirror.sql</code> in Supabase, then sync.
      </p>
    </div>
  );
}

function OverviewTab({ overview, loading, error, onReload, onSync, syncing, syncProgress, onGoTo }) {
  if (error) return <AdminLoadError message={error} onRetry={onReload} />;
  if (loading || !overview) {
    return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading FitBox overview">{[1, 2, 3, 4].map(item => <div key={item} className={`${ADMIN_PANEL} h-24 animate-pulse`} />)}</div>;
  }
  const summary = overview.summary;
  const gatewayReady = overview.gateway?.ready;
  const feedsViaGateway = Boolean(overview.gateway?.feeds_available);
  const pushLive = Boolean(overview.events?.ready && overview.last_event_at);
  return (
    <div className="space-y-5">
      <MirrorNotice installed={overview.mirror_installed} />
      <div className={`${ADMIN_PANEL} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-start gap-3">
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${gatewayReady ? 'bg-emerald-300/15 text-emerald-200' : 'bg-amber-300/15 text-amber-200'}`}>
            <Zap className="size-5" />
          </div>
          <div>
            <h3 className="font-display text-xl uppercase text-xert-offwhite">{gatewayReady ? 'Live gateway connected' : 'Live gateway not connected'}</h3>
            <p className="mt-1 max-w-xl font-body text-sm leading-relaxed text-xert-pale/65">
              {gatewayReady
                ? `XERT can ask FitBox directly through Zapier for gym ${overview.gym_id || '—'}.${feedsViaGateway ? ` Last full sync ${when(overview.last_completed_sync)}.` : pushLive ? ` Members, memberships and bookings arrive live from your FitBox Zaps; last change ${when(overview.last_event_at)}.` : ' Your FitBox Zaps deliver changes as they happen.'}`
                : 'Add the Zapier MCP server URL in Vercel to look people up in FitBox and register prospects instantly. The FitBox Zaps keep delivering changes meanwhile.'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {feedsViaGateway ? (
            <button type="button" onClick={onSync} disabled={!gatewayReady || syncing || !overview.mirror_installed} className={`${ADMIN_BUTTON.primary} min-h-11 px-5`}>
              {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {syncing ? `Syncing ${FEED_LABELS[syncProgress] || ''}…` : 'Sync everything now'}
            </button>
          ) : (
            <div className="max-w-xs rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-body text-xs leading-relaxed text-xert-pale/70 sm:text-right">
              <p className="font-semibold text-xert-offwhite">{pushLive ? 'Live via FitBox Zaps' : 'Waiting for the first FitBox change'}</p>
              <p className="mt-1">{overview.events_24h || 0} change{overview.events_24h === 1 ? '' : 's'} received in the last 24 hours. Use Members → Look up to pull one person on demand.</p>
            </div>
          )}
          {!gatewayReady && <button type="button" onClick={() => onGoTo('setup')} className="font-body text-xs uppercase tracking-wider text-xert-steel underline-offset-4 hover:underline">Open setup</button>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active members" value={summary?.users?.active} hint={`${summary?.users?.prospects ?? 0} prospects · ${summary?.users?.staff ?? 0} staff`} />
        <Stat label="Active memberships" value={summary?.subscriptions?.active} hint={`${summary?.subscriptions?.paid_active ?? 0} paying`} />
        <Stat label="Upcoming bookings" value={summary?.attendance?.upcoming} hint={`${summary?.attendance?.cancelled ?? 0} cancelled on record`} />
        <Stat label="Linked to XERT" value={summary?.links} hint="FitBox users matched to XERT members or leads" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${ADMIN_PANEL} p-5`}>
          <h3 className={ADMIN_TEXT.sectionHeading}>Needs you</h3>
          <ul className="mt-3 divide-y divide-white/[0.06]">
            <li className="flex items-center justify-between py-3">
              <span className="font-body text-sm text-xert-offwhite">FitBox signals awaiting review</span>
              <button type="button" onClick={() => onGoTo('review')} className="inline-flex items-center gap-2 font-body text-sm text-xert-steel">
                <span className={`rounded-full px-2.5 py-0.5 font-body text-xs ${overview.review_queue > 0 ? 'bg-amber-300/20 text-amber-100' : 'bg-white/[0.06] text-xert-pale/60'}`}>{overview.review_queue}</span>
                Open
              </button>
            </li>
            <li className="flex items-center justify-between gap-4 py-3">
              <span className="font-body text-sm text-xert-offwhite">Classes known to FitBox</span>
              <span className="text-right font-body text-sm text-xert-pale/70">{overview.classes?.length ? overview.classes.map(item => item.name).join(', ') : 'None seen yet'}</span>
            </li>
          </ul>
        </section>
        <section className={`${ADMIN_PANEL} p-5`}>
          <h3 className={ADMIN_TEXT.sectionHeading}>{feedsViaGateway ? 'Recent syncs' : 'Recent activity'}</h3>
          {!feedsViaGateway && overview.last_event_at && (
            <p className="mt-3 font-body text-sm text-xert-pale/70">Last FitBox change: {readable(overview.last_event_type)} · {when(overview.last_event_at)}</p>
          )}
          {overview.recent_runs?.length ? (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {overview.recent_runs.slice(0, 8).map(run => (
                <li key={run.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-body text-sm text-xert-offwhite">{FEED_LABELS[run.feed] || readable(run.feed)}</p>
                    <p className="font-body text-xs text-xert-pale/50">{when(run.finished_at || run.started_at)} · {run.accepted} stored{run.rejected ? ` · ${run.rejected} skipped` : ''}{run.linked ? ` · ${run.linked} linked` : ''}{run.error_code ? ` · ${readable(run.error_code).toLowerCase()}` : ''}</p>
                  </div>
                  <StatusChip value={run.status} />
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 font-body text-sm text-xert-pale/55">{feedsViaGateway ? 'No syncs yet. Run one to fill the members, memberships and bookings tabs.' : 'Lookups and prospect registrations will be listed here.'}</p>}
        </section>
      </div>
    </div>
  );
}

function LookupCard({ onFound }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const isEmail = value.includes('@');
      const next = await lookupFitboxUser(isEmail ? { email: value } : { fitboxUserId: value });
      setResult(next);
      if (next.found) onFound?.();
    } catch (lookupError) {
      setError(lookupError.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className={`${ADMIN_PANEL} p-4`}>
      <label htmlFor="fitbox-lookup" className={ADMIN_TEXT.sectionHeading}>Look up in FitBox</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input id="fitbox-lookup" value={query} onChange={event => setQuery(event.target.value)} placeholder="Email address or FitBox user ID" className={`${ADMIN_INPUT_BARE} flex-1`} />
        <button type="submit" disabled={busy || !query.trim()} className={`${ADMIN_BUTTON.primary} min-h-11 px-5`}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Look up
        </button>
      </div>
      <p className="mt-2 font-body text-xs text-xert-pale/50">Asks FitBox live, stores the profile in the mirror and links it to an XERT member when the email matches exactly.</p>
      {error && <p role="alert" className="mt-3 font-body text-sm text-red-200">{error}</p>}
      {result && !result.found && <p className="mt-3 font-body text-sm text-amber-200">FitBox has no user for that lookup.</p>}
      {result?.found && (
        <div className="mt-3 rounded-xl border border-emerald-300/25 bg-emerald-300/5 p-3 font-body text-sm text-xert-pale/80">
          <p className="text-xert-offwhite">{fullName(result.user)} · <StatusChip value={result.user.status} /></p>
          <p className="mt-1 text-xs">{result.user.email || 'No email'} · {result.user.phone || 'No phone'} · FitBox ID {result.user.fitbox_user_id}</p>
          <p className="mt-1 text-xs">Next session: {result.next_session?.session_start_time ? `${result.next_session.class_name || 'Class'} · ${when(result.next_session.session_start_time)}` : result.next_session?.unavailable ? 'Could not be checked' : 'None booked'}</p>
          {result.linked > 0 && <p className="mt-1 text-xs text-emerald-200">Linked to an XERT member by verified email.</p>}
        </div>
      )}
    </form>
  );
}

function MembersTab({ links }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [state, reload] = useMirror(() => listFitboxUsers({ search, status }), [search, status]);
  const linkedIds = useMemo(() => new Set((links || []).map(link => link.fitbox_user_id)), [links]);
  return (
    <div className="space-y-4">
      <MirrorNotice installed={state.installed} />
      <LookupCard onFound={reload} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, email or ID" aria-label="Search FitBox members" className={`${ADMIN_INPUT_BARE} flex-1`} />
        <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter by FitBox status" className={`${ADMIN_INPUT_BARE} sm:w-44`}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="prospect">Prospect</option>
          <option value="pending">Pending</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      {state.error ? <AdminLoadError message={state.error} onRetry={reload} /> : state.loading ? (
        <div className="space-y-2" role="status" aria-label="Loading FitBox members">{[1, 2, 3].map(item => <div key={item} className={`${ADMIN_PANEL} h-16 animate-pulse`} />)}</div>
      ) : state.rows.length === 0 ? (
        <p className={`${ADMIN_PANEL} p-6 text-center font-body text-sm text-xert-pale/55`}>No FitBox members in the mirror yet. Sync from Overview or look one up above.</p>
      ) : (
        <ul className="space-y-2">
          {state.rows.map(row => (
            <li key={row.id} className={`${ADMIN_PANEL} flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between`}>
              <div className="min-w-0">
                <p className="font-body text-sm font-semibold text-xert-offwhite">{fullName(row)} {row.role === 'staff' && <span className="ml-1 font-normal text-xert-pale/50">· staff</span>}</p>
                <p className="truncate font-body text-xs text-xert-pale/55">{row.email || 'No email'} · {row.phone || 'No phone'}{row.city ? ` · ${row.city}` : ''}</p>
                <p className="font-body text-[11px] text-xert-pale/40">FitBox ID {row.fitbox_user_id} · synced {when(row.synced_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                {linkedIds.has(row.fitbox_user_id) && <span className="inline-flex items-center gap-1 font-body text-[11px] uppercase tracking-wider text-emerald-200"><Link2 className="size-3" /> Linked</span>}
                <StatusChip value={row.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MembershipsTab() {
  const [status, setStatus] = useState('all');
  const [state, reload] = useMirror(() => listFitboxSubscriptions({ status }), [status]);
  return (
    <div className="space-y-4">
      <MirrorNotice installed={state.installed} />
      <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter memberships by status" className={`${ADMIN_INPUT_BARE} sm:w-52`}>
        <option value="all">All memberships</option>
        <option value="active">Active</option>
        <option value="cancelled">Cancelled</option>
        <option value="expired">Expired</option>
      </select>
      {state.error ? <AdminLoadError message={state.error} onRetry={reload} /> : state.loading ? (
        <div className="space-y-2" role="status" aria-label="Loading FitBox memberships">{[1, 2].map(item => <div key={item} className={`${ADMIN_PANEL} h-16 animate-pulse`} />)}</div>
      ) : state.rows.length === 0 ? (
        <p className={`${ADMIN_PANEL} p-6 text-center font-body text-sm text-xert-pale/55`}>No memberships in the mirror yet. Sync from Overview.</p>
      ) : (
        <ul className="space-y-2">
          {state.rows.map(row => (
            <li key={row.id} className={`${ADMIN_PANEL} flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between`}>
              <div className="min-w-0">
                <p className="font-body text-sm font-semibold text-xert-offwhite">{row.product_name || 'Membership'}</p>
                <p className="truncate font-body text-xs text-xert-pale/55">{row.email || `FitBox user ${row.fitbox_user_id}`} · {money(row.price_in_cents)}{row.payment_gateway ? ` via ${readable(row.payment_gateway)}` : ''}</p>
                <p className="font-body text-[11px] text-xert-pale/40">Started {row.start_date || '—'}{row.expiration_date ? ` · ends ${row.expiration_date}` : ''}{row.sessions_count !== null && row.sessions_count !== undefined ? ` · ${row.sessions_count} sessions` : ''}</p>
              </div>
              <StatusChip value={row.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingsTab() {
  const [range, setRange] = useState('upcoming');
  const [state, reload] = useMirror(() => listFitboxAttendance({ range }), [range]);
  return (
    <div className="space-y-4">
      <MirrorNotice installed={state.installed} />
      <div role="tablist" aria-label="Booking range" className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {[['upcoming', 'Upcoming'], ['recent', 'Recent']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={range === key} onClick={() => setRange(key)} className={`min-h-9 rounded-lg px-4 font-body text-xs uppercase tracking-wider ${range === key ? 'bg-xert-steel text-xert-navy' : 'text-xert-pale/60'}`}>{label}</button>
        ))}
      </div>
      {state.error ? <AdminLoadError message={state.error} onRetry={reload} /> : state.loading ? (
        <div className="space-y-2" role="status" aria-label="Loading FitBox bookings">{[1, 2].map(item => <div key={item} className={`${ADMIN_PANEL} h-16 animate-pulse`} />)}</div>
      ) : state.rows.length === 0 ? (
        <p className={`${ADMIN_PANEL} p-6 text-center font-body text-sm text-xert-pale/55`}>No {range} FitBox bookings in the mirror.</p>
      ) : (
        <ul className="space-y-2">
          {state.rows.map(row => (
            <li key={row.id} className={`${ADMIN_PANEL} flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between`}>
              <div className="min-w-0">
                <p className="font-body text-sm font-semibold text-xert-offwhite">{row.class_name || 'Class'} · {when(row.session_start_time)}</p>
                <p className="font-body text-xs text-xert-pale/55">FitBox user {row.fitbox_user_id} · attendance {row.fitbox_attendance_id}{row.fitbox_event_id ? ` · event ${row.fitbox_event_id}` : ''}</p>
                <p className="font-body text-[11px] text-xert-pale/40">Seen via {readable(row.feed)} · synced {when(row.synced_at)}</p>
              </div>
              <StatusChip value={row.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SetupTab({ overview }) {
  const gateway = overview?.gateway;
  const hooks = overview?.hooks;
  const events = overview?.events;
  return (
    <div className="space-y-4">
      <section className={`${ADMIN_PANEL} p-5`}>
        <h3 className="font-display text-xl uppercase text-xert-offwhite">Connection checklist</h3>
        <ul className="mt-2 divide-y divide-white/[0.06]">
          <ReadinessRow ok={Boolean(overview?.mirror_installed)} label="Mirror tables installed" detail={overview?.mirror_installed ? 'fitbox_users, fitbox_subscriptions, fitbox_attendance, fitbox_classes and fitbox_sync_runs exist.' : 'Apply supabase/migrations/20260903000000_fitbox_live_mirror.sql in the Supabase SQL editor.'} />
          <ReadinessRow ok={Boolean(gateway?.ready)} label="Live gateway (Zapier MCP)" detail={gateway?.ready
            ? (gateway.mode === 'dynamic'
              ? 'Dynamic server: lookups, prospect registration and all bulk feeds are on.'
              : `Actions-only server (${(gateway.tools || []).length} FitBox tools): lookups and prospect registration are on; bulk feeds are not. Connect the dynamic server URL to enable feeds.`)
            : gateway?.mode === 'unreachable'
              ? `Zapier rejected the configured server URL (${readable(gateway.error_code || '').toLowerCase() || 'unreachable'}). Regenerate the server URL in Zapier and update ZAPIER_MCP_URL.`
              : `Missing in Vercel: ${(gateway?.missing || ['ZAPIER_MCP_URL']).join(', ')}. In Zapier MCP open your server, choose Connect, copy the server URL into Vercel as ZAPIER_MCP_URL (and ZAPIER_MCP_TOKEN if a key is shown), then redeploy.`} />
          <ReadinessRow ok={Boolean(hooks?.ready)} label="Push Zaps (catch hooks)" detail={hooks?.ready ? 'Register and Get User catch hooks are configured as the fallback path.' : `Optional once the gateway is live. Missing: ${(hooks?.missing || []).join(', ') || 'none'}.`} />
          <ReadinessRow ok={Boolean(events?.ready)} label="Inbound event Zaps" detail={events?.ready ? 'FitBox → XERT review-only triggers are accepted.' : `Missing: ${(events?.missing || []).join(', ')}.`} />
        </ul>
      </section>
      <section className={`${ADMIN_PANEL} p-5`}>
        <h3 className={ADMIN_TEXT.sectionHeading}>What each part does</h3>
        <dl className="mt-3 space-y-3 font-body text-sm text-xert-pale/70">
          <div><dt className="text-xert-offwhite">Live gateway</dt><dd>XERT asks FitBox directly through Zapier: member profiles, statuses, memberships, class bookings, first sessions and classes on demand, plus instant prospect registration and profile refresh.</dd></div>
          <div><dt className="text-xert-offwhite">Push Zaps</dt><dd>FitBox tells XERT when something changes. Those signals land in the Review queue as evidence; nothing in XERT changes automatically.</dd></div>
          <div><dt className="text-xert-offwhite">What XERT never stores</dt><dd>Date of birth, gender, weight, height, street addresses, emergency contacts, custom fields or card details from FitBox.</dd></div>
          <div><dt className="text-xert-offwhite">Editing members</dt><dd>Change member details, memberships and billing in FitBox itself. Update User stays off because the connector overwrites gender by default.</dd></div>
        </dl>
      </section>
    </div>
  );
}

export default function FitboxHub({ initialTab = 'overview' }) {
  const [tab, setTab] = useState(TABS.some(item => item.key === initialTab) ? initialTab : 'overview');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [links, setLinks] = useState([]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [next, linkRows] = await Promise.all([getFitboxOverview(), listFitboxMemberLinks().catch(() => ({ rows: [] }))]);
      setOverview(next);
      setLinks(linkRows.rows || []);
    } catch (loadError) {
      setError(loadError.message || 'FitBox overview could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const syncAll = async () => {
    setSyncing(true);
    const failures = [];
    let stored = 0;
    for (const feed of FITBOX_SYNC_FEEDS) {
      setSyncProgress(feed);
      try {
        const result = await runFitboxSync(feed);
        stored += Number(result.accepted || 0);
      } catch (syncError) {
        failures.push(`${FEED_LABELS[feed] || feed}: ${syncError.message}`);
      }
    }
    setSyncing(false);
    setSyncProgress('');
    toast({
      title: failures.length ? 'FitBox sync finished with problems' : 'FitBox sync complete',
      description: failures.length ? failures.join(' · ') : `${stored} records refreshed from FitBox.`,
      variant: failures.length ? 'destructive' : undefined,
    });
    await loadOverview();
  };

  return (
    <div className={`${ADMIN_PAGE} space-y-5`}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={ADMIN_TEXT.sectionHeading}>Business</p>
          <h2 className={ADMIN_TEXT.pageTitle}>FitBox</h2>
          <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-xert-pale/65">Everything XERT knows from FitBox in one place: members, memberships, bookings, the signals that need a look, and how the connection is set up.</p>
        </div>
        <button type="button" onClick={() => void loadOverview()} disabled={loading} className={`${ADMIN_BUTTON.ghost} min-h-11 px-4`}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
        </button>
      </header>

      <nav role="tablist" aria-label="FitBox sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map(item => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button key={item.key} type="button" role="tab" aria-selected={active} onClick={() => setTab(item.key)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 font-body text-xs uppercase tracking-wider transition-colors ${active ? 'border-xert-steel/50 bg-xert-steel/15 text-xert-offwhite' : 'border-white/[0.06] bg-white/[0.02] text-xert-pale/60 hover:text-xert-offwhite'}`}>
              <Icon className="size-4" /> {item.label}
              {item.key === 'review' && overview?.review_queue > 0 && <span className="rounded-full bg-amber-300/25 px-2 py-0.5 text-[10px] text-amber-100">{overview.review_queue}</span>}
            </button>
          );
        })}
      </nav>

      {tab === 'overview' && <OverviewTab overview={overview} loading={loading} error={error} onReload={loadOverview} onSync={syncAll} syncing={syncing} syncProgress={syncProgress} onGoTo={setTab} />}
      {tab === 'members' && <MembersTab links={links} />}
      {tab === 'memberships' && <MembershipsTab />}
      {tab === 'bookings' && <BookingsTab />}
      {tab === 'review' && <FitboxReconciliation embedded />}
      {tab === 'setup' && <SetupTab overview={overview} />}

      <p className="flex items-start gap-2 font-body text-xs leading-relaxed text-xert-pale/45">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        FitBox stays the source of truth for memberships and billing. XERT reads, links and records; it never changes a FitBox record from here except registering an approved prospect.
      </p>
    </div>
  );
}
