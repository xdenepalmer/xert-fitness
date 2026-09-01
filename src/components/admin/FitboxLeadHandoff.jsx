import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getFitboxLeadState, refreshFitboxUser, sendLeadToFitbox } from '@/lib/adminData';

const ERROR_LABELS = {
  ZAPIER_DISPATCH_FAILED: 'Zapier did not accept the handoff.',
  ZAPIER_DISPATCH_OUTCOME_UNKNOWN: 'Zapier did not confirm whether FitBox received this prospect. Check FitBox for the lead email before taking another action.',
  FITBOX_PROVIDER_REJECTED: 'FitBox rejected the prospect.',
  FITBOX_PROSPECT_INVALID: 'FitBox reported missing or invalid prospect details.',
  FITBOX_DUPLICATE_REVIEW: 'FitBox reported a possible duplicate. Review it in FitBox.',
  FITBOX_IDENTITY_CONFLICT: 'This FitBox identity conflicts with an existing XERT link.',
  FITBOX_CALLBACK_EXPIRED: 'Zapier did not return a result before the handoff expired.',
  ZAPIER_PROFILE_REFRESH_FAILED: 'Zapier could not start the read-only profile refresh. It is safe to retry.',
  FITBOX_USER_NOT_FOUND: 'FitBox could not find the linked user. Review the link before retrying.',
  FITBOX_PROFILE_REFRESH_INVALID: 'FitBox returned an incomplete profile result.',
  FITBOX_PROFILE_REFRESH_REJECTED: 'FitBox rejected the read-only profile refresh.',
  FITBOX_LOOKUP_IDENTITY_MISMATCH: 'FitBox returned a different user identity. The XERT link was not changed.',
  FITBOX_PROFILE_REFRESH_EXPIRED: 'The read-only profile refresh expired without a callback. It is safe to retry.',
};

function statusLabel(status) {
  return String(status || 'unknown').replace(/_/g, ' ');
}

export default function FitboxLeadHandoff({ lead }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setState(await getFitboxLeadState(lead.id));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const next = await sendLeadToFitbox(lead.id);
      setState(current => ({ ...current, ...next }));
      setConfirming(false);
      toast({ title: 'Sent to FitBox', description: 'Zapier accepted the prospect handoff. The FitBox ID will appear here when it completes.' });
      window.setTimeout(() => void load(), 1_500);
    } catch (sendError) {
      setError(sendError.message);
      toast({ title: 'FitBox handoff failed', description: sendError.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const refreshProfile = async () => {
    setRefreshingProfile(true);
    setError('');
    try {
      const next = await refreshFitboxUser(lead.id);
      setState(current => ({ ...current, ...next }));
      toast({ title: 'FitBox refresh started', description: 'XERT is fetching a read-only profile snapshot. No member or billing details will be changed.' });
      window.setTimeout(() => void load(), 1_500);
    } catch (refreshError) {
      setError(refreshError.message);
      toast({ title: 'FitBox refresh failed', description: refreshError.message, variant: 'destructive' });
    } finally {
      setRefreshingProfile(false);
    }
  };

  const job = state?.current_job;
  const linked = state?.link;
  const inProgress = ['queued', 'dispatched', 'dispatch_unknown'].includes(job?.status);
  const failed = job?.status === 'failed';
  const safeToRetry = failed && job?.last_error_code === 'ZAPIER_DISPATCH_FAILED';
  const needsProviderReview = failed && !safeToRetry;
  const profileJob = job?.job_type === 'get_user' ? job : null;
  const profileInProgress = ['queued', 'dispatched', 'dispatch_unknown'].includes(profileJob?.status);
  const profileNeedsReview = profileJob?.status === 'failed'
    && ['FITBOX_USER_NOT_FOUND', 'FITBOX_LOOKUP_IDENTITY_MISMATCH'].includes(profileJob.last_error_code);

  return (
    <section className="mb-6 border border-xert-steel/30 bg-xert-charcoal/50 p-4" aria-labelledby="fitbox-handoff-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 id="fitbox-handoff-title" className="font-display text-sm uppercase text-xert-offwhite">FitBox</h4>
          <p className="mt-1 font-body text-xs leading-5 text-xert-concrete/50">Membership and billing stay in FitBox. XERT keeps this lead and the verified FitBox ID linked.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || sending || refreshingProfile} aria-label="Refresh FitBox status" title="Refresh FitBox status" className="min-h-11 min-w-11 inline-flex items-center justify-center text-xert-steel disabled:opacity-40">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !state ? (
        <div className="mt-4 flex items-center gap-2 font-body text-xs text-xert-concrete/50"><Loader2 className="h-4 w-4 animate-spin" /> Checking FitBox status…</div>
      ) : linked ? (
        <div className="mt-4 rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 className="h-4 w-4" /><span className="font-display text-xs uppercase">Linked</span></div>
          <p className="mt-2 font-body text-sm text-xert-offwhite">FitBox user {linked.fitbox_user_id}</p>
          <p className="mt-0.5 font-body text-xs text-xert-concrete/50">Provider status: {statusLabel(linked.fitbox_status || 'prospect')}</p>
          {linked.profile_synced_at ? (
            <dl className="mt-3 space-y-1 border-t border-emerald-500/20 pt-3 font-body text-xs text-xert-concrete/70">
              <div><dt className="inline text-xert-concrete/40">FitBox name: </dt><dd className="inline">{[linked.profile_first_name, linked.profile_last_name].filter(Boolean).join(' ') || 'Not supplied'}</dd></div>
              <div><dt className="inline text-xert-concrete/40">FitBox email: </dt><dd className="inline break-all">{linked.profile_email || 'Not supplied'}</dd></div>
              <div><dt className="inline text-xert-concrete/40">FitBox phone: </dt><dd className="inline">{linked.profile_phone || 'Not supplied'}</dd></div>
              <div><dt className="inline text-xert-concrete/40">Read-only snapshot: </dt><dd className="inline">{new Date(linked.profile_synced_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
            </dl>
          ) : <p className="mt-2 font-body text-xs text-xert-concrete/50">No FitBox profile snapshot yet.</p>}
          {['failed', 'expired'].includes(profileJob?.status) && (
            <p className={`mt-3 font-body text-xs leading-5 ${profileNeedsReview ? 'text-amber-200' : 'text-red-200'}`}>
              {ERROR_LABELS[profileJob.last_error_code] || 'The previous read-only profile refresh did not complete.'}
            </p>
          )}
          <button
            type="button"
            onClick={() => void refreshProfile()}
            disabled={loading || sending || refreshingProfile || profileInProgress || state?.profile_refresh_ready === false || profileNeedsReview}
            className="mt-3 min-h-11 w-full inline-flex items-center justify-center gap-2 border border-emerald-400/35 px-4 font-display text-xs uppercase text-emerald-100 disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${(refreshingProfile || profileInProgress) ? 'animate-spin' : ''}`} />
            {profileInProgress ? 'Refreshing FitBox profile…' : 'Refresh read-only profile'}
          </button>
          {state?.profile_refresh_ready === false && <p className="mt-2 font-body text-xs text-amber-200">{state.profile_refresh_issue}</p>}
          <p className="mt-2 font-body text-[11px] leading-4 text-xert-concrete/45">Reads name, email, phone and provider status only. XERT profile, membership, bookings and billing are never changed.</p>
        </div>
      ) : inProgress ? (
        <div className="mt-4 rounded-sm border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-amber-300">{job?.status === 'dispatch_unknown' ? <TriangleAlert className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}<span className="font-display text-xs uppercase">{job?.status === 'dispatch_unknown' ? 'Check FitBox before retrying' : 'Handoff in progress'}</span></div>
          <p className="mt-2 font-body text-xs leading-5 text-xert-concrete/60">{job?.status === 'dispatch_unknown' ? ERROR_LABELS.ZAPIER_DISPATCH_OUTCOME_UNKNOWN : 'Zapier accepted the request. Refresh shortly to see the verified FitBox ID.'}</p>
        </div>
      ) : confirming ? (
        <div className="mt-4 rounded-sm border border-xert-red/40 bg-xert-red/10 p-3">
          <p className="font-display text-xs uppercase text-xert-offwhite">Create this FitBox prospect?</p>
          <dl className="mt-3 space-y-1 font-body text-xs text-xert-concrete/70">
            <div><dt className="inline text-xert-concrete/40">Name: </dt><dd className="inline">{lead.full_name}</dd></div>
            <div><dt className="inline text-xert-concrete/40">Email: </dt><dd className="inline break-all">{lead.email}</dd></div>
            <div><dt className="inline text-xert-concrete/40">Phone: </dt><dd className="inline">{lead.phone || 'Missing'}</dd></div>
          </dl>
          <p className="mt-3 font-body text-xs leading-5 text-xert-concrete/50">These contact details will be sent through Zapier to FitBox. This creates a prospect only—not a membership, subscription or charge.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={sending} className="min-h-11 border border-xert-steel/40 px-3 font-display text-xs uppercase text-xert-concrete">Cancel</button>
            <button type="button" onClick={() => void send()} disabled={sending} className="min-h-11 inline-flex items-center justify-center gap-2 bg-xert-red px-3 font-display text-xs uppercase text-white disabled:opacity-40">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Confirm send
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {failed && <div className="mb-3 flex items-start gap-2 rounded-sm border border-red-500/30 bg-red-500/10 p-3 text-red-200"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><p className="font-body text-xs leading-5">{ERROR_LABELS[job.last_error_code] || 'The previous FitBox handoff did not complete.'}</p></div>}
          {state?.ready === false ? (
            <p className="font-body text-xs leading-5 text-amber-200">{state.configuration_issue}</p>
          ) : needsProviderReview ? (
            <p className="font-body text-xs leading-5 text-amber-200">Search for this email in FitBox and reconcile the existing prospect before sending again. Automatic retry is blocked to prevent duplicates.</p>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} disabled={sending} className="min-h-11 w-full inline-flex items-center justify-center gap-2 bg-xert-steel px-4 font-display text-xs uppercase text-xert-navy hover:bg-xert-pale disabled:opacity-40">
              <ExternalLink className="h-4 w-4" /> {safeToRetry ? 'Retry FitBox handoff' : 'Send to FitBox'}
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-3 font-body text-xs leading-5 text-red-300">{error}</p>}
    </section>
  );
}
