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

function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function buildDailyRevenue(orders, now = new Date(), dayCount = 30) {
  const count = Math.max(1, Math.min(366, Math.trunc(Number(dayCount) || 30)));
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - index - 1));
    return {
      key: localDayKey(date),
      label: date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
      amountCents: 0
    };
  });
  const byKey = new Map(days.map(day => [day.key, day]));
  for (const order of orders || []) {
    if (order.status !== 'paid') continue;
    const day = byKey.get(localDayKey(order.paid_at || order.created_at));
    if (day) day.amountCents += Number(order.amount_cents) || 0;
  }
  return days;
}

export function orderCsvRows(orders) {
  return (orders || []).map(order => {
    const refund = Array.isArray(order.stripe_refunds) ? order.stripe_refunds[0] : order.stripe_refunds;
    return {
      created_at: order.created_at,
      paid_at: order.paid_at,
      product: order.products?.name || 'Session pack',
      email: order.email || '',
      amount: ((Number(order.amount_cents) || 0) / 100).toFixed(2),
      currency: String(order.currency || 'aud').toUpperCase(),
      status: order.status,
      checkout_session: order.stripe_checkout_session_id || '',
      payment_intent: order.stripe_payment_intent_id || '',
      refunded_at: order.refunded_at || refund?.refunded_at || '',
      refunded_amount: ((Number(order.refunded_amount_cents ?? refund?.amount_cents) || 0) / 100).toFixed(2),
      credits_revoked: Number(refund?.credits_revoked) || 0,
      credits_consumed_before_refund: Number(refund?.credits_consumed) || 0,
      bookings_cancelled: Number(refund?.bookings_cancelled) || 0,
    };
  });
}
