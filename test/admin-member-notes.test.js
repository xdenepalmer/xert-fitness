import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeMemberNote, normalizeMemberNoteArchive } from '../src/lib/memberAdmin.js';

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const NOTE_ID = '22222222-2222-4222-8222-222222222222';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('member notes normalize trusted fields and trim their body', () => {
  assert.deepEqual(normalizeMemberNote(MEMBER_ID, ' FOLLOW_UP ', '  Called about goal review.  '), {
    userId: MEMBER_ID,
    category: 'follow_up',
    body: 'Called about goal review.'
  });
  assert.deepEqual(normalizeMemberNoteArchive(NOTE_ID, 1), { noteId: NOTE_ID, archived: true });
});

test('member note validation rejects invalid identifiers, categories and body lengths', () => {
  assert.throws(() => normalizeMemberNote('bad-id', 'general', 'Valid note'), /valid member account/i);
  assert.throws(() => normalizeMemberNote(MEMBER_ID, 'medical', 'Valid note'), /valid member note category/i);
  assert.throws(() => normalizeMemberNote(MEMBER_ID, 'general', 'x'), /between 3 and 1,000/i);
  assert.throws(() => normalizeMemberNoteArchive('bad-id', true), /valid member note/i);
});

test('admin member notes use dedicated RPCs and tolerate only a missing list migration', () => {
  const source = read('../src/lib/adminData.js');
  assert.match(source, /rpc\('admin_list_member_notes'/);
  assert.match(source, /p_limit: pageSize/);
  assert.match(source, /p_offset: \(page - 1\) \* pageSize/);
  assert.match(source, /collectAdminBatches/);
  assert.match(source, /rpc\('admin_add_member_note'/);
  assert.match(source, /rpc\('admin_set_member_note_archived'/);
  assert.match(source, /\['42883', 'PGRST202'\]/);
  assert.match(source, /memberNotesAvailable: notes\.available/);
});

test('member drawer exposes a bounded, safety-labelled archive workflow', () => {
  const source = read('../src/components/admin/MembersManager.jsx');
  assert.match(source, /Staff notes/);
  assert.match(source, /maxLength=\{1000\}/);
  assert.match(source, /Avoid unnecessary clinical or sensitive personal information/);
  assert.match(source, /Show archived/);
  assert.match(source, /Restore staff note/);
  assert.match(source, /<AdminConfirmDialog/);
  assert.match(source, /Archived notes remain available to administrators and can be restored later/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(source, /admin_member_notes_upgrade\.sql/);
});

test('../supabase/migrations/20260714003000_admin_member_notes.sql keeps historical bounded list contract', () => {
  const sql = read('../supabase/migrations/20260714003000_admin_member_notes.sql');
  assert.match(sql, /create table if not exists public\.admin_member_notes/i);
  assert.match(sql, /admin_list_member_notes[\s\S]*limit 100/i);
  assert.match(sql, /revoke execute on function public\.admin_list_member_notes\(uuid, boolean\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.admin_list_member_notes\(uuid, boolean\) to authenticated/i);
  assert.match(sql, /values \('admin_member_notes'\)/i);
});

for (const path of [
  '../src/supabase/admin_cms_schema.sql',
  '../src/supabase/admin_member_notes_upgrade.sql',
  '../src/supabase/admin_member_service_history_paging.sql',
  '../supabase/migrations/20260726124000_admin_member_service_history_paging.sql',
]) {
  test(`${path} pages member notes past the old hard 100 cut`, () => {
    const sql = read(path);
    if (path.includes('admin_member_notes') || path.includes('admin_cms_schema')) {
      assert.match(sql, /create table if not exists public\.admin_member_notes/i);
      assert.match(sql, /admin_member_notes_user_id_fkey[\s\S]*on delete cascade/i);
      assert.match(sql, /admin_member_notes_author_id_fkey[\s\S]*on delete set null/i);
      assert.match(sql, /alter table public\.admin_member_notes enable row level security/i);
      assert.match(sql, /revoke all on table public\.admin_member_notes from public, anon, authenticated/i);
      assert.match(sql, /create policy "admin_member_notes_admin_read"[\s\S]*public\.is_admin\(\)/i);
      assert.match(sql, /category in \('general', 'coaching', 'follow_up', 'billing'\)/i);
      assert.match(sql, /char_length\(btrim\(body\)\) between 3 and 1000/i);
      assert.equal((sql.match(/if not public\.is_admin\(\) then raise exception 'ADMIN_ONLY'/gi) || []).length >= 3, true);
      for (const signature of [
        'admin_add_member_note\\(uuid, text, text\\)',
        'admin_set_member_note_archived\\(uuid, boolean\\)'
      ]) {
        assert.match(sql, new RegExp(`revoke execute on function public\\.${signature} from public, anon`, 'i'));
        assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to authenticated`, 'i'));
      }
      assert.match(sql, /values \('admin_member_notes'\)/i);
    }
    assert.match(sql, /p_limit integer default 500/i);
    assert.match(sql, /p_offset integer default 0/i);
    assert.match(sql, /limit v_limit offset v_offset/i);
    assert.doesNotMatch(sql, /admin_list_member_notes[\s\S]*limit 100;/i);
    assert.match(
      sql,
      /revoke execute on function public\.admin_list_member_notes\(uuid, boolean, integer, integer\) from public, anon/i,
    );
    assert.match(
      sql,
      /grant execute on function public\.admin_list_member_notes\(uuid, boolean, integer, integer\) to authenticated/i,
    );
    assert.match(sql, /admin_member_service_history_paging/i);
  });
}
