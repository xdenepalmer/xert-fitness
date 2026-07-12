import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  getClassBookings, getMemberBookingRequests, updateBookingStatus,
  updateMemberBookingStatus, updateLegacyBookingNotes,
} from '@/lib/adminData';
import AdminLoadError from '@/components/admin/AdminLoadError';
import { downloadCsv } from '@/lib/csv';
import { bookingCsvRows, filterAdminBookings, summarizeAdminBookings } from '@/lib/bookingAnalytics';

const STATUSES = ['requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show'];
const STATUS_COLORS = {
  requested: 'bg-xert-red/20 text-xert-red',
  confirmed: 'bg-green-900/30 text-green-400',
  waitlisted: 'bg-yellow-900/30 text-yellow-400',
  cancelled: 'bg-xert-steel/30 text-xert-concrete/40',
  declined: 'bg-xert-steel/30 text-xert-concrete/40',
  attended: 'bg-green-700/30 text-green-300',
  no_show: 'bg-orange-900/30 text-xert-orange',
};

export default function BookingRequestsTable() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [daysFilter, setDaysFilter] = useState('30');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [notes, setNotes] = useState('');
  const [updatingKey, setUpdatingKey] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [legacy, members] = await Promise.all([
        getClassBookings(),
        getMemberBookingRequests(),
      ]);
      const rows = [
        ...legacy.map(booking => ({
          ...booking,
          source: 'enquiry',
          createdAt: booking.created_at,
          session: booking.class_sessions,
        })),
        ...members.map(booking => ({
          ...booking,
          source: 'member',
          full_name: booking.profile?.full_name || booking.profile?.email || 'Member',
          email: booking.profile?.email || 'Email unavailable',
          phone: booking.profile?.phone || '',
          createdAt: booking.created_at,
          session: booking.class_sessions,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBookings(rows);
    } catch (error) {
      setLoadError(error.message || 'Check booking tables and admin permissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredBookings = useMemo(() => filterAdminBookings(bookings, {
    search,
    status: statusFilter,
    source: sourceFilter,
    days: daysFilter,
  }), [bookings, daysFilter, search, sourceFilter, statusFilter]);
  const summary = useMemo(() => summarizeAdminBookings(filteredBookings), [filteredBookings]);

  const handleStatusUpdate = async (booking, status) => {
    const actionKey = `${booking.source}-${booking.id}`;
    setUpdatingKey(actionKey);
    try {
      if (booking.source === 'member') {
        await updateMemberBookingStatus(booking.id, status);
      } else {
        await updateBookingStatus(booking.id, status);
      }
      toast({ title: 'Booking updated', description: `${booking.full_name || 'Booking'} is now ${status.replace(/_/g, ' ')}.` });
      await load();
    } catch (e) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setUpdatingKey('');
    }
  };

  const saveNotes = async () => {
    if (!selectedBooking) return;
    setSavingNotes(true);
    try {
      await updateLegacyBookingNotes(selectedBooking.id, notes);
      setSelectedBooking(null);
      toast({ title: 'Notes saved' });
      await load();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Booking Operations</h2>
        <button type="button" onClick={() => downloadCsv(
          `xert-bookings-${new Date().toISOString().slice(0, 10)}.csv`,
          bookingCsvRows(filteredBookings),
          [
            { key: 'created_at', label: 'Requested' }, { key: 'source', label: 'Source' },
            { key: 'status', label: 'Status' }, { key: 'name', label: 'Name' },
            { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
            { key: 'class', label: 'Class' }, { key: 'class_start', label: 'Class start' },
            { key: 'coach', label: 'Coach' }, { key: 'location', label: 'Location' },
            { key: 'credit_reserved', label: 'Credit reserved' }, { key: 'admin_notes', label: 'Admin notes' },
          ]
        )} disabled={filteredBookings.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 uppercase tracking-wider hover:border-xert-steel transition-colors disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search member, contact or class" aria-label="Search bookings"
          className="sm:col-span-2 bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter bookings by status"
          className="bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} aria-label="Filter bookings by source" className="bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
          <option value="all">All sources</option><option value="member">Member credit</option><option value="enquiry">Enquiry form</option>
        </select>
        <div className="flex gap-2">
          <select value={daysFilter} onChange={e => setDaysFilter(e.target.value)} aria-label="Filter bookings by age" className="flex-1 min-w-0 bg-xert-ink border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
            <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} title="Refresh booking requests" aria-label="Refresh booking requests"
            className="p-2.5 border border-xert-steel/40 text-xert-steel hover:border-xert-steel transition-colors disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Matching', value: summary.total },
          { label: 'Requested', value: summary.requested },
          { label: 'Confirmed', value: summary.confirmed },
          { label: 'Attended', value: summary.attendance },
        ].map(item => (
          <div key={item.label} className="bg-xert-ink border border-xert-steel/20 p-4">
            <p className="font-display text-2xl text-xert-offwhite tabular-nums">{item.value}</p>
            <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-xert-ink animate-pulse" />)}</div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={load} />
      ) : filteredBookings.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">No matching bookings</p>
          <p className="font-body text-sm text-xert-concrete/40">Adjust the filters or refresh the queue.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredBookings.map(b => (
            <div key={`${b.source}-${b.id}`} className="bg-xert-ink border border-xert-steel/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-body text-base text-xert-offwhite">{b.full_name}</span>
                    <span className={`font-body text-xs px-2 py-0.5 ${STATUS_COLORS[b.status] || ''}`}>{b.status}</span>
                  </div>
                  <p className="font-body text-xs text-xert-concrete/50">
                    <a href={`mailto:${b.email}`} className="hover:text-xert-steel">{b.email}</a>
                    {b.phone && <> · <a href={`tel:${b.phone}`} className="hover:text-xert-steel">{b.phone}</a></>}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span className="font-body text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-xert-steel/30 text-xert-concrete/40">
                      {b.source === 'member' ? 'Member credit booking' : 'Enquiry form'}
                    </span>
                    {b.source === 'member' && b.credit_batch_id && (
                      <span className="font-body text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-xert-steel/30 text-xert-concrete/40">
                        Credit reserved
                      </span>
                    )}
                  </div>
                  {b.session && (
                    <p className="font-body text-xs text-xert-concrete/40 mt-1">
                      {b.session.title} · {b.session.start_time ? new Date(b.session.start_time).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  )}
                  {b.admin_notes && <p className="font-body text-xs text-xert-concrete/30 mt-1 italic">{b.admin_notes}</p>}
                </div>
                <div className="flex gap-2 flex-wrap justify-end shrink-0">
                  {b.status === 'requested' && (
                    <>
                      <button disabled={Boolean(updatingKey)} onClick={() => handleStatusUpdate(b, 'confirmed')}
                        className="px-3 py-1.5 border border-green-600/40 font-body text-xs text-green-400 hover:bg-green-900/20 transition-colors">
                        Confirm
                      </button>
                      <button disabled={Boolean(updatingKey)} onClick={() => handleStatusUpdate(b, 'waitlisted')}
                        className="px-3 py-1.5 border border-yellow-600/40 font-body text-xs text-yellow-400 hover:bg-yellow-900/20 transition-colors">
                        Waitlist
                      </button>
                      <button disabled={Boolean(updatingKey)} onClick={() => handleStatusUpdate(b, 'declined')}
                        className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/50 transition-colors">
                        Decline
                      </button>
                    </>
                  )}
                  {b.status === 'confirmed' && (
                    <>
                      <button disabled={Boolean(updatingKey)} onClick={() => handleStatusUpdate(b, 'attended')}
                        className="px-3 py-1.5 border border-green-600/40 font-body text-xs text-green-400 transition-colors">
                        Attended
                      </button>
                      <button disabled={Boolean(updatingKey)} onClick={() => handleStatusUpdate(b, 'no_show')}
                        className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/50 transition-colors">
                        No show
                      </button>
                    </>
                  )}
                  {b.source === 'enquiry' && (
                    <button onClick={() => { setSelectedBooking(b); setNotes(b.admin_notes || ''); }}
                      className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 transition-colors">
                      Notes
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedBooking && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="booking-notes-title" className="bg-xert-ink border border-xert-steel/20 p-6 max-w-sm w-full">
            <h3 id="booking-notes-title" className="font-display text-lg text-xert-offwhite uppercase mb-4">Admin Notes</h3>
            <label htmlFor="booking-admin-notes" className="sr-only">Admin notes for {selectedBooking.full_name}</label>
            <textarea id="booking-admin-notes" maxLength={5000} value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none mb-4" />
            <div className="flex gap-3">
              <button type="button" disabled={savingNotes} onClick={() => setSelectedBooking(null)}
                className="flex-1 py-2.5 border border-xert-steel/40 font-display text-xs text-xert-concrete/60 uppercase">Cancel</button>
              <button type="button" disabled={savingNotes} onClick={saveNotes}
                className="flex-1 py-2.5 bg-xert-red text-white font-display text-xs uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">{savingNotes ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
