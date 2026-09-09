import React from 'react';
import { Activity, CheckCircle2, Mail, Phone, RefreshCw, UserRoundSearch } from 'lucide-react';
import { createFollowUpCopy } from '@/lib/memberFollowUp';
import { activationQueuePresentation, activationSnapshotPresentation } from '@/lib/memberActivation';
import AdminLoadError from '@/components/admin/AdminLoadError';
import { AdminStatCard, AdminSkeleton, AdminEmptyState } from '@/components/admin/ui';

function QueueLoading({label}) {
  return <div role="status" aria-label={label}>{[0,1,2].map(index => <div key={index} aria-hidden="true" className="members-queue-row" data-member-placeholder="queue"><div className="members-stack"><AdminSkeleton decorative size="title" /><AdminSkeleton decorative /><AdminSkeleton decorative size="medium" /></div><div className="members-actions">{[0,1,2,3].map(value => <AdminSkeleton decorative variant="control" key={value} />)}</div></div>)}</div>;
}
function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const FOLLOW_UP_LABELS = {
  no_first_booking: 'No first booking',
  credits_expiring: 'Credits expiring',
  idle_credits: 'Credits inactive',
  renewal_due: 'Renewal due'
};

function followUpDetail(member) {
  if (member.reason === 'no_first_booking') return `Joined ${fmtDate(member.joined_at)}`;
  if (member.reason === 'credits_expiring') {
    const count = Number(member.credits_expiring);
    return `${count} credit${count === 1 ? '' : 's'} expire ${fmtDate(member.next_credit_expiry)}`;
  }
  return `${Number(member.credits_remaining)} credit${Number(member.credits_remaining) === 1 ? '' : 's'} · ${member.last_attended_at ? `Last class ${fmtDate(member.last_attended_at)}` : 'No attended class'}`;
}

export function ActivationCockpit({
  overview,
  overviewAvailable,
  overviewError,
  overviewLoading,
  queue,
  queueAvailable,
  queueError,
  queueLoading,
  onRetry,
  onView,
  onLog,
  disabled = false,
}) {
  const presentation = overview ? activationSnapshotPresentation(overview) : null;
  const actionRows = activationQueuePresentation(queue, 12);
  const outreachAllowed = !queueError && !queueLoading && !disabled;
  const hasSnapshotWarning = Boolean(overviewError || presentation?.partial || presentation?.inconsistent || presentation?.stale);

  return (
    <section aria-labelledby="member-activation-title" className="members-card members-queue">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="member-activation-title" className="flex flex-wrap items-center gap-2 font-display text-base uppercase text-text-primary">
            <Activity className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" /> Member activation
          </h3>
          <p className="mt-1 max-w-2xl font-body text-sm leading-relaxed text-text-secondary">
            Authoritative 30-day account cohort. Each step comes from current setup, training access, booking and recorded attendance — not page views.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={overviewLoading || queueLoading}
          className="admin-kit-button"
        >
          <RefreshCw className={`h-4 w-4 ${(overviewLoading || queueLoading) ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {!overview && overviewLoading ? (
        <div className="members-stats" role="status" aria-label="Loading member activation funnel">
          {[1,2,3,4,5,6].map(item => <div key={item} aria-hidden="true" className="members-card members-stack" data-member-placeholder="metric"><AdminSkeleton decorative size="short" /><AdminSkeleton decorative size="title" /><AdminSkeleton decorative /><AdminSkeleton decorative size="medium" /></div>)}
        </div>
      ) : !overviewAvailable ? (
        <p className="mt-4 border border-state-warning/35 bg-state-warning/10 p-3 font-body text-sm text-state-warning" role="status">
          Activation reporting is paused until the member activation upgrade is applied.
        </p>
      ) : !overview ? (
        <div className="mt-4">
          <AdminLoadError message={overviewError || 'Member activation reporting is unavailable.'} onRetry={onRetry} />
        </div>
      ) : (
        <>
          {hasSnapshotWarning && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-state-warning/35 bg-state-warning/10 p-3">
              <p role="status" className="font-body text-sm leading-relaxed text-state-warning">
                {overviewError
                  ? 'Showing the last successful activation snapshot. Refresh before making outreach decisions.'
                  : presentation.inconsistent
                    ? 'Activation stages do not form a valid funnel. Treat this snapshot as unavailable and retry.'
                    : presentation.partial
                      ? 'Some activation stages are unavailable. Known counts remain visible.'
                      : 'This activation snapshot is stale. Refresh before making outreach decisions.'}
              </p>
              {presentation.asOf && (
                <span className="font-body text-sm uppercase tracking-wider text-text-secondary">
                  As of {fmtDateTime(presentation.asOf)}
                </span>
              )}
            </div>
          )}

          {overviewLoading && (
            <p className="mt-3 font-body text-sm text-text-secondary" role="status">Refreshing the last activation snapshot…</p>
          )}

          {presentation.asOf && !hasSnapshotWarning && <p className="members-secondary">As of {fmtDateTime(presentation.asOf)}</p>}
          <div className="members-stats">
            {presentation.stages.map(stage => (
              <AdminStatCard key={stage.key} label={stage.label} value={stage.countLabel} detail={stage.detail}><p className="members-secondary">{stage.rateLabel}</p></AdminStatCard>
            ))}
          </div>
        </>
      )}

      <div className="mt-5 border-t border-border-hairline pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-display text-sm uppercase text-text-primary">Activation actions</h4>
            <p className="mt-1 font-body text-sm text-text-secondary">Bounded to the 12 highest-priority members. Outreach remains manual.</p>
          </div>
          {!queueLoading && queueAvailable && !queueError && (
            <span className="font-body text-sm tabular-nums text-text-secondary">{actionRows.length} due</span>
          )}
        </div>

        {queueLoading && actionRows.length === 0 ? (
          <QueueLoading label="Loading activation actions" />
        ) : !queueAvailable ? (
          <p className="mt-3 font-body text-sm text-state-warning" role="status">Activation actions are paused until the member activation upgrade is applied.</p>
        ) : queueError && actionRows.length === 0 ? (
          <div className="mt-3"><AdminLoadError message={queueError} onRetry={onRetry} /></div>
        ) : actionRows.length === 0 ? (
          <AdminEmptyState title="No activation follow-ups are due." description="The current action queue is clear." />
        ) : (
          <>
            {queueError && (
              <p className="mt-3 font-body text-sm text-state-warning" role="status">Showing the last successful action queue. Refresh before contacting members.</p>
            )}
            <div className="mt-3 divide-y border-border-hairline border-t border-border-hairline">
              {actionRows.map(member => {
                const contact = createFollowUpCopy(member, window.location.origin);
                const name = member.full_name || member.email || 'Member';
                return (
                  <div key={member.id} className="members-queue-row">
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm uppercase text-text-primary">{name}</p>
                      <p className="mt-0.5 font-body text-sm text-text-secondary">
                        {member.activationReasonLabel}{member.joined_at ? ` · Joined ${fmtDate(member.joined_at)}` : ''}
                      </p>
                    </div>
                    <div className="members-actions">
                      {member.email && (outreachAllowed ? (
                        <a href={contact.mailto} title={`Draft email to ${name}`} aria-label={`Draft activation email to ${name}`} className="admin-kit-button">
                          <Mail className="h-4 w-4" aria-hidden="true" />
                        </a>
                      ) : (
                        <span aria-disabled="true" title="Refresh activation actions before emailing" className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border-hairline text-text-secondary">
                          <Mail className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Email unavailable until activation actions refresh</span>
                        </span>
                      ))}
                      {member.phone && (outreachAllowed ? (
                        <a href={`tel:${member.phone}`} title={`Call ${name}`} aria-label={`Call ${name} about activation`} className="admin-kit-button">
                          <Phone className="h-4 w-4" aria-hidden="true" />
                        </a>
                      ) : (
                        <span aria-disabled="true" title="Refresh activation actions before calling" className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border-hairline text-text-secondary">
                          <Phone className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Call unavailable until activation actions refresh</span>
                        </span>
                      ))}
                      <button type="button" onClick={() => onLog(member)} disabled={!outreachAllowed} title={outreachAllowed ? `Log activation follow-up with ${name}` : 'Refresh activation actions before logging outreach'} className="admin-kit-button">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Log
                      </button>
                      <button type="button" disabled={disabled} onClick={() => onView(member)} className="admin-kit-button">View</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function FollowUpQueue({ rows, available, error, loading, onRetry, onView, onLog }) {
  return (
    <section aria-labelledby="member-follow-up-title" className="members-card members-queue">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 id="member-follow-up-title" className="flex flex-wrap items-center gap-2 font-display text-sm text-text-primary uppercase">
          <UserRoundSearch className="w-4 h-4 text-text-secondary" /> Follow-up queue
          {!loading && available && <span className="font-body text-sm text-text-secondary">({rows.length})</span>}
        </h3>
      </div>
      {loading ? (
        <QueueLoading label="Loading follow-up queue" />
      ) : error ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="alert" className="font-body text-sm text-state-danger">{error}</p>
          <button type="button" onClick={onRetry} className="admin-kit-button">Retry</button>
        </div>
      ) : !available ? (
        <p className="font-body text-sm text-state-warning" >Follow-ups are paused until admin_member_follow_up_upgrade.sql is applied.</p>
      ) : rows.length === 0 ? (
        <AdminEmptyState title="No follow-ups due." description="No members currently need follow-up." />
      ) : (
        <div className="divide-y border-border-hairline border-t border-border-hairline">
          {rows.map(member => {
            const contact = createFollowUpCopy(member, window.location.origin);
            return (
              <div key={member.id} className="members-queue-row">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm text-text-primary uppercase">{member.full_name || member.email}</p>
                  <p className="font-body text-sm text-text-secondary">
                    {FOLLOW_UP_LABELS[member.reason] || 'Follow-up'} · {followUpDetail(member)}
                  </p>
                </div>
                <div className="members-actions">
                  <a href={contact.mailto} title={`Draft email to ${member.full_name || member.email}`} aria-label={`Draft email to ${member.full_name || member.email}`} className="admin-kit-button">
                    <Mail className="w-4 h-4" />
                  </a>
                  {member.phone && (
                    <a href={`tel:${member.phone}`} title={`Call ${member.full_name || member.email}`} aria-label={`Call ${member.full_name || member.email}`} className="admin-kit-button">
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                  <button type="button" onClick={() => onLog(member)} title={`Log follow-up with ${member.full_name || member.email}`} className="admin-kit-button">
                    <CheckCircle2 className="w-4 h-4" /> Log
                  </button>
                  <button type="button" onClick={() => onView(member)} className="admin-kit-button">View</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
