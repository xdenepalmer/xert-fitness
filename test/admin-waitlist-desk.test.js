import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('admin waitlist overview is bounded and rollout compatible', async () => {
  const source = await read('../src/lib/adminData.js');
  const helper = source.slice(
    source.indexOf('export async function adminWaitlistOverview'),
    source.indexOf('export async function adminSetBookingStatus')
  );

  assert.match(helper, /Math\.max\(1, Math\.min\(50,/);
  assert.match(helper, /rpc\('admin_waitlist_overview', \{ p_limit: safeLimit \}\)/);
  assert.match(helper, /\['42883', 'PGRST202'\]/);
  assert.match(helper, /return \{ rows: \[\], available: false \}/);
});

for (const path of [
  '../src/supabase/admin_cms_schema.sql',
  '../src/supabase/waitlist_fifo_promotion_upgrade.sql',
]) {
  test(`${path} installs a secure operational waitlist desk`, async () => {
    const sql = await read(path);
    const overview = sql.slice(
      sql.indexOf('function public.admin_waitlist_overview'),
      sql.indexOf('revoke execute on function public.admin_waitlist_overview')
    );

    assert.match(overview, /if not public\.is_admin\(\) then raise exception 'ADMIN_ONLY'/i);
    assert.match(overview, /greatest\(1, least\(coalesce\(p_limit, 20\), 50\)\)/i);
    assert.match(overview, /s\.status = 'published' and s\.start_time > now\(\)/i);
    assert.match(overview, /having count\(b\.id\) filter \(where b\.status = 'waitlisted'\) > 0/i);
    assert.match(overview, /order by b\.created_at, b\.id[\s\S]*?limit 1/i);
    assert.match(overview, /sum\(cb\.remaining\)[\s\S]*?cb\.remaining > 0/i);
    assert.match(overview, /order by \(q\.capacity is null or q\.active_count < q\.capacity\) desc/i);
    assert.match(sql, /revoke execute on function public\.admin_waitlist_overview\(integer\) from public, anon/i);
    assert.match(sql, /grant execute on function public\.admin_waitlist_overview\(integer\)\s+to authenticated/i);
  });
}

test('class calendar exposes waitlist blockers, roster access, promotion, and zero-credit skip', async () => {
  const source = await read('../src/components/admin/ClassCalendarAdmin.jsx');

  assert.match(source, /Waitlist desk/);
  assert.match(source, /Future class queues, ordered with open places first\./);
  assert.match(source, /Next member needs a credit/);
  assert.match(source, /Skip — no credits/);
  assert.match(source, /Remove from waitlist\?/);
  assert.match(source, /Waitlisted members do not hold a credit/);
  assert.match(source, /onClick=\{\(\) => onOpen\(item\.session_id\)\}/);
  assert.match(source, /onClick=\{\(\) => onPromote\(item\)\}/);
  assert.match(source, /onClick=\{\(\) => onSkip\(item\)\}/);
  assert.match(source, /adminSetBookingStatus\(candidate\.next_booking_id, 'cancelled'\)/);
  assert.match(source, /adminWaitlistOverview\(20\)/);
  assert.match(source, /expandedBookings === candidate\.session_id \? \[refreshBookings\(candidate\.session_id\)\] : \[\]/);
});

test('promotion no-credit errors point staff at the waitlist desk skip control', async () => {
  const source = await read('../src/lib/adminData.js');
  const promote = source.slice(
    source.indexOf('export async function adminPromoteNextWaitlisted'),
    source.indexOf('export async function adminRecordSessionAttendance')
  );
  assert.match(promote, /WAITLIST_MEMBER_NO_CREDITS\|NO_CREDITS/);
  assert.match(promote, /Skip — no credits on the waitlist desk/);
});

for (const path of [
  '../src/supabase/waitlist_fifo_promotion_upgrade.sql',
  '../src/supabase/credit_batch_refund_reactivation.sql',
  '../supabase/migrations/20260726106000_credit_batch_refund_reactivation.sql',
]) {
  test(`${path} cancels waitlisted heads without refunding a credit`, async () => {
    const sql = await read(path);
    const statusFunction = sql.slice(
      sql.indexOf('create or replace function public.admin_set_booking_status'),
      sql.indexOf('end; $$;', sql.indexOf('create or replace function public.admin_set_booking_status'))
    );
    assert.match(
      statusFunction,
      /p_status in \('waitlisted', 'declined', 'cancelled'\)[\s\S]*v_current in \('requested', 'confirmed', 'attended', 'no_show'\)/
    );
    assert.doesNotMatch(
      statusFunction,
      /v_current in \('requested', 'confirmed', 'attended', 'no_show', 'waitlisted'\)/
    );
  });
}
