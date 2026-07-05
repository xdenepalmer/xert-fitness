import React, { useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Download, X, Ticket, CalendarDays, Receipt, Loader2 } from 'lucide-react';
import { adminListMembers, adminGrantCredits, adminSetRole, adminMemberDetail } from '@/lib/adminData';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { downloadCsv } from '@/lib/csv';

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

function MemberDrawer({ member, onClose, onGrant }) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    setDetail(null);
    adminMemberDetail(member.id)
      .then(setDetail)
      .catch(e => toast({ title: 'Could not load member detail', description: e.message, variant: 'destructive' }));
  }, [member.id]);

  const activeCredits = (detail?.credits || [])
    .filter(c => c.remaining > 0 && (!c.expires_at || new Date(c.expires_at) > new Date()));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md h-full overflow-y-auto animate-slide-up sm:animate-none"
        style={{ backgroundColor: '#0e161e', borderLeft: '1px solid rgba(123,167,188,0.2)' }}>
        {/* Header */}
        <div className="sticky top-0 p-5 flex items-start justify-between gap-4"
          style={{ backgroundColor: '#0e161e', borderBottom: '1px solid rgba(123,167,188,0.14)' }}>
          <div>
            <h3 className="font-display text-2xl uppercase leading-none text-xert-offwhite">{member.full_name || '(no name)'}</h3>
            <p className="font-body text-xs mt-1.5" style={{ color: 'rgba(209,221,230,0.45)' }}>
              {member.email}{member.phone ? ` · ${member.phone}` : ''}
            </p>
            <p className="font-body text-[11px] mt-0.5" style={{ color: 'rgba(123,167,188,0.5)' }}>
              Member since {fmtDate(member.joined_at)}{member.role === 'admin' ? ' · Admin' : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1 shrink-0" style={{ color: 'rgba(209,221,230,0.5)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {!detail ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#7BA7BC' }} />
          </div>
        ) : (
          <div className="p-5 space-y-7">
            {/* Credits */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em]" style={{ color: 'rgba(123,167,188,0.6)' }}>
                  <Ticket className="w-3.5 h-3.5" /> Credits
                </h4>
                <button onClick={onGrant}
                  className="px-2.5 py-1 border font-body text-[10px] uppercase tracking-wider transition-colors"
                  style={{ borderColor: 'rgba(123,167,188,0.3)', color: '#7BA7BC' }}>
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
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                        ${((o.amount_cents || 0) / 100).toFixed(2)}
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
  const [saving, setSaving] = useState(false);

  const handleGrant = async () => {
    setSaving(true);
    try {
      await adminGrantCredits(member.id, sessions, validityDays > 0 ? validityDays : null);
      onDone();
    } catch (e) {
      toast({ title: 'Grant failed', description: e.message, variant: 'destructive' });
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
  const [viewing, setViewing] = useState(null);

  const load = () => {
    setLoading(true);
    adminListMembers().then(d => { setMembers(d); setLoading(false); }).catch(e => { toast({ title: 'Something went wrong', description: e.message, variant: 'destructive' }); setLoading(false); });
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
    try { await adminSetRole(m.id, role); load(); } catch (e) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Members ({members.length})</h2>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…"
            className={`${inputCls} w-64`} />
          <button
            onClick={() => downloadCsv(`xert-members-${new Date().toISOString().slice(0, 10)}.csv`, members, [
              { key: 'full_name', label: 'Name' }, { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' }, { key: 'role', label: 'Role' },
              { key: 'credits_remaining', label: 'Credits' }, { key: 'bookings_count', label: 'Bookings' },
              { key: 'total_spent_cents', label: 'Spent (cents)' }, { key: 'joined_at', label: 'Joined' },
            ])}
            disabled={members.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 uppercase tracking-wider hover:border-xert-steel transition-colors disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
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
                <button onClick={() => setViewing(m)}
                  className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                  View
                </button>
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

      {viewing && (
        <MemberDrawer
          member={viewing}
          onClose={() => setViewing(null)}
          onGrant={() => setGranting(viewing)}
        />
      )}

      {granting && (
        <GrantCreditsModal member={granting} onDone={() => { setGranting(null); setViewing(null); load(); }} onCancel={() => setGranting(null)} />
      )}
    </div>
  );
}
