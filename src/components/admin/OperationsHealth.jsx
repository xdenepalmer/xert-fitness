import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, BellRing, CheckCircle2, CircleAlert, Copy, Database, Loader2,
  RefreshCw, ShieldCheck,
} from 'lucide-react';
import { getOperationsHealth, resolveStripeOperatorReview, retryStripeWebhookEvent } from '@/lib/adminData';
import { toast } from '@/components/ui/use-toast';
import AdminLoadError from '@/components/admin/AdminLoadError';
import { ADMIN_OVERVIEW_REFRESH_INTERVAL_MS, shouldRefreshAdminData } from '@/lib/adminFreshness';
import { orderOperationsHealthChecks } from '@/lib/adminHealth';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';

const STATUS_STYLE = {
  ok: {
    label: 'Ready',
    icon: CheckCircle2,
    color: '#7ec98f',
    bg: 'rgba(126,201,143,0.1)',
    border: 'rgba(126,201,143,0.28)',
  },
  attention: {
    label: 'Needs attention',
    icon: AlertTriangle,
    color: '#e0b36a',
    bg: 'rgba(224,179,106,0.1)',
    border: 'rgba(224,179,106,0.28)',
  },
  error: {
    label: 'Error',
    icon: CircleAlert,
    color: '#f87171',
    bg: 'rgba(248,113,113,0.1)',
    border: 'rgba(248,113,113,0.28)',
  },
};

const ROUTES = {
  products: 'products',
  classes: 'calendar',
  coaches: 'coaches',
  events: 'events',
  cms: 'content',
  orders: 'orders',
  admins: 'gym-members',
  'commerce-config': 'products',
  'push-notifications': 'announcements',
};

export default function OperationsHealth({ onNavigate }) {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pendingResolution, setPendingResolution] = useState(null);
  const [pendingRetry, setPendingRetry] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const requestIdRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(Number.NaN);

  const load = useCallback(async ({ initial = false } = {}) => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    if (initial) setLoading(true);
    else setRefreshing(true);
    setLoadError('');
    try {
      const nextChecks = await getOperationsHealth();
      if (requestId !== requestIdRef.current) return;
      setChecks(nextChecks);
      setLastUpdated(new Date());
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(error.message);
      toast({ title: 'Health check failed', description: error.message, variant: 'destructive' });
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        lastRefreshAtRef.current = Date.now();
      }
      requestInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void load({ initial: true });
    return () => {
      requestIdRef.current += 1;
      requestInFlightRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (shouldRefreshAdminData({
        visibilityState: document.visibilityState,
        lastRefreshAt: lastRefreshAtRef.current,
        minimumAgeMs: ADMIN_OVERVIEW_REFRESH_INTERVAL_MS,
      })) {
        void load();
      }
    };
    const intervalId = window.setInterval(refreshWhenVisible, ADMIN_OVERVIEW_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [load]);

  const summary = useMemo(() => {
    const errors = checks.filter(c => c.status === 'error').length;
    const attention = checks.filter(c => c.status === 'attention').length;
    const ok = checks.filter(c => c.status === 'ok').length;
    return { ok, attention, errors };
  }, [checks]);

  const orderedChecks = useMemo(() => orderOperationsHealthChecks(checks), [checks]);

  const copyIncidentId = useCallback(async eventId => {
    try {
      await navigator.clipboard.writeText(eventId);
      toast({ title: 'Stripe Event ID copied' });
    } catch {
      toast({
        title: 'Could not copy Event ID',
        description: 'Select the Event ID and copy it manually.',
        variant: 'destructive',
      });
    }
  }, []);

  const markIncidentHandled = useCallback(async () => {
    if (!pendingResolution?.event_id || !pendingResolution?.error_code) return;
    setResolving(true);
    try {
      await resolveStripeOperatorReview(pendingResolution.event_id, pendingResolution.error_code);
      setPendingResolution(null);
      toast({ title: 'Stripe incident marked handled' });
      await load();
    } catch (error) {
      toast({ title: 'Could not resolve incident', description: error.message, variant: 'destructive' });
    } finally {
      setResolving(false);
    }
  }, [load, pendingResolution]);

  const retryIncident = useCallback(async () => {
    if (!pendingRetry?.event_id) return;
    setRetrying(true);
    try {
      const result = await retryStripeWebhookEvent(pendingRetry.event_id);
      setPendingRetry(null);
      toast({
        title: result.duplicate ? 'Stripe event was already settled' : 'Stripe event recovered',
        description: result.duplicate
          ? 'Another delivery completed this event before the recovery attempt.'
          : result.status === 'processed'
          ? 'XERT processed the canonical Stripe event and reconciled its records.'
          : 'XERT safely completed the event without a payment record change.',
      });
      await load();
    } catch (error) {
      toast({ title: 'Could not retry Stripe event', description: error.message, variant: 'destructive' });
    } finally {
      setRetrying(false);
    }
  }, [load, pendingRetry]);

  return (
    <div className="p-6 space-y-6">
      <div className="relative p-6 overflow-hidden"
        style={{
          background: 'linear-gradient(120deg, rgba(50,72,90,0.42) 0%, rgba(16,24,32,0.74) 60%)',
          border: '1px solid rgba(123,167,188,0.2)',
        }}>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex items-center justify-center" style={{ backgroundColor: 'rgba(123,167,188,0.16)' }}>
              <ShieldCheck className="w-6 h-6" style={{ color: '#7BA7BC' }} />
            </div>
            <div>
              <p className="font-body text-[11px] uppercase tracking-[0.25em] mb-1" style={{ color: '#7BA7BC' }}>
                Operations Health
              </p>
              <h2 className="font-display text-3xl uppercase leading-none" style={{ color: '#F1F3F4' }}>
                Launch readiness at a glance.
              </h2>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button type="button" onClick={() => void load()} disabled={loading || refreshing}
              className="inline-flex min-h-11 items-center gap-2 px-4 py-2.5 font-body text-xs uppercase tracking-wider border transition-colors disabled:opacity-50"
              style={{ borderColor: 'rgba(123,167,188,0.28)', color: '#D1DDE6' }}>
              {loading || refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
            {lastUpdated && (
              <span role="status" aria-live="polite" className="font-body text-[10px] uppercase tracking-wider text-xert-pale/40">
                Updated {lastUpdated.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ready', value: summary.ok, color: '#7ec98f' },
          { label: 'Attention', value: summary.attention, color: '#e0b36a' },
          { label: 'Errors', value: summary.errors, color: '#f87171' },
        ].map(item => (
          <div key={item.label} className="p-4" style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.16)' }}>
            <p className="font-display text-3xl tabular-nums leading-none" style={{ color: item.color }}>
              {loading ? '-' : item.value}
            </p>
            <p className="font-body text-[10px] uppercase tracking-[0.2em] mt-1" style={{ color: 'rgba(209,221,230,0.45)' }}>
              {item.label}
            </p>
          </div>
        ))}
      </div>

      {loadError && <AdminLoadError message={loadError} onRetry={load} />}

      {loadError ? null : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-36 bg-xert-ink animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {orderedChecks.map(check => {
            const style = STATUS_STYLE[check.status] || STATUS_STYLE.ok;
            const Icon = style.icon;
            const target = ROUTES[check.key];

            return (
              <article key={check.key} className="p-5 flex flex-col"
                style={{ backgroundColor: style.bg, border: `1px solid ${style.border}` }}>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(16,24,32,0.42)' }}>
                    {check.key === 'supabase'
                      ? <Database className="w-5 h-5" style={{ color: style.color }} />
                      : check.key === 'push-notifications'
                        ? <BellRing className="w-5 h-5" style={{ color: style.color }} />
                        : <Icon className="w-5 h-5" style={{ color: style.color }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <h3 className="font-display text-xl uppercase leading-none text-xert-offwhite">{check.label}</h3>
                      <span className="font-body text-[10px] uppercase tracking-wider shrink-0" style={{ color: style.color }}>
                        {style.label}
                      </span>
                    </div>
                    <p className="font-body text-sm leading-relaxed" style={{ color: 'rgba(209,221,230,0.68)' }}>
                      {check.detail}
                    </p>
                  </div>
                </div>

                {check.action && (
                  <p className="font-body text-xs leading-relaxed mt-auto" style={{ color: 'rgba(209,221,230,0.52)' }}>
                    {check.action}
                  </p>
                )}

                {check.incidents?.length > 0 && (
                  <div className="mt-4 space-y-2" aria-label="Unresolved Stripe webhook incidents">
                    {check.incidents.map(incident => (
                      <div key={incident.event_id} className="p-3"
                        style={{ backgroundColor: 'rgba(16,24,32,0.48)', border: '1px solid rgba(248,113,113,0.18)' }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-body text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#f87171' }}>
                                {incident.status}
                              </span>
                              <span className="font-body text-xs text-xert-pale/70 break-all">{incident.event_type}</span>
                            </div>
                            <code className="block mt-1 font-mono text-[11px] text-xert-pale/55 break-all">{incident.event_id}</code>
                            {incident.order_id && (
                              <code className="block mt-1 font-mono text-[10px] text-xert-pale/40 break-all">
                                Order {incident.order_id}
                              </code>
                            )}
                          </div>
                          <button type="button" onClick={() => void copyIncidentId(incident.event_id)}
                            className="inline-flex size-11 shrink-0 items-center justify-center border border-xert-steel/20 text-xert-steel transition-colors hover:bg-xert-steel/10"
                            title="Copy Stripe Event ID" aria-label={`Copy Stripe Event ID ${incident.event_id}`}>
                            <Copy className="size-4" />
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-body text-[10px] uppercase tracking-wider text-xert-pale/40">
                          <span>{incident.attempts} attempt{incident.attempts === 1 ? '' : 's'}</span>
                          {incident.error_code && <span>{incident.error_code}</span>}
                          {incident.last_received_at && (
                            <time dateTime={incident.last_received_at}>
                              {new Date(incident.last_received_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                            </time>
                          )}
                        </div>
                        {incident.resolution && (
                          <p className="mt-3 font-body text-xs leading-relaxed" style={{ color: 'rgba(224,179,106,0.88)' }}>
                            {incident.resolution}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {incident.status === 'failed' && (
                            <button type="button" onClick={() => setPendingResolution(incident)}
                              className="inline-flex min-h-11 items-center gap-2 border border-xert-steel/25 px-3 font-body text-xs uppercase tracking-wider text-xert-pale transition-colors hover:bg-xert-steel/10">
                              <CheckCircle2 className="size-4" />
                              Mark handled
                            </button>
                          )}
                          {![
                            'PARTIAL_REFUND_REQUIRES_REVIEW',
                            'PAYMENT_DISPUTE_REQUIRES_REVIEW',
                            'PAYMENT_DISPUTE_LOST_REQUIRES_REVIEW',
                          ].includes(incident.error_code) && (
                            <button type="button" onClick={() => setPendingRetry(incident)}
                              className="inline-flex min-h-11 items-center gap-2 border border-xert-steel/25 px-3 font-body text-xs uppercase tracking-wider text-xert-pale transition-colors hover:bg-xert-steel/10">
                              <RefreshCw className="size-4" />
                              Retry safely
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {target && (
                  <button type="button" onClick={() => onNavigate?.(target)}
                    className="inline-flex min-h-11 items-center gap-2 self-start mt-4 font-body text-xs uppercase tracking-wider"
                    style={{ color: '#7BA7BC' }}>
                    Open section
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      <AdminConfirmDialog
        open={Boolean(pendingResolution)}
        onOpenChange={open => !open && setPendingResolution(null)}
        title="Mark Stripe incident handled?"
        description={pendingResolution
          ? `Confirm that ${pendingResolution.event_type} (${pendingResolution.event_id}) has been reviewed and any required member credit action is complete.`
          : ''}
        warning="This removes the incident from launch blockers. Stripe and order records remain unchanged."
        cancelLabel="Keep unresolved"
        confirmLabel="Mark handled"
        onConfirm={() => void markIncidentHandled()}
        busy={resolving}
      />
      <AdminConfirmDialog
        open={Boolean(pendingRetry)}
        onOpenChange={open => !open && setPendingRetry(null)}
        title="Retry Stripe event?"
        description={pendingRetry
          ? `Retrieve ${pendingRetry.event_id} directly from Stripe and run it through XERT's idempotent payment recovery path.`
          : ''}
        warning="XERT verifies the event identity and payment mode before processing. Existing paid orders and credit grants cannot be duplicated."
        cancelLabel="Cancel"
        confirmLabel="Retry event"
        onConfirm={() => void retryIncident()}
        busy={retrying}
      />
    </div>
  );
}
