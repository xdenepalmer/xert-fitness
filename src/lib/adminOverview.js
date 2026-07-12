const READINESS_KEYS = ['coaches', 'events', 'content', 'classes'];

export function readinessFromSettled(results) {
  const data = {};
  const launch = {};
  const errors = [];
  READINESS_KEYS.forEach((key, index) => {
    const result = results[index];
    if (result?.status === 'fulfilled') {
      data[key] = result.value || [];
      launch[key] = data[key].length > 0;
    } else {
      data[key] = null;
      launch[key] = null;
      errors.push(`${key}: ${result?.reason?.message || 'unavailable'}`);
    }
  });
  return { data, launch, errors };
}

export function activityFromSettled(results) {
  const errors = [];
  const value = (index, label) => {
    const result = results[index];
    if (result?.status === 'fulfilled') return result.value || [];
    errors.push(`${label}: ${result?.reason?.message || 'unavailable'}`);
    return [];
  };
  const orders = value(0, 'orders');
  const members = value(1, 'members');
  const feed = [
    ...orders.slice(0, 6).map(order => ({
      type: 'order', at: order.paid_at || order.created_at,
      title: `${order.products?.name || 'Session pack'} - $${((order.amount_cents || 0) / 100).toFixed(2)}`,
      sub: order.email || 'unknown buyer',
    })),
    ...members.slice(0, 6).map(member => ({
      type: 'member', at: member.joined_at,
      title: member.full_name || member.email || 'New member', sub: 'Created an account',
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 7);
  return { feed, errors };
}
