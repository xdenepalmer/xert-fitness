import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schemaPaths = [
  '../src/supabase/admin_cms_schema.sql',
  '../src/supabase/event_goals_upgrade.sql'
];

test('both database installation paths secure the admin event roster RPC', () => {
  for (const path of schemaPaths) {
    const sql = readFileSync(new URL(path, import.meta.url), 'utf8');

    assert.match(sql, /create or replace function public\.admin_event_goal_members\(p_event_id uuid\)/i);
    assert.match(sql, /if not public\.is_admin\(\) then raise exception 'ADMIN_ONLY'/i);
    assert.match(sql, /revoke execute on function public\.admin_event_goal_members\(uuid\) from public, anon/i);
    assert.match(sql, /grant execute on function public\.admin_event_goal_members\(uuid\)\s+to authenticated/i);
    assert.match(sql, /where g\.event_id = p_event_id/i);
  }
});
