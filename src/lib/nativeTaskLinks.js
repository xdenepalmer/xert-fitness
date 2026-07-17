const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const exactFallbacks = new Map([
  ['/open/home', '/'],
  ['/open/home/notices', '/account#notices'],
  ['/open/booking', '/booking'],
  ['/open/booking/packs', '/booking#packs'],
  ['/open/booking/purchase-confirmation', '/account'],
  ['/open/events', '/events'],
  ['/open/events/goals', '/events#goals'],
  ['/open/explore', '/about'],
  ['/open/account', '/account'],
  ['/open/account/bookings', '/account#bookings'],
]);

const contextualFallbacks = [
  {
    pattern: new RegExp(`^/open/booking/classes/(${UUID_PATTERN})$`, 'i'),
    destination: match => `/booking?session=${match[1].toLowerCase()}`,
  },
  {
    pattern: new RegExp(`^/open/home/notices/${UUID_PATTERN}$`, 'i'),
    destination: '/account#notices',
  },
  {
    pattern: new RegExp(`^/open/account/bookings/${UUID_PATTERN}$`, 'i'),
    destination: '/account#bookings',
  },
];

export function nativeTaskFallback(pathname) {
  if (typeof pathname !== 'string') return '/app';
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const exact = exactFallbacks.get(normalized);
  if (exact) return exact;
  for (const { pattern, destination } of contextualFallbacks) {
    const match = normalized.match(pattern);
    if (match) return typeof destination === 'function' ? destination(match) : destination;
  }
  return '/app';
}
