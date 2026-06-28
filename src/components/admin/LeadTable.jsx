import React, { useState, useEffect } from 'react';
import { getMemberLeads, getTrainerLeads, getPartnerLeads, updateLeadStatus, updateAdminNotes, exportLeadsCsv } from '@/lib/adminData';

const MEMBER_STATUSES = ['new', 'contacted', 'warm', 'hot', 'foundation_offer_sent', 'booked_trial', 'joined', 'not_suitable', 'archived'];
const TRAINER_STATUSES = ['new', 'reviewing', 'contacted', 'interview', 'shortlisted', 'not_suitable', 'hired', 'archived'];
const PARTNER_STATUSES = ['new', 'reviewing', 'contacted', 'meeting', 'approved', 'not_suitable', 'archived'];

const STATUS_COLORS = {
  new: 'bg-xert-red/20 text-xert-red',
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

  const save = async () => {
    setSaving(true);
    try {
      await updateLeadStatus(table, lead.id, status);
      await updateAdminNotes(table, lead.id, notes);
      onUpdate();
      onClose();
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-end">
      <div className="bg-xert-ink border-l border-xert-steel/20 w-full sm:max-w-md h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-display text-xl text-xert-offwhite uppercase">Lead Detail</h3>
          <button onClick={onClose} className="text-xert-concrete/40 hover:text-xert-offwhite text-xl">✕</button>
        </div>

        {/* Core info */}
        <div className="space-y-3 mb-6 pb-6 border-b border-xert-steel/20">
          <div>
            <p className="font-body text-xs text-xert-concrete/40 uppercase">Name</p>
            <p className="font-body text-base text-xert-offwhite">{lead.full_name}</p>
          </div>
          <div>
            <p className="font-body text-xs text-xert-concrete/40 uppercase">Email</p>
            <p className="font-body text-sm text-xert-offwhite">{lead.email}</p>
          </div>
          <div>
            <p className="font-body text-xs text-xert-concrete/40 uppercase">Phone</p>
            <p className="font-body text-sm text-xert-offwhite">{lead.phone || '—'}</p>
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
        </div>

        {/* Status update */}
        <div className="mb-4">
          <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-2">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
            {statuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-2">Admin notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
            placeholder="Internal notes..."
            className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red resize-none" />
        </div>

        <button onClick={save} disabled={saving}
          className="w-full py-3 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
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
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [error, setError] = useState('');

  const fetchFn = type === 'member' ? getMemberLeads : type === 'trainer' ? getTrainerLeads : getPartnerLeads;
  const table = type === 'member' ? 'member_interest' : type === 'trainer' ? 'trainer_interest' : 'partner_interest';
  const statuses = type === 'member' ? MEMBER_STATUSES : type === 'trainer' ? TRAINER_STATUSES : PARTNER_STATUSES;

  const load = () => {
    setLoading(true);
    fetchFn({ search, status: statusFilter }).then(data => {
      setLeads(data);
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  const handleExport = async () => {
    try {
      const csv = await exportLeadsCsv(table);
      if (!csv) { alert('No data to export.'); return; }
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xert_${table}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + e.message);
    }
  };

  return (
    <div className="p-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name or email..."
          className="flex-1 bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-xert-ink border border-xert-steel/40 px-4 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
          <option value="">All statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <button onClick={handleExport}
          className="px-5 py-2.5 border border-xert-steel/40 font-display text-xs text-xert-concrete/60 uppercase hover:border-xert-concrete transition-colors whitespace-nowrap">
          Export CSV
        </button>
      </div>

      {error && <div className="mb-4 p-3 border border-xert-red/40 bg-xert-red/10"><p className="font-body text-sm text-xert-red">{error}</p></div>}

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
            <div key={lead.id}
              onClick={() => setSelectedLead(lead)}
              className="bg-xert-ink border border-xert-steel/20 p-4 cursor-pointer hover:border-xert-red/40 transition-colors">
              <div className="flex items-start justify-between gap-4">
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
                <div className="text-right shrink-0">
                  <p className="font-body text-xs text-xert-concrete/30">{new Date(lead.created_at).toLocaleDateString('en-AU')}</p>
                  {lead.utm_source && <p className="font-body text-xs text-xert-concrete/30 mt-1">{lead.utm_source}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="font-body text-xs text-xert-concrete/30 mt-4">{leads.length} result{leads.length !== 1 ? 's' : ''}</p>

      {selectedLead && (
        <LeadDetailDrawer
          lead={selectedLead}
          statuses={statuses}
          table={table}
          onClose={() => setSelectedLead(null)}
          onUpdate={load}
        />
      )}
    </div>
  );
}