import React, { useEffect, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Archive, ArchiveRestore, CalendarDays, ChevronLeft, ChevronRight, Download, Loader2, MessageSquarePlus, Receipt, RefreshCw, Ticket, X } from 'lucide-react';
import { adminAddMemberNote, adminExportMembers, adminGrantCredits, adminListMembersPage, adminMemberDetail, adminSetMemberNoteArchived, adminSetRole } from '@/lib/adminData';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { downloadCsv } from '@/lib/csv';
import { creditGrantValidationError } from '@/lib/memberAdmin';
import { formatPackPrice } from '@/lib/products';
import AdminLoadError from '@/components/admin/AdminLoadError';

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const BOOKING_BADGE = {
  confirmed: { color: '#7BA7BC', label: 'Confirmed' },
  attended: { color: '#7ec98f', label: 'Attended' },
  no_show: { color: '#e0b36a', label: 'No show' },
  cancelled: { color: 'rgba(209,221,230,0.4)', label: 'Cancelled' },
};
const PAGE_SIZE = 50;

function MemberDrawer({ member, onClose, onGrant }) {
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [noteCategory, setNoteCategory] = useState('general');
  const [noteBody, setNoteBody] = useState('');
  const [noteError, setNoteError] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [showArchivedNotes, setShowArchivedNotes] = useState(false);

  const loadDetail = () => {
    setDetail(null);
    setDetailError('');
    adminMemberDetail(member.id)
      .then(setDetail)
      .catch(e => setDetailError(e.message || 'Check member detail permissions.'));
  };

  useEffect(() => { loadDetail(); }, [member.id]);

  const handleAddNote = async event => {
    event.preventDefault();
    setNoteSaving(true);
    setNoteError('');
    try {
      await adminAddMemberNote(member.id, noteCategory, noteBody);
      setNoteBody('');
      toast({ title: 'Staff note added' });
      loadDetail();
    } catch (error) {
      setNoteError(error.message || 'Could not add the staff note.');
    } finally {
      setNoteSaving(false);
    }
  };

  const handleNoteArchive = async note => {
    const shouldArchive = !note.archived_at;
    if (shouldArchive && !window.confirm('Archive this staff note? It can be restored later.')) return;
    setNoteSaving(true);
    setNoteError('');
    try {
      await adminSetMemberNoteArchived(note.id, shouldArchive);
      toast({ title: shouldArchive ? 'Staff note archived' : 'Staff note restored' });
      loadDetail();
    } catch (error) {
      setNoteError(error.message || 'Could not update the staff note.');
    } finally {
      setNoteSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="member-detail-title" className="relative w-full max-w-md h-full overflow-y-auto animate-slide-up sm:animate-none"
        style={{ backgroundColor: '#0e161e', borderLeft: '1px solid rgba(123,167,188,0.2)' }}>
        {/* Header */}
        <div className="sticky top-0 p-5 flex items-start justify-between gap-4"
          style={{ backgroundColor: '#0e161e', borderBottom: '1px solid rgba(123,167,188,0.14)' }}>
          <div>
            <h3 id="member-detail-title" className="font-display text-2xl uppercase leading-none text-xert-offwhite">{member.full_name || '(no name)'}</h3>
            <p className="font-body text-xs mt-1.5" style={{ color: 'rgba(209,221,230,0.45)' }}>
              {member.email}{member.phone ? ` · ${member.phone}` : ''}
            </p>
            <p className="font-body text-[11px] mt-0.5" style={{ color: 'rgba(123,167,188,0.5)' }}>
              Member since {fmtDate(member.joined_at)}{member.role === 'admin' ? ' · Admin' : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} title="Close member detail" aria-label="Close member detail" className="p-1 shrink-0" style={{ color: 'rgba(209,221,230,0.5)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {detailError ? (
          <div className="p-5"><AdminLoadError message={detailError} onRetry={loadDetail} /></div>
        ) : !detail ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#7BA7BC' }} />
          </div>
        ) : (
          <div className="p-5 space-y-7">
            {/* Staff notes */}
            <section>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h4 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em]" style={{ color: 'rgba(123,167,188,0.6)' }}>
                  <MessageSquarePlus className="w-3.5 h-3.5" /> Staff notes
                </h4>
                {detail.notes.some(note => note.archived_at) && (
                  <label className="inline-flex min-h-11 items-center gap-2 font-body text-[10px] uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.55)' }}>
                    <input type="checkbox" checked={showArchivedNotes} onChange={event => setShowArchivedNotes(event.target.checked)} className="accent-xert-steel" />
                    Show archived
                  </label>
                )}
              </div>

              {!detail.memberNotesAvailable ? (
                <p className="font-body text-xs" style={{ color: '#e0b36a' }}>
                  Staff notes are paused until admin_member_notes_upgrade.sql is applied.
                </p>
              ) : (
                <>
                  <form onSubmit={handleAddNote} className="space-y-2">
                    <label htmlFor="member-note-category" className="sr-only">Staff note category</label>
                    <select id="member-note-category" value={noteCategory} onChange={event => setNoteCategory(event.target.value)} disabled={noteSaving}
                      className="w-full min-h-11 bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-steel">
                      <option value="general">General</option>
                      <option value="coaching">Coaching</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="billing">Billing</option>
                    </select>
                    <label htmlFor="member-note-body" className="sr-only">Staff note</label>
                    <textarea id="member-note-body" value={noteBody} onChange={event => setNoteBody(event.target.value)} disabled={noteSaving}
                      minLength={3} maxLength={1000} rows={3} required placeholder="Add operational context for staff"
                      className="w-full resize-y bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite placeholder:text-xert-concrete/30 focus:outline-none focus:border-xert-steel" />
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-body text-[10px] leading-relaxed" style={{ color: 'rgba(209,221,230,0.35)' }}>
                        Use factual operational or coaching context. Avoid unnecessary clinical or sensitive personal information.
                      </p>
                      <button type="submit" disabled={noteSaving || noteBody.trim().length < 3}
                        className="min-h-11 shrink-0 px-3 border border-xert-steel/40 font-body text-xs text-xert-steel transition-colors hover:border-xert-steel disabled:opacity-40">
                        {noteSaving ? 'Saving...' : 'Add note'}
                      </button>
                    </div>
                  </form>
                  {noteError && <p role="alert" className="font-body text-xs text-xert-red mt-2">{noteError}</p>}

                  <div className="mt-4 space-y-2">
                    {detail.notes.filter(note => showArchivedNotes || !note.archived_at).length === 0 ? (
                      <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>No staff notes yet.</p>
                    ) : detail.notes.filter(note => showArchivedNotes || !note.archived_at).map(note => (
                      <article key={note.id} className="p-3" style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.12)', opacity: note.archived_at ? 0.55 : 1 }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-body text-[10px] uppercase tracking-wider" style={{ color: '#7BA7BC' }}>{String(note.category || 'general').replace('_', '-')}</p>
                            <p className="font-body text-sm whitespace-pre-wrap break-words mt-1" style={{ color: '#D1DDE6' }}>{note.body}</p>
                          </div>
                          <button type="button" disabled={noteSaving} onClick={() => handleNoteArchive(note)}
                            title={note.archived_at ? 'Restore staff note' : 'Archive staff note'} aria-label={note.archived_at ? 'Restore staff note' : 'Archive staff note'}
                            className="min-h-11 min-w-11 inline-flex shrink-0 items-center justify-center border border-xert-steel/20 text-xert-steel transition-colors hover:border-xert-steel disabled:opacity-40">
                            {note.archived_at ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="font-body text-[10px] mt-2" style={{ color: 'rgba(209,221,230,0.35)' }}>
                          {note.author_name || 'Former admin'} · {fmtDateTime(note.created_at)}{note.archived_at ? ' · Archived' : ''}
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Credits */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em]" style={{ color: 'rgba(123,167,188,0.6)' }}>
                  <Ticket className="w-3.5 h-3.5" /> Credits
                </h4>
                <button type="button" disabled={!detail.creditAuditAvailable} onClick={onGrant}
                  className="min-h-11 px-2.5 py-2 border font-body text-[10px] uppercase tracking-wider transition-colors"
                  style={{ borderColor: 'rgba(123,167,188,0.3)', color: '#7BA7BC', opacity: detail.creditAuditAvailable ? 1 : 0.4 }}>
                  + Grant
                </button>
              </div>
              {detail.credits.length === 0 ? (
                <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>No credit packs yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.credits.map(c => {
                    const expired = c.expires_at && new Date(c.expires_at) <= new Date();
                    const active = c.remaining > 0 && !expired;
                    const grant = detail.grants.find(item => item.credit_batch_id === c.id);
                    return (
                      <div key={c.id} className="flex items-center gap-3 p-3"
                        style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.12)', opacity: active ? 1 : 0.55 }}>
                        <p className="font-display text-xl tabular-nums" style={{ color: active ? '#7BA7BC' : 'rgba(209,221,230,0.4)' }}>
                          {c.remaining}<span className="text-sm" style={{ color: 'rgba(209,221,230,0.35)' }}>/{c.total}</span>
                        </p>
                        <div className="flex-1">
                          <p className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.6)' }}>
                            {expired ? 'Expired' : c.expires_at ? `Expires ${fmtDate(c.expires_at)}` : 'No expiry'}
                          </p>
                          <p className="font-body text-[10px]" style={{ color: 'rgba(209,221,230,0.3)' }}>
                            Added {fmtDate(c.created_at)}{c.order_id ? '' : ' · manual grant'}
                          </p>
                          {grant && <p className="font-body text-[11px] mt-1" style={{ color: 'rgba(123,167,188,0.72)' }}>Reason: {grant.note}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!detail.creditAuditAvailable && (
                <p className="font-body text-xs mt-3" style={{ color: '#e0b36a' }}>Credit audit migration is not installed; new manual grants are paused.</p>
              )}
            </section>

            {/* Bookings */}
            <section>
              <h4 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em] mb-3" style={{ color: 'rgba(123,167,188,0.6)' }}>
                <CalendarDays className="w-3.5 h-3.5" /> Bookings
              </h4>
              {detail.bookings.length === 0 ? (
                <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>No class bookings yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.bookings.map(b => {
                    const badge = BOOKING_BADGE[b.status] || BOOKING_BADGE.confirmed;
                    return (
                      <div key={b.id} className="flex items-center gap-3 py-2 px-3"
                        style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.1)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm truncate" style={{ color: '#D1DDE6' }}>
                            {b.class_sessions?.title || b.class_sessions?.class_type || 'Class'}
                          </p>
                          <p className="font-body text-[11px]" style={{ color: 'rgba(209,221,230,0.35)' }}>
                            {fmtDateTime(b.class_sessions?.start_time)}
                          </p>
                        </div>
                        <span className="font-body text-[10px] uppercase tracking-wider shrink-0" style={{ color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Purchases */}
            <section>
              <h4 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em] mb-3" style={{ color: 'rgba(123,167,188,0.6)' }}>
                <Receipt className="w-3.5 h-3.5" /> Purchases
              </h4>
              {detail.orders.length === 0 ? (
                <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>No purchases yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.orders.map(o => (
                    <div key={o.id} className="flex items-center gap-3 py-2 px-3"
                      style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.1)' }}>
                      <p className="font-body text-sm flex-1 truncate" style={{ color: '#D1DDE6' }}>{o.products?.name || 'Session pack'}</p>
                      <p className="font-body text-[11px] shrink-0" style={{ color: 'rgba(209,221,230,0.35)' }}>{fmtDate(o.paid_at || o.created_at)}</p>
                      <p className="font-display text-sm tabular-nums shrink-0" style={{ color: '#7BA7BC' }}>
                        {formatPackPrice(o.amount_cents, o.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = 'bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red';

function GrantCreditsModal({ member, onDone, onCancel }) {
  const [sessions, setSessions] = useState(1);
  const [validityDays, setValidityDays] = useState(28);
  const [note, setNote] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const validationError = creditGrantValidationError({ sessions, validityDays, note });

  const handleGrant = async () => {
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminGrantCredits(member.id, sessions, validityDays > 0 ? validityDays : null, requestId, note.trim());
      toast({ title: 'Credits granted', description: `${sessions} credit${sessions === 1 ? '' : 's'} added to ${member.full_name || member.email}.` });
      onDone();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="grant-credits-title" className="bg-xert-ink border border-xert-steel/20 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-xert-steel/20">
          <h3 id="grant-credits-title" className="font-display text-xl text-xert-offwhite uppercase">Grant Credits</h3>
          <p className="font-body text-xs text-xert-concrete/50 mt-1">{member.full_name || member.email}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="grant-credit-count" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Class credits</label>
            <input id="grant-credit-count" type="number" min="1" max="100" value={sessions} onChange={e => setSessions(+e.target.value)} className={`${inputCls} w-full`} />
            <div className="flex gap-2 mt-2">{[1, 4, 10].map(value => <button type="button" key={value} onClick={() => setSessions(value)} className="px-2.5 py-1 border border-xert-steel/30 font-body text-xs text-xert-steel">{value}</button>)}</div>
          </div>
          <div>
            <label htmlFor="grant-validity-days" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Validity (days, 0 = never expires)</label>
            <input id="grant-validity-days" type="number" min="0" value={validityDays} onChange={e => setValidityDays(+e.target.value)} className={`${inputCls} w-full`} />
            <div className="flex flex-wrap gap-2 mt-2">{[{ label: '14 days', value: 14 }, { label: '28 days', value: 28 }, { label: '56 days', value: 56 }, { label: 'No expiry', value: 0 }].map(option => <button type="button" key={option.value} onClick={() => setValidityDays(option.value)} className="px-2.5 py-1 border border-xert-steel/30 font-body text-xs text-xert-steel">{option.label}</button>)}</div>
          </div>
          <div>
            <label htmlFor="grant-credit-reason" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Grant reason</label>
            <textarea id="grant-credit-reason" value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={3} placeholder="e.g. Cash sale, service recovery, competition prize" className={`${inputCls} w-full resize-none`} />
            <p className="font-body text-[10px] text-xert-concrete/30 mt-1">Required for the permanent admin audit trail.</p>
          </div>
          <p className="font-body text-xs text-xert-concrete/40">
            Use for comps, refunds or manual/cash sales. Credits appear instantly in the member&rsquo;s account.
          </p>
          {error && <p role="alert" className="font-body text-xs text-xert-red">{error}</p>}
        </div>
        <div className="flex gap-3 p-6 border-t border-xert-steel/20">
          <button type="button" disabled={saving} onClick={onCancel} className="flex-1 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleGrant} disabled={saving}
            className="flex-1 py-3 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
            {saving ? 'Granting…' : `Grant ${sessions}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MembersManager({ initialMemberId, onIntentHandled }) {
  const { user } = useSupabaseAuth();
  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [granting, setGranting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [creditFilter, setCreditFilter] = useState('all');
  const [roleChangingId, setRoleChangingId] = useState(null);
  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    adminListMembersPage({
      search: debouncedSearch,
      role: roleFilter,
      credit: creditFilter,
      page,
      pageSize: PAGE_SIZE
    }).then(result => {
      if (!active) return;
      setMembers(result.rows);
      setTotal(result.total);
    }).catch(error => {
      if (!active) return;
      setMembers([]);
      setTotal(0);
      setLoadError(error.message || 'Check the member admin RPC and permissions.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [creditFilter, debouncedSearch, page, refreshVersion, roleFilter]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min((page - 1) * PAGE_SIZE + members.length, total);
  const hasFilters = Boolean(debouncedSearch) || roleFilter !== 'all' || creditFilter !== 'all';
  const searchPending = search.trim() !== debouncedSearch;
  const refresh = () => setRefreshVersion(version => version + 1);

  useEffect(() => {
    setPage(1);
    setViewing(null);
    setGranting(null);
  }, [creditFilter, debouncedSearch, roleFilter]);

  useEffect(() => {
    if (!initialMemberId) return undefined;
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
      .finally(() => { if (active) onIntentHandled?.(); });
    return () => { active = false; };
  }, [initialMemberId, onIntentHandled]);

  const handleExport = async () => {
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
      setExporting(false);
    }
  };

  const handleRole = async (m, role) => {
    const verb = role === 'admin' ? 'Promote' : 'Remove admin from';
    const consequence = role === 'admin'
      ? 'This grants access to member data, bookings, sales, content, and staff controls.'
      : 'This removes access to all administrative tools.';
    if (!confirm(`${verb} ${m.full_name || m.email}?\n\n${consequence}`)) return;
    setRoleChangingId(m.id);
    try {
      await adminSetRole(m.id, role);
      toast({ title: 'Role updated', description: `${m.full_name || m.email} is now ${role}.` });
      setPage(1);
      refresh();
    } catch (e) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); }
    finally { setRoleChangingId(null); }
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Members ({total})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search members" placeholder="Search name, email or phone…"
            className={`${inputCls} w-64`} />
          <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} aria-label="Filter members by role" className={inputCls}><option value="all">All roles</option><option value="member">Members</option><option value="admin">Admins</option></select>
          <select value={creditFilter} onChange={event => setCreditFilter(event.target.value)} aria-label="Filter members by credits" className={inputCls}><option value="all">All credits</option><option value="available">Has credits</option><option value="none">No credits</option></select>
          <button type="button" onClick={refresh} disabled={loading} title="Refresh members" aria-label="Refresh members" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/30 text-xert-steel disabled:opacity-40"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button
            onClick={() => void handleExport()}
            disabled={total === 0 || exporting || searchPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 uppercase tracking-wider hover:border-xert-steel transition-colors disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> {exporting ? 'Exporting…' : 'CSV'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-xert-ink animate-pulse" />)}</div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={refresh} />
      ) : total === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">
            {hasFilters ? 'No matches' : 'No members yet'}
          </p>
          <p className="font-body text-sm text-xert-concrete/40">
            {hasFilters ? 'Try a different search or filter.' : 'Members appear here as soon as they create an account on the site.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="bg-xert-ink border border-xert-steel/20 p-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[14rem]">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-base text-xert-offwhite uppercase">{m.full_name || '(no name)'}</h3>
                  {m.role === 'admin' && (
                    <span className="font-body text-xs border border-xert-orange/40 text-xert-orange px-2 py-0.5 uppercase">Admin</span>
                  )}
                </div>
                <p className="font-body text-xs text-xert-concrete/50">
                  <a href={`mailto:${m.email}`} className="hover:text-xert-steel">{m.email}</a>{m.phone ? <> · <a href={`tel:${m.phone}`} className="hover:text-xert-steel">{m.phone}</a></> : ''} · joined {new Date(m.joined_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-5 font-body text-xs text-xert-concrete/60 shrink-0">
                <div className="text-center">
                  <p className="font-display text-lg text-xert-offwhite tabular-nums">{m.credits_remaining}</p>
                  <p className="uppercase tracking-wider text-[10px]">Credits</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-lg text-xert-offwhite tabular-nums">{m.bookings_count}</p>
                  <p className="uppercase tracking-wider text-[10px]">Bookings</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-lg text-xert-offwhite tabular-nums">{formatPackPrice(m.total_spent_cents, 'aud')}</p>
                  <p className="uppercase tracking-wider text-[10px]">Spent</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={() => setViewing(m)}
                  className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                  View
                </button>
                <button type="button" onClick={() => setGranting(m)}
                  className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                  + Credits
                </button>
                {m.role === 'admin' ? (
                  m.id !== user?.id && (
                    <button disabled={roleChangingId !== null} onClick={() => handleRole(m, 'member')}
                      className="min-h-11 px-3 py-2.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors">
                      Remove admin
                    </button>
                  )
                ) : (
                  <button disabled={roleChangingId !== null} onClick={() => handleRole(m, 'admin')}
                    className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                    Make admin
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="font-body text-xs text-xert-concrete/40">
          {total === 0 ? '0 results' : `${firstResult}-${lastResult} of ${total} matching members`}
        </p>
        {pageCount > 1 && (
          <nav aria-label="Member result pages" className="flex items-center gap-2">
            <button type="button" onClick={() => { setViewing(null); setPage(current => Math.max(1, current - 1)); }} disabled={page <= 1} title="Previous page" aria-label="Previous member page" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-body text-xs text-xert-concrete/60 tabular-nums">Page {page} of {pageCount}</span>
            <button type="button" onClick={() => { setViewing(null); setPage(current => Math.min(pageCount, current + 1)); }} disabled={page >= pageCount} title="Next page" aria-label="Next member page" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </nav>
        )}
      </div>

      {viewing && (
        <MemberDrawer
          member={viewing}
          onClose={() => setViewing(null)}
          onGrant={() => setGranting(viewing)}
        />
      )}

      {granting && (
        <GrantCreditsModal member={granting} onDone={() => { setGranting(null); setViewing(null); refresh(); }} onCancel={() => setGranting(null)} />
      )}
    </div>
  );
}
