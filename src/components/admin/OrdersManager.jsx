import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { ChevronLeft, ChevronRight, Copy, Download, RefreshCw, RotateCcw, X } from 'lucide-react';
import { getAllOrders, reconcileOrder, refundOrder } from '@/lib/adminData';
import { downloadCsv } from '@/lib/csv';
import { buildDailyRevenue, filterOrders, orderCsvRows, summarizeOrders } from '@/lib/orderAnalytics';
import { formatPackPrice } from '@/lib/products';
import AdminLoadError from '@/components/admin/AdminLoadError';

const STATUS_COLORS = {
  paid: 'text-green-400 border-green-600/40',
  pending: 'text-xert-orange border-xert-orange/40',
  failed: 'text-xert-red/60 border-xert-red/30',
  refunded: 'text-xert-concrete/40 border-xert-steel/30',
};
const PAGE_SIZE = 50;

function purchasedTerms(order) {
  const credits = Number(order?.credit_total);
  const validity = Number(order?.credit_validity_days);
  if (!Number.isSafeInteger(credits) || credits <= 0 || !Number.isSafeInteger(validity) || validity <= 0) {
    return 'Legacy order - purchased terms not recorded';
  }
  return `${credits} session credit${credits === 1 ? '' : 's'} · ${validity} days validity`;
}

export default function OrdersManager() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [daysFilter, setDaysFilter] = useState('30');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [page, setPage] = useState(1);
  const [refundReason, setRefundReason] = useState('requested_by_customer');
  const [refundConfirmation, setRefundConfirmation] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  // Same-paint double-click must not fire two Stripe reconciles.
  const reconcileLockRef = useRef(false);
  // Stripe refund create is idempotent per order, but same-paint double-click
  // still races two reconcile_stripe_order_refund calls + duplicate toasts
  // before `refunding` re-renders (reconcile already uses reconcileLockRef).
  const refundLockRef = useRef(false);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setOrders(await getAllOrders());
    } catch (error) {
      setLoadError(error.message || 'Check the orders table and admin permissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const currencies = useMemo(() => [...new Set(orders.map(order => String(order.currency || 'aud').toLowerCase()))].sort(), [orders]);
  const filteredOrders = useMemo(() => filterOrders(orders, { search, status: statusFilter, currency: currencyFilter, days: daysFilter }), [currencyFilter, daysFilter, orders, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleOrders = useMemo(
    () => filteredOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredOrders, safePage],
  );
  const firstResult = filteredOrders.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(safePage * PAGE_SIZE, filteredOrders.length);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    // Keep the open refund/reconcile subject pinned while Stripe work is in flight.
    if (refunding || reconciling) return;
    setPage(1);
    setSelectedOrder(null);
  }, [currencyFilter, daysFilter, search, statusFilter, refunding, reconciling]);

  const stats = useMemo(() => summarizeOrders(filteredOrders), [filteredOrders]);
  const summaryCurrency = stats.currencies.length === 1 ? stats.currencies[0] : currencyFilter !== 'all' ? currencyFilter : null;
  const money = cents => summaryCurrency ? formatPackPrice(cents, summaryCurrency) : stats.paidCount === 0 ? formatPackPrice(0, 'aud') : 'Mixed currencies';

  const chartData = useMemo(() => buildDailyRevenue(filteredOrders), [filteredOrders]);
  const chartMaximum = Math.max(...chartData.map(day => day.amountCents), 0);

  const copyIdentifier = async value => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Could not copy', description: 'Select the identifier and copy it manually.', variant: 'destructive' });
    }
  };

  const closeOrder = () => {
    if (refunding || reconciling) return;
    setSelectedOrder(null);
    setRefundReason('requested_by_customer');
    setRefundConfirmation('');
  };

  const submitReconciliation = async () => {
    const orderId = selectedOrder?.id;
    if (!orderId || reconcileLockRef.current || reconciling) return;
    reconcileLockRef.current = true;
    setReconciling(true);
    try {
      const result = await reconcileOrder(orderId);
      const expired = result.status === 'failed' && result.checkout_status === 'expired';
      toast({
        title: expired
          ? 'Expired checkout closed'
          : result.already_paid ? 'Fulfilment verified' : 'Payment reconciled',
        description: expired
          ? 'Stripe confirms no payment was taken. The pending order is now closed without granting credits.'
          : result.buyer_deleted
            ? 'Payment settled without granting credits — the buying account is gone.'
            : result.already_paid || Number(result.credits_granted || 0) === 0
              ? 'Stripe fulfilment matches this order. No new credits were granted.'
              : `${result.credits_granted} session credit${result.credits_granted === 1 ? '' : 's'} verified for this order.`,
      });
      setSelectedOrder(null);
      await load();
    } catch (error) {
      toast({ title: 'Reconciliation stopped', description: error.message, variant: 'destructive' });
    } finally {
      reconcileLockRef.current = false;
      setReconciling(false);
    }
  };

  const submitRefund = async () => {
    const orderId = selectedOrder?.id;
    const reason = refundReason;
    const confirmation = refundConfirmation;
    if (!orderId || refundLockRef.current || refunding || reconciling) return;
    refundLockRef.current = true;
    setRefunding(true);
    try {
      const result = await refundOrder(orderId, reason, confirmation);
      const count = Number(result.credits_revoked) || 0;
      const bookings = Number(result.bookings_cancelled) || 0;
      toast({
        title: result.recovered ? 'Refund recovered' : 'Refund completed',
        description: `${count} credit${count === 1 ? '' : 's'} revoked; ${bookings} booking${bookings === 1 ? '' : 's'} cancelled.`,
      });
      setSelectedOrder(null);
      setRefundReason('requested_by_customer');
      setRefundConfirmation('');
      await load();
    } catch (error) {
      toast({ title: 'Refund failed', description: error.message, variant: 'destructive' });
    } finally {
      setRefunding(false);
      refundLockRef.current = false;
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Orders &amp; Revenue</h2>
        <button
          onClick={() => downloadCsv(`xert-orders-${new Date().toISOString().slice(0, 10)}.csv`,
            orderCsvRows(filteredOrders), [
              { key: 'created_at', label: 'Created' }, { key: 'paid_at', label: 'Paid' },
              { key: 'product', label: 'Product' }, { key: 'email', label: 'Email' },
              { key: 'amount', label: 'Amount' }, { key: 'currency', label: 'Currency' },
              { key: 'credit_total', label: 'Purchased session credits' },
              { key: 'credit_validity_days', label: 'Purchased validity days' },
              { key: 'status', label: 'Status' }, { key: 'checkout_session', label: 'Stripe Checkout Session' },
              { key: 'payment_intent', label: 'Stripe Payment Intent' },
              { key: 'reconciled_at', label: 'Admin reconciled' }, { key: 'reconciled_by', label: 'Reconciled by admin ID' },
              { key: 'refunded_at', label: 'Refunded' }, { key: 'refunded_amount', label: 'Refund amount' },
              { key: 'credits_revoked', label: 'Unused credits revoked' },
              { key: 'credits_consumed_before_refund', label: 'Credits used before refund' },
              { key: 'bookings_cancelled', label: 'Future bookings cancelled' },
            ])}
          disabled={filteredOrders.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 uppercase tracking-wider hover:border-xert-steel transition-colors disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <input value={search} onChange={event => setSearch(event.target.value)} aria-label="Search orders" placeholder="Search buyer, product or Stripe ID" className="sm:col-span-2 bg-xert-ink border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red" />
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filter orders by status" className="bg-xert-ink border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite">
          <option value="all">All statuses</option>
          {Object.keys(STATUS_COLORS).map(status => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={currencyFilter} onChange={event => setCurrencyFilter(event.target.value)} aria-label="Filter orders by currency" className="bg-xert-ink border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite">
          <option value="all">All currencies</option>
          {currencies.map(currency => <option key={currency} value={currency}>{currency.toUpperCase()}</option>)}
        </select>
        <div className="flex gap-2">
          <select value={daysFilter} onChange={event => setDaysFilter(event.target.value)} aria-label="Filter orders by age" className="flex-1 bg-xert-ink border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite">
            <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} title="Refresh orders" aria-label="Refresh orders" className="p-2.5 border border-xert-steel/40 text-xert-steel disabled:opacity-40"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {/* Revenue summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Filtered revenue', value: money(stats.totalRevenue) },
          { label: 'This month', value: money(stats.monthRevenue) },
          { label: 'Paid orders', value: stats.paidCount },
          { label: 'Orders this month', value: stats.monthCount },
        ].map(s => (
          <div key={s.label} className="bg-xert-ink border border-xert-steel/20 p-4">
            <p className="font-display text-2xl text-xert-offwhite tabular-nums">{s.value}</p>
            <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 30-day revenue chart */}
      {!loading && stats.currencies.length <= 1 && filteredOrders.some(o => o.status === 'paid') && (
        <div className="mb-8 p-5" style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.16)' }}>
          <h3 className="font-display text-xs uppercase tracking-[0.2em] mb-4" style={{ color: 'rgba(123,167,188,0.6)' }}>
            Revenue — last 30 days
          </h3>
          <div role="img" aria-label="Daily paid revenue for the last 30 days" className="relative h-44 pt-3 pb-6 border-b border-xert-steel/20">
            <div className="absolute inset-x-0 top-3 bottom-6 flex items-end gap-1">
              {chartData.map(day => {
                const height = chartMaximum ? Math.max(day.amountCents ? 2 : 0, (day.amountCents / chartMaximum) * 100) : 0;
                const amount = formatPackPrice(day.amountCents, summaryCurrency || 'aud');
                return (
                  <div key={day.key} className="flex-1 h-full flex items-end" title={`${day.label}: ${amount}`} aria-label={`${day.label}: ${amount}`}>
                    <div className="w-full bg-xert-steel hover:bg-xert-concrete transition-colors" style={{ height: `${height}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex justify-between font-body text-[10px] text-xert-concrete/40">
              <span>{chartData[0]?.label}</span>
              <span>{chartData[Math.floor(chartData.length / 2)]?.label}</span>
              <span>{chartData.at(-1)?.label}</span>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-xert-ink animate-pulse" />)}</div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => load()} />
      ) : filteredOrders.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">No matching orders</p>
          <p className="font-body text-sm text-xert-concrete/40">Adjust the filters or wait for Stripe purchases to arrive.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleOrders.map(o => (
            <button type="button" onClick={() => setSelectedOrder(o)} key={o.id} className="w-full text-left bg-xert-ink border border-xert-steel/20 p-4 flex flex-wrap items-center gap-4 hover:border-xert-steel/50 transition-colors">
              <span className={`font-body text-xs border px-2 py-0.5 uppercase shrink-0 ${STATUS_COLORS[o.status] || STATUS_COLORS.pending}`}>
                {o.status}
              </span>
              <div className="flex-1 min-w-[12rem]">
                <p className="font-body text-sm text-xert-offwhite">{o.products?.name || 'Session pack'}</p>
                <p className="font-body text-xs text-xert-steel/70">{purchasedTerms(o)}</p>
                <p className="font-body text-xs text-xert-concrete/50">{o.email || 'unknown buyer'}</p>
              </div>
              <p className="font-body text-xs text-xert-concrete/40 shrink-0">
                {new Date(o.paid_at || o.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </p>
              <p className="font-display text-lg text-xert-offwhite tabular-nums shrink-0">
                {formatPackPrice(o.amount_cents, o.currency)}
              </p>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-body text-xs text-xert-concrete/40">
          {filteredOrders.length === 0 ? '0 results' : `${firstResult}-${lastResult} of ${filteredOrders.length} matching orders`}
          {filteredOrders.length !== orders.length ? ` · ${orders.length} total` : ''}
        </p>
        {pageCount > 1 && (
          <nav aria-label="Order result pages" className="flex items-center gap-2">
            <button type="button" onClick={() => { setSelectedOrder(null); setPage(current => Math.max(1, current - 1)); }} disabled={safePage <= 1} title="Previous page" aria-label="Previous order page" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-body text-xs text-xert-concrete/60 tabular-nums">Page {safePage} of {pageCount}</span>
            <button type="button" onClick={() => { setSelectedOrder(null); setPage(current => Math.min(pageCount, current + 1)); }} disabled={safePage >= pageCount} title="Next page" aria-label="Next order page" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </nav>
        )}
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-xert-ink border border-xert-steel/30 p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div><p className="font-body text-xs uppercase tracking-wider text-xert-steel">Order detail</p><h3 id="order-detail-title" className="font-display text-2xl uppercase text-xert-offwhite mt-1">{selectedOrder.products?.name || 'Session pack'}</h3></div>
              <button type="button" onClick={closeOrder} disabled={refunding || reconciling} title="Close order detail" aria-label="Close order detail" className="p-1.5 text-xert-concrete/50 disabled:opacity-40"><X className="w-5 h-5" /></button>
            </div>
            <dl className="space-y-4 font-body text-sm">
              <div><dt className="text-xs uppercase text-xert-concrete/40">Buyer</dt><dd className="text-xert-offwhite mt-1">{selectedOrder.email ? <a href={`mailto:${selectedOrder.email}`} className="hover:text-xert-steel">{selectedOrder.email}</a> : 'Anonymized buyer'}</dd></div>
              <div><dt className="text-xs uppercase text-xert-concrete/40">Amount</dt><dd className="text-xert-offwhite mt-1">{formatPackPrice(selectedOrder.amount_cents, selectedOrder.currency)} · {selectedOrder.status}</dd></div>
              <div><dt className="text-xs uppercase text-xert-concrete/40">Purchased terms</dt><dd className="text-xert-offwhite mt-1">{purchasedTerms(selectedOrder)}</dd></div>
              <Identifier label="Stripe checkout session" value={selectedOrder.stripe_checkout_session_id} onCopy={copyIdentifier} />
              <Identifier label="Stripe payment intent" value={selectedOrder.stripe_payment_intent_id} onCopy={copyIdentifier} />
              <Identifier label="XERT order ID" value={selectedOrder.id} onCopy={copyIdentifier} />
              {selectedOrder.reconciled_at && (
                <>
                  <div><dt className="text-xs uppercase text-xert-concrete/40">Admin reconciled</dt><dd className="text-xert-concrete/70 mt-1">{new Date(selectedOrder.reconciled_at).toLocaleString('en-AU')}</dd></div>
                  <Identifier label="Reconciled by admin" value={selectedOrder.reconciled_by} onCopy={copyIdentifier} />
                </>
              )}
            </dl>
            {['pending', 'failed'].includes(selectedOrder.status) && selectedOrder.stripe_checkout_session_id && (
              <div className="mt-6 border-t border-xert-orange/30 pt-5 space-y-3">
                <div className="flex items-center gap-2 text-xert-orange"><RefreshCw className="w-4 h-4" /><h4 className="font-display text-sm uppercase">Payment recovery</h4></div>
                <p className="font-body text-sm leading-relaxed text-xert-concrete/70">
                  Ask Stripe for the canonical outcome. XERT grants credits only for an exact paid match, or safely closes an expired unpaid checkout.
                </p>
                <button type="button" onClick={() => void submitReconciliation()} disabled={reconciling} className="w-full min-h-11 inline-flex items-center justify-center gap-2 border border-xert-orange/50 px-4 font-display text-sm uppercase text-xert-orange disabled:opacity-40">
                  <RefreshCw className={`w-4 h-4 ${reconciling ? 'animate-spin' : ''}`} /> {reconciling ? 'Checking Stripe...' : 'Check Stripe Outcome'}
                </button>
              </div>
            )}
            {selectedOrder.status === 'refunded' && (() => {
              const refund = Array.isArray(selectedOrder.stripe_refunds) ? selectedOrder.stripe_refunds[0] : selectedOrder.stripe_refunds;
              return (
                <div className="mt-6 border-t border-xert-steel/20 pt-5">
                  <p className="font-display text-sm uppercase text-xert-offwhite">Refund reconciliation</p>
                  <p className="mt-2 font-body text-sm text-xert-concrete/70">
                    {formatPackPrice(selectedOrder.refunded_amount_cents || refund?.amount_cents, selectedOrder.currency)} refunded. {refund?.credits_revoked || 0} credits revoked; {refund?.bookings_cancelled || 0} future bookings cancelled; {refund?.credits_consumed || 0} sessions already used.
                  </p>
                  <dl className="mt-4 font-body text-sm"><Identifier label="Stripe refund" value={refund?.refund_id} onCopy={copyIdentifier} /></dl>
                </div>
              );
            })()}
            {selectedOrder.status === 'paid' && selectedOrder.stripe_payment_intent_id && (
              <div className="mt-6 border-t border-xert-red/30 pt-5 space-y-4">
                <div className="flex items-center gap-2 text-xert-red"><RotateCcw className="w-4 h-4" /><h4 className="font-display text-sm uppercase">Full refund</h4></div>
                <select value={refundReason} onChange={event => setRefundReason(event.target.value)} disabled={refunding} aria-label="Refund reason" className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite">
                  <option value="requested_by_customer">Requested by customer</option>
                  <option value="duplicate">Duplicate payment</option>
                </select>
                <div>
                  <label htmlFor="refund-confirmation" className="block font-body text-xs uppercase text-xert-concrete/50 mb-1">Type REFUND to confirm</label>
                  <input id="refund-confirmation" value={refundConfirmation} onChange={event => setRefundConfirmation(event.target.value)} disabled={refunding} autoComplete="off" className="w-full bg-xert-charcoal border border-xert-red/40 px-3 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
                </div>
                <button type="button" onClick={() => void submitRefund()} disabled={refunding || refundConfirmation !== 'REFUND'} className="w-full min-h-11 inline-flex items-center justify-center gap-2 bg-xert-red px-4 font-display text-sm uppercase text-white disabled:opacity-40">
                  <RotateCcw className={`w-4 h-4 ${refunding ? 'animate-spin' : ''}`} /> {refunding ? 'Refunding...' : `Refund ${formatPackPrice(selectedOrder.amount_cents, selectedOrder.currency)}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Identifier({ label, value, onCopy }) {
  return <div><dt className="text-xs uppercase text-xert-concrete/40">{label}</dt><dd className="flex items-center gap-2 text-xert-concrete/70 mt-1 min-w-0"><code className="truncate">{value || 'Not recorded'}</code>{value && <button type="button" onClick={() => void onCopy(value)} title={`Copy ${label}`} aria-label={`Copy ${label}`} className="p-1 text-xert-steel"><Copy className="w-3.5 h-3.5" /></button>}</dd></div>;
}
