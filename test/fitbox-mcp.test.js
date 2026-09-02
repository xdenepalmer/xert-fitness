import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  FITBOX_MCP_ACTIONS,
  FITBOX_MCP_FEEDS,
  FITBOX_MCP_FEED_KEYS,
  extractToolPayload,
  fitboxActionArguments,
  fitboxMcpEnvironment,
  fitboxRegisterArguments,
  gatewayCapabilities,
  matchProfilesToFitboxUsers,
  mcpToolCallRequest,
  normalizeFitboxAttendance,
  normalizeFitboxClasses,
  normalizeFitboxFeed,
  normalizeFitboxPush,
  normalizeFitboxSubscription,
  normalizeFitboxUser,
  parseMcpResponseText,
  summarizeFitboxMirror,
  toolResultRows,
} from '../src/lib/fitboxMcp.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

// Shapes recorded from the live connector on 2 September 2026; values are synthetic.
const USER = { id: '100999', firstname: 'Test', lastname: 'Member', email: 'Test.Member@Example.com', dob: '1990-01-01', gender: 'Female', address1: '1 Test St', city: 'Kingaroy', state: 'Queensland', postcode: '4610', country: 'AU', contact_phone: '+61.400 000 000', current_weight: 70, height: 170, status: 'active', anniversary_date: '2026-08-31T00:00:00.000Z', secondary_email: 'x@example.com', role: 'member', customFields: { note: 'private' } };
const STATUS = { id: '100999', email: 'test.member@example.com', gymId: '545', status: 'active', role: 'member', created_at: '2026-08-31T08:08:53.000Z', updated_at: '2026-08-31T09:13:07.000Z' };
const SUBSCRIPTION = { id: '193470', product_id: 12675, product_name: 'Foundation - Full Access Unlimited Membership', customer_id: 100999, email: 'test.member@example.com', status: 'active', payment_gateway: 'stripe', price_in_cents: 3590, set_up_price_in_cents: 0, discount_percentage: 0, start_date: '2026-09-01T00:00:00.000Z', expiration_date: null, sessions_count: 4, sessions_count_last_reset: '2026-09-02T00:00:00.000Z', created_at: '2026-09-01T12:19:10.000Z', updated_at: '2026-09-02T11:33:51.000Z' };
const ATTENDANCE = { attendanceId: '6695543', classId: '8363', className: 'Xert functional fitness training', eventId: '3055210', sessionStartTime: '2026-09-04T22:00:00.000Z', status: 'booked', userId: '100999', gymId: 545 };

test('the MCP gateway fails closed until the Zapier server URL and gym are valid', () => {
  assert.deepEqual(fitboxMcpEnvironment({}).missing, ['ZAPIER_MCP_URL', 'FITBOX_GYM_ID']);
  assert.equal(fitboxMcpEnvironment({ ZAPIER_MCP_URL: 'http://mcp.zapier.com/api/mcp/mcp', FITBOX_GYM_ID: '545' }).ready, false);
  assert.equal(fitboxMcpEnvironment({ ZAPIER_MCP_URL: 'https://evil.example/api/mcp/mcp', FITBOX_GYM_ID: '545' }).ready, false);
  assert.equal(fitboxMcpEnvironment({ ZAPIER_MCP_URL: 'https://user:pw@mcp.zapier.com/api/mcp/mcp', FITBOX_GYM_ID: '545' }).ready, false);
  const ready = fitboxMcpEnvironment({ ZAPIER_MCP_URL: 'https://mcp.zapier.com/api/mcp/s/abc123/mcp', ZAPIER_MCP_TOKEN: 'tok_0123456789abcdef', FITBOX_GYM_ID: '545' });
  assert.equal(ready.ready, true);
  assert.equal(ready.gymId, '545');
  assert.equal(ready.token, 'tok_0123456789abcdef');
  assert.equal(fitboxMcpEnvironment({ ZAPIER_MCP_URL: 'https://mcp.zapier.com/api/mcp/mcp', ZAPIER_MCP_TOKEN: 'short', FITBOX_GYM_ID: '545' }).ready, false);
});

test('tool calls use JSON-RPC tools/call with the FitBox app scoped to the gym', () => {
  const args = fitboxActionArguments({ ...FITBOX_MCP_ACTIONS.get_user, params: { user_id: 'someone@example.com' }, gymId: '545' });
  assert.deepEqual(args, { selected_api: 'FitboxCLIAPI', action: 'get_user', tool_name: 'fitbox_get_user', params: { user_id: 'someone@example.com', gym_id: '545' } });
  const request = mcpToolCallRequest({ id: 'req-1', tool: 'execute_zapier_read_action', arguments: args });
  assert.equal(request.jsonrpc, '2.0');
  assert.equal(request.method, 'tools/call');
  assert.equal(request.params.name, 'execute_zapier_read_action');
  assert.throws(() => mcpToolCallRequest({ id: 'x', tool: 'bad tool name', arguments: {} }), /INVALID_MCP_TOOL/);
  assert.throws(() => fitboxActionArguments({ action: 'drop table', tool: 'fitbox_get_user', gymId: '545' }), /INVALID_FITBOX_ACTION/);
  for (const feed of FITBOX_MCP_FEED_KEYS) assert.match(FITBOX_MCP_FEEDS[feed].tool, /^fitbox_[a-z_]+$/);
  assert.equal(FITBOX_MCP_ACTIONS.register_user.kind, 'write');
  assert.equal(Object.hasOwn(FITBOX_MCP_ACTIONS, 'update_user'), false, 'Update User stays unavailable');
});

test('responses are read from plain JSON or server-sent events and errors surface', () => {
  const json = JSON.stringify({ jsonrpc: '2.0', id: 'a', result: { content: [{ type: 'text', text: JSON.stringify({ results: [ATTENDANCE] }) }] } });
  assert.equal(toolResultRows(extractToolPayload(parseMcpResponseText(json, 'a')))[0].attendanceId, '6695543');
  const sse = ['event: message', 'data: {"jsonrpc":"2.0","id":"b","result":{"content":[{"type":"text","text":"{\\"results\\":[]}"}]}}', '', 'data: [DONE]'].join('\n');
  assert.deepEqual(toolResultRows(extractToolPayload(parseMcpResponseText(sse, 'b'))), []);
  assert.throws(() => parseMcpResponseText(JSON.stringify({ jsonrpc: '2.0', id: 'c', error: { code: -32600, message: 'Invalid authorization token' } }), 'c'), /MCP_ERROR: Invalid authorization token/);
  assert.throws(() => parseMcpResponseText(json, 'other'), /MCP_RESPONSE_MISSING/);
  assert.throws(() => extractToolPayload({ isError: true, content: [{ type: 'text', text: 'Gym not found' }] }), /FITBOX_ACTION_FAILED: Gym not found/);
  assert.deepEqual(toolResultRows(extractToolPayload({ content: [{ type: 'text', text: '[{"id":"1"}]' }] })), [{ id: '1' }]);
});

test('member profiles keep contact and status fields and drop health, body and address data', () => {
  const user = normalizeFitboxUser(USER, '545');
  assert.equal(user.fitbox_user_id, '100999');
  assert.equal(user.email, 'test.member@example.com');
  assert.equal(user.first_name, 'Test');
  assert.equal(user.phone, '+61.400 000 000');
  assert.equal(user.city, 'Kingaroy');
  assert.equal(user.status, 'active');
  assert.equal(user.anniversary_date, '2026-08-31');
  for (const key of ['dob', 'gender', 'current_weight', 'height', 'address1', 'secondary_email', 'customFields']) {
    assert.equal(Object.hasOwn(user, key), false, `${key} must never be mirrored`);
  }
  assert.throws(() => normalizeFitboxUser({ firstname: 'No', lastname: 'Id' }, '545'), /INVALID_FITBOX_RECORD/);
});

test('subscriptions, statuses and attendance normalize with stable provider identifiers', () => {
  const subscription = normalizeFitboxSubscription(SUBSCRIPTION, '545');
  assert.equal(subscription.fitbox_subscription_id, '193470');
  assert.equal(subscription.fitbox_user_id, '100999');
  assert.equal(subscription.product_id, '12675');
  assert.equal(subscription.price_in_cents, 3590);
  assert.equal(subscription.start_date, '2026-09-01');
  assert.equal(subscription.expiration_date, null);
  assert.equal(subscription.sessions_count, 4);

  const attendance = normalizeFitboxAttendance(ATTENDANCE, '545', 'booked');
  assert.equal(attendance.fitbox_attendance_id, '6695543');
  assert.equal(attendance.fitbox_event_id, '3055210');
  assert.equal(attendance.fitbox_class_id, '8363');
  assert.equal(attendance.session_start_time, '2026-09-04T22:00:00.000Z');
  assert.throws(() => normalizeFitboxAttendance({ ...ATTENDANCE, gymId: 999 }, '545', 'booked'), /FITBOX_GYM_MISMATCH/);
  assert.throws(() => normalizeFitboxAttendance(ATTENDANCE, '545', 'anything'), /INVALID_FITBOX_RECORD/);

  const statuses = normalizeFitboxFeed('statuses', [STATUS, { id: 'bad id!' }], '545');
  assert.equal(statuses.accepted.length, 1);
  assert.equal(statuses.rejected, 1);
  assert.equal(statuses.accepted[0].provider_updated_at, '2026-08-31T09:13:07.000Z');

  // A cancellation poll that only echoes bookings must not record cancellations.
  const cancellations = normalizeFitboxFeed('cancellations', [ATTENDANCE, { ...ATTENDANCE, attendanceId: '1', status: 'cancelled' }], '545');
  assert.equal(cancellations.accepted.length, 1);
  assert.equal(cancellations.accepted[0].status, 'cancelled');
  assert.throws(() => normalizeFitboxFeed('nope', [], '545'), /INVALID_FITBOX_FEED/);
});

test('classes come from the connector enum and member links require a unique exact email on both sides', () => {
  assert.deepEqual(normalizeFitboxClasses([{ value: '8363', label: 'Xert functional fitness training' }, { value: 'bad id', label: 'x' }]), [{ fitbox_class_id: '8363', name: 'Xert functional fitness training' }]);
  const links = matchProfilesToFitboxUsers(
    [{ fitbox_user_id: '1', email: 'a@example.com' }, { fitbox_user_id: '2', email: 'dup@example.com' }, { fitbox_user_id: '3', email: 'dup@example.com' }, { fitbox_user_id: '4', email: 'b@example.com' }],
    [{ id: '0f7d3a4a-2f2c-4a1b-9c2d-1f2e3a4b5c6d', email: 'A@example.com' }, { id: '1f7d3a4a-2f2c-4a1b-9c2d-1f2e3a4b5c6d', email: 'dup@example.com' }, { id: 'not-a-uuid', email: 'b@example.com' }],
  );
  assert.deepEqual(links, [{ profile_id: '0f7d3a4a-2f2c-4a1b-9c2d-1f2e3a4b5c6d', fitbox_user_id: '1', email: 'a@example.com' }]);
});

test('prospect registration sends only bounded contact fields and the mirror summary counts safely', () => {
  const args = fitboxRegisterArguments({ full_name: '  Jane   Citizen ', email: 'Jane@Example.com', phone: '0400 000 000', suburb_town: 'Kingaroy', dob: '1990-01-01' });
  assert.deepEqual(args, { firstname: 'Jane', lastname: 'Citizen', email: 'jane@example.com', contact_phone: '0400 000 000', city: 'Kingaroy' });
  assert.throws(() => fitboxRegisterArguments({ full_name: 'Prince', email: 'p@example.com', phone: '1' }), /FITBOX_FULL_NAME_REQUIRED/);
  const summary = summarizeFitboxMirror({
    users: [{ status: 'active', role: 'member' }, { status: 'active', role: 'staff' }, { status: 'prospect', role: 'member' }],
    subscriptions: [{ status: 'active', price_in_cents: 3590 }, { status: 'active', price_in_cents: 0 }, { status: 'cancelled', price_in_cents: 10 }],
    attendance: [{ status: 'booked', session_start_time: '2999-01-01T00:00:00.000Z' }, { status: 'booked', session_start_time: '2000-01-01T00:00:00.000Z' }, { status: 'cancelled', feed: 'cancelled' }],
    now: new Date('2026-09-02T00:00:00Z'),
  });
  assert.deepEqual(summary, { users: { total: 3, active: 1, prospects: 1, staff: 1 }, subscriptions: { total: 3, active: 2, paid_active: 1 }, attendance: { upcoming: 1, cancelled: 1 } });
});

test('the live mirror migration is admin-readable, service-written and registered as a capability', async () => {
  const sql = await read('../supabase/migrations/20260903000000_fitbox_live_mirror.sql');
  for (const table of ['fitbox_users', 'fitbox_subscriptions', 'fitbox_attendance', 'fitbox_classes', 'fitbox_sync_runs']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`create policy "${table}_admin_read" on public\\.${table} for select to authenticated using \\(public\\.is_admin\\(\\)\\)`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }
  for (const column of ['dob', 'gender', 'weight', 'height', 'address1']) {
    assert.doesNotMatch(sql, new RegExp(`\\b${column}\\b\\s+(text|date|integer)`), `${column} must not be mirrored`);
  }
  assert.match(sql, /lead_type in \('member_interest', 'member_profile'\)/);
  assert.match(sql, /link_method in \('zapier_register_prospect', 'zapier_mcp_register', 'verified_email'\)/);
  assert.match(sql, /values \('fitbox_live_mirror'\)/);
  const capabilities = await read('../src/lib/schemaCapabilities.js');
  assert.match(capabilities, /fitbox_live_mirror: 'Apply supabase\/migrations\/20260903000000_fitbox_live_mirror\.sql/);
  const vercel = JSON.parse(await read('../vercel.json'));
  assert.equal(vercel.functions['api/admin-fitbox-integration.js'].maxDuration, 60, 'gateway calls can take longer than the default function budget');
});

test('the gateway API is admin-gated, fail-closed and never logs provider payloads', async () => {
  const api = await read('../api/admin-fitbox-integration.js');
  for (const symbol of ['callZapierMcp', 'fitboxAction', 'runFitboxSync', 'lookupFitbox', 'registerProspectViaGateway', 'refreshUserViaGateway', 'fitboxOverview', 'gatewayFailureResponse']) {
    assert.match(api, new RegExp(`async function ${symbol}|function ${symbol}`), `${symbol} must exist`);
  }
  assert.match(api, /if \(!config\.ready\) throw new Error\('FITBOX_MCP_NOT_CONFIGURED'\)/);
  assert.match(api, /redirect: 'error'/);
  assert.match(api, /MCP_UNAUTHORIZED/);
  assert.match(api, /'sync_fitbox', 'lookup_fitbox'/);
  assert.match(api, /async function gatewayTools/);
  assert.match(api, /FITBOX_FEED_UNAVAILABLE/);
  assert.match(api, /gym_id: numericGym\(config\.gymId\)/);
  assert.match(api, /wantsOverview[\s\S]*fitboxOverview\(admin\)/);
  // Gateway timeouts on a write cannot prove FitBox did nothing, so retries stay blocked.
  assert.match(api, /code === 'FITBOX_GATEWAY_TIMEOUT' \? 'dispatch_unknown' : 'failed'/);
  const gateway = api.slice(api.indexOf('async function callZapierMcp'), api.indexOf('export default async function handler'));
  for (const line of gateway.split('\n').filter(item => /console\.(info|warn|error)/.test(item))) {
    assert.doesNotMatch(line, /payload|record|email|phone|token|config\.url/, `gateway log must stay bounded: ${line.trim()}`);
  }
  const workspaces = await read('../src/lib/adminWorkspaces.js');
  assert.match(workspaces, /key: 'fitbox', label: 'FitBox', detail: 'Members, memberships, bookings and sync'/);
  const centre = await read('../src/pages/AdminCommandCentre.jsx');
  assert.match(centre, /case 'fitbox': return <FitboxHub/);
  const hub = await read('../src/components/admin/FitboxHub.jsx');
  for (const tab of ['overview', 'members', 'memberships', 'bookings', 'review', 'setup']) assert.match(hub, new RegExp(`key: '${tab}'`));
  const members = await read('../src/components/admin/MembersManager.jsx');
  assert.match(members, /<FitboxMemberPanel member=\{member\} \/>/);
  const navigation = await read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift');
  assert.match(navigation, /case \.fitbox: return "FitBox"/);
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  assert.match(view, /case \.fitbox:\s+AdminFitboxView\(admin: admin, session: session\)/);
  const yaml = await read('../codemagic.yaml');
  assert.match(yaml, /fitbox_live_mirror/);
});

test('the gateway tells a dynamic Zapier server from an actions-only one', () => {
  const dynamic = gatewayCapabilities(['execute_zapier_read_action', 'execute_zapier_write_action', 'inspect_zapier_actions']);
  assert.equal(dynamic.mode, 'dynamic');
  assert.equal(dynamic.feeds_available, true);
  assert.deepEqual(dynamic.actions, { get_user: true, next_session: true, register_user: true });
  const fixed = gatewayCapabilities(['get_configuration_url', 'list_dynamic_enum_values', 'fitbox_get_user', 'fitbox_get_users_next_session', 'fitbox_register_user', 'fitbox_update_user']);
  assert.equal(fixed.mode, 'static');
  assert.equal(fixed.feeds_available, false);
  assert.deepEqual(fixed.tools, ['fitbox_get_user', 'fitbox_get_users_next_session', 'fitbox_register_user', 'fitbox_update_user']);
  const withFeeds = gatewayCapabilities(['list_dynamic_enum_values', 'fitbox_get_user', 'fitbox_user_profile_changed', 'fitbox_class_session_booked']);
  assert.equal(withFeeds.mode, 'static');
  assert.equal(withFeeds.feeds_available, true);
  assert.equal(withFeeds.feeds.users, true);
  assert.equal(withFeeds.feeds.subscriptions, false);
  assert.equal(withFeeds.classes_available, true);
  assert.deepEqual(fixed.actions, { get_user: true, next_session: true, register_user: true });
  assert.equal(gatewayCapabilities(['get_configuration_url']).mode, 'empty');
});

test('push Zaps can carry bounded mirror fields and fall back to review-only when identity is missing', () => {
  const user = normalizeFitboxPush('user_profile_changed', { fitbox_user_id: '100999', fitbox_first_name: 'Test', fitbox_last_name: 'Member', fitbox_email: 'TEST@example.com', fitbox_phone: '0400', status: 'Active', fitbox_role: 'member', provider_updated_at: '2026-09-02T00:00:00Z', dob: '1990-01-01' }, '545');
  assert.equal(user.feed, 'users');
  assert.equal(user.row.email, 'test@example.com');
  assert.equal(user.row.status, 'active');
  assert.equal(user.row.provider_updated_at, '2026-09-02T00:00:00.000Z');
  assert.equal(Object.hasOwn(user.row, 'dob'), false);
  const subscription = normalizeFitboxPush('user_subscription_changed', { fitbox_subscription_id: '193470', fitbox_user_id: '100999', product_name: 'Foundation', status: 'active', price_in_cents: '3590', start_date: '2026-09-01' }, '545');
  assert.equal(subscription.feed, 'subscriptions');
  assert.equal(subscription.row.price_in_cents, 3590);
  const booked = normalizeFitboxPush('class_session_booked', { fitbox_booking_id: '6695543', fitbox_session_id: '3055210', fitbox_class_id: '8363', class_name: 'Xert functional fitness training', fitbox_user_id: '100999', session_start_time: '2026-09-04T22:00:00.000Z' }, '545');
  assert.equal(booked.feed, 'bookings');
  assert.equal(booked.row.status, 'booked');
  const cancelled = normalizeFitboxPush('class_session_cancelled', { fitbox_booking_id: '1', fitbox_user_id: '100999' }, '545');
  assert.equal(cancelled.feed, 'cancellations');
  assert.equal(cancelled.row.status, 'cancelled');
  assert.equal(normalizeFitboxPush('class_session_booked', { fitbox_user_id: '100999' }, '545'), null, 'no attendance id means review only');
  assert.equal(normalizeFitboxPush('user_status_changed', { status: 'active' }, '545'), null);
  assert.equal(normalizeFitboxPush('unknown_event', { fitbox_user_id: '1' }, '545'), null);
});
