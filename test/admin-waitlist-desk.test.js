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

test('class calendar exposes waitlist blockers, roster access, and direct promotion', async () => {
  const source = await read('../src/components/admin/ClassCalendarAdmin.jsx');

  assert.match(source, /Waitlist desk/);
  assert.match(source, /Future class queues, ordered with open places first\./);
  assert.match(source, /Next member needs a credit/);
  assert.match(source, /onClick=\{\(\) => onOpen\(item\.session_id\)\}/);
  assert.match(source, /onClick=\{\(\) => onPromote\(item\)\}/);
  assert.match(source, /adminWaitlistOverview\(20\)/);
  assert.match(source, /expandedBookings === session\.id \? \[refreshBookings\(session\.id\)\] : \[\]/);
});
