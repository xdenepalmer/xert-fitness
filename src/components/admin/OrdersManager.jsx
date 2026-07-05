import React, { useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Download } from 'lucide-react';
import { getAllOrders } from '@/lib/adminData';
import { downloadCsv } from '@/lib/csv';

const STATUS_COLORS = {
  paid: 'text-green-400 border-green-600/40',
  pending: 'text-xert-orange border-xert-orange/40',
  failed: 'text-xert-red/60 border-xert-red/30',
  refunded: 'text-xert-concrete/40 border-xert-steel/30',
};

export default function OrdersManager() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllOrders().then(d => { setOrders(d); setLoading(false); }).catch(e => { toast({ title: 'Something went wrong', description: e.message, variant: 'destructive' }); setLoading(false); });
  }, []);

  const stats = useMemo(() => {
    const paid = orders.filter(o => o.status === 'paid');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = paid.filter(o => new Date(o.paid_at || o.created_at) >= monthStart);
    const sum = list => list.reduce((s, o) => s + (o.amount_cents || 0), 0);
    return {
      totalRevenue: sum(paid),
      monthRevenue: sum(thisMonth),
      paidCount: paid.length,
      monthCount: thisMonth.length,
    };
  }, [orders]);

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Orders &amp; Revenue</h2>
        <button
          onClick={() => downloadCsv(`xert-orders-${new Date().toISOString().slice(0, 10)}.csv`,
            orders.map(o => ({ ...o, product: o.products?.name })), [
              { key: 'created_at', label: 'Created' }, { key: 'paid_at', label: 'Paid' },
              { key: 'product', label: 'Product' }, { key: 'email', label: 'Email' },
              { key: 'amount_cents', label: 'Amount (cents)' }, { key: 'currency', label: 'Currency' },
              { key: 'status', label: 'Status' },
            ])}
          disabled={orders.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 uppercase tracking-wider hover:border-xert-steel transition-colors disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* Revenue summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total revenue', value: `$${(stats.totalRevenue / 100).toFixed(2)}` },
          { label: 'This month', value: `$${(stats.monthRevenue / 100).toFixed(2)}` },
          { label: 'Paid orders', value: stats.paidCount },
          { label: 'Orders this month', value: stats.monthCount },
        ].map(s => (
          <div key={s.label} className="bg-xert-ink border border-xert-steel/20 p-4">
            <p className="font-display text-2xl text-xert-offwhite tabular-nums">{s.value}</p>
            <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-xert-ink animate-pulse" />)}</div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">No orders yet</p>
          <p className="font-body text-sm text-xert-concrete/40">Stripe purchases appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(o => (
            <div key={o.id} className="bg-xert-ink border border-xert-steel/20 p-4 flex flex-wrap items-center gap-4">
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
                ${((o.amount_cents || 0) / 100).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
