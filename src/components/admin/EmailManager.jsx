import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, History, Loader2, Mail, RefreshCw, RotateCcw, Send, TriangleAlert } from 'lucide-react';
import { EMAIL_TYPE_LABELS, emailConfirmedBookings, getEmailSettings, listEmailLog, retryFailedEmails, saveEmailSettings, sendTestEmail } from '@/lib/adminData';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';
import { toast } from '@/components/ui/use-toast';
import AdminLoadError from '@/components/admin/AdminLoadError';
import EmailCampaignComposer from '@/components/admin/EmailCampaignComposer';
import { ADMIN_BUTTON, ADMIN_INPUT, ADMIN_PAGE, ADMIN_PANEL, ADMIN_TEXT } from '@/components/admin/ui';

function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusChip({ value }) {
  const tone = { sent: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200', delivered: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200', queued: 'border-amber-300/35 bg-amber-300/10 text-amber-200', failed: 'border-red-300/35 bg-red-300/10 text-red-200', skipped: 'border-white/10 bg-white/[0.04] text-xert-pale/60' }[value] || 'border-white/10 bg-white/[0.04] text-xert-pale/60';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 font-body text-[10px] uppercase tracking-[0.14em] ${tone}`}>{value || 'unknown'}</span>;
}

function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className="flex items-start justify-between gap-4 py-3">
      <span>
        <span className="block font-body text-sm text-xert-offwhite">{label}</span>
        {description && <span className="block font-body text-xs text-xert-pale/55">{description}</span>}
      </span>
      <input type="checkbox" role="switch" aria-checked={checked} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} className="mt-1 size-5 shrink-0 accent-xert-steel" />
    </label>
  );
}

export default function EmailManager({ initialTab = 'send' }) {
  const [installed, setInstalled] = useState(true);
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(null);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [tab, setTab] = useState(initialTab === 'automatic' ? 'automatic' : 'send');
  const [catchUpOpen, setCatchUpOpen] = useState(false);
  const [catchingUp, setCatchingUp] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [state, logState] = await Promise.all([getEmailSettings(), listEmailLog()]);
      setInstalled(state.installed && logState.installed);
      setSettings(state.settings);
      setDraft(state.settings ? { ...state.settings, types: { ...(state.settings.types || {}) } } : null);
      setLog(logState.rows);
    } catch (loadError) {
      setError(loadError.message || 'Email settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dirty = draft && settings && JSON.stringify(draft) !== JSON.stringify(settings);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const next = await saveEmailSettings({
        enabled: draft.enabled,
        from_name: draft.from_name,
        from_address: draft.from_address,
        reply_to: draft.reply_to,
        owner_alert_email: draft.owner_alert_email,
        types: draft.types,
      });
      setSettings(next);
      setDraft({ ...next, types: { ...(next.types || {}) } });
      toast({ title: 'Email settings saved' });
    } catch (saveError) {
      toast({ title: 'Could not save email settings', description: saveError.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const test = async event => {
    event.preventDefault();
    setTesting(true);
    try {
      const result = await sendTestEmail(testTo);
      toast({ title: result?.status === 'failed' || result?.status === 'skipped' ? 'Test email was not sent' : 'Test email queued', description: result?.error || `Check ${testTo} in a minute, then refresh the log below.`, variant: result?.error ? 'destructive' : undefined });
      await load();
    } catch (testError) {
      toast({ title: 'Test email failed', description: testError.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const catchUp = async () => {
    setCatchingUp(true);
    try {
      // Paced in batches of 40; keep going until nobody is left waiting.
      let result = await emailConfirmedBookings();
      for (let round = 0; round < 20 && Number(result?.remaining || 0) > 0; round += 1) {
        const next = await emailConfirmedBookings();
        result = { ...next, queued: result.queued + Number(next.queued || 0), skipped: result.skipped + Number(next.skipped || 0) };
      }
      setCatchUpOpen(false);
      toast({
        title: result?.queued ? `${result.queued} confirmation email${result.queued === 1 ? '' : 's'} queued` : 'Nobody was waiting on a confirmation',
        description: `${result?.already_emailed || 0} already had one${result?.skipped ? `, ${result.skipped} skipped (see the log)` : ''}.`,
        variant: result?.skipped ? 'destructive' : undefined,
      });
      await load();
    } catch (catchUpError) {
      toast({ title: 'Catch-up failed', description: catchUpError.message, variant: 'destructive' });
    } finally {
      setCatchingUp(false);
    }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      const result = await retryFailedEmails();
      toast({
        title: result?.retried ? `${result.retried} email${result.retried === 1 ? '' : 's'} sent again` : 'Nothing to retry',
        description: result?.remaining ? `${result.remaining} more still waiting; press again in a moment.` : 'Refresh the log in a minute to see delivery.',
      });
      await load();
    } catch (retryError) {
      toast({ title: 'Retry failed', description: retryError.message, variant: 'destructive' });
    } finally {
      setRetrying(false);
    }
  };
  const retryable = log.filter(row => row.status === 'failed' && /^(HTTP 429|HTTP 5|HANDOFF_FAILED|HTTP timeout)/.test(row.error || '')).length;

  return (
    <div className={`${ADMIN_PAGE} space-y-5`}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={ADMIN_TEXT.sectionHeading}>Communications</p>
          <h2 className={ADMIN_TEXT.pageTitle}>Email members</h2>
          <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-xert-pale/65">Write an email to any group, the same way you text members. XERT also sends automatic emails from your domain when bookings are confirmed, classes are cancelled, enquiries arrive and members join.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className={`${ADMIN_BUTTON.ghost} min-h-11 px-4`}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
        </button>
      </header>

      {error ? <AdminLoadError message={error} onRetry={() => void load()} /> : !installed ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300/35 bg-amber-300/10 p-4" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-200" />
          <p className="font-body text-sm leading-relaxed text-amber-100/80">Email is not installed yet. Apply <code className="font-mono text-xs">supabase/migrations/20260903010000_email_notifications.sql</code>, add the Resend key to Supabase Vault as described in docs/EMAIL_RESEND_SETUP.md, then refresh.</p>
        </div>
      ) : loading || !draft ? (
        <div className={`${ADMIN_PANEL} h-40 animate-pulse`} role="status" aria-label="Loading email settings" />
      ) : (
        <>
          <div role="tablist" aria-label="Email" className="flex gap-2 overflow-x-auto">
            {[['send', 'Send an email'], ['automatic', 'Automatic emails']].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`${tab === key ? ADMIN_BUTTON.primary : ADMIN_BUTTON.ghost} shrink-0 px-4`}>{label}</button>
            ))}
          </div>

          {tab === 'send' && (
            <EmailCampaignComposer emailEnabled={Boolean(settings?.enabled)} providerReady={Boolean(settings?.provider_ready)} onSent={() => void load()} />
          )}

          {tab === 'automatic' && (<>
          <section className={`${ADMIN_PANEL} p-5`}>
            <div className="flex items-start gap-3">
              <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${draft.enabled ? 'bg-emerald-300/15 text-emerald-200' : 'bg-amber-300/15 text-amber-200'}`}><Mail className="size-5" /></div>
              <div className="flex-1">
                <Toggle checked={Boolean(draft.enabled)} onChange={value => setDraft({ ...draft, enabled: value })} label={draft.enabled ? 'Automatic emails are on' : 'Automatic emails are off'} description="Master switch. When off, every email is logged as skipped and nothing leaves XERT." />
                {!settings?.provider_ready && <p className="mt-1 flex items-center gap-2 font-body text-xs text-amber-200"><TriangleAlert className="size-3.5" /> The Resend key is not in Supabase Vault yet, so sends will be skipped.</p>}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block"><span className={ADMIN_TEXT.sectionHeading}>From name</span><input value={draft.from_name || ''} onChange={event => setDraft({ ...draft, from_name: event.target.value })} className={`${ADMIN_INPUT} mt-1`} /></label>
              <label className="block"><span className={ADMIN_TEXT.sectionHeading}>From address</span><input type="email" value={draft.from_address || ''} onChange={event => setDraft({ ...draft, from_address: event.target.value })} className={`${ADMIN_INPUT} mt-1`} placeholder="hello@contact.xertfitness.com.au" /></label>
              <label className="block"><span className={ADMIN_TEXT.sectionHeading}>Replies go to</span><input type="email" value={draft.reply_to || ''} onChange={event => setDraft({ ...draft, reply_to: event.target.value })} className={`${ADMIN_INPUT} mt-1`} placeholder="Your inbox" /></label>
              <label className="block"><span className={ADMIN_TEXT.sectionHeading}>Owner alerts to</span><input type="email" value={draft.owner_alert_email || ''} onChange={event => setDraft({ ...draft, owner_alert_email: event.target.value })} className={`${ADMIN_INPUT} mt-1`} placeholder="Where new enquiries are announced" /></label>
            </div>
            <p className="mt-2 font-body text-xs text-xert-pale/50">The from address must be on a domain verified in Resend.</p>
          </section>

          <section className={`${ADMIN_PANEL} p-5`}>
            <h3 className={ADMIN_TEXT.sectionHeading}>Which emails to send</h3>
            <div className="mt-1 divide-y divide-white/[0.06]">
              {Object.entries(EMAIL_TYPE_LABELS).map(([key, label]) => (
                <Toggle key={key} checked={draft.types?.[key] !== false} onChange={value => setDraft({ ...draft, types: { ...(draft.types || {}), [key]: value } })} label={label} disabled={!draft.enabled} />
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => void save()} disabled={!dirty || saving} className={`${ADMIN_BUTTON.primary} min-h-11 px-5`}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Save email settings
            </button>
            <form onSubmit={test} className="flex flex-col gap-2 sm:flex-row">
              <input type="email" required value={testTo} onChange={event => setTestTo(event.target.value)} placeholder="Send a test to…" aria-label="Test email address" className={`${ADMIN_INPUT} sm:w-64`} />
              <button type="submit" disabled={testing || !testTo} className={`${ADMIN_BUTTON.ghost} min-h-11 px-4`}>
                {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send test
              </button>
            </form>
          </div>

          <section className={`${ADMIN_PANEL} p-5`}>
            <h3 className={ADMIN_TEXT.sectionHeading}>Catch up on earlier confirmations</h3>
            <p className="mt-2 font-body text-sm leading-relaxed text-xert-pale/65">Confirmed a class before email was switched on? This sends the “You are booked in” email to everyone confirmed for an upcoming class who has not received one. Nobody gets it twice.</p>
            <button type="button" onClick={() => setCatchUpOpen(true)} disabled={!draft.enabled || catchingUp} className={`${ADMIN_BUTTON.ghost} mt-3`}>
              {catchingUp ? <Loader2 className="size-4 animate-spin" /> : <History className="size-4" />} Email everyone already confirmed
            </button>
          </section>

          <section className={`${ADMIN_PANEL} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className={ADMIN_TEXT.sectionHeading}>Recent emails</h3>
              {retryable > 0 && (
                <button type="button" onClick={() => void retry()} disabled={retrying} className={`${ADMIN_BUTTON.ghost} min-h-10 px-3 text-xs`}>
                  {retrying ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Retry {retryable} failed
                </button>
              )}
            </div>
            {log.length === 0 ? <p className="mt-3 font-body text-sm text-xert-pale/55">Nothing sent yet.</p> : (
              <ul className="mt-3 divide-y divide-white/[0.06]">
                {log.map(row => (
                  <li key={row.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-body text-sm text-xert-offwhite">{row.subject || EMAIL_TYPE_LABELS[row.email_type] || row.email_type}</p>
                      <p className="truncate font-body text-xs text-xert-pale/55">{row.recipient} · {EMAIL_TYPE_LABELS[row.email_type] || row.email_type} · {when(row.sent_at || row.created_at)}{row.error ? ` · ${row.error}` : ''}</p>
                    </div>
                    <StatusChip value={row.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          </>)}
        </>
      )}
      <AdminConfirmDialog
        open={catchUpOpen}
        title="Email everyone already confirmed?"
        description="Each person confirmed for an upcoming class who has not had a confirmation email gets the branded “You are booked in” email now."
        confirmLabel={catchingUp ? 'Sending…' : 'Send confirmations'}
        busy={catchingUp}
        onOpenChange={open => { if (!open && !catchingUp) setCatchUpOpen(false); }}
        onConfirm={() => void catchUp()}
      />
    </div>
  );
}
