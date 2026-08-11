import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const context = readFileSync(new URL('../src/lib/SupabaseAuthContext.jsx', import.meta.url), 'utf8');
const adminRoute = readFileSync(new URL('../src/components/admin/AdminRoute.jsx', import.meta.url), 'utf8');

test('web auth ignores stale initial sessions and stale profile responses', () => {
  assert.match(context, /let sessionVersion = 0/);
  assert.match(context, /if \(!active \|\| sessionVersion !== 0\) return/);
  assert.match(context, /const version = \+\+sessionVersion/);
  assert.match(context, /version === sessionVersion/);
  assert.match(context, /const requestId = \+\+profileRequestId/);
  assert.match(context, /requestId === profileRequestId/);
});

test('web auth always settles initial loading when session lookup fails', () => {
  assert.match(context, /\.catch\(\(\) => \{/);
  assert.match(context, /sessionVersion === 0\) setLoading\(false\)/);
});

test('profile verification failures remain distinct from confirmed non-admin access', () => {
  assert.match(context, /const \[profileError, setProfileError\] = useState\(null\)/);
  assert.match(context, /const \{ data, error \} = await supabase/);
  assert.match(context, /if \(error\) throw error/);
  assert.match(context, /setProfileError\(error\?\.message/);
  assert.match(context, /retryProfileRef\.current = \(\) => loadProfile\(nextSession, \{ interactive: true \}\)/);
  assert.match(context, /profileError,[\s\S]*retryProfile,/);
  assert.match(adminRoute, /if \(profileError && !isAdmin\)/);
  assert.match(adminRoute, /Couldn&rsquo;t verify owner access/);
  assert.match(adminRoute, /onClick=\{retryProfile\}/);
});

test('same-user transient profile failures preserve the last verified role', () => {
  const catchBlock = context.match(/\} catch \(error\) \{[\s\S]*?\} finally \{/u)?.[0] || '';
  assert.doesNotMatch(catchBlock, /setProfile\(null\)/);
  assert.match(context, /userId !== loadedProfileUserId[\s\S]*setProfile\(null\)/);
});

test('interactive same-user profile retry clears stale errors and cannot be spammed', () => {
  assert.match(context, /const profileRetryInFlightRef = useRef\(false\)/);
  assert.match(context, /if \(profileRetryInFlightRef\.current\) return/);
  assert.match(context, /profileRetryInFlightRef\.current = true[\s\S]*await retryProfileRef\.current\(\)[\s\S]*profileRetryInFlightRef\.current = false/);
  assert.match(context, /loadProfile\(currentSession, \{ interactive = false \} = \{\}\)/);
  assert.match(context, /userId !== loadedProfileUserId \|\| interactive[\s\S]*setProfileError\(null\)[\s\S]*setProfileLoading\(true\)/);
  assert.match(adminRoute, /onClick=\{retryProfile\} disabled=\{profileLoading\}/);
  assert.match(adminRoute, /profileLoading \? 'Checking…' : 'Retry'/);
});
