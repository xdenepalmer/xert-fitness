const SITE_NAME = 'XERT Fitness';
const HOME_TITLE = 'XERT Fitness | Functional Training Kingaroy';
const HOME_DESCRIPTION = 'Structured, coach-led functional fitness, personal training and event preparation in Kingaroy, Queensland.';

const PUBLIC_METADATA = Object.freeze({
  '/': { title: HOME_TITLE, description: HOME_DESCRIPTION },
  '/about': { title: 'About XERT Fitness | Kingaroy', description: 'Meet the purpose, coaching model and training philosophy behind XERT Fitness in Kingaroy.' },
  '/coaches': { title: 'Coaches and Practitioners | XERT Fitness', description: 'Meet the coaches and allied health practitioners supporting XERT Fitness members.' },
  '/events': { title: '2026 Event Calendar | XERT Fitness', description: 'Explore the 2026 South East Queensland events that shape XERT Fitness training blocks and shared member goals.' },
  '/booking': { title: 'Book Classes and Session Packs | XERT Fitness', description: 'Request a class, personal training session or XERT Fitness session pack.' },
  '/contact': { title: 'Contact XERT Fitness | Kingaroy', description: 'Contact XERT Fitness about classes, coaching, allied health partnerships or your first session.' },
  '/training-guide': { title: 'Functional Training Guide | XERT Fitness', description: 'Learn how XERT approaches functional fitness, movement quality, conditioning and event preparation.' },
  '/timetable': { title: 'Class Timetable | XERT Fitness', description: 'View the XERT Fitness soft-launch timetable and planned class schedule in Kingaroy.' },
  '/app': { title: 'XERT Fitness iPhone App', description: 'Manage XERT bookings, session credits, training goals and events from the XERT Fitness iPhone app.' },
  '/trainer-interest': { title: 'Coach Opportunities | XERT Fitness', description: 'Register your interest in coaching or personal training opportunities with XERT Fitness.' },
  '/partner-interest': { title: 'Allied Health Partnerships | XERT Fitness', description: 'Register your interest in an allied health or community partnership with XERT Fitness.' },
  '/privacy': { title: 'Privacy Policy | XERT Fitness', description: 'Read how XERT Fitness collects, uses and protects member and website visitor information.' },
  '/terms': { title: 'Terms of Use | XERT Fitness', description: 'Read the terms that apply to XERT Fitness services, bookings, session packs and digital products.' },
});

const NOINDEX_PATHS = new Set([
  '/account',
  '/admin',
  '/checkout-return',
  '/forgot-password',
  '/login',
  '/register',
  '/reset-password',
  '/thank-you',
]);

// Any fixed same-origin base works here; it only exists so we can reject a path
// that WHATWG URL parsing would resolve to a foreign origin (scheme-relative
// "//host" or its backslash equivalents) before it reaches a canonical link.
const CANONICAL_BASE = 'https://xert-fitness.vercel.app';

function sameOriginPath(candidate) {
  try {
    const url = new URL(candidate, CANONICAL_BASE);
    return url.origin === CANONICAL_BASE ? url.pathname : '/';
  } catch {
    return '/';
  }
}

export function metadataForPath(pathname) {
  const normalized = pathname !== '/' ? pathname.replace(/\/+$/, '') : '/';
  const path = sameOriginPath(normalized);
  const publicMetadata = PUBLIC_METADATA[normalized];
  if (publicMetadata) return { ...publicMetadata, indexable: true, path };

  const isPrivate = normalized.startsWith('/admin/') || NOINDEX_PATHS.has(normalized);
  return {
    title: isPrivate ? `${SITE_NAME} | Member Access` : `Page Not Found | ${SITE_NAME}`,
    description: HOME_DESCRIPTION,
    indexable: false,
    path,
  };
}
