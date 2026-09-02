import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Eye, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { acknowledgeFitboxReconciliationEvent, getFitboxReconciliationEvents } from '@/lib/adminData';
import { toast } from '@/components/ui/use-toast';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';
import AdminLoadError from '@/components/admin/AdminLoadError';
import { ADMIN_PAGE } from '@/components/admin/ui';

const EVENT_LABELS = {
  class_session_booked: 'Class session booked',
  class_session_cancelled: 'Class session cancelled',
  user_first_session_booked: 'First session booked',
  user_profile_changed: 'Profile changed',
  user_status_changed: 'User status changed',
  user_subscription_changed: 'Subscription changed',
};

function readable(value) {
  return String(value || 'Unknown').replace(/_/g, ' ');
}

function timestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown time'
    : date.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
}

function eventScope(event) {
  const parts = [
    event.fitbox_user_id ? `User ${event.fitbox_user_id}` : null,
    event.fitbox_booking_id ? `Booking ${event.fitbox_booking_id}` : null,
    event.fitbox_session_id ? `Session ${event.fitbox_session_id}` : null,
    event.fitbox_subscription_id ? `Subscription ${event.fitbox_subscription_id}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || 'Provider identifier unavailable';
}

export default function FitboxReconciliation() {
  const [state, setState] = useState('needs_review');
  const [events, setEvents] = useState([]);
  const [linkIntegrity, setLinkIntegrity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pendingEvent, setPendingEvent] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const load = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const result = await getFitboxReconciliationEvents(state);
      setEvents(Array.isArray(result.events) ? result.events : []);
      setLinkIntegrity(result.link_integrity || null);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(loadError.message || 'FitBox reconciliation queue could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [state]);

  useEffect(() => { void load({ initial: true }); }, [load]);

  const acknowledge = async () => {
    if (!pendingEvent?.id) return;
    setAcknowledging(true);
    try {
      const result = await acknowledgeFitboxReconciliationEvent(pendingEvent.id);
      setPendingEvent(null);
      toast({
        title: result.already_reviewed ? 'FitBox event was already reviewed' : 'FitBox event acknowledged',
        description: 'This updated the XERT review ledger only. No FitBox or XERT member, booking, membership or billing record changed.',
      });
      await load();
    } catch (acknowledgeError) {
      toast({ title: 'Could not acknowledge FitBox event', description: acknowledgeError.message, variant: 'destructive' });
    } finally {
      setAcknowledging(false);
    }
  };

  const orphanedLinks = Number(linkIntegrity?.orphaned || 0);

  return (
    <div className={`${ADMIN_PAGE} space-y-5`}>
      <header className="border border-xert-steel/20 bg-gradient-to-r from-xert-deep/40 to-xert-navy/75 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center bg-xert-steel/15 text-xert-steel">
              <ClipboardCheck className="size-5" />
            </div>
            <div>
              <p className="font-body text-[10px] uppercase tracking-[0.22em] text-xert-steel/70">Provider review only</p>
              <h2 className="mt-1 font-display text-2xl uppercase text-xert-offwhite sm:text-3xl">FitBox reconciliation</h2>
              <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-xert-pale/65">
                Review inbound FitBox signals as evidence. Acknowledging an item only updates this protected XERT review ledger; it never creates, cancels or changes a booking, membership, payment or profile.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading || refreshing}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-xert-steel/30 px-4 font-body text-xs uppercase tracking-wider text-xert-pale disabled:opacity-50">
            {loading || refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-xert-steel/15 pt-4">
          <label className="flex min-h-11 items-center gap-3 font-body text-xs uppercase tracking-wider text-xert-pale/60">
            Show
            <select value={state} onChange={event => setState(event.target.value)} className="min-h-11 border border-xert-steel/30 bg-xert-navy px-3 text-sm normal-case tracking-normal text-xert-offwhite">
              <option value="needs_review">Needs review</option>
              <option value="reviewed">Reviewed</option>
              <option value="ignored">Ignored</option>
            </select>
          </label>
          <p className="font-body text-[11px] uppercase tracking-wider text-xert-pale/40">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : 'Loading latest records'}
          </p>
        </div>
      </header>

      {orphanedLinks > 0 && (
        <section className="flex items-start gap-3 border border-amber-300/35 bg-amber-300/10 p-4" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-200" />
          <div>
            <h3 className="font-display text-sm uppercase text-amber-100">FitBox link needs source review</h3>
            <p className="mt-1 font-body text-sm leading-relaxed text-amber-100/75">
              {orphanedLinks} FitBox link{orphanedLinks === 1 ? '' : 's'} {orphanedLinks === 1 ? 'has' : 'have'} no matching XERT lead. Preserve the provider evidence and investigate the original XERT source; do not create a replacement lead or register the same FitBox user again.
            </p>
          </div>
        </section>
      )}

      {error ? <AdminLoadError message={error} onRetry={() => void load()} /> : loading ? (
        <div className="space-y-3" role="status" aria-label="Loading FitBox reconciliation queue">
          {[1, 2, 3].map(item => <div key={item} className="h-36 animate-pulse border border-xert-steel/15 bg-xert-ink" />)}
        </div>
      ) : events.length === 0 ? (
        <section className="border border-emerald-400/25 bg-emerald-400/5 p-6 text-center">
          <CheckCircle2 className="mx-auto size-6 text-emerald-300" />
          <h3 className="mt-3 font-display text-xl uppercase text-xert-offwhite">Nothing waiting here</h3>
          <p className="mx-auto mt-2 max-w-lg font-body text-sm leading-relaxed text-xert-pale/60">
            There are no FitBox events in the selected state. New provider signals will remain review-only until an owner records their review.
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {events.map(event => {
            const awaitingReview = event.processing_state === 'needs_review';
            return (
              <article key={event.id} className="border border-xert-steel/20 bg-xert-ink/70 p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 border px-2 py-1 font-body text-[10px] uppercase tracking-wider ${awaitingReview ? 'border-amber-300/35 bg-amber-300/10 text-amber-200' : 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'}`}>
                        {awaitingReview ? <TriangleAlert className="size-3" /> : <CheckCircle2 className="size-3" />}
                        {readable(event.processing_state)}
                      </span>
                      <span className="font-body text-[11px] uppercase tracking-wider text-xert-steel">{readable(event.review_reason)}</span>
                    </div>
                    <h3 className="mt-3 font-display text-xl uppercase text-xert-offwhite">{EVENT_LABELS[event.event_type] || readable(event.event_type)}</h3>
                    <p className="mt-1 font-body text-sm text-xert-pale/65">{eventScope(event)}</p>
                  </div>
                  {awaitingReview && (
                    <button type="button" onClick={() => setPendingEvent(event)}
                      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-xert-steel/35 px-4 font-display text-xs uppercase text-xert-steel hover:border-xert-steel hover:text-xert-pale">
                      <Eye className="size-4" /> Mark reviewed
                    </button>
                  )}
                </div>
                <dl className="mt-4 grid gap-3 border-t border-xert-steel/15 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="font-body text-[10px] uppercase tracking-wider text-xert-pale/40">Received</dt><dd className="mt-1 font-body text-xert-pale/75">{timestamp(event.received_at)}</dd></div>
                  <div><dt className="font-body text-[10px] uppercase tracking-wider text-xert-pale/40">Provider status</dt><dd className="mt-1 font-body text-xert-pale/75">{event.provider_status ? readable(event.provider_status) : 'Not supplied'}</dd></div>
                  <div><dt className="font-body text-[10px] uppercase tracking-wider text-xert-pale/40">Provider time</dt><dd className="mt-1 font-body text-xert-pale/75">{event.provider_occurred_at || event.provider_updated_at ? timestamp(event.provider_updated_at || event.provider_occurred_at) : 'Not supplied'}</dd></div>
                  <div><dt className="font-body text-[10px] uppercase tracking-wider text-xert-pale/40">Review record</dt><dd className="mt-1 font-body text-xert-pale/75">{event.reviewed_at ? `Reviewed ${timestamp(event.reviewed_at)}` : 'Awaiting owner review'}</dd></div>
                </dl>
                <p className="mt-3 font-body text-[11px] leading-relaxed text-xert-pale/40">Event ID: {event.id}</p>
              </article>
            );
          })}
        </div>
      )}

      <section className="flex items-start gap-3 border border-xert-steel/20 bg-xert-navy/35 p-4">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-xert-steel" />
        <p className="font-body text-xs leading-relaxed text-xert-pale/60">
          FitBox event identity is not yet strong enough for automatic XERT reconciliation. Keep its native booking, credit, Stripe and membership records authoritative until FitBox provides a verified API contract.
        </p>
      </section>

      <AdminConfirmDialog
        open={Boolean(pendingEvent)}
        onOpenChange={open => !open && setPendingEvent(null)}
        title="Mark FitBox event reviewed?"
        description={pendingEvent ? `Record that ${EVENT_LABELS[pendingEvent.event_type] || readable(pendingEvent.event_type)} (${pendingEvent.id}) has been reviewed by an owner.` : ''}
        warning="This only acknowledges a review in XERT. It does not contact FitBox or change any booking, credit, membership, payment or member profile."
        cancelLabel="Keep for review"
        confirmLabel="Mark reviewed"
        onConfirm={() => void acknowledge()}
        busy={acknowledging}
      />
    </div>
  );
}
