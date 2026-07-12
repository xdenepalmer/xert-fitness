import React, { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import {
  getClassBookings, getMemberBookingRequests, updateBookingStatus,
  updateMemberBookingStatus, updateAdminNotes,
} from '@/lib/adminData';

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
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [notes, setNotes] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      getClassBookings({ status: statusFilter || undefined }),
      getMemberBookingRequests({ status: statusFilter || undefined }),
    ]).then(([legacy, members]) => {
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
      setLoading(false);
    }).catch(error => {
      toast({ title: 'Could not load booking requests', description: error.message, variant: 'destructive' });
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleStatusUpdate = async (booking, status) => {
    try {
      if (booking.source === 'member') {
        await updateMemberBookingStatus(booking.id, status);
      } else {
        await updateBookingStatus(booking.id, status);
      }
      load();
    } catch (e) { toast({ title: 'Update failed', description: e.message, variant: 'destructive' }); }
  };

  const saveNotes = async () => {
    if (!selectedBooking) return;
    try {
      await updateAdminNotes('class_bookings', selectedBooking.id, notes);
      setSelectedBooking(null);
      load();
    } catch (e) { toast({ title: 'Save failed', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="p-6">
      <div className="flex gap-3 mb-6">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-xert-ink animate-pulse" />)}</div>
      ) : bookings.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">No booking requests</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map(b => (
            <div key={b.id} className="bg-xert-ink border border-xert-steel/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-body text-base text-xert-offwhite">{b.full_name}</span>
                    <span className={`font-body text-xs px-2 py-0.5 ${STATUS_COLORS[b.status] || ''}`}>{b.status}</span>
                  </div>
                  <p className="font-body text-xs text-xert-concrete/50">{b.email} · {b.phone}</p>
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
                      <button onClick={() => handleStatusUpdate(b, 'confirmed')}
                        className="px-3 py-1.5 border border-green-600/40 font-body text-xs text-green-400 hover:bg-green-900/20 transition-colors">
                        Confirm
                      </button>
                      <button onClick={() => handleStatusUpdate(b, 'waitlisted')}
                        className="px-3 py-1.5 border border-yellow-600/40 font-body text-xs text-yellow-400 hover:bg-yellow-900/20 transition-colors">
                        Waitlist
                      </button>
                      <button onClick={() => handleStatusUpdate(b, 'declined')}
                        className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/50 transition-colors">
                        Decline
                      </button>
                    </>
                  )}
                  {b.status === 'confirmed' && (
                    <>
                      <button onClick={() => handleStatusUpdate(b, 'attended')}
                        className="px-3 py-1.5 border border-green-600/40 font-body text-xs text-green-400 transition-colors">
                        Attended
                      </button>
                      <button onClick={() => handleStatusUpdate(b, 'no_show')}
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
          <div className="bg-xert-ink border border-xert-steel/20 p-6 max-w-sm w-full">
            <h3 className="font-display text-lg text-xert-offwhite uppercase mb-4">Admin Notes</h3>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setSelectedBooking(null)}
                className="flex-1 py-2.5 border border-xert-steel/40 font-display text-xs text-xert-concrete/60 uppercase">Cancel</button>
              <button onClick={saveNotes}
                className="flex-1 py-2.5 bg-xert-red text-white font-display text-xs uppercase hover:bg-xert-orange transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
