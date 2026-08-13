import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('form submissions preserve the form each respondent actually completed', async () => {
  const [sql, completion] = await Promise.all([
    read('../supabase/migrations/20260813010000_xert_form_response_snapshots.sql'),
    read('../supabase/migrations/20260813020000_require_versioned_form_submissions.sql'),
  ]);

  assert.match(sql, /add column if not exists form_snapshot jsonb/);
  assert.match(sql, /'questions', f\.questions/);
  assert.match(sql, /'header_media_type', f\.header_media_type/);
  assert.match(sql, /'header_media_url', f\.header_media_url/);
  assert.match(sql, /'header_media_caption', f\.header_media_caption/);
  assert.match(sql, /'snapshot_source', 'legacy_backfill'/);
  assert.match(sql, /'snapshot_source', 'captured_at_submission'/);
  assert.match(sql, /'collect_name_required', f\.collect_name_required/);
  assert.match(sql, /where f\.id = r\.form_id[\s\S]*r\.form_snapshot is null/);
  assert.match(sql, /alter column form_snapshot set not null/);
  assert.match(sql, /before insert on public\.xert_form_responses/);
  assert.match(sql, /new\.form_snapshot is distinct from old\.form_snapshot/);
  assert.match(sql, /new\.answers is distinct from old\.answers/);
  assert.match(sql, /new\.id is distinct from old\.id/);
  assert.match(sql, /Submitted form records are immutable/);
  assert.match(completion, /values \('form_response_snapshots'\)/);
  assert.match(completion, /revoke all on function public\.submit_xert_form_response[\s\S]*from public, anon, authenticated/);
});
