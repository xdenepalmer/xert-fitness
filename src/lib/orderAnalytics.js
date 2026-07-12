export function orderTimestamp(order) {
  const value = Date.parse(order?.paid_at || order?.created_at || '');
  return Number.isFinite(value) ? value : 0;
}

export function filterOrders(orders, filters = {}, now = Date.now()) {
  const search = String(filters.search || '').trim().toLowerCase();
  const days = filters.days === 'all' ? null : Number(filters.days || 30);
  const cutoff = days && Number.isFinite(days) ? now - days * 86400000 : null;

  return (orders || []).filter(order => {
    if (filters.status && filters.status !== 'all' && order.status !== filters.status) return false;
    if (filters.currency && filters.currency !== 'all' && String(order.currency || 'aud').toLowerCase() !== filters.currency) return false;
    if (cutoff && orderTimestamp(order) < cutoff) return false;
    if (!search) return true;
    return [
      order.email,
      order.products?.name,
      order.stripe_checkout_session_id,
      order.stripe_payment_intent_id,
    ].some(value => String(value || '').toLowerCase().includes(search));
  });
}

export function summarizeOrders(orders, now = new Date()) {
  const paid = (orders || []).filter(order => order.status === 'paid');
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisMonth = paid.filter(order => orderTimestamp(order) >= monthStart);
  const sum = list => list.reduce((total, order) => total + (Number(order.amount_cents) || 0), 0);
  const currencies = [...new Set(paid.map(order => String(order.currency || 'aud').toLowerCase()))];

  return {
    totalRevenue: sum(paid),
    monthRevenue: sum(thisMonth),
    paidCount: paid.length,
    monthCount: thisMonth.length,
    currencies,
  };
}

export function orderCsvRows(orders) {
  return (orders || []).map(order => ({
    created_at: order.created_at,
    paid_at: order.paid_at,
    product: order.products?.name || 'Session pack',
    email: order.email || '',
    amount: ((Number(order.amount_cents) || 0) / 100).toFixed(2),
    currency: String(order.currency || 'aud').toUpperCase(),
    status: order.status,
    checkout_session: order.stripe_checkout_session_id || '',
    payment_intent: order.stripe_payment_intent_id || '',
  }));
}
