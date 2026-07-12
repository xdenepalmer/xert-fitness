export const DEFAULT_ADMIN_SECTION = 'overview';

export const ADMIN_SECTION_KEYS = Object.freeze([
  'overview',
  'health',
  'gym-members',
  'orders',
  'products',
  'calendar',
  'bookings',
  'pt-requests',
  'availability',
  'content',
  'coaches',
  'events',
  'members',
  'trainers',
  'partners',
  'settings',
  'campaigns'
]);

const ADMIN_SECTION_SET = new Set(ADMIN_SECTION_KEYS);

export function isAdminSection(value) {
  return ADMIN_SECTION_SET.has(value);
}

export function getAdminSectionFromPath(pathname) {
  const path = String(pathname || '').split(/[?#]/, 1)[0];
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== 'admin' || segments.length === 1) return DEFAULT_ADMIN_SECTION;
  return isAdminSection(segments[1]) ? segments[1] : DEFAULT_ADMIN_SECTION;
}

export function getAdminSectionPath(section) {
  const safeSection = isAdminSection(section) ? section : DEFAULT_ADMIN_SECTION;
  return safeSection === DEFAULT_ADMIN_SECTION ? '/admin' : `/admin/${safeSection}`;
}
