import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getPTRequests, updatePTRequestStatus } from '@/lib/adminData';
import AdminLoadError from '@/components/admin/AdminLoadError';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';
import { downloadCsv } from '@/lib/csv';
import { bulkPTRequestStatusOptions, isPendingPTRequest, PT_SESSION_TYPES, ptRequestCsvRows, selectedPTRequestIds } from '@/lib/ptRequestAnalytics';
import { collectAdminPages } from '@/lib/adminPagination';
import { adminBulkConfirmation, settleAdminMutations } from '@/lib/adminBulk';

const STATUSES = ['requested', 'approved', 'declined', 'reschedule_requested', 'completed', 'cancelled'];
const STATUS_COLORS = {
  requested: 'bg-xert-steel/20 text-xert-red',
  approved: 'bg-green-900/30 text-green-400',
  declined: 'bg-xert-steel/30 text-xert-concrete/40',
  reschedule_requested: 'bg-yellow-900/30 text-yellow-400',
  completed: 'bg-green-700/30 text-green-300',
  cancelled: 'bg-xert-steel/20 text-xert-concrete/30',
};
const PAGE_SIZE = 50;
const EMPTY_SUMMARY = { total: 0, requested: 0, approved: 0, completed: 0 };

export default function PTRequestsTable() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sessionTypeFilter, setSessionTypeFilter] = useState('all');
  const [daysFilter, setDaysFilter] = useState('30');
  const [notesModal, setNotesModal] = useState(null);
  const [notes, setNotes] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkConfirmationOpen, setBulkConfirmationOpen] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async (targetPage = 1) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const result = await getPTRequests({
        search: debouncedSearch,
        status: statusFilter,
        sessionType: sessionTypeFilter,
        days: daysFilter,
        page: targetPage,
        pageSize: PAGE_SIZE
      });
      if (requestId !== requestIdRef.current) return;
      setRequests(result.rows);
      setSummary(result.summary || EMPTY_SUMMARY);
      setTotal(result.total);
      setPage(result.page);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(error.message || 'Check the private session requests table and admin permissions.');
      setRequests([]);
      setSummary(EMPTY_SUMMARY);
      setTotal(0);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [daysFilter, debouncedSearch, sessionTypeFilter, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => { void load(1); }, [load]);
  useEffect(() => () => { requestIdRef.current += 1; }, []);

  const sessionTypes = useMemo(() => [...new Set([...PT_SESSION_TYPES, ...requests.map(request => request.requested_session_type).filter(Boolean)])].sort(), [requests]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(page * PAGE_SIZE, total);
  const allVisibleSelected = requests.length > 0 && requests.every(request => selectedIds.has(request.id));
  const selectedRequests = useMemo(() => requests.filter(request => selectedIds.has(request.id)), [requests, selectedIds]);
  const bulkStatusOptions = useMemo(() => bulkPTRequestStatusOptions(selectedRequests), [selectedRequests]);
  const bulkConfirmation = useMemo(() => {
    if (!bulkStatus || selectedRequests.length === 0) return null;
    const [description, warning] = adminBulkConfirmation({
      count: selectedRequests.length,
      recordLabel: 'PT request',
      status: bulkStatus,
      warning: 'This updates every selected member request.',
    }).split('\n\n');
    return { description, warning };
  }, [bulkStatus, selectedRequests]);

  useEffect(() => {
    if (bulkStatus && !bulkStatusOptions.includes(bulkStatus)) setBulkStatus('');
  }, [bulkStatus, bulkStatusOptions]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [daysFilter, debouncedSearch, sessionTypeFilter, statusFilter]);

  const goToPage = targetPage => {
    setNotesModal(null);
    setSelectedIds(new Set());
    void load(targetPage);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await collectAdminPages(targetPage => getPTRequests({
        search: debouncedSearch,
        status: statusFilter,
        sessionType: sessionTypeFilter,
        days: daysFilter,
        page: targetPage,
        pageSize: 100,
        includeSummary: false
      }));
      if (rows.length === 0) throw new Error('No matching PT requests to export.');
      downloadCsv(
        `xert-pt-requests-${new Date().toISOString().slice(0, 10)}.csv`,
        ptRequestCsvRows(rows),
        [
          { key: 'created_at', label: 'Requested' }, { key: 'status', label: 'Status' },
          { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' }, { key: 'session_type', label: 'Session type' },
          { key: 'preferred_day', label: 'Preferred day' }, { key: 'preferred_time', label: 'Preferred time' },
        ]
      );
      toast({ title: 'CSV exported', description: `${rows.length} filtered PT request${rows.length === 1 ? '' : 's'} downloaded.` });
    } catch (error) {
      toast({ title: 'Export failed', description: error.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleUpdate = async (id, status, adminNotes) => {
    setUpdatingId(id);
    try {
      await updatePTRequestStatus(id, status, adminNotes);
      toast({ title: adminNotes === undefined ? 'PT request updated' : 'Notes saved', description: adminNotes === undefined ? `Request is now ${status.replace(/_/g, ' ')}.` : undefined });
      // Stay on the desk page the operator was working; filters already drop
      // rows that no longer match without bouncing them back to page 1.
      await load(page);
      if (adminNotes !== undefined) setNotesModal(null);
    } catch (e) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkStatus || selectedRequests.length === 0 || !bulkStatusOptions.includes(bulkStatus)) return;
    setBulkSaving(true);
    const results = await settleAdminMutations(selectedRequests, request => updatePTRequestStatus(request.id, bulkStatus));
    const failedIds = new Set();
    results.forEach((result, index) => {
      if (result.status === 'rejected') failedIds.add(selectedRequests[index].id);
    });
    const updatedCount = selectedRequests.length - failedIds.size;
    if (updatedCount > 0) {
      toast({ title: 'PT requests updated', description: `${updatedCount} request${updatedCount === 1 ? '' : 's'} moved to ${bulkStatus.replace(/_/g, ' ')}.` });
      await load(page);
    }
    setSelectedIds(failedIds);
    if (failedIds.size > 0) {
      toast({ title: 'Some updates failed', description: `${failedIds.size} request${failedIds.size === 1 ? '' : 's'} remain selected so you can retry.`, variant: 'destructive' });
    } else {
      setBulkStatus('');
    }
    setBulkSaving(false);
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">PT Request Operations</h2>
        <button type="button" onClick={() => void handleExport()} disabled={total === 0 || exporting || loading}
          className="inline-flex min-h-11 items-center gap-1.5 px-3 py-2 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 uppercase tracking-wider hover:border-xert-steel transition-colors disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> {exporting ? 'Exporting...' : 'CSV'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search PT requests" placeholder="Search member, goal or notes"
          className="sm:col-span-2 bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter PT requests by status"
          className="bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={sessionTypeFilter} onChange={e => setSessionTypeFilter(e.target.value)} aria-label="Filter PT requests by session type"
          className="bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
          <option value="all">All session types</option>
          {sessionTypes.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
        <div className="flex gap-2">
          <select value={daysFilter} onChange={e => setDaysFilter(e.target.value)} aria-label="Filter PT requests by age"
            className="flex-1 min-w-0 bg-xert-ink border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
            <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
          </select>
          <button type="button" onClick={() => void load(page)} disabled={loading} title="Refresh PT requests" aria-label="Refresh PT requests"
            className="min-w-11 min-h-11 p-2.5 border border-xert-steel/40 text-xert-steel hover:border-xert-steel transition-colors disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Matching', value: summary.total },
          { label: 'Requested', value: summary.requested },
          { label: 'Approved', value: summary.approved },
          { label: 'Completed', value: summary.completed },
        ].map(item => (
          <div key={item.label} className="bg-xert-ink border border-xert-steel/20 p-4">
            <p className="font-display text-2xl text-xert-offwhite tabular-nums">{item.value}</p>
            <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 border border-xert-steel/20 bg-xert-ink p-3">
        <label className="inline-flex min-h-11 items-center gap-2 font-body text-xs text-xert-concrete/60">
          <input type="checkbox" checked={allVisibleSelected} onChange={event => setSelectedIds(current => selectedPTRequestIds(current, requests, event.target.checked))} disabled={requests.length === 0 || bulkSaving} className="accent-xert-red" />
          Select this page
        </label>
        <span className="font-body text-xs text-xert-concrete/40">{selectedIds.size} selected</span>
        <select value={bulkStatus} onChange={event => setBulkStatus(event.target.value)} disabled={selectedIds.size === 0 || bulkSaving} aria-label="New status for selected PT requests" className="sm:ml-auto min-h-11 bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-xs text-xert-offwhite disabled:opacity-40">
          <option value="">Move selected to...</option>
          {bulkStatusOptions.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
        </select>
        <button type="button" onClick={() => setBulkConfirmationOpen(true)} disabled={!bulkConfirmation || bulkSaving} className="min-h-11 px-4 py-2 bg-xert-steel text-xert-navy font-display text-xs uppercase disabled:opacity-40">
          {bulkSaving ? 'Updating...' : 'Apply'}
        </button>
      </div>
      {selectedIds.size > 0 && bulkStatusOptions.length === 0 && (
        <p className="-mt-2 mb-4 font-body text-xs text-xert-concrete/50">Select requests with the same actionable status to use bulk updates.</p>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-xert-ink animate-pulse" />)}</div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => load(page)} />
      ) : requests.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">No matching PT requests</p>
          <p className="font-body text-sm text-xert-concrete/40">Adjust the filters or refresh the queue.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="bg-xert-ink border border-xert-steel/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <input type="checkbox" checked={selectedIds.has(r.id)} onChange={event => setSelectedIds(current => selectedPTRequestIds(current, [r], event.target.checked))} disabled={bulkSaving} aria-label={`Select PT request for ${r.full_name || r.email}`} className="mt-1 accent-xert-red" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-body text-base text-xert-offwhite">{r.full_name}</span>
                    <span className={`font-body text-xs px-2 py-0.5 ${STATUS_COLORS[r.status] || ''}`}>{r.status?.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="font-body text-xs text-xert-concrete/50">
                    <a href={`mailto:${r.email}`} className="hover:text-xert-steel">{r.email}</a>
                    {r.phone && <> · <a href={`tel:${r.phone}`} className="hover:text-xert-steel">{r.phone}</a></>}
                  </p>
                  <p className="font-body text-xs text-xert-concrete/60 mt-1">
                    {[r.requested_session_type, [r.preferred_day, r.preferred_time].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                  </p>
                  {r.training_goal && <p className="font-body text-xs text-xert-concrete/40 mt-0.5">Goal: {r.training_goal}</p>}
                  {r.notes && <p className="font-body text-xs text-xert-concrete/40 mt-1">Member note: {r.notes}</p>}
                  {r.admin_notes && <p className="font-body text-xs text-xert-concrete/30 mt-1 italic">{r.admin_notes}</p>}
                </div>
                <div className="flex gap-2 flex-wrap justify-end shrink-0">
                  {isPendingPTRequest(r.status) && (
                    <>
                      <button disabled={updatingId !== null} onClick={() => handleUpdate(r.id, 'approved')}
                        className="min-h-11 px-3 py-2.5 border border-green-600/40 font-body text-xs text-green-400 transition-colors">Approve</button>
                      {r.status === 'requested' && (
                        <button disabled={updatingId !== null} onClick={() => handleUpdate(r.id, 'reschedule_requested')}
                          className="min-h-11 px-3 py-2.5 border border-yellow-600/40 font-body text-xs text-yellow-400 transition-colors">Reschedule</button>
                      )}
                      <button disabled={updatingId !== null} onClick={() => handleUpdate(r.id, 'declined')}
                        className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/50 transition-colors">Decline</button>
                    </>
                  )}
                  {r.status === 'approved' && (
                    <>
                      <button disabled={updatingId !== null} onClick={() => handleUpdate(r.id, 'completed')}
                        className="min-h-11 px-3 py-2.5 border border-green-600/40 font-body text-xs text-green-400 transition-colors">Mark complete</button>
                      <button disabled={updatingId !== null} onClick={() => handleUpdate(r.id, 'cancelled')}
                        className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/50 transition-colors">Cancel</button>
                    </>
                  )}
                  <button onClick={() => { setNotesModal(r); setNotes(r.admin_notes || ''); }}
                    className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 transition-colors">Notes</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-body text-xs text-xert-concrete/40">
          {total === 0 ? '0 results' : `${firstResult}-${lastResult} of ${total} results`}
        </p>
        {pageCount > 1 && (
          <nav aria-label="PT request result pages" className="flex items-center gap-2">
            <button type="button" onClick={() => goToPage(page - 1)} disabled={loading || page <= 1} title="Previous page" aria-label="Previous PT request page" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-body text-xs text-xert-concrete/60 tabular-nums">Page {page} of {pageCount}</span>
            <button type="button" onClick={() => goToPage(page + 1)} disabled={loading || page >= pageCount} title="Next page" aria-label="Next PT request page" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </nav>
        )}
      </div>

      {notesModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="pt-notes-title" className="bg-xert-ink border border-xert-steel/20 p-6 max-w-sm w-full">
            <h3 id="pt-notes-title" className="font-display text-lg text-xert-offwhite uppercase mb-4">Admin Notes — {notesModal.full_name}</h3>
            <textarea aria-label={`Admin notes for ${notesModal.full_name}`} maxLength={5000} value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none mb-4" />
            <div className="flex gap-3">
              <button type="button" disabled={updatingId === notesModal.id} onClick={() => setNotesModal(null)}
                className="flex-1 py-2.5 border border-xert-steel/40 font-display text-xs text-xert-concrete/60 uppercase">Cancel</button>
              <button type="button" disabled={updatingId === notesModal.id} onClick={() => void handleUpdate(notesModal.id, notesModal.status, notes)}
                className="flex-1 py-2.5 bg-xert-steel text-xert-navy font-display text-xs uppercase hover:bg-xert-pale transition-colors disabled:opacity-50">{updatingId === notesModal.id ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
      <AdminConfirmDialog
        open={bulkConfirmationOpen}
        onOpenChange={setBulkConfirmationOpen}
        title="Confirm PT request update"
        description={bulkConfirmation?.description || ''}
        warning={bulkConfirmation?.warning}
        confirmLabel="Apply update"
        onConfirm={() => void handleBulkUpdate()}
        busy={bulkSaving}
      />
    </div>
  );
}
