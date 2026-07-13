import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, CalendarCheck2, CalendarClock, ChevronLeft, ChevronRight, ClipboardCheck, Download, FileClock, RefreshCw, ScrollText, ShieldCheck, Ticket, UserRoundSearch } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getAdminAuditRecords } from '@/lib/adminData';
import {
  adminAuditCsvRows,
  buildAdminAuditEvents,
  filterAdminAuditEvents,
  summarizeAdminAuditEvents,
} from '@/lib/adminAudit';
import { downloadCsv } from '@/lib/csv';
import AdminLoadError from '@/components/admin/AdminLoadError';

const PAGE_SIZE = 50;
const RANGE_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];
const ACTION_ICONS = Object.freeze({
  role: ShieldCheck,
  credit: Ticket,
  announcement: BellRing,
  lead: UserRoundSearch,
  schedule: CalendarClock,
  content: FileClock,
  booking: CalendarCheck2,
});
const ACTION_TAGS = Object.freeze({
  role: 'Role',
  credit: 'Credit',
  announcement: 'Notice',
  lead: 'Lead',
  schedule: 'Schedule',
  content: 'Content',
  booking: 'Booking',
  request: 'Request',
});

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  return date.toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function ActionMark({ type }) {
  const Icon = ACTION_ICONS[type] || ClipboardCheck;
  return (
    <span className="w-9 h-9 shrink-0 inline-flex items-center justify-center bg-xert-steel/10 border border-xert-steel/20" aria-hidden="true">
      <Icon className="w-4 h-4 text-xert-steel" />
    </span>
  );
}

export default function AdminAuditLog() {
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [days, setDays] = useState('30');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setRecords(await getAdminAuditRecords());
      setUpdatedAt(new Date());
    } catch (error) {
      const message = error.message || 'Check audit migrations and administrator permissions.';
      if (!records) setLoadError(message);
      toast({ title: 'Admin audit unavailable', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { setPage(1); }, [days, search, type]);

  const allEvents = useMemo(() => buildAdminAuditEvents(records || {}), [records]);
  const events = useMemo(
    () => filterAdminAuditEvents(allEvents, { days, search, type }),
    [allEvents, days, search, type]
  );
  const summary = useMemo(() => summarizeAdminAuditEvents(events), [events]);
  const pageCount = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleEvents = events.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const firstResult = events.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const lastResult = Math.min(safePage * PAGE_SIZE, events.length);

  const exportRows = () => downloadCsv(
    `xert-admin-audit-${days}-${new Date().toISOString().slice(0, 10)}.csv`,
    adminAuditCsvRows(events),
    [
      { key: 'timestamp', label: 'Timestamp' },
      { key: 'action', label: 'Action' },
      { key: 'administrator', label: 'Administrator' },
      { key: 'administrator_id', label: 'Administrator ID' },
      { key: 'member', label: 'Subject' },
      { key: 'member_id', label: 'Subject ID' },
      { key: 'summary', label: 'Summary' },
      { key: 'detail', label: 'Detail / Reason' },
    ]
  );

  if (!records && loading) return <div className="p-6"><div className="h-40 bg-xert-ink animate-pulse" /></div>;
  if (!records && loadError) return <div className="p-6"><AdminLoadError message={loadError} onRetry={load} /></div>;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-xert-steel" />
            <h2 className="font-display text-lg text-xert-offwhite uppercase">Admin Audit</h2>
          </div>
          <p className="font-body text-xs text-xert-concrete/40 mt-1">
            Permanent role, credit, lead, booking, schedule, content, request and member notice history
            {updatedAt ? ` · refreshed ${updatedAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportRows} disabled={events.length === 0}
            className="min-h-11 inline-flex items-center gap-1.5 px-3 py-2 border border-xert-steel/40 font-body text-xs text-xert-concrete/70 uppercase tracking-wider hover:border-xert-steel disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button type="button" onClick={() => void load()} disabled={loading} title="Refresh admin audit" aria-label="Refresh admin audit"
            className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {records?.warnings?.length > 0 && (
        <div role="status" className="border border-xert-orange/30 bg-xert-orange/5 px-4 py-3">
          <p className="font-body text-sm text-xert-orange">
            Partial audit history: {records.warnings.join(' | ')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-10 gap-3">
        {[
          { label: 'Actions', value: summary.total },
          { label: 'Role changes', value: summary.roleChanges },
          { label: 'Lead changes', value: summary.leadChanges },
          { label: 'Booking changes', value: summary.bookingChanges },
          { label: 'Schedule changes', value: summary.scheduleChanges },
          { label: 'Content changes', value: summary.contentChanges },
          { label: 'Request changes', value: summary.requestChanges },
          { label: 'Notice changes', value: summary.announcementChanges },
          { label: 'Credits granted', value: summary.creditsGranted },
          { label: 'Active administrators', value: summary.activeAdmins },
        ].map(metric => (
          <div key={metric.label} className="bg-xert-ink border border-xert-steel/20 p-4">
            <p className="font-display text-2xl text-xert-offwhite tabular-nums">{metric.value}</p>
            <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider mt-1">{metric.label}</p>
          </div>
        ))}
      </div>

      <section className="bg-xert-ink border border-xert-steel/20" aria-labelledby="audit-ledger-title">
        <div className="p-4 border-b border-xert-steel/20 space-y-3">
          <h3 id="audit-ledger-title" className="font-display text-sm text-xert-concrete/60 uppercase tracking-wider">Audit Ledger</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search admin audit"
              placeholder="Search admin, member, resource or reason"
              className="sm:col-span-1 min-h-11 bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite placeholder:text-xert-concrete/30 focus:outline-none focus:border-xert-steel" />
            <select value={type} onChange={event => setType(event.target.value)} aria-label="Audit action type"
              className="min-h-11 bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite">
              <option value="all">All actions</option>
              <option value="role">Role changes</option>
              <option value="credit">Credit grants</option>
              <option value="lead">Lead pipeline changes</option>
              <option value="booking">Booking changes</option>
              <option value="schedule">Schedule changes</option>
              <option value="content">Content changes</option>
              <option value="request">Booking & PT changes</option>
              <option value="announcement">Member notice changes</option>
            </select>
            <select value={days} onChange={event => setDays(event.target.value)} aria-label="Audit reporting range"
              className="min-h-11 bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite">
              {RANGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="p-10 text-center">
            <ScrollText className="w-7 h-7 mx-auto text-xert-steel/40" />
            <p className="font-body text-sm text-xert-concrete/50 mt-3">No matching administrative actions.</p>
          </div>
        ) : (
          <div className="divide-y divide-xert-steel/10">
            {visibleEvents.map(event => (
              <article key={event.id} className="p-4 flex items-start gap-3">
                <ActionMark type={event.type} />
                <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.45fr)] gap-2 lg:gap-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="font-body text-sm text-xert-offwhite">{event.summary}</p>
                      <span className="font-body text-[10px] uppercase tracking-wider text-xert-steel">
                        {ACTION_TAGS[event.type] || 'Admin'}
                      </span>
                    </div>
                    <p className="font-body text-xs text-xert-concrete/55 mt-1 break-words">{event.detail}</p>
                    <p className="font-body text-xs text-xert-concrete/40 mt-1">
                      <span className="text-xert-concrete/70">{event.actor}</span> acted on <span className="text-xert-concrete/70">{event.subject}</span>
                    </p>
                  </div>
                  <time dateTime={event.at} className="font-body text-xs text-xert-concrete/40 lg:text-right tabular-nums">
                    {formatDateTime(event.at)}
                  </time>
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="min-h-14 px-4 py-3 border-t border-xert-steel/20 flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-xs text-xert-concrete/40" aria-live="polite">
            Showing {firstResult}-{lastResult} of {events.length}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={safePage <= 1}
              title="Previous page" aria-label="Previous audit page"
              className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-body text-xs text-xert-concrete/60 tabular-nums min-w-16 text-center">{safePage} / {pageCount}</span>
            <button type="button" onClick={() => setPage(current => Math.min(pageCount, current + 1))} disabled={safePage >= pageCount}
              title="Next page" aria-label="Next audit page"
              className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
