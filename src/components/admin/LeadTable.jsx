import React, { useCallback, useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Download, RefreshCw, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getMemberLeads, getTrainerLeads, getPartnerLeads, revealMemberInterestHealth, updateLead, updateLeadStatuses } from '@/lib/adminData';
import { downloadCsv } from '@/lib/csv';
import { collectLeadPages, leadExportColumns, leadExportRows, selectedLeadIds } from '@/lib/adminLeads';
import AdminLoadError from '@/components/admin/AdminLoadError';

const MEMBER_STATUSES = ['new', 'contacted', 'warm', 'hot', 'foundation_offer_sent', 'booked_trial', 'joined', 'not_suitable', 'archived'];
const TRAINER_STATUSES = ['new', 'reviewing', 'contacted', 'interview', 'shortlisted', 'not_suitable', 'hired', 'archived'];
const PARTNER_STATUSES = ['new', 'reviewing', 'contacted', 'meeting', 'approved', 'not_suitable', 'archived'];
const PAGE_SIZE = 50;

const STATUS_COLORS = {
  new: 'bg-xert-steel/20 text-xert-red',
  contacted: 'bg-blue-900/30 text-blue-400',
  warm: 'bg-yellow-900/30 text-yellow-400',
  hot: 'bg-orange-900/30 text-xert-orange',
  foundation_offer_sent: 'bg-purple-900/30 text-purple-400',
  booked_trial: 'bg-green-900/30 text-green-400',
  joined: 'bg-green-700/30 text-green-300',
  reviewing: 'bg-blue-900/30 text-blue-400',
  interview: 'bg-purple-900/30 text-purple-400',
  shortlisted: 'bg-yellow-900/30 text-yellow-400',
  hired: 'bg-green-700/30 text-green-300',
  meeting: 'bg-purple-900/30 text-purple-400',
  approved: 'bg-green-700/30 text-green-300',
  not_suitable: 'bg-xert-steel/30 text-xert-concrete/40',
  archived: 'bg-xert-steel/20 text-xert-concrete/30',
};

function LeadDetailDrawer({ lead, statuses, table, onClose, onUpdate }) {
  const [status, setStatus] = useState(lead.status || 'new');
  const [notes, setNotes] = useState(lead.admin_notes || '');
  const [saving, setSaving] = useState(false);
  const [healthReveal, setHealthReveal] = useState(null);
  const [revealingHealth, setRevealingHealth] = useState(false);
  const healthRevealRequestRef = useRef(0);

  const revealHealth = async () => {
    if (revealingHealth) return;
    const leadId = lead.id;
    const requestId = ++healthRevealRequestRef.current;
    setRevealingHealth(true);
    try {
      const result = await revealMemberInterestHealth(leadId);
      if (requestId !== healthRevealRequestRef.current || leadId !== lead.id) return;
      setHealthReveal(result);
      if (!result?.available) {
        toast({ title: 'No health details', description: 'This lead has no consented injury notes to reveal.' });
      }
    } catch (e) {
      if (requestId !== healthRevealRequestRef.current || leadId !== lead.id) return;
      toast({ title: 'Reveal failed', description: e.message, variant: 'destructive' });
    } finally {
      if (requestId === healthRevealRequestRef.current) setRevealingHealth(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateLead(table, lead.id, { status, admin_notes: notes });
      await onUpdate();
      toast({ title: 'Lead updated', description: `${lead.full_name || 'Lead'} is now ${status.replace(/_/g, ' ')}.` });
      onClose();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-end">
      <div role="dialog" aria-modal="true" aria-labelledby="lead-detail-title" className="bg-xert-ink border-l border-xert-steel/20 w-full sm:max-w-md h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 id="lead-detail-title" className="font-display text-xl text-xert-offwhite uppercase">Lead Detail</h3>
          <button type="button" onClick={onClose} title="Close lead details" aria-label="Close lead details" className="p-1.5 text-xert-concrete/40 hover:text-xert-offwhite"><X className="w-5 h-5" /></button>
        </div>

        {/* Core info */}
        <div className="space-y-3 mb-6 pb-6 border-b border-xert-steel/20">
          <div>
            <p className="font-body text-xs text-xert-concrete/40 uppercase">Name</p>
            <p className="font-body text-base text-xert-offwhite">{lead.full_name}</p>
          </div>
          <div>
            <p className="font-body text-xs text-xert-concrete/40 uppercase">Email</p>
            <a href={`mailto:${lead.email}`} className="font-body text-sm text-xert-offwhite hover:text-xert-steel">{lead.email}</a>
          </div>
          <div>
            <p className="font-body text-xs text-xert-concrete/40 uppercase">Phone</p>
            {lead.phone ? <a href={`tel:${lead.phone}`} className="font-body text-sm text-xert-offwhite hover:text-xert-steel">{lead.phone}</a> : <p className="font-body text-sm text-xert-offwhite">—</p>}
          </div>
          {lead.suburb_town && <div><p className="font-body text-xs text-xert-concrete/40 uppercase">Suburb</p><p className="font-body text-sm text-xert-offwhite">{lead.suburb_town}</p></div>}
          {lead.current_training_level && <div><p className="font-body text-xs text-xert-concrete/40 uppercase">Level</p><p className="font-body text-sm text-xert-offwhite">{lead.current_training_level}</p></div>}
          {lead.main_training_goals?.length > 0 && <div><p className="font-body text-xs text-xert-concrete/40 uppercase">Goals</p><p className="font-body text-sm text-xert-offwhite">{lead.main_training_goals.join(', ')}</p></div>}
          {lead.preferred_training_times?.length > 0 && <div><p className="font-body text-xs text-xert-concrete/40 uppercase">Preferred times</p><p className="font-body text-sm text-xert-offwhite">{lead.preferred_training_times.join(', ')}</p></div>}
          {lead.qualifications && <div><p className="font-body text-xs text-xert-concrete/40 uppercase">Qualifications</p><p className="font-body text-sm text-xert-offwhite">{lead.qualifications}</p></div>}
          {lead.profession && <div><p className="font-body text-xs text-xert-concrete/40 uppercase">Profession</p><p className="font-body text-sm text-xert-offwhite">{lead.profession}</p></div>}
          {lead.business_name && <div><p className="font-body text-xs text-xert-concrete/40 uppercase">Business</p><p className="font-body text-sm text-xert-offwhite">{lead.business_name}</p></div>}
          {lead.short_intro && <div><p className="font-body text-xs text-xert-concrete/40 uppercase">Intro</p><p className="font-body text-sm text-xert-offwhite leading-relaxed">{lead.short_intro}</p></div>}
          {lead.utm_source && <div><p className="font-body text-xs text-xert-concrete/40 uppercase">Source</p><p className="font-body text-sm text-xert-concrete/60">{lead.utm_source} / {lead.utm_medium} / {lead.utm_campaign}</p></div>}
          <div><p className="font-body text-xs text-xert-concrete/40 uppercase">Submitted</p><p className="font-body text-sm text-xert-concrete/60">{new Date(lead.created_at).toLocaleString('en-AU')}</p></div>
          {table === 'member_interest' && (
            <div>
              <p className="font-body text-xs text-xert-concrete/40 uppercase">Health notes</p>
              {healthReveal?.available ? (
                <p className="font-body text-sm text-xert-offwhite leading-relaxed mt-1">{healthReveal.injuries_or_limitations_optional}</p>
              ) : healthReveal && healthReveal.available === false ? (
                <p className="font-body text-sm text-xert-concrete/50 mt-1">No consented injury notes on this lead.</p>
              ) : (
                <button
                  type="button"
                  disabled={revealingHealth}
                  onClick={() => void revealHealth()}
                  className="mt-2 min-h-11 px-3 py-2 border border-xert-steel/40 font-body text-xs uppercase tracking-wider text-xert-concrete/70 hover:border-xert-steel disabled:opacity-50"
                >
                  {revealingHealth ? 'Revealing...' : 'Reveal consented health notes'}
                </button>
              )}
              <p className="font-body text-[11px] text-xert-concrete/40 mt-2 leading-relaxed">
                Injury details stay out of lists and CSV exports. Reveal only when you need them for safe follow-up.
              </p>
            </div>
          )}
        </div>

        {/* Status update */}
        <div className="mb-4">
          <label htmlFor="lead-status" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-2">Status</label>
          <select id="lead-status" value={status} onChange={e => setStatus(e.target.value)}
            className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
            {statuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label htmlFor="lead-notes" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-2">Admin notes</label>
          <textarea id="lead-notes" maxLength={5000} value={notes} onChange={e => setNotes(e.target.value)} rows={4}
            placeholder="Internal notes..."
            className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red resize-none" />
        </div>

        <button type="button" onClick={save} disabled={saving}
          className="w-full py-3 bg-xert-steel text-xert-navy font-display text-sm uppercase hover:bg-xert-pale transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

export default function LeadTable({ type = 'member' }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const requestIdRef = useRef(0);

  const fetchFn = type === 'member' ? getMemberLeads : type === 'trainer' ? getTrainerLeads : getPartnerLeads;
  const table = type === 'member' ? 'member_interest' : type === 'trainer' ? 'trainer_interest' : 'partner_interest';
  const statuses = type === 'member' ? MEMBER_STATUSES : type === 'trainer' ? TRAINER_STATUSES : PARTNER_STATUSES;

  const load = useCallback(async (targetPage = 1) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const result = await fetchFn({ search: debouncedSearch, status: statusFilter, page: targetPage, pageSize: PAGE_SIZE });
      if (requestId !== requestIdRef.current) return;
      setLeads(result.rows);
      setTotal(result.total);
      setPage(result.page);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setError(e.message);
      setLeads([]);
      setTotal(0);
      setSelectedIds(new Set());
      setSelectedLead(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [debouncedSearch, fetchFn, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setSelectedIds(new Set());
    void load(1);
  }, [load]);

  useEffect(() => () => { requestIdRef.current += 1; }, []);

  const goToPage = targetPage => {
    setSelectedIds(new Set());
    setSelectedLead(null);
    void load(targetPage);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await collectLeadPages(targetPage => fetchFn({
        search: debouncedSearch,
        status: statusFilter,
        page: targetPage,
        pageSize: 100
      }));

      if (rows.length === 0) {
        toast({ title: 'No results to export', variant: 'destructive' });
        return;
      }
      downloadCsv(
        `xert_${table}_${new Date().toISOString().split('T')[0]}.csv`,
        leadExportRows(table, rows),
        leadExportColumns(table)
      );
      toast({ title: 'CSV exported', description: `${rows.length} filtered result${rows.length === 1 ? '' : 's'} downloaded.` });
    } catch (exportError) {
      toast({ title: 'Export failed', description: exportError.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkStatus || selectedIds.size === 0) return;
    setBulkSaving(true);
    try {
      await updateLeadStatuses(table, [...selectedIds], bulkStatus);
      toast({ title: 'Leads updated', description: `${selectedIds.size} lead${selectedIds.size === 1 ? '' : 's'} moved to ${bulkStatus.replace(/_/g, ' ')}.` });
      setSelectedIds(new Set());
      setBulkStatus('');
      await load(1);
    } catch (bulkError) {
      toast({ title: 'Bulk update failed', description: bulkError.message, variant: 'destructive' });
    } finally {
      setBulkSaving(false);
    }
  };

  const allSelected = leads.length > 0 && leads.every(lead => selectedIds.has(lead.id));
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="p-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <label htmlFor={`${type}-lead-search`} className="sr-only">Search leads by name or email</label>
        <input id={`${type}-lead-search`}
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name or email..."
          className="flex-1 bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red" />
        <label htmlFor={`${type}-lead-status-filter`} className="sr-only">Filter leads by status</label>
        <select id={`${type}-lead-status-filter`} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
          <option value="">All statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <button type="button" onClick={() => void load(page)} disabled={loading} title="Refresh leads" aria-label="Refresh leads" className="p-2.5 border border-xert-steel/40 text-xert-steel hover:border-xert-steel disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button type="button" onClick={() => void handleExport()} disabled={exporting || loading}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-xert-steel/40 font-display text-xs text-xert-concrete/60 uppercase hover:border-xert-concrete transition-colors whitespace-nowrap disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> {exporting ? 'Exporting...' : 'Export results'}
        </button>
      </div>

      {leads.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 border border-xert-steel/20 bg-xert-ink">
          <label className="inline-flex items-center gap-2 font-body text-xs text-xert-concrete/60">
            <input type="checkbox" checked={allSelected} onChange={event => setSelectedIds(event.target.checked ? new Set(leads.map(lead => lead.id)) : new Set())} className="accent-xert-red" />
            Select page
          </label>
          <span className="font-body text-xs text-xert-concrete/40">{selectedIds.size} selected</span>
          <select value={bulkStatus} onChange={event => setBulkStatus(event.target.value)} disabled={selectedIds.size === 0 || bulkSaving} className="sm:ml-auto bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-xs text-xert-offwhite disabled:opacity-40">
            <option value="">Move selected to...</option>
            {statuses.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
          </select>
          <button type="button" onClick={() => void handleBulkUpdate()} disabled={!bulkStatus || selectedIds.size === 0 || bulkSaving} className="px-4 py-2 bg-xert-steel text-xert-navy font-display text-xs uppercase disabled:opacity-40">
            {bulkSaving ? 'Updating...' : 'Apply'}
          </button>
        </div>
      )}

      {error && <div className="mb-4"><AdminLoadError message={error} onRetry={() => load(page)} /></div>}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-xert-ink animate-pulse" />)}
        </div>
      ) : leads.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">No leads yet</p>
          <p className="font-body text-sm text-xert-concrete/40">Submissions will appear here once received.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => (
            <div key={lead.id} className="bg-xert-ink border border-xert-steel/20 p-4 hover:border-xert-red/40 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={event => setSelectedIds(current => selectedLeadIds(current, lead.id, event.target.checked))} aria-label={`Select ${lead.full_name || lead.email}`} className="mt-1 accent-xert-red" />
                <button type="button" onClick={() => setSelectedLead(lead)} className="flex-1 min-w-0 text-left">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <span className="font-body text-base text-xert-offwhite truncate">{lead.full_name}</span>
                    <span className={`font-body text-xs px-2 py-0.5 rounded-sm ${STATUS_COLORS[lead.status] || 'bg-xert-steel/30 text-xert-concrete/60'}`}>
                      {(lead.status || 'new').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="font-body text-xs text-xert-concrete/50">{lead.email} {lead.phone ? `· ${lead.phone}` : ''}</p>
                  {lead.main_training_goals?.length > 0 && (
                    <p className="font-body text-xs text-xert-concrete/40 mt-1">{lead.main_training_goals.slice(0, 3).join(', ')}</p>
                  )}
                </div>
                </button>
                <div className="text-right shrink-0">
                  <p className="font-body text-xs text-xert-concrete/30">{new Date(lead.created_at).toLocaleDateString('en-AU')}</p>
                  {lead.utm_source && <p className="font-body text-xs text-xert-concrete/30 mt-1">{lead.utm_source}</p>}
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
          <nav aria-label="Lead results pages" className="flex items-center gap-2">
            <button type="button" onClick={() => goToPage(page - 1)} disabled={loading || page <= 1} title="Previous page" aria-label="Previous lead page" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-body text-xs text-xert-concrete/60 tabular-nums">Page {page} of {pageCount}</span>
            <button type="button" onClick={() => goToPage(page + 1)} disabled={loading || page >= pageCount} title="Next page" aria-label="Next lead page" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </nav>
        )}
      </div>

      {selectedLead && (
        <LeadDetailDrawer
          key={selectedLead.id}
          lead={selectedLead}
          statuses={statuses}
          table={table}
          onClose={() => setSelectedLead(null)}
          onUpdate={() => load(1)}
        />
      )}
    </div>
  );
}
