import React from 'react';
import { UserCheck } from 'lucide-react';
import { AdminBadge, AdminSkeleton } from '@/components/admin/ui';

export default function WaitlistDesk({ rows, available, error, loading, promotingSessionId, onRetry, onOpen, onPromote }) {
  return (
    <section aria-labelledby="waitlist-desk-title" className="calendar-waitlist">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 id="waitlist-desk-title" className="flex items-center gap-2 font-display text-sm text-xert-offwhite uppercase">
            <UserCheck className="w-4 h-4 text-xert-steel" /> Waitlist desk
            {!loading && available && <span className="font-body text-xs text-xert-concrete/40">({rows.length})</span>}
          </h3>
          <p className="font-body text-xs text-xert-concrete/40 mt-1">Future class queues, ordered with open places first.</p>
        </div>
      </div>
      {loading ? (
        <AdminSkeleton variant="editor" label="Loading waitlist desk" />
      ) : error ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="alert" className="font-body text-xs text-xert-red">{error}</p>
          <button type="button" onClick={onRetry} className="min-h-11 px-3 border border-xert-steel/30 font-body text-xs text-xert-steel hover:border-xert-steel">Retry</button>
        </div>
      ) : !available ? (
        <p className="font-body text-xs text-status-warning-300" >The waitlist source is unavailable. Contact support to enable the waitlist desk.</p>
      ) : rows.length === 0 ? (
        <p className="font-body text-sm text-xert-concrete/40">No upcoming class waitlists.</p>
      ) : (
        <div className="calendar-waitlist-grid">
          {rows.map(item => {
            const credits = Number(item.next_available_credits || 0);
            const capacityLabel = item.capacity == null ? `${item.active_count}/unlimited` : `${item.active_count}/${item.capacity}`;
            const nextMember = item.next_full_name || item.next_email || 'Member';
            return (
              <article key={item.session_id} className="calendar-queue-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base text-xert-offwhite uppercase">{item.title}</p>
                    <p className="font-body text-xs text-xert-concrete/50 mt-1">
                      {new Date(item.start_time).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </p>
                    <p className="font-body text-[11px] text-xert-concrete/45 mt-2">
                      {Number(item.waitlist_count)} waiting · {capacityLabel} active
                    </p>
                    <p className="font-body text-xs text-xert-concrete/65 mt-2">
                      Next: {nextMember} · {credits} credit{credits === 1 ? '' : 's'}
                    </p>
                  </div>
                  <AdminBadge status={item.can_promote ? 'active' : 'pending'}>{item.can_promote ? 'Place open' : 'Class full'}</AdminBadge>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <button type="button" onClick={() => onOpen(item.session_id)} className="min-h-11 px-3 border border-xert-steel/30 font-body text-xs text-xert-concrete/65 hover:border-xert-steel">
                    Open roster
                  </button>
                  {item.can_promote && credits > 0 && (
                    <button type="button" onClick={() => onPromote(item)} disabled={Boolean(promotingSessionId)} className="inline-flex min-h-11 items-center gap-1.5 px-3 border border-xert-steel/40 font-body text-xs text-xert-steel hover:border-xert-steel disabled:opacity-40">
                      <UserCheck className="w-3.5 h-3.5" />
                      {promotingSessionId === item.session_id ? 'Promoting...' : 'Promote next'}
                    </button>
                  )}
                  {item.can_promote && credits === 0 && <span className="font-body text-xs text-status-warning-300" >Next member needs a credit</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}


