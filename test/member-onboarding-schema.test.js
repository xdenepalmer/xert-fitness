import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const migration = read('../supabase/migrations/20260721010000_member_onboarding_foundation.sql');
const upgrade = read('../src/supabase/member_onboarding_upgrade.sql');

function tableDefinition(sql, table) {
  const match = sql.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`, 'i'));
  assert.ok(match, `Expected a ${table} table definition`);
  return match[1];
}

function functionDefinition(sql, fn) {
  const start = sql.indexOf(`create or replace function public.${fn}`);
  assert.ok(start >= 0, `Expected a ${fn} function`);
  const end = sql.indexOf('\n$$;', start);
  assert.ok(end > start, `Expected a complete ${fn} function body`);
  return sql.slice(start, end + 4);
}

test('canonical onboarding migration and manual upgrade stay byte-for-byte equivalent', () => {
  assert.equal(migration.trim(), upgrade.trim());
  assert.match(migration, /values \('member_onboarding_foundation'\)/i);
});

test('foundation separates minimal emergency, document, receipt and reveal data', () => {
  const emergency = tableDefinition(migration, 'member_emergency_contacts');
  const documents = tableDefinition(migration, 'member_onboarding_documents');
  const receipts = tableDefinition(migration, 'member_onboarding_receipts');
  const reveals = tableDefinition(migration, 'member_emergency_contact_reveals');

  assert.match(emergency, /user_id uuid primary key[\s\S]*references public\.profiles\(id\) on delete cascade/i);
  assert.match(emergency, /contact_name text not null/i);
  assert.match(emergency, /contact_phone text not null/i);
  assert.match(emergency, /relationship text not null/i);
  assert.match(emergency, /contact_awareness_confirmed_at timestamptz not null default pg_catalog\.now\(\)/i);

  assert.match(documents, /document_key text not null/i);
  assert.match(documents, /version text not null/i);
  assert.match(documents, /content_sha256 text not null/i);
  assert.match(documents, /published_at timestamptz not null/i);
  assert.match(receipts, /user_id uuid not null[\s\S]*references public\.profiles\(id\) on delete cascade/i);
  assert.match(receipts, /accepted_at timestamptz not null default pg_catalog\.now\(\)/i);
  assert.match(receipts, /unique \(user_id, document_id\)/i);
  assert.match(reveals, /member_user_id uuid not null[\s\S]*references public\.profiles\(id\) on delete cascade/i);
  assert.match(reveals, /revealed_by uuid[\s\S]*on delete set null/i);

  const storedColumns = [emergency, documents, receipts, reveals].join('\n');
  for (const forbidden of [
    /date_of_birth/i,
    /\bdob\b/i,
    /screening_answer/i,
    /diagnosis/i,
    /injur/i,
    /medication/i,
    /free_text/i,
    /\bnotes?\b/i,
    /waiver/i,
    /clearance/i,
  ]) {
    assert.doesNotMatch(storedColumns, forbidden);
  }
  assert.doesNotMatch(reveals, /contact_name|contact_phone|relationship/i);
});

test('sensitive tables have RLS and no direct browser table privileges', () => {
  for (const table of [
    'member_emergency_contacts',
    'member_onboarding_documents',
    'member_onboarding_receipts',
    'member_emergency_contact_reveals',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.doesNotMatch(migration, /create policy .*member_(?:emergency|onboarding)/i);
});

test('member RPCs bind identity to auth and save the complete state atomically', () => {
  const readState = functionDefinition(migration, 'my_member_onboarding()');
  const save = functionDefinition(migration, 'save_my_member_onboarding(');

  for (const fn of [readState, save]) {
    assert.match(fn, /security definer/i);
    assert.match(fn, /set search_path = ''/i);
    assert.match(fn, /auth\.uid\(\)/i);
  }
  assert.doesNotMatch(readState.slice(0, readState.indexOf('returns jsonb')), /p_user_id/i);
  assert.match(save, /p_full_name text[\s\S]*p_phone text[\s\S]*p_emergency_contact_name text[\s\S]*p_emergency_contact_phone text[\s\S]*p_emergency_contact_relationship text[\s\S]*p_contact_is_aware boolean[\s\S]*p_accepted_document_ids uuid\[\][\s\S]*p_source text/i);
  assert.match(save, /p_contact_is_aware is distinct from true[\s\S]*CONTACT_AWARENESS_REQUIRED/i);
  assert.match(save, /v_source not in \('ios_app', 'web_app'\)[\s\S]*INVALID_ONBOARDING_SOURCE/i);
  assert.match(save, /v_accepted_ids is distinct from v_required_ids[\s\S]*ONBOARDING_DOCUMENTS_STALE/i);

  const profileUpdate = save.match(/update public\.profiles[\s\S]*?where id = v_user_id;/i)?.[0];
  assert.ok(profileUpdate);
  assert.match(profileUpdate, /set full_name = v_full_name,[\s\S]*phone = v_phone,[\s\S]*updated_at = pg_catalog\.now\(\)/i);
  assert.doesNotMatch(profileUpdate, /\b(?:role|email|created_at)\s*=/i);
  assert.match(save, /insert into public\.member_emergency_contacts[\s\S]*on conflict \(user_id\) do update/i);
  assert.match(save, /insert into public\.member_onboarding_receipts[\s\S]*on conflict \(user_id, document_id\) do nothing/i);
  assert.match(save, /return public\.member_onboarding_state\(v_user_id\)/i);

  for (const code of [
    'AUTH_REQUIRED',
    'MEMBER_PROFILE_NOT_FOUND',
    'INVALID_FULL_NAME',
    'INVALID_MEMBER_PHONE',
    'INVALID_EMERGENCY_CONTACT_NAME',
    'INVALID_EMERGENCY_CONTACT_PHONE',
    'INVALID_EMERGENCY_CONTACT_RELATIONSHIP',
    'CONTACT_AWARENESS_REQUIRED',
    'INVALID_ONBOARDING_SOURCE',
    'ONBOARDING_DOCUMENTS_REQUIRED',
    'ONBOARDING_DOCUMENTS_STALE',
  ]) {
    assert.match(save + readState, new RegExp(code));
  }
});

test('member state is authoritative, current-document aware and privacy bounded', () => {
  const state = functionDefinition(migration, 'member_onboarding_state(');
  assert.match(state, /security definer/i);
  assert.match(state, /set search_path = ''/i);
  assert.doesNotMatch(state, /\bstable\b/i);
  assert.match(state, /document\.required is true[\s\S]*document\.published_at <= pg_catalog\.now\(\)[\s\S]*document\.retired_at is null/i);
  for (const key of [
    'user_id',
    'profile',
    'emergency_contact',
    'required_documents',
    'accepted_documents',
    'profile_complete',
    'emergency_contact_complete',
    'documents_complete',
    'is_complete',
  ]) {
    assert.match(state, new RegExp(`'${key}'`));
  }
  assert.match(state, /v_required_count > 0 and v_accepted_count = v_required_count/i);
});

test('published acknowledgement is exact, current and immutable', () => {
  const bodyMatch = migration.match(/\$document\$([\s\S]*?)\$document\$/);
  assert.ok(bodyMatch);
  const body = bodyMatch[1];
  const digest = createHash('sha256').update(body, 'utf8').digest('hex');
  assert.equal(digest, 'edd59a910635b592e61a1a3c044830bb06dec29fc6cdf1cf7e09ec8629f50c3a');
  assert.match(migration, new RegExp(`'${digest}'`));
  assert.match(body, /18 years of age or older/i);
  assert.match(body, /Australian Adult Pre-Exercise Screening System \(APSS\)/i);
  assert.match(body, /https:\/\/ausactive\.org\.au\/policies-guidelines\/adult-pre-exercise-screening-system\//i);
  assert.match(body, /not medical advice, diagnosis, treatment or medical clearance/i);
  assert.match(migration, /'6b2b521e-7f49-4a8b-9a76-3b9e3dc0e501'[\s\S]*'adult_readiness_acknowledgement'[\s\S]*'2026-07-21\.1'/i);
  assert.match(migration, /member_onboarding_documents_immutable[\s\S]*before update or delete/i);
  assert.match(migration, /ONBOARDING_DOCUMENT_DRIFT/i);
});

test('receipts and reveal audits are append-only without breaking account deletion cascades', () => {
  const appendOnlyGuard = functionDefinition(migration, 'guard_member_onboarding_append_only()');
  assert.match(migration, /member_onboarding_receipts_no_update[\s\S]*before update on public\.member_onboarding_receipts/i);
  assert.match(migration, /member_emergency_contact_reveals_no_update[\s\S]*before update on public\.member_emergency_contact_reveals/i);
  assert.doesNotMatch(migration, /before (?:update or )?delete on public\.member_onboarding_receipts/i);
  assert.doesNotMatch(migration, /before (?:update or )?delete on public\.member_emergency_contact_reveals/i);
  assert.match(appendOnlyGuard, /tg_table_name = 'member_emergency_contact_reveals'/i);
  assert.match(appendOnlyGuard, /old\.revealed_by is not null[\s\S]*new\.revealed_by is null/i);
  assert.match(appendOnlyGuard, /to_jsonb\(new\) - 'revealed_by'[\s\S]*to_jsonb\(old\) - 'revealed_by'/i);
  assert.match(appendOnlyGuard, /return new;[\s\S]*MEMBER_ONBOARDING_AUDIT_IMMUTABLE/i);
});

test('owner summary omits raw contact and deliberate reveal is audited before disclosure', () => {
  const summary = functionDefinition(migration, 'admin_member_onboarding_summary(');
  const reveal = functionDefinition(migration, 'admin_reveal_member_emergency_contact(');
  const summaryReturn = summary.match(/returns table \(([\s\S]*?)\)\nlanguage/i)?.[1];
  assert.ok(summaryReturn);
  assert.match(summaryReturn, /user_id uuid[\s\S]*profile_complete boolean[\s\S]*emergency_contact_complete boolean[\s\S]*documents_complete boolean[\s\S]*onboarding_complete boolean/i);
  assert.doesNotMatch(summaryReturn, /contact_name|contact_phone|\brelationship\b/i);
  assert.match(summary, /public\.is_admin\(\)[\s\S]*ADMIN_ONLY/i);
  assert.match(summary, /pg_catalog\.cardinality\(p_user_ids\) not between 1 and 100/i);

  assert.match(reveal, /public\.is_admin\(\)[\s\S]*ADMIN_ONLY/i);
  const auditInsert = reveal.indexOf('insert into public.member_emergency_contact_reveals');
  const responseBuild = reveal.indexOf('return pg_catalog.jsonb_build_object');
  assert.ok(auditInsert >= 0 && responseBuild > auditInsert);
  assert.match(reveal, /returning id, revealed_at into v_reveal_id, v_revealed_at/i);
  assert.match(reveal, /'audit_event_id'[\s\S]*'revealed_at'[\s\S]*'emergency_contact'/i);
});

test('RPC execution grants are narrow and helper functions remain private', () => {
  for (const signature of [
    'public.my_member_onboarding\\(\\)',
    'public.save_my_member_onboarding\\(text, text, text, text, text, boolean, uuid\\[\\], text\\)',
    'public.admin_member_onboarding_summary\\(uuid\\[\\]\\)',
    'public.admin_reveal_member_emergency_contact\\(uuid\\)',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function ${signature}[\\s\\S]*?from public, anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function ${signature}[\\s\\S]*?to authenticated`, 'i'));
  }
  assert.match(migration, /revoke all on function public\.member_onboarding_state\(uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant execute on function public\.member_onboarding_state/i);
});
