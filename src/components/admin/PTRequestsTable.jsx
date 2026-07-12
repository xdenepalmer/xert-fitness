import React, { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { getPTRequests, updatePTRequestStatus } from '@/lib/adminData';
import AdminLoadError from '@/components/admin/AdminLoadError';

const STATUSES = ['requested', 'approved', 'declined', 'reschedule_requested', 'completed', 'cancelled'];
const STATUS_COLORS = {
  requested: 'bg-xert-red/20 text-xert-red',
  approved: 'bg-green-900/30 text-green-400',
  declined: 'bg-xert-steel/30 text-xert-concrete/40',
  reschedule_requested: 'bg-yellow-900/30 text-yellow-400',
  completed: 'bg-green-700/30 text-green-300',
  cancelled: 'bg-xert-steel/20 text-xert-concrete/30',
};

export default function PTRequestsTable() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [notesModal, setNotesModal] = useState(null);
  const [notes, setNotes] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setRequests(await getPTRequests({ status: statusFilter || undefined }));
    } catch (error) {
      setLoadError(error.message || 'Check the private session requests table and admin permissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleUpdate = async (id, status, adminNotes) => {
    try { await updatePTRequestStatus(id, status, adminNotes); load(); } catch (e) { toast({ title: 'Update failed', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="p-6">
      <div className="flex gap-3 mb-6">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-xert-ink animate-pulse" />)}</div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={load} />
      ) : requests.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">No PT requests</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="bg-xert-ink border border-xert-steel/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-body text-base text-xert-offwhite">{r.full_name}</span>
                    <span className={`font-body text-xs px-2 py-0.5 ${STATUS_COLORS[r.status] || ''}`}>{r.status?.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="font-body text-xs text-xert-concrete/50">{r.email} · {r.phone}</p>
                  <p className="font-body text-xs text-xert-concrete/60 mt-1">
                    {r.requested_session_type} · {r.preferred_day} {r.preferred_time}
                  </p>
                  {r.training_goal && <p className="font-body text-xs text-xert-concrete/40 mt-0.5">Goal: {r.training_goal}</p>}
                  {r.admin_notes && <p className="font-body text-xs text-xert-concrete/30 mt-1 italic">{r.admin_notes}</p>}
                </div>
                <div className="flex gap-2 flex-wrap justify-end shrink-0">
                  {r.status === 'requested' && (
                    <>
                      <button onClick={() => handleUpdate(r.id, 'approved')}
                        className="px-3 py-1.5 border border-green-600/40 font-body text-xs text-green-400 transition-colors">Approve</button>
                      <button onClick={() => handleUpdate(r.id, 'reschedule_requested')}
                        className="px-3 py-1.5 border border-yellow-600/40 font-body text-xs text-yellow-400 transition-colors">Reschedule</button>
                      <button onClick={() => handleUpdate(r.id, 'declined')}
                        className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/50 transition-colors">Decline</button>
                    </>
                  )}
                  {r.status === 'approved' && (
                    <button onClick={() => handleUpdate(r.id, 'completed')}
                      className="px-3 py-1.5 border border-green-600/40 font-body text-xs text-green-400 transition-colors">Mark complete</button>
                  )}
                  <button onClick={() => { setNotesModal(r); setNotes(r.admin_notes || ''); }}
                    className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 transition-colors">Notes</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {notesModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-xert-ink border border-xert-steel/20 p-6 max-w-sm w-full">
            <h3 className="font-display text-lg text-xert-offwhite uppercase mb-4">Admin Notes — {notesModal.full_name}</h3>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setNotesModal(null)}
                className="flex-1 py-2.5 border border-xert-steel/40 font-display text-xs text-xert-concrete/60 uppercase">Cancel</button>
              <button onClick={() => { handleUpdate(notesModal.id, notesModal.status, notes); setNotesModal(null); }}
                className="flex-1 py-2.5 bg-xert-red text-white font-display text-xs uppercase hover:bg-xert-orange transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
