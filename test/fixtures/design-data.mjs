// Fictional, local-browser-only data. Never imported by the application.
export const fixtureUser = {
  id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated',
  email: 'alex@example.invalid', app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Alex Morgan' }, created_at: '2026-01-01T00:00:00Z',
};

export function fixtureSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    access_token: `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: fixtureUser.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt })}.local-fixture-only`,
    refresh_token: 'local-fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt,
    user: fixtureUser,
  };
}

export function designData() {
  const start = new Date(Date.now() + 2 * 3600000).toISOString();
  const end = new Date(Date.now() + 3 * 3600000).toISOString();
  const session = {
    id: '22222222-2222-4222-8222-222222222222', session_id: '22222222-2222-4222-8222-222222222222',
    title: 'Foundation Strength', session_type: 'strength', start_time: start, end_time: end,
    status: 'published', coach_name: 'Sam', location_zone: 'Main floor', capacity: 8,
    confirmed_count: 6, booked_count: 6, available_spots: 2, spots_remaining: 2,
    requested_count: 2, public_request_count: 1, waitlist_count: 2, attendance_due: false,
    booking_mode: 'request_to_book',
  };
  return {
    profiles: [{ ...fixtureUser, full_name: 'Alex Morgan', role: 'admin' }],
    admin_settings: [{ id: 'fixture-settings', bookings_enabled: true, payments_enabled: false,
      prices_coming_soon: true, countdown_enabled: false, class_credits_enabled: false,
      soft_launch_mode: true, default_booking_mode: 'request_to_book' }],
    sessions: [session],
    sessions_with_availability: [session],
    admin_daily_operations: [session],
    my_bookings: [{ id: '33333333-3333-4333-8333-333333333333', session_id: session.id,
      session_title: session.title, title: session.title, start_time: start, end_time: end,
      status: 'confirmed', coach_name: 'Sam' }],
    my_member_announcements: [], admin_waitlist_overview: [],
  };
}

const readRPCs = new Set([
  'sessions_with_availability', 'my_bookings', 'my_member_announcements', 'admin_daily_operations',
  'admin_waitlist_overview', 'admin_search_members', 'admin_members_overview',
]);

// Network-level isolation: keep real auth/router/components, intercept only I/O.
// External data destinations are fulfilled here or aborted. Only unauthenticated
// Google Fonts reads pass through so typography matches the real product.
export async function installDesignFixtures(context, { origin, signedIn = false, requests = [] }) {
  const data = designData();
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    const method = request.method();
    if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
      && method === 'GET' && !request.headers().authorization) return route.continue();
    const respond = (body, status = 200, extra = {}) => route.fulfill({ status,
      contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...extra },
      body: method === 'HEAD' ? '' : JSON.stringify(body),
    });
    if (url.hostname.endsWith('.supabase.co') || url.hostname === 'invalid.xert.invalid') {
      requests.push({ method, path: url.pathname });
      if (url.pathname === '/auth/v1/user') return respond(fixtureUser);
      const rpc = url.pathname.startsWith('/rest/v1/rpc/');
      const name = url.pathname.split('/').at(-1);
      if (rpc && !readRPCs.has(name)) return respond({ message: 'Mutation or unconfigured RPC blocked by local design fixture.' }, 501);
      if (!rpc && !['GET', 'HEAD', 'OPTIONS'].includes(method)) return respond({ message: 'Writes blocked by local design fixture.' }, 403);
      const rows = data[name] ?? [];
      const single = request.headers().accept?.includes('vnd.pgrst.object');
      return respond(single ? rows[0] ?? null : rows, 200, { 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' });
    }
    requests.push({ method, path: url.pathname, blocked: true });
    if (url.origin === origin) return respond({ message: 'Live APIs disabled in local design verification.' }, 403);
    return route.abort('blockedbyclient');
  });
  if (signedIn) {
    await context.addInitScript(session => {
      localStorage.setItem('sb-ugmkwoapjcpiucsrxwzt-auth-token', JSON.stringify(session));
    }, fixtureSession());
  }
}
