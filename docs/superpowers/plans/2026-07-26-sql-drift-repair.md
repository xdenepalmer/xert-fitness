# SQL Drift Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure private notices and member email protection survive both new migrations and repeat runs of the documented database setup.

**Architecture:** A forward-only migration restores the safe database state for deployed projects. The reusable setup files choose the enhanced rule only after its required tables and columns exist, preserving first-time setup order while preventing a later re-run from downgrading protection. One regression test checks every definition that can otherwise reintroduce the older behaviour.

**Tech Stack:** PostgreSQL 16, Supabase RLS, Node.js test runner.

## Global Constraints

- Do not edit an already-applied migration.
- Add the forward migration and its matching reusable SQL file.
- Preserve the existing announcement timing, expiry, archival, administrator, identity, role, and creation-date checks.
- The reusable files must still run before the private-notice tables and profile email column exist.
- Verify the RLS rule and the profile trigger against local PostgreSQL before committing.

---

### Task 1: Add a regression test for the safe definitions

**Files:**
- Create: `test/sql-drift-repair.test.js`
- Modify: `src/supabase/booking_schema.sql:51-72`
- Modify: `src/supabase/booking_schema.sql:1120-1127`
- Modify: `src/supabase/announcement_archival_upgrade.sql:223-235`
- Test: `test/sql-drift-repair.test.js`

**Interfaces:**
- Consumes: SQL definitions stored in the reusable setup files.
- Produces: A test that fails whenever either reusable path omits the targeted-notice predicate or email immutability check.

- [ ] **Step 1: Write the failing test**

```js
test('every reusable announcement policy preserves targeted recipient access', () => {
  for (const sql of [bookingSchema, archivalUpgrade]) {
    assert.match(sql, /audience = 'all'[\s\S]*audience = 'targeted'/i);
    assert.match(sql, /member_announcement_targets target[\s\S]*target\.user_id = \(select auth\.uid\(\)\)/i);
  }
});

test('the reusable profile guard prevents members changing email', () => {
  assert.match(bookingSchema, /new\.email is distinct from old\.email[\s\S]*PROFILE_EMAIL_MANAGED_BY_AUTH/i);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test test/sql-drift-repair.test.js`

Expected: Both assertions fail because the reusable notice policies omit recipient filtering and the booking schema omits the email guard.

- [ ] **Step 3: Update the reusable definitions**

Replace both reusable policy definitions with a conditional SQL block. When the
`audience` column and target table both exist, it installs the following
recipient restriction inside the live-notice branch:

```sql
and (
  audience = 'all'
  or (
    audience = 'targeted'
    and exists (
      select 1
      from public.member_announcement_targets target
      where target.announcement_id = member_announcements.id
        and target.user_id = (select auth.uid())
    )
  )
)
```

When the profile email column exists, the reusable profile guard must include
the following check after the role check:

```sql
if new.email is distinct from old.email then
  raise exception 'PROFILE_EMAIL_MANAGED_BY_AUTH';
end if;
```

When the column does not exist, it must retain the existing guard without that
check. When `audience` exists but the target table does not, the notice policy
must fail closed by allowing only `audience = 'all'`; it must never fall back to
showing targeted notices to every member.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test test/sql-drift-repair.test.js`

Expected: PASS with two tests and no failures.

### Task 2: Restore the protections on deployed databases

**Files:**
- Create: `supabase/migrations/20260726070214_sql_drift_repair.sql`
- Create: `src/supabase/sql_drift_repair.sql`
- Modify: `README.md`
- Test: `test/sql-drift-repair.test.js`

**Interfaces:**
- Consumes: `public.member_announcements`, `public.member_announcement_targets`, `public.profiles`, `public.is_admin()`, and `public.guard_profile_write()`.
- Produces: An idempotent migration that replaces the stale policy and guard with the safe definitions.

- [ ] **Step 1: Extend the failing test to require a mirrored, safe migration**

```js
test('the deployed repair and reusable copy are identical and protect both gaps', () => {
  assert.equal(migration.replace(/\r\n/g, '\n'), reusableRepair.replace(/\r\n/g, '\n'));
  assert.match(migration, /drop policy if exists "member_announcements_select_live_or_admin"/i);
  assert.match(migration, /audience = 'targeted'[\s\S]*target\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /new\.email is distinct from old\.email[\s\S]*PROFILE_EMAIL_MANAGED_BY_AUTH/i);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test test/sql-drift-repair.test.js`

Expected: FAIL because neither repair file exists.

- [ ] **Step 3: Generate and write the migration**

Run: `supabase migration new sql_drift_repair`

Expected: a newly created migration file under `supabase/migrations/`.

Put this complete idempotent repair in the generated migration and copy it unchanged to `src/supabase/sql_drift_repair.sql`:

```sql
-- Restore protections that older reusable setup files could overwrite.
-- The policy allows a member to read a targeted notice only when that member
-- owns a matching target row. The trigger keeps email identity auth-managed.

create or replace function public.guard_profile_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      if coalesce(new.role, 'member') <> 'member' then
        raise exception 'PROFILE_ROLE_MANAGED_BY_ADMIN';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.id is distinct from old.id then
        raise exception 'PROFILE_ID_IMMUTABLE';
      end if;
      if new.role is distinct from old.role then
        raise exception 'PROFILE_ROLE_MANAGED_BY_ADMIN';
      end if;
      if new.email is distinct from old.email then
        raise exception 'PROFILE_EMAIL_MANAGED_BY_AUTH';
      end if;
      if new.created_at is distinct from old.created_at then
        raise exception 'PROFILE_CREATED_AT_IMMUTABLE';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists "member_announcements_select_live_or_admin" on public.member_announcements;
create policy "member_announcements_select_live_or_admin"
  on public.member_announcements for select
  to authenticated
  using (
    public.is_admin()
    or (
      archived_at is null
      and published_at is not null
      and published_at <= now()
      and (expires_at is null or expires_at > now())
      and (
        audience = 'all'
        or (
          audience = 'targeted'
          and exists (
            select 1
            from public.member_announcement_targets target
            where target.announcement_id = member_announcements.id
              and target.user_id = (select auth.uid())
          )
        )
      )
    )
  );

revoke execute on function public.guard_profile_write() from public, anon, authenticated;
```

Add `src/supabase/sql_drift_repair.sql` to the README's database-file list and existing-database application order.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test test/sql-drift-repair.test.js`

Expected: PASS with three tests and no failures.

### Task 3: Prove the database behaviour and run project checks

**Files:**
- Verify: `supabase/migrations/20260726070214_sql_drift_repair.sql`
- Verify: `src/supabase/sql_drift_repair.sql`
- Verify: `test/sql-drift-repair.test.js`

**Interfaces:**
- Consumes: the completed repair migration and test.
- Produces: executable proof that an unintended member cannot read a targeted notice or update their email.

- [ ] **Step 1: Start local PostgreSQL**

Run:

```bash
PGD=/var/tmp/pgdata
rm -rf "$PGD"
mkdir -p "$PGD"
chown postgres:postgres "$PGD"
chmod 700 "$PGD"
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGD -A trust -U postgres"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGD -o '-k /var/tmp -p 5433' -l /var/tmp/pg.log start"
```

Expected: PostgreSQL accepts connections on `/var/tmp`, port `5433`.

- [ ] **Step 2: Apply a minimal reproduction and the repair**

Run a SQL fixture that creates `auth.uid()`, `public.is_admin()`, `public.profiles`, `public.member_announcements`, and `public.member_announcement_targets`; then load the migration. Set one member identity at a time with `set request.jwt.claim.sub`, and assert:

```sql
select count(*) = 1 as intended_member_sees_notice from public.member_announcements;
select count(*) = 0 as other_member_cannot_see_notice from public.member_announcements;
update public.profiles set email = 'changed@example.com' where id = auth.uid();
```

Expected: the intended member sees one row, the other member sees no rows, and the update raises `PROFILE_EMAIL_MANAGED_BY_AUTH`.

- [ ] **Step 3: Run the complete automated checks**

Run:

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: all tests pass, lint and type checking are clean, and the production build succeeds.

- [ ] **Step 4: Commit the implementation**

Run:

```bash
git add README.md src/supabase/booking_schema.sql src/supabase/announcement_archival_upgrade.sql src/supabase/sql_drift_repair.sql supabase/migrations/20260726070214_sql_drift_repair.sql test/sql-drift-repair.test.js
git commit -m "Prevent reusable SQL setup from weakening member protections"
git push -u origin cursor/repair-sql-drift-c73d
```

Expected: the repair is committed and pushed before its pull request is updated.
