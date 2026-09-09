import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { adminExportMembers, adminListMemberActivationQueue, adminListMemberFollowUps, adminListMembersPage, adminMemberActivationOverview, adminSetRole } from '@/lib/adminData';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { downloadCsv } from '@/lib/csv';
import { formatPackPrice } from '@/lib/products';
import MemberConfirmation from './MemberConfirmation';
import { ADMIN_PAGE, AdminPageHeader, AdminFilterBar, AdminDataTable, AdminBadge, AdminSkeleton, readFilterValues } from './ui';
import {useLocation} from 'react-router-dom';
import './members.css';

import MemberDrawer from './MemberDrawer';
import {ActivationCockpit, FollowUpQueue} from './MemberQueues';
import {FollowUpModal, GrantCreditsModal} from './MemberDialogs';

const PAGE_SIZE = 50;
const filterFields = [{key:'member-search'}, {key:'member-role',options:[{value:'member'},{value:'admin'}]}, {key:'member-credit',options:[{value:'available'},{value:'none'}]}];
const queryValues = values => ({search:(values['member-search'] || '').trim(), role:values['member-role'] || 'all', credit:values['member-credit'] || 'all'});
const memberLabel = member => member.full_name || member.email || '(no name)';
const contactSkeleton = () => <div className="members-stack"><AdminSkeleton decorative variant="control" /><AdminSkeleton decorative /><AdminSkeleton decorative size="medium" /></div>;
const actionsSkeleton = () => <div className="members-actions">{[0,1,2].map(index => <AdminSkeleton decorative key={index} variant="control" size="short" />)}</div>;
export default function MembersManager({ initialMemberId, onIntentHandled, onDirtyChange }) {
  const { user } = useSupabaseAuth();
  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const [query, setQuery] = useState(() => ({...queryValues(readFilterValues(location.search, filterFields)), page:1}));
  const {search:debouncedSearch, role:roleFilter, credit:creditFilter, page} = query;
  const [searchPending, setSearchPending] = useState(false);
  const directoryRequest = useRef(0);
  const exportPending = useRef(false);
  const rolePending = useRef(false);
  const handledIntent = useRef(null);
  const [drawerDirty, setDrawerDirty] = useState(false);
  const [operationDirty, setOperationDirty] = useState(false);
  useEffect(() => {onDirtyChange?.(drawerDirty || operationDirty);}, [drawerDirty, operationDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const setPage = value => setQuery(current => ({...current,page:typeof value === 'function' ? value(current.page) : value}));
  const changeFilters = useCallback(values => {
    const next = queryValues(values);
    setSearchPending(false);
    setQuery(current => current.search === next.search && current.role === next.role && current.credit === next.credit ? current : {...next,page:1});
  }, []);
  const invalidateSearch = () => {directoryRequest.current += 1; setSearchPending(true);};
  const [granting, setGranting] = useState(null);
  const [grantVersion, setGrantVersion] = useState(0);
  const [loggingFollowUp, setLoggingFollowUp] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [roleChangingId, setRoleChangingId] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [followUps, setFollowUps] = useState([]);
  const [followUpsAvailable, setFollowUpsAvailable] = useState(true);
  const [followUpsLoading, setFollowUpsLoading] = useState(true);
  const [followUpsError, setFollowUpsError] = useState('');
  const [activationOverview, setActivationOverview] = useState(null);
  const [activationOverviewAvailable, setActivationOverviewAvailable] = useState(true);
  const [activationOverviewLoading, setActivationOverviewLoading] = useState(true);
  const [activationOverviewError, setActivationOverviewError] = useState('');
  const [activationQueue, setActivationQueue] = useState([]);
  const [activationQueueAvailable, setActivationQueueAvailable] = useState(true);
  const [activationQueueLoading, setActivationQueueLoading] = useState(true);
  const [activationQueueError, setActivationQueueError] = useState('');
  const [pendingRoleChange, setPendingRoleChange] = useState(null);

  useEffect(() => {
    let active = true;
    const requestId = ++directoryRequest.current;
    if (searchPending) return () => { active = false; };
    setLoading(true);
    setLoadError('');
    adminListMembersPage({
      search: debouncedSearch,
      role: roleFilter,
      credit: creditFilter,
      page,
      pageSize: PAGE_SIZE
    }).then(result => {
      if (!active || requestId !== directoryRequest.current) return;
      setMembers(result.rows);
      setTotal(result.total);
    }).catch(error => {
      if (!active || requestId !== directoryRequest.current) return;
      setMembers([]);
      setTotal(0);
      setLoadError(error.message || 'Check the member admin RPC and permissions.');
    }).finally(() => {
      if (active && requestId === directoryRequest.current) setLoading(false);
    });
    return () => { active = false; };
  }, [creditFilter, debouncedSearch, page, refreshVersion, roleFilter, searchPending]);

  useEffect(() => {
    let active = true;
    setFollowUpsLoading(true);
    setFollowUpsError('');
    adminListMemberFollowUps(20)
      .then(result => {
        if (!active) return;
        setFollowUps(result.rows);
        setFollowUpsAvailable(result.available);
      })
      .catch(error => {
        if (!active) return;
        setFollowUps([]);
        setFollowUpsError(error.message || 'Check the follow-up queue permissions.');
      })
      .finally(() => { if (active) setFollowUpsLoading(false); });
    return () => { active = false; };
  }, [refreshVersion]);

  useEffect(() => {
    let active = true;
    setActivationOverviewLoading(true);
    setActivationOverviewError('');
    adminMemberActivationOverview(30)
      .then(result => {
        if (!active) return;
        setActivationOverviewAvailable(result?.available !== false);
        if (result?.available !== false) {
          setActivationOverview(result?.overview ?? result?.data ?? result);
        }
      })
      .catch(error => {
        if (!active) return;
        setActivationOverviewError(error.message || 'Check the member activation reporting permissions.');
      })
      .finally(() => { if (active) setActivationOverviewLoading(false); });

    return () => { active = false; };
  }, [refreshVersion]);

  useEffect(() => {
    let active = true;
    setActivationQueueLoading(true);
    setActivationQueueError('');
    adminListMemberActivationQueue(12)
      .then(result => {
        if (!active) return;
        setActivationQueueAvailable(result?.available !== false);
        if (result?.available !== false) setActivationQueue(result?.rows ?? []);
      })
      .catch(error => {
        if (!active) return;
        setActivationQueueError(error.message || 'Check the member activation queue permissions.');
      })
      .finally(() => { if (active) setActivationQueueLoading(false); });

    return () => { active = false; };
  }, [refreshVersion]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min((page - 1) * PAGE_SIZE + members.length, total);
  const hasFilters = Boolean(debouncedSearch) || roleFilter !== 'all' || creditFilter !== 'all';
  const refresh = () => setRefreshVersion(version => version + 1);

  useEffect(() => {
    if (!initialMemberId || handledIntent.current === initialMemberId) return undefined;
    let active = true;
    adminListMembersPage({ memberId: initialMemberId, pageSize: 1 })
      .then(result => {
        if (!active) return;
        if (result.rows[0]) setViewing(result.rows[0]);
        else toast({ title: 'Member not found', description: 'This member may have been removed or is no longer accessible.', variant: 'destructive' });
      })
      .catch(error => {
        if (active) toast({ title: 'Member unavailable', description: error.message, variant: 'destructive' });
      })
      .finally(() => { if (active) {handledIntent.current = initialMemberId; onIntentHandled?.();} });
    return () => { active = false; };
  }, [initialMemberId, onIntentHandled]);

  const handleExport = async () => {
    if (exportPending.current || loading || searchPending) return;
    exportPending.current = true;
    setExporting(true);
    try {
      const rows = await adminExportMembers({ search: debouncedSearch, role: roleFilter, credit: creditFilter });
      downloadCsv(`xert-members-${new Date().toISOString().slice(0, 10)}.csv`, rows.map(member => ({ ...member, total_spent: (Number(member.total_spent_cents) / 100).toFixed(2) })), [
        { key: 'full_name', label: 'Name' }, { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' }, { key: 'role', label: 'Role' },
        { key: 'credits_remaining', label: 'Credits' }, { key: 'bookings_count', label: 'Bookings' },
        { key: 'total_spent', label: 'Spent (AUD)' }, { key: 'joined_at', label: 'Joined' },
      ]);
    } catch (error) {
      toast({ title: 'Export failed', description: error.message, variant: 'destructive' });
    } finally {
      exportPending.current = false;
      setExporting(false);
    }
  };

  const requestRoleChange = (m, role) => {
    if (rolePending.current || loading || searchPending || (role === 'member' && m.id === user?.id)) return;
    const verb = role === 'admin' ? 'Promote' : 'Remove admin from';
    const consequence = role === 'admin'
      ? 'This grants access to member data, bookings, sales, content, and staff controls.'
      : 'This removes access to all administrative tools.';
    setPendingRoleChange({ member: m, role, verb, consequence });
  };

  const applyRoleChange = async () => {
    const pending = pendingRoleChange;
    if (!pending || rolePending.current) return;
    rolePending.current = true;
    const { member: m, role } = pending;
    setRoleChangingId(m.id);
    try {
      await adminSetRole(m.id, role);
      toast({ title: 'Role updated', description: `${m.full_name || m.email} is now ${role}.` });
      setPage(1);
      refresh();
    } catch (e) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); }
    finally { rolePending.current = false; setRoleChangingId(null); setPendingRoleChange(null); }
  };

  const directoryBusy = loading || searchPending || roleChangingId !== null;
  const columns = [
    {key:'full_name',header:'Member',renderSkeleton:contactSkeleton,render:m => <div className="members-stack"><button type="button" className="admin-kit-button members-name" disabled={directoryBusy} onClick={() => setViewing(m)}>{memberLabel(m)}</button><a className="members-contact-link" href={`mailto:${m.email}`}>{m.email}</a>{m.phone && <a className="members-contact-link" href={`tel:${m.phone}`}>{m.phone}</a>}<span className="members-secondary">Joined {new Date(m.joined_at).toLocaleDateString('en-AU')}</span>{m.role === 'admin' && <AdminBadge status="active">Admin</AdminBadge>}</div>},
    {key:'credits_remaining',header:'Credits',render:m => <span className="tabular-nums">{m.credits_remaining}</span>},
    {key:'bookings_count',header:'Bookings'},
    {key:'total_spent_cents',header:'Spent',render:m => formatPackPrice(m.total_spent_cents,'aud')},
    {key:'actions',header:'Actions',renderSkeleton:actionsSkeleton,render:m => <div className="members-actions"><button type="button" className="admin-kit-button" disabled={directoryBusy} onClick={() => setViewing(m)}>View</button><button type="button" className="admin-kit-button" disabled={directoryBusy} onClick={() => setGranting(m)}>+ Credits</button>{m.role === 'admin' ? m.id !== user?.id && <button type="button" className="admin-kit-button" disabled={directoryBusy} onClick={() => requestRoleChange(m,'member')}>Remove admin</button> : <button type="button" className="admin-kit-button" disabled={directoryBusy} onClick={() => requestRoleChange(m,'admin')}>Make admin</button>}</div>},
  ];
  return (
    <div className={`${ADMIN_PAGE} members-workspace`}>
      <AdminPageHeader title={`Members (${total})`} description="Account directory, private records and manual member follow-up.">
        <button type="button" onClick={refresh} disabled={loading || searchPending} aria-label="Refresh members" className="admin-kit-button"><RefreshCw className="h-4 w-4" /> Refresh</button>
        <button type="button" onClick={() => void handleExport()} disabled={total === 0 || exporting || directoryBusy} className="admin-kit-button"><Download className="h-4 w-4" />{exporting ? 'Exporting…' : 'CSV'}</button>
      </AdminPageHeader>
      <fieldset className="members-filter" disabled={roleChangingId !== null} onChange={invalidateSearch}>
        <AdminFilterBar queryKey="member-search" searchLabel="Search members" onChange={changeFilters} filters={[
          {key:'member-role',label:'Filter members by role',options:[{value:'member',label:'Members'},{value:'admin',label:'Admins'}]},
          {key:'member-credit',label:'Filter members by credits',options:[{value:'available',label:'Has credits'},{value:'none',label:'No credits'}]},
        ]} />
      </fieldset>

      <ActivationCockpit
        overview={activationOverview}
        overviewAvailable={activationOverviewAvailable}
        overviewError={activationOverviewError}
        overviewLoading={activationOverviewLoading}
        queue={activationQueue}
        queueAvailable={activationQueueAvailable}
        queueError={activationQueueError}
        queueLoading={activationQueueLoading}
        onRetry={refresh}
        onView={setViewing}
        onLog={setLoggingFollowUp}
        disabled={roleChangingId !== null}
      />

      <FollowUpQueue rows={followUps} available={followUpsAvailable} error={followUpsError} loading={followUpsLoading} onRetry={refresh} onView={setViewing} onLog={setLoggingFollowUp} />

      <AdminDataTable rows={members} columns={columns} label="Member directory" getRowLabel={memberLabel} sort={null} loading={loading || searchPending} error={loadError} onRetry={refresh} emptyTitle={hasFilters ? 'No matches' : 'No members yet'} emptyDescription={hasFilters ? 'Try a different search or filter.' : 'Members appear here as soon as they create an account on the site.'} />

      <div className="members-pagination">
        <p role="status" aria-live="polite" className="font-body text-xs text-text-secondary">
          {total === 0 ? '0 results' : `${firstResult}-${lastResult} of ${total} matching members`}
        </p>
        {pageCount > 1 && (
          <nav aria-label="Member result pages" className="members-actions">
            <button type="button" onClick={() => { setViewing(null); setPage(current => Math.max(1, current - 1)); }} disabled={directoryBusy || page <= 1} title="Previous page" aria-label="Previous member page" className="admin-kit-button">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-body text-xs text-text-secondary tabular-nums">Page {page} of {pageCount}</span>
            <button type="button" onClick={() => { setViewing(null); setPage(current => Math.min(pageCount, current + 1)); }} disabled={directoryBusy || page >= pageCount} title="Next page" aria-label="Next member page" className="admin-kit-button">
              <ChevronRight className="w-4 h-4" />
            </button>
          </nav>
        )}
      </div>

      {viewing && (
        <MemberDrawer
          key={viewing.id}
          member={viewing}
          onClose={() => setViewing(null)}
          onGrant={() => setGranting(viewing)}
          onNotesChanged={refresh}
          onDirtyChange={setDrawerDirty}
          operationOpen={Boolean(granting)}
          grantVersion={grantVersion}
        />
      )}

      {granting && (
        <GrantCreditsModal onDirtyChange={setOperationDirty} member={granting} onDone={() => { setGranting(null); setGrantVersion(version => version + 1); refresh(); }} onCancel={() => setGranting(null)} />
      )}

      {loggingFollowUp && (
        <FollowUpModal onDirtyChange={setOperationDirty} member={loggingFollowUp} onDone={() => { setLoggingFollowUp(null); refresh(); }} onCancel={() => setLoggingFollowUp(null)} />
      )}
      <MemberConfirmation
        open={Boolean(pendingRoleChange)}
        onOpenChange={open => !open && setPendingRoleChange(null)}
        title={pendingRoleChange?.role === 'admin' ? 'Grant administrator access?' : 'Remove administrator access?'}
        description={pendingRoleChange ? `${pendingRoleChange.verb} ${pendingRoleChange.member.full_name || pendingRoleChange.member.email}?` : ''}
        warning={pendingRoleChange?.consequence}
        confirmLabel={pendingRoleChange?.role === 'admin' ? 'Make admin' : 'Remove admin'}
        onConfirm={() => void applyRoleChange()}
        busy={roleChangingId !== null}
      />
    </div>
  );
}
