import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCheck, Loader2, MessageSquareText, RefreshCw, Send, XCircle,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  BROADCAST_AUDIENCES as AUDIENCES, formatBroadcastSessionLabel as formatSessionLabel,
  loadAudienceRows, loadBroadcastSessions,
} from '@/lib/adminAudiences';
import {
  SMS_MAX_RECIPIENTS, recipientsFromRows, smsCampaignValidationError, smsSegments,
} from '@/lib/smsCampaigns';
import { sendAdminSms } from '@/lib/smsSend';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';
import { ADMIN_INPUT, ADMIN_PAGE, ADMIN_TEXT } from '@/components/admin/ui';

const inputCls = ADMIN_INPUT;

export default function SmsManager() {
  const [audience, setAudience] = useState('members');
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [unchecked, setUnchecked] = useState(() => new Set());
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    loadBroadcastSessions()
      .then(setSessions)
      .catch(error => toast({ title: 'Could not load classes', description: error.message, variant: 'destructive' }));
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
  }, [audience, sessionId]);

  const pool = useMemo(() => recipientsFromRows(rows), [rows]);
  const selected = useMemo(
    () => pool.recipients.filter(recipient => !unchecked.has(recipient.key)),
    [pool.recipients, unchecked],
  );
  const segments = useMemo(() => smsSegments(message), [message]);
  const validationError = smsCampaignValidationError({ message, recipients: selected });

  const toggle = key => setUnchecked(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const send = async () => {
    setSending(true);
    try {
      const result = await sendAdminSms({ message, recipients: selected });
      setOutcome(result);
      setConfirming(false);
      toast({
        title: result.failed === 0 ? 'SMS campaign sent' : 'SMS campaign finished with failures',
        description: `${result.sent} sent${result.failed ? `, ${result.failed} failed` : ''}.`,
        variant: result.failed === 0 ? undefined : 'destructive',
      });
    } catch (error) {
      toast({ title: 'SMS sending failed', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const skipped = pool.missingPhone + pool.invalidPhone;

  return (
    <div className={`${ADMIN_PAGE} space-y-6`}>
      <div>
        <h2 className={ADMIN_TEXT.pageTitle}>Text Members</h2>
        <p className="mt-1 font-body text-sm text-xert-concrete/50">
          Send an SMS through Twilio to any group with a mobile number on file. Untick anyone who should not receive it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {AUDIENCES.map(option => {
          const Icon = option.icon;
          const active = audience === option.key;
          return (
            <button key={option.key} type="button" onClick={() => setAudience(option.key)} aria-pressed={active}
              className={`flex min-h-11 flex-col items-start gap-1 border p-3 text-left transition-colors ${active ? 'border-xert-steel bg-xert-steel/10' : 'border-xert-steel/20 hover:border-xert-steel/50'}`}>
              <span className="flex items-center gap-2 font-display text-sm uppercase text-xert-offwhite">
                <Icon className="h-4 w-4 text-xert-steel" /> {option.label}
              </span>
              <span className="font-body text-xs text-xert-concrete/45">{option.detail}</span>
            </button>
          );
        })}
      </div>

      {audience === 'class' && (
        <div>
          <label htmlFor="sms-class" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Class</label>
          <select id="sms-class" value={sessionId} onChange={event => setSessionId(event.target.value)} className={inputCls}>
            <option value="">Choose a class…</option>
            {sessions.map(session => (
              <option key={session.id} value={session.id}>{formatSessionLabel(session)}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recipients */}
        <section className="border border-xert-steel/20 bg-xert-ink">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-xert-steel/15 p-4">
            <h3 className="font-display text-sm uppercase text-xert-offwhite">
              Recipients <span className="text-xert-steel">{selected.length}</span>
              <span className="text-xert-concrete/40"> / {pool.recipients.length}</span>
            </h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => setUnchecked(new Set())}
                className="min-h-11 border border-xert-steel/30 px-3 font-body text-xs uppercase text-xert-concrete/60 hover:border-xert-steel hover:text-xert-offwhite transition-colors">
                All
              </button>
              <button type="button" onClick={() => setUnchecked(new Set(pool.recipients.map(recipient => recipient.key)))}
                className="min-h-11 border border-xert-steel/30 px-3 font-body text-xs uppercase text-xert-concrete/60 hover:border-xert-steel hover:text-xert-offwhite transition-colors">
                None
              </button>
            </div>
          </div>
          {loading ? (
            <p role="status" className={`${ADMIN_PAGE} text-center font-body text-sm text-xert-concrete/50`}>
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading recipients…
            </p>
          ) : loadError ? (
            <div className="p-5 text-center">
              <p className="font-body text-sm text-xert-red">{loadError}</p>
              <button type="button" onClick={() => setAudience(current => `${current}`)}
                className="mt-3 inline-flex min-h-11 items-center gap-2 border border-xert-steel/40 px-4 font-display text-xs uppercase text-xert-offwhite">
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            </div>
          ) : audience === 'class' && !sessionId ? (
            <p className={`${ADMIN_PAGE} font-body text-sm text-xert-concrete/45`}>Choose a class to load its sign-ups and roster.</p>
          ) : pool.recipients.length === 0 ? (
            <p className={`${ADMIN_PAGE} font-body text-sm text-xert-concrete/45`}>
              Nobody in this group has a usable Australian mobile number{skipped ? ` (${skipped} without one)` : ''}.
            </p>
          ) : (
            <>
              <ul className="max-h-96 divide-y divide-xert-steel/10 overflow-y-auto">
                {pool.recipients.map(recipient => {
                  const checked = !unchecked.has(recipient.key);
                  return (
                    <li key={recipient.key}>
                      <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 hover:bg-xert-steel/5">
                        <input type="checkbox" checked={checked} onChange={() => toggle(recipient.key)} className="peer sr-only" />
                        <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${checked ? 'border-xert-steel bg-xert-steel text-xert-navy' : 'border-xert-steel/40'} peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite`}>
                          {checked && <span className="text-xs">&#10003;</span>}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-body text-sm ${checked ? 'text-xert-offwhite' : 'text-xert-concrete/40 line-through'}`}>{recipient.name}</span>
                          <span className="block truncate font-body text-xs text-xert-concrete/40">{recipient.phone}{recipient.detail ? ` · ${recipient.detail}` : ''}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {(skipped > 0 || pool.duplicates > 0) && (
                <p className="border-t border-xert-steel/10 p-3 font-body text-xs text-xert-concrete/40">
                  {[
                    skipped > 0 && `${skipped} ${skipped === 1 ? 'person' : 'people'} skipped (no valid mobile)`,
                    pool.duplicates > 0 && `${pool.duplicates} duplicate ${pool.duplicates === 1 ? 'number' : 'numbers'} merged`,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
            </>
          )}
        </section>

        {/* Composer */}
        <section className="space-y-4">
          <div className="border border-xert-steel/20 bg-xert-ink p-4">
            <label htmlFor="sms-message" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Message</label>
            <textarea id="sms-message" rows={6} value={message} onChange={event => setMessage(event.target.value)}
              placeholder="Hi from XERT — " className={`${inputCls} resize-none`} />
            <p className="mt-2 flex flex-wrap justify-between gap-2 font-body text-xs text-xert-concrete/40">
              <span>{segments.characters} characters · {segments.segments || 0} SMS segment{segments.segments === 1 ? '' : 's'} per person{segments.encoding === 'UCS-2' ? ' · emoji/unicode shortens segments' : ''}</span>
              {selected.length > 0 && segments.segments > 0 && (
                <span>{selected.length * segments.segments} total segment{selected.length * segments.segments === 1 ? '' : 's'}</span>
              )}
            </p>
          </div>

          <button type="button" disabled={Boolean(validationError) || sending} onClick={() => setConfirming(true)}
            title={validationError || `Send to ${selected.length} ${selected.length === 1 ? 'person' : 'people'}`}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-xert-steel px-5 font-display text-sm uppercase text-xert-navy transition-colors hover:bg-xert-pale disabled:opacity-40">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send to {selected.length} {selected.length === 1 ? 'person' : 'people'}
          </button>
          {validationError && message.trim() && (
            <p className="font-body text-xs text-xert-concrete/45">{validationError}</p>
          )}
          <p className="font-body text-xs leading-relaxed text-xert-concrete/35">
            Limit {SMS_MAX_RECIPIENTS} people per send. Replies go to the Twilio number, not the app.
            Only message people who expect to hear from XERT.
          </p>

          {outcome && (
            <div className="border border-xert-steel/20 bg-xert-ink">
              <p className="flex items-center gap-2 border-b border-xert-steel/15 p-4 font-display text-sm uppercase text-xert-offwhite">
                <MessageSquareText className="h-4 w-4 text-xert-steel" />
                {outcome.sent} sent{outcome.failed ? `, ${outcome.failed} failed` : ''}
              </p>
              <ul className="max-h-56 divide-y divide-xert-steel/10 overflow-y-auto">
                {outcome.results.map(result => (
                  <li key={result.phone} className="flex items-center gap-3 px-4 py-2">
                    {result.ok
                      ? <CheckCheck className="h-4 w-4 shrink-0 text-green-500" aria-label="Sent" />
                      : <XCircle className="h-4 w-4 shrink-0 text-xert-red" aria-label="Failed" />}
                    <span className="min-w-0 flex-1 truncate font-body text-sm text-xert-offwhite">{result.name}</span>
                    <span className="truncate font-body text-xs text-xert-concrete/40">{result.ok ? result.status : result.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <AdminConfirmDialog
        open={confirming}
        title={`Text ${selected.length} ${selected.length === 1 ? 'person' : 'people'}?`}
        description={`Each person gets ${segments.segments} SMS segment${segments.segments === 1 ? '' : 's'} from the XERT Twilio number. This cannot be recalled once sent.`}
        warning={undefined}
        confirmLabel={sending ? 'Sending…' : 'Send SMS now'}
        busy={sending}
        onOpenChange={open => { if (!open && !sending) setConfirming(false); }}
        onConfirm={() => void send()}
      />
    </div>
  );
}
