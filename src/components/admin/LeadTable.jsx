import React, { useCallback, useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getMemberLeads, getTrainerLeads, getPartnerLeads, updateLeadStatuses } from '@/lib/adminData';
import { downloadCsv } from '@/lib/csv';
import { collectLeadPages, leadExportColumns, leadExportRows, LEAD_STATUSES } from '@/lib/adminLeads';
import LeadDetailDrawer from './LeadDetailDrawer';
import { ADMIN_BUTTON, ADMIN_PAGE, AdminPageHeader, AdminFilterBar, AdminDataTable, AdminFormField, AdminBadge, AdminSkeleton } from '@/components/admin/ui';
import './leads.css';

const PAGE_SIZE = 50;
const leadLabel = lead => lead.full_name || lead.email || lead.id;
const contactSkeleton = () => <div className="lead-contact"><AdminSkeleton decorative variant="control" className="lead-name-skeleton" /><AdminSkeleton decorative /><AdminSkeleton decorative size="short" /></div>;
const statusSkeleton = () => <AdminSkeleton decorative className="lead-status-skeleton" />;
const contextSkeleton = () => <div className="lead-contact"><AdminSkeleton decorative /><AdminSkeleton decorative size="medium" /></div>;
const submittedSkeleton = () => <div className="lead-contact"><AdminSkeleton decorative size="medium" /><AdminSkeleton decorative size="short" /></div>;

export default function LeadTable({ type = 'member', onDirtyChange }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
  const bulkPendingRef = useRef(false);
  const pendingFiltersRef = useRef(null);
  const exportPendingRef = useRef(false);

  const fetchFn = type === 'member' ? getMemberLeads : type === 'trainer' ? getTrainerLeads : getPartnerLeads;
  const table = type === 'member' ? 'member_interest' : type === 'trainer' ? 'trainer_interest' : 'partner_interest';
  const statuses = LEAD_STATUSES[table];

  const load = useCallback(async (targetPage = 1) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const result = await fetchFn({ search, status: statusFilter, page: targetPage, pageSize: PAGE_SIZE });
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
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [search, fetchFn, statusFilter]);

  useEffect(() => {
    setSelectedIds(new Set());
    setBulkStatus('');
    void load(1);
  }, [load]);

  useEffect(() => () => { requestIdRef.current += 1; }, []);

  const changeFilters = useCallback(values => {
    // A debounce already queued before Apply may settle while controls are disabled.
    // Keep the reviewed page intact until the mutation settles, then honor the query.
    if (bulkPendingRef.current) {
      pendingFiltersRef.current = values;
      return;
    }
    setSearch(values['lead-search'] || '');
    setStatusFilter(values['lead-status'] || '');
  }, []);

  const goToPage = targetPage => {
    if (bulkPendingRef.current) return;
    setSelectedIds(new Set());
    setBulkStatus('');
    setSelectedLead(null);
    void load(targetPage);
  };

  const handleExport = async () => {
    if (exportPendingRef.current || bulkPendingRef.current) return;
    exportPendingRef.current = true;
    setExporting(true);
    try {
      const rows = await collectLeadPages(targetPage => fetchFn({ search, status: statusFilter, page: targetPage, pageSize: 100 }));
      if (rows.length === 0) {
        toast({ title: 'No results to export', variant: 'destructive' });
        return;
      }
      downloadCsv(`xert_${table}_${new Date().toISOString().split('T')[0]}.csv`, leadExportRows(table, rows), leadExportColumns(table));
      toast({ title: 'CSV exported', description: `${rows.length} filtered result${rows.length === 1 ? '' : 's'} downloaded.` });
    } catch (exportError) {
      toast({ title: 'Export failed', description: exportError.message, variant: 'destructive' });
    } finally {
      exportPendingRef.current = false;
      setExporting(false);
    }
  };

  const reloadAfterSave = () => {
    setSelectedIds(new Set());
    setBulkStatus('');
    return load(1);
  };

  const handleBulkUpdate = async () => {
    if (bulkPendingRef.current || !bulkStatus || selectedIds.size === 0) return;
    // Bind the receipt and request to the exact IDs/status reviewed on this page.
    const reviewedIds = [...selectedIds];
    const reviewedStatus = bulkStatus;
    bulkPendingRef.current = true;
    setBulkSaving(true);
    try {
      await updateLeadStatuses(table, reviewedIds, reviewedStatus);
      // The helper returns only after the server acknowledges this exact count.
      const count = reviewedIds.length;
      toast({ title: 'Leads updated', description: `${count} lead${count === 1 ? '' : 's'} moved to ${reviewedStatus.replace(/_/g, ' ')}.` });
      setSelectedIds(new Set());
      setBulkStatus('');
      await load(1);
    } catch (bulkError) {
      toast({ title: 'Bulk update failed', description: bulkError.message, variant: 'destructive' });
    } finally {
      bulkPendingRef.current = false;
      setBulkSaving(false);
      if (pendingFiltersRef.current) {
        const pending = pendingFiltersRef.current;
        pendingFiltersRef.current = null;
        changeFilters(pending);
      }
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(page * PAGE_SIZE, total);
  const columns = [
    { key: 'full_name', header: 'Lead', renderSkeleton: contactSkeleton, render: lead => <div className="lead-contact"><button type="button" className="lead-open" disabled={bulkSaving} onClick={() => setSelectedLead(lead)}>{leadLabel(lead)}</button><span className="lead-secondary">{lead.email}</span>{lead.phone && <span className="lead-secondary">{lead.phone}</span>}</div> },
    { key: 'status', header: 'Status', renderSkeleton: statusSkeleton, render: lead => <AdminBadge status={lead.status}>{(lead.status || 'Unknown').replace(/_/g, ' ')}</AdminBadge> },
    { key: 'context', header: type === 'member' ? 'Training goals' : type === 'trainer' ? 'Qualifications' : 'Business', renderSkeleton: contextSkeleton, render: lead => type === 'member' ? lead.main_training_goals?.slice(0, 3).join(', ') || '—' : type === 'trainer' ? lead.qualifications || '—' : lead.business_name || lead.profession || '—' },
    { key: 'created_at', header: 'Submitted', renderSkeleton: submittedSkeleton, render: lead => <div className="lead-contact"><time dateTime={lead.created_at}>{new Date(lead.created_at).toLocaleDateString('en-AU')}</time>{lead.utm_source && <span className="lead-secondary">{lead.utm_source}</span>}</div> },
  ];

  return <div className={`${ADMIN_PAGE} lead-pipeline`} data-lead-pipeline={type}>
    <AdminPageHeader eyebrow="Lead pipeline" title={`${type[0].toUpperCase()}${type.slice(1)} leads`} description="Review enquiries and follow up. Newest submissions appear first.">
      <button type="button" className="admin-kit-button" aria-label="Refresh leads" disabled={loading || bulkSaving} onClick={() => { setSelectedIds(new Set()); void load(page); }}><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh</button>
      <button type="button" className="admin-kit-button" disabled={exporting || loading || bulkSaving || Boolean(error)} onClick={() => void handleExport()}><Download className="h-4 w-4" aria-hidden="true" />{exporting ? 'Exporting...' : 'Export results'}</button>
    </AdminPageHeader>
    <fieldset className="lead-filter-fieldset" disabled={bulkSaving}>
      <legend className="sr-only">Lead filters</legend>
      <AdminFilterBar queryKey="lead-search" searchLabel="Search leads by name or email" onChange={changeFilters}
        filters={[{ key: 'lead-status', label: 'Filter leads by status', options: statuses.map(status => ({ value: status, label: status.replace(/_/g, ' ') })) }]} />
    </fieldset>
    <div className="lead-list-controls">
      <p className="lead-secondary">Selection applies to this loaded page only. Export includes every filtered result.</p>
    </div>
    {selectedIds.size > 0 && <div className="lead-bulk-actions" aria-busy={bulkSaving}>
      <p>{selectedIds.size} lead{selectedIds.size === 1 ? '' : 's'} selected on this page</p>
      <AdminFormField label="Move selected leads to"><select value={bulkStatus} disabled={bulkSaving || loading} onChange={event => setBulkStatus(event.target.value)}><option value="">Choose status</option>{statuses.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select></AdminFormField>
      <button type="button" className={ADMIN_BUTTON.primary} onClick={() => void handleBulkUpdate()} disabled={!bulkStatus || bulkSaving || loading}>{bulkSaving ? 'Updating...' : 'Apply'}</button>
      <button type="button" className="admin-kit-button" disabled={bulkSaving} onClick={() => { setSelectedIds(new Set()); setBulkStatus(''); }}>Clear selection</button>
    </div>}
    <AdminDataTable rows={leads} columns={columns} getRowLabel={leadLabel} label={`${type[0].toUpperCase()}${type.slice(1)} leads`} sort={null}
      selectable selectedKeys={selectedIds} onSelectionChange={setSelectedIds} selectAllLabel="Select all leads on this page" selectionDisabled={bulkSaving || loading}
      loading={loading} error={error} onRetry={() => void load(page)}
      emptyTitle={search || statusFilter ? 'No matching leads' : 'No leads yet'} emptyDescription={search || statusFilter ? 'Change or reset the filters to see more enquiries.' : 'Submissions will appear here once received.'} />
    {!error && <div className="lead-pagination">
      <p className="lead-secondary" role="status">{total === 0 ? '0 results' : `${firstResult}-${lastResult} of ${total} results`}</p>
      {pageCount > 1 && <nav aria-label="Lead results pages">
        <button type="button" className="admin-kit-button" aria-label="Previous lead page" disabled={loading || bulkSaving || page <= 1} onClick={() => goToPage(page - 1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
        <span>Page {page} of {pageCount}</span>
        <button type="button" className="admin-kit-button" aria-label="Next lead page" disabled={loading || bulkSaving || page >= pageCount} onClick={() => goToPage(page + 1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
      </nav>}
    </div>}
    {selectedLead && <LeadDetailDrawer key={selectedLead.id} lead={selectedLead} statuses={statuses} table={table} onClose={() => setSelectedLead(null)} onUpdate={reloadAfterSave} onDirtyChange={onDirtyChange} />}
  </div>;
}
