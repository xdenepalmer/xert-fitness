import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Loader2, Mail, RefreshCw, Send, XCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  BROADCAST_AUDIENCES, formatBroadcastSessionLabel, loadAudienceRows, loadBroadcastSessions,
} from '@/lib/adminAudiences';
import {
  EMAIL_BODY_MAX_LENGTH, EMAIL_MAX_RECIPIENTS, EMAIL_SUBJECT_MAX_LENGTH,
  chunkRecipients, emailCampaignPayload, emailCampaignValidationError, emailRecipientsFromRows, mergeCampaignResults,
} from '@/lib/emailCampaigns';
import { listEmailCampaigns, sendBulkEmail } from '@/lib/adminData';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';
import { ADMIN_BUTTON, ADMIN_INPUT, ADMIN_LABEL, ADMIN_PANEL, ADMIN_TEXT } from '@/components/admin/ui';

function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Email members: the email twin of Text members. Same audiences, same tick
 * list, then a subject and a message that the database wraps in the branded
 * XERT layout and sends one-to-one through Resend.
 */
export default function EmailCampaignComposer({ emailEnabled = true, providerReady = true, onSent }) {
  const [audience, setAudience] = useState('members');
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [unchecked, setUnchecked] = useState(() => new Set());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [greeting, setGreeting] = useState(true);
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadBroadcastSessions()
      .then(setSessions)
      .catch(error => toast({ title: 'Could not load classes', description: error.message, variant: 'destructive' }));
    listEmailCampaigns().then(result => setHistory(result.rows)).catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    setOutcome(null);
    setUnchecked(new Set());
    loadAudienceRows(audience, sessionId)
      .then(loaded => { if (active) setRows(loaded); })
      .catch(error => { if (active) { setRows([]); setLoadError(error.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [audience, sessionId, reloadKey]);

  const pool = useMemo(() => emailRecipientsFromRows(rows), [rows]);
  const selected = useMemo(
    () => pool.recipients.filter(recipient => !unchecked.has(recipient.key)),
    [pool.recipients, unchecked],
  );
  const validationError = emailCampaignValidationError({ subject, body, recipients: selected, ctaLabel, ctaUrl });
  const blocked = !emailEnabled
    ? 'Turn automatic emails on under "Automatic emails" before sending to a group.'
    : !providerReady ? 'Add the Resend key to Supabase Vault before sending to a group.' : null;

  const toggle = key => setUnchecked(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const send = async () => {
    setSending(true);
    try {
      // The database paces sends to stay under Resend's rate limit, so a big
      // list goes over in chunks that each join the same campaign record.
      const results = [];
      let campaignId = null;
      for (const chunk of chunkRecipients(selected)) {
        const part = await sendBulkEmail(emailCampaignPayload({ subject, body, recipients: chunk, audience, greeting, ctaLabel, ctaUrl, campaignId }));
        campaignId = campaignId || part?.campaign_id || null;
        results.push(part);
        setOutcome(mergeCampaignResults(results));
      }
      const result = mergeCampaignResults(results);
      setOutcome(result);
      setConfirming(false);
      const problems = Number(result?.skipped || 0) + Number(result?.failed || 0);
      toast({
        title: problems === 0 ? 'Email sent' : 'Email finished with problems',
        description: `${result?.queued || 0} queued${problems ? `, ${problems} not sent` : ''}. The log under "Automatic emails" shows delivery.`,
        variant: problems === 0 ? undefined : 'destructive',
      });
      listEmailCampaigns().then(next => setHistory(next.rows)).catch(() => {});
      onSent?.(result);
    } catch (error) {
      toast({ title: 'Email could not be sent', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const skipped = pool.missingEmail + pool.invalidEmail;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {BROADCAST_AUDIENCES.map(option => {
          const Icon = option.icon;
          const active = audience === option.key;
          return (
            <button key={option.key} type="button" onClick={() => setAudience(option.key)} aria-pressed={active}
              className={`flex min-h-11 flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors ${active ? 'border-xert-steel bg-xert-steel/10' : 'border-white/10 hover:border-xert-steel/50'}`}>
              <span className="flex items-center gap-2 font-display text-sm uppercase text-xert-offwhite">
                <Icon className="h-4 w-4 text-xert-steel" /> {option.label}
              </span>
              <span className="font-body text-xs text-xert-pale/45">{option.detail}</span>
            </button>
          );
        })}
      </div>

      {audience === 'class' && (
        <div>
          <label htmlFor="email-class" className={ADMIN_LABEL}>Class</label>
          <select id="email-class" value={sessionId} onChange={event => setSessionId(event.target.value)} className={ADMIN_INPUT}>
            <option value="">Choose a class…</option>
            {sessions.map(session => (
              <option key={session.id} value={session.id}>{formatBroadcastSessionLabel(session)}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={ADMIN_PANEL}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] p-4">
            <h3 className="font-display text-sm uppercase text-xert-offwhite">
              Recipients <span className="text-xert-steel">{selected.length}</span>
              <span className="text-xert-pale/40"> / {pool.recipients.length}</span>
            </h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => setUnchecked(new Set())} className={`${ADMIN_BUTTON.ghost} px-3 text-xs uppercase`}>All</button>
              <button type="button" onClick={() => setUnchecked(new Set(pool.recipients.map(recipient => recipient.key)))} className={`${ADMIN_BUTTON.ghost} px-3 text-xs uppercase`}>None</button>
            </div>
          </div>
          {loading ? (
            <p role="status" className="px-5 py-8 text-center font-body text-sm text-xert-pale/50">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading recipients…
            </p>
          ) : loadError ? (
            <div className="p-5 text-center">
              <p className="font-body text-sm text-xert-red">{loadError}</p>
              <button type="button" onClick={() => setReloadKey(key => key + 1)} className={`${ADMIN_BUTTON.ghost} mt-3`}>
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            </div>
          ) : audience === 'class' && !sessionId ? (
            <p className="p-5 font-body text-sm text-xert-pale/45">Choose a class to load its sign-ups and roster.</p>
          ) : pool.recipients.length === 0 ? (
            <p className="p-5 font-body text-sm text-xert-pale/45">
              Nobody in this group has an email address on file{skipped ? ` (${skipped} without one)` : ''}.
            </p>
          ) : (
            <>
              <ul className="max-h-96 divide-y divide-white/[0.06] overflow-y-auto">
                {pool.recipients.map(recipient => {
                  const checked = !unchecked.has(recipient.key);
                  return (
                    <li key={recipient.key}>
                      <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 hover:bg-white/[0.03]">
                        <input type="checkbox" checked={checked} onChange={() => toggle(recipient.key)} className="peer sr-only" />
                        <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${checked ? 'border-xert-steel bg-xert-steel text-xert-navy' : 'border-xert-steel/40'} peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite`}>
                          {checked && <span className="text-xs">&#10003;</span>}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-body text-sm ${checked ? 'text-xert-offwhite' : 'text-xert-pale/40 line-through'}`}>{recipient.name}</span>
                          <span className="block truncate font-body text-xs text-xert-pale/40">{recipient.email}{recipient.detail ? ` · ${recipient.detail}` : ''}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {(skipped > 0 || pool.duplicates > 0) && (
                <p className="border-t border-white/[0.06] p-3 font-body text-xs text-xert-pale/40">
                  {[
                    skipped > 0 && `${skipped} ${skipped === 1 ? 'person' : 'people'} skipped (no email address)`,
                    pool.duplicates > 0 && `${pool.duplicates} duplicate ${pool.duplicates === 1 ? 'address' : 'addresses'} merged`,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
            </>
          )}
        </section>

        <section className="space-y-4">
          <div className={`${ADMIN_PANEL} space-y-4 p-4`}>
            <div>
              <label htmlFor="email-subject" className={ADMIN_LABEL}>Subject</label>
              <input id="email-subject" value={subject} maxLength={EMAIL_SUBJECT_MAX_LENGTH} onChange={event => setSubject(event.target.value)}
                placeholder="What is this email about?" className={ADMIN_INPUT} />
            </div>
            <div>
              <label htmlFor="email-body" className={ADMIN_LABEL}>Message</label>
              <textarea id="email-body" rows={8} value={body} maxLength={EMAIL_BODY_MAX_LENGTH} onChange={event => setBody(event.target.value)}
                placeholder="Write it the way you would say it. Leave a blank line between paragraphs." className={`${ADMIN_INPUT} resize-y`} />
              <p className="mt-2 font-body text-xs text-xert-pale/40">{body.trim().length} / {EMAIL_BODY_MAX_LENGTH} characters · sent inside the XERT branded layout with your logo</p>
            </div>
            <label className="flex items-center gap-3 font-body text-sm text-xert-pale/80">
              <input type="checkbox" checked={greeting} onChange={event => setGreeting(event.target.checked)} className="size-4 accent-xert-steel" />
              Start each email with “Hi &lt;first name&gt;,”
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="email-cta-label" className={ADMIN_LABEL}>Button (optional)</label>
                <input id="email-cta-label" value={ctaLabel} maxLength={60} onChange={event => setCtaLabel(event.target.value)} placeholder="See the timetable" className={ADMIN_INPUT} />
              </div>
              <div>
                <label htmlFor="email-cta-url" className={ADMIN_LABEL}>Button link</label>
                <input id="email-cta-url" type="url" value={ctaUrl} onChange={event => setCtaUrl(event.target.value)} placeholder="https://xertfitness.com.au/timetable" className={ADMIN_INPUT} />
              </div>
            </div>
          </div>

          <button type="button" disabled={Boolean(validationError) || Boolean(blocked) || sending} onClick={() => setConfirming(true)}
            title={blocked || validationError || `Email ${selected.length} ${selected.length === 1 ? 'person' : 'people'}`}
            className={`${ADMIN_BUTTON.primary} min-h-12 w-full`}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Email {selected.length} {selected.length === 1 ? 'person' : 'people'}
          </button>
          {blocked ? (
            <p className="font-body text-xs text-amber-200/80">{blocked}</p>
          ) : validationError && (subject.trim() || body.trim()) ? (
            <p className="font-body text-xs text-xert-pale/45">{validationError}</p>
          ) : null}
          <p className="font-body text-xs leading-relaxed text-xert-pale/35">
            Limit {EMAIL_MAX_RECIPIENTS} people per send. Everyone gets their own copy; nobody sees anyone else&apos;s address.
            Replies go to the reply-to address set under Automatic emails. Only email people who expect to hear from XERT.
          </p>

          {outcome && (
            <div className={ADMIN_PANEL}>
              <p className="flex items-center gap-2 border-b border-white/[0.06] p-4 font-display text-sm uppercase text-xert-offwhite">
                <Mail className="h-4 w-4 text-xert-steel" />
                {outcome.queued} queued{outcome.skipped || outcome.failed ? `, ${Number(outcome.skipped || 0) + Number(outcome.failed || 0)} not sent` : ''}
              </p>
              <ul className="max-h-56 divide-y divide-white/[0.06] overflow-y-auto">
                {(outcome.results || []).map(result => (
                  <li key={result.email} className="flex items-center gap-3 px-4 py-2">
                    {result.status === 'queued'
                      ? <CheckCheck className="h-4 w-4 shrink-0 text-green-500" aria-label="Queued" />
                      : <XCircle className="h-4 w-4 shrink-0 text-xert-red" aria-label="Not sent" />}
                    <span className="min-w-0 flex-1 truncate font-body text-sm text-xert-offwhite">{result.name || result.email}</span>
                    <span className="truncate font-body text-xs text-xert-pale/40">{result.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {history.length > 0 && (
        <section className={`${ADMIN_PANEL} p-5`}>
          <h3 className={ADMIN_TEXT.sectionHeading}>Emails you have sent</h3>
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {history.map(campaign => (
              <li key={campaign.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-body text-sm text-xert-offwhite">{campaign.subject}</p>
                  <p className="truncate font-body text-xs text-xert-pale/55">{when(campaign.created_at)}{campaign.audience ? ` · ${BROADCAST_AUDIENCES.find(option => option.key === campaign.audience)?.label || campaign.audience}` : ''}</p>
                </div>
                <p className="font-body text-xs text-xert-pale/60">{campaign.queued_count} of {campaign.recipient_count} queued{campaign.skipped_count ? ` · ${campaign.skipped_count} not sent` : ''}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AdminConfirmDialog
        open={confirming}
        title={`Email ${selected.length} ${selected.length === 1 ? 'person' : 'people'}?`}
        description={`“${subject.trim()}” goes to each ticked person from ${'XERT Fitness'} in the branded layout. This cannot be recalled once sent.`}
        confirmLabel={sending ? 'Sending…' : 'Send email now'}
        busy={sending}
        onOpenChange={open => { if (!open && !sending) setConfirming(false); }}
        onConfirm={() => void send()}
      />
    </div>
  );
}
