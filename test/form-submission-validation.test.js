import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('the public submission RPC rejects answers for unknown or unpresented fields', async () => {
  const sql = await read('../supabase/migrations/20260813010000_xert_form_response_snapshots.sql');

  assert.match(sql, /create or replace function public\.submit_xert_form_response_v2\(/);
  assert.match(sql, /for v_answer_key, v_answer in select key, value from jsonb_each\(p_answers\)/);
  assert.match(sql, /The submission contains an unknown answer/);
  assert.match(sql, /v_question_type in \('section_break', 'statement'\)/);
  assert.match(sql, /v_answer_key = any\(v_skipped_ids\)/);
  assert.match(sql, /an answer for a field that was not presented/);
  assert.match(sql, /revoke all on function public\.submit_xert_form_response_v2[\s\S]*from public/);
  assert.match(sql, /grant execute on function public\.submit_xert_form_response_v2[\s\S]*to anon, authenticated/);
});

test('submission records are locked to the exact public form version', async () => {
  const [sql, client, page, completion] = await Promise.all([
    read('../supabase/migrations/20260813010000_xert_form_response_snapshots.sql'),
    read('../src/lib/xertForms.js'),
    read('../src/pages/PublicForm.jsx'),
    read('../supabase/migrations/20260813020000_require_versioned_form_submissions.sql'),
  ]);

  assert.match(sql, /returns table \([\s\S]*updated_at timestamptz/);
  assert.match(sql, /p_form_updated_at timestamptz/);
  assert.match(sql, /for update/);
  assert.match(sql, /v_form\.updated_at is distinct from p_form_updated_at/);
  assert.match(sql, /Refresh and review the latest wording before submitting/);
  assert.match(sql, /not one_response_per_email or collect_email_required/);
  assert.match(client, /rpc\('submit_xert_form_response_v2'/);
  assert.match(client, /p_form_updated_at: formUpdatedAt/);
  assert.match(page, /formUpdatedAt: form\.updated_at/);
  assert.match(completion, /revoke all on function public\.submit_xert_form_response/);
});

test('database branching mirrors the complete forward-only builder sequence', async () => {
  const sql = await read('../supabase/migrations/20260813010000_xert_form_response_snapshots.sql');

  assert.match(sql, /from jsonb_array_elements\(v_form\.questions\) with ordinality/);
  assert.match(sql, /v_question_type not in \('single_choice', 'multiple_choice', 'dropdown', 'yes_no'\)/);
  assert.match(sql, /\(v_question ->> 'id'\) = any\(v_skipped_ids\)[\s\S]*continue/);
  assert.match(sql, /jsonb_array_length\(v_answer\) = 1/);
  assert.match(sql, /v_skip_target_number > v_question_position \+ 1/);
  assert.match(sql, /least\(v_skip_target_number, v_question_count \+ 1\)/);
  assert.match(sql, /if v_skip_target >= v_question_position \+ 2 then/);
  assert.match(sql, /for v_skip_step in \(v_question_position \+ 1\)\.\.\(v_skip_target - 1\)/);
  assert.match(sql, /or v_question_id = any\(v_skipped_ids\)[\s\S]*continue/);
  assert.match(sql, /Please complete every required question/);
});

test('the RPC validates JSON types, configured choices, rating ranges and signature bytes', async () => {
  const sql = await read('../supabase/migrations/20260813010000_xert_form_response_snapshots.sql');

  for (const jsonType of ['string', 'number', 'array', 'object']) {
    assert.match(sql, new RegExp(`jsonb_typeof\\(v_answer\\) is distinct from '${jsonType}'`));
  }
  assert.match(sql, /jsonb_array_elements_text\(v_options\)/);
  assert.match(sql, /One or more choice answers are invalid/);
  assert.match(sql, /v_answer_number <> trunc\(v_answer_number\)/);
  assert.match(sql, /v_answer_number not between 1 and 5/);
  assert.match(sql, /v_answer_number not between 0 and 10/);
  assert.match(sql, /v_answer_number not between v_scale_min and v_scale_max/);
  assert.match(sql, /octet_length\(p_value\) > 524288/);
  assert.match(sql, /\^data:image\/\(png\|jpeg\);base64/);
  assert.match(sql, /return octet_length\(decode\(v_payload, 'base64'\)\) <= 393216/);
  assert.match(sql, /if not public\.xert_valid_form_signature\(v_answer_text\)/);
});

test('required compound fields need semantic content and trigger helpers are private', async () => {
  const sql = await read('../supabase/migrations/20260813010000_xert_form_response_snapshots.sql');

  assert.match(sql, /create or replace function public\.xert_form_answer_is_present\(p_answer jsonb\)/);
  assert.match(sql, /when 'string'[\s\S]*btrim\(p_answer #>> '\{\}'\) <> ''/);
  assert.match(sql, /when 'array'[\s\S]*xert_form_answer_is_present\(v_item\)/);
  assert.match(sql, /when 'object'[\s\S]*xert_form_answer_is_present\(v_item\)/);
  assert.match(sql, /not coalesce\(public\.xert_form_answer_is_present\(v_answer\), false\)/);
  assert.match(sql, /v_question_type = 'file_upload'[\s\S]*nullif\(btrim\(v_answer ->> 'name'\), ''\) is null/);
  assert.match(sql, /revoke all on function public\.xert_form_answer_is_present\(jsonb\) from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.xert_valid_form_signature\(text\) from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.xert_touch_form_updated_at\(\) from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.xert_capture_form_response_snapshot\(\) from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.xert_preserve_form_response_record\(\) from public, anon, authenticated/);
});
