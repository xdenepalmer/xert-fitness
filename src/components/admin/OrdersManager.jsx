import React, { useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Copy, Download, RefreshCw, X } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { getAllOrders } from '@/lib/adminData';
import { downloadCsv } from '@/lib/csv';
import { filterOrders, orderCsvRows, summarizeOrders } from '@/lib/orderAnalytics';
import { formatPackPrice } from '@/lib/products';
import AdminLoadError from '@/components/admin/AdminLoadError';

const STATUS_COLORS = {
  paid: 'text-green-400 border-green-600/40',
  pending: 'text-xert-orange border-xert-orange/40',
  failed: 'text-xert-red/60 border-xert-red/30',
  refunded: 'text-xert-concrete/40 border-xert-steel/30',
};

export default function OrdersManager() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [daysFilter, setDaysFilter] = useState('30');
  const [selectedOrder, setSelectedOrder] = useState(null);

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

  const stats = useMemo(() => summarizeOrders(filteredOrders), [filteredOrders]);
  const summaryCurrency = stats.currencies.length === 1 ? stats.currencies[0] : currencyFilter !== 'all' ? currencyFilter : null;
  const money = cents => summaryCurrency ? formatPackPrice(cents, summaryCurrency) : stats.paidCount === 0 ? formatPackPrice(0, 'aud') : 'Mixed currencies';

  // Daily revenue for the last 30 days.
  const chartData = useMemo(() => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 86400000);
      days.push({
        key: day.toDateString(),
        label: day.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
        revenue: 0,
      });
    }
    const byKey = Object.fromEntries(days.map(d => [d.key, d]));
    for (const o of filteredOrders) {
      if (o.status !== 'paid') continue;
      const key = new Date(o.paid_at || o.created_at).toDateString();
      if (byKey[key]) byKey[key].revenue += (o.amount_cents || 0) / 100;
    }
    return days;
  }, [filteredOrders]);

  const copyIdentifier = async value => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Could not copy', description: 'Select the identifier and copy it manually.', variant: 'destructive' });
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
              { key: 'status', label: 'Status' }, { key: 'checkout_session', label: 'Stripe Checkout Session' },
              { key: 'payment_intent', label: 'Stripe Payment Intent' },
            ])}
          disabled={filteredOrders.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 uppercase tracking-wider hover:border-xert-steel transition-colors disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search buyer, product or Stripe ID" className="sm:col-span-2 bg-xert-ink border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite placeholder-xert-concrete/30 focus:outline-none focus:border-xert-red" />
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="bg-xert-ink border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite">
          <option value="all">All statuses</option>
          {Object.keys(STATUS_COLORS).map(status => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={currencyFilter} onChange={event => setCurrencyFilter(event.target.value)} className="bg-xert-ink border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite">
          <option value="all">All currencies</option>
          {currencies.map(currency => <option key={currency} value={currency}>{currency.toUpperCase()}</option>)}
        </select>
        <div className="flex gap-2">
          <select value={daysFilter} onChange={event => setDaysFilter(event.target.value)} className="flex-1 bg-xert-ink border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite">
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
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <XAxis dataKey="label" interval={6} tick={{ fill: 'rgba(209,221,230,0.4)', fontSize: 10 }} axisLine={{ stroke: 'rgba(123,167,188,0.2)' }} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(209,221,230,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip
                  cursor={{ fill: 'rgba(123,167,188,0.08)' }}
                  contentStyle={{ backgroundColor: '#101820', border: '1px solid rgba(123,167,188,0.3)', fontFamily: 'inherit', fontSize: 12 }}
                  labelStyle={{ color: '#D1DDE6' }}
                  formatter={value => {
                    const amount = Array.isArray(value) ? value[0] : value;
                    return [formatPackPrice(Number(amount) * 100, summaryCurrency || 'aud'), 'Revenue'];
                  }}
                />
                <Bar dataKey="revenue" fill="#7BA7BC" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-xert-ink animate-pulse" />)}</div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={load} />
      ) : filteredOrders.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">No matching orders</p>
          <p className="font-body text-sm text-xert-concrete/40">Adjust the filters or wait for Stripe purchases to arrive.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredOrders.map(o => (
            <button type="button" onClick={() => setSelectedOrder(o)} key={o.id} className="w-full text-left bg-xert-ink border border-xert-steel/20 p-4 flex flex-wrap items-center gap-4 hover:border-xert-steel/50 transition-colors">
              <span className={`font-body text-xs border px-2 py-0.5 uppercase shrink-0 ${STATUS_COLORS[o.status] || STATUS_COLORS.pending}`}>
                {o.status}
              </span>
              <div className="flex-1 min-w-[12rem]">
                <p className="font-body text-sm text-xert-offwhite">{o.products?.name || 'Session pack'}</p>
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
      <p className="font-body text-xs text-xert-concrete/30 mt-4">{filteredOrders.length} of {orders.length} orders shown</p>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
          <div className="w-full max-w-lg bg-xert-ink border border-xert-steel/30 p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div><p className="font-body text-xs uppercase tracking-wider text-xert-steel">Order detail</p><h3 id="order-detail-title" className="font-display text-2xl uppercase text-xert-offwhite mt-1">{selectedOrder.products?.name || 'Session pack'}</h3></div>
              <button type="button" onClick={() => setSelectedOrder(null)} title="Close order detail" aria-label="Close order detail" className="p-1.5 text-xert-concrete/50"><X className="w-5 h-5" /></button>
            </div>
            <dl className="space-y-4 font-body text-sm">
              <div><dt className="text-xs uppercase text-xert-concrete/40">Buyer</dt><dd className="text-xert-offwhite mt-1">{selectedOrder.email ? <a href={`mailto:${selectedOrder.email}`} className="hover:text-xert-steel">{selectedOrder.email}</a> : 'Anonymized buyer'}</dd></div>
              <div><dt className="text-xs uppercase text-xert-concrete/40">Amount</dt><dd className="text-xert-offwhite mt-1">{formatPackPrice(selectedOrder.amount_cents, selectedOrder.currency)} · {selectedOrder.status}</dd></div>
              <Identifier label="Stripe checkout session" value={selectedOrder.stripe_checkout_session_id} onCopy={copyIdentifier} />
              <Identifier label="Stripe payment intent" value={selectedOrder.stripe_payment_intent_id} onCopy={copyIdentifier} />
              <Identifier label="XERT order ID" value={selectedOrder.id} onCopy={copyIdentifier} />
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function Identifier({ label, value, onCopy }) {
  return <div><dt className="text-xs uppercase text-xert-concrete/40">{label}</dt><dd className="flex items-center gap-2 text-xert-concrete/70 mt-1 min-w-0"><code className="truncate">{value || 'Not recorded'}</code>{value && <button type="button" onClick={() => void onCopy(value)} title={`Copy ${label}`} aria-label={`Copy ${label}`} className="p-1 text-xert-steel"><Copy className="w-3.5 h-3.5" /></button>}</dd></div>;
}
