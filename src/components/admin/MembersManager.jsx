import React, { useEffect, useMemo, useState } from 'react';
import { adminListMembers, adminGrantCredits, adminSetRole } from '@/lib/adminData';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';

const inputCls = 'bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red';

function GrantCreditsModal({ member, onDone, onCancel }) {
  const [sessions, setSessions] = useState(1);
  const [validityDays, setValidityDays] = useState(28);
  const [saving, setSaving] = useState(false);

  const handleGrant = async () => {
    setSaving(true);
    try {
      await adminGrantCredits(member.id, sessions, validityDays > 0 ? validityDays : null);
      onDone();
    } catch (e) {
      alert('Grant failed: ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-xert-ink border border-xert-steel/20 w-full max-w-md">
        <div className="p-6 border-b border-xert-steel/20">
          <h3 className="font-display text-xl text-xert-offwhite uppercase">Grant Credits</h3>
          <p className="font-body text-xs text-xert-concrete/50 mt-1">{member.full_name || member.email}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Class credits</label>
            <input type="number" min="1" max="100" value={sessions} onChange={e => setSessions(+e.target.value)} className={`${inputCls} w-full`} />
          </div>
          <div>
            <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Validity (days, 0 = never expires)</label>
            <input type="number" min="0" value={validityDays} onChange={e => setValidityDays(+e.target.value)} className={`${inputCls} w-full`} />
          </div>
          <p className="font-body text-xs text-xert-concrete/40">
            Use for comps, refunds or manual/cash sales. Credits appear instantly in the member&rsquo;s account.
          </p>
        </div>
        <div className="flex gap-3 p-6 border-t border-xert-steel/20">
          <button onClick={onCancel} className="flex-1 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors">Cancel</button>
          <button onClick={handleGrant} disabled={saving || sessions < 1}
            className="flex-1 py-3 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
            {saving ? 'Granting…' : `Grant ${sessions}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MembersManager() {
  const { user } = useSupabaseAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [granting, setGranting] = useState(null);

  const load = () => {
    setLoading(true);
    adminListMembers().then(d => { setMembers(d); setLoading(false); }).catch(e => { alert(e.message); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      (m.full_name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q));
  }, [members, search]);

  const handleRole = async (m, role) => {
    const verb = role === 'admin' ? 'Promote' : 'Remove admin from';
    if (!confirm(`${verb} ${m.full_name || m.email}?`)) return;
    try { await adminSetRole(m.id, role); load(); } catch (e) { alert('Failed: ' + e.message); }
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Members ({members.length})</h2>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…"
          className={`${inputCls} w-64`} />
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-xert-ink animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">
            {members.length === 0 ? 'No members yet' : 'No matches'}
          </p>
          <p className="font-body text-sm text-xert-concrete/40">
            {members.length === 0 ? 'Members appear here as soon as they create an account on the site.' : 'Try a different search.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => (
            <div key={m.id} className="bg-xert-ink border border-xert-steel/20 p-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[14rem]">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-base text-xert-offwhite uppercase">{m.full_name || '(no name)'}</h3>
                  {m.role === 'admin' && (
                    <span className="font-body text-xs border border-xert-orange/40 text-xert-orange px-2 py-0.5 uppercase">Admin</span>
                  )}
                </div>
                <p className="font-body text-xs text-xert-concrete/50">
                  {m.email}{m.phone ? ` · ${m.phone}` : ''} · joined {new Date(m.joined_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                  <p className="font-display text-lg text-xert-offwhite tabular-nums">${(Number(m.total_spent_cents) / 100).toFixed(0)}</p>
                  <p className="uppercase tracking-wider text-[10px]">Spent</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setGranting(m)}
                  className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                  + Credits
                </button>
                {m.role === 'admin' ? (
                  m.id !== user?.id && (
                    <button onClick={() => handleRole(m, 'member')}
                      className="px-3 py-1.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors">
                      Remove admin
                    </button>
                  )
                ) : (
                  <button onClick={() => handleRole(m, 'admin')}
                    className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                    Make admin
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {granting && (
        <GrantCreditsModal member={granting} onDone={() => { setGranting(null); load(); }} onCancel={() => setGranting(null)} />
      )}
    </div>
  );
}
