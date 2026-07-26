# SQL drift repair design

## Goal

Keep private member notices private and prevent members from changing the email
address attached to their account when an operator re-runs the documented
database setup.

## Scope

The repair covers two existing gaps:

1. The reusable setup files can replace the notice visibility rule with an
   older version that lets any signed-in member read a private notice.
2. The reusable booking setup can replace the profile write guard with an older
   version that lets a member change their email address.

## Approach

Add one forward-only migration that restores both protections for every
database that has already been set up. It will be safe to apply more than once.

Update every reusable setup file that creates either affected protection so its
definition matches the safe behaviour. This prevents a later manual setup run
from undoing the migration.

Add source-level regression tests that verify each reusable definition:

- shows a private notice only to its intended member;
- keeps the existing timing and archive checks for notices;
- rejects member email changes while retaining the existing identity, role and
  creation-date protections.

## Safety and verification

The migration will not modify historical migrations. It will use the existing
access and profile-protection patterns already used by the authoritative
migrations.

Before committing, prove the notice rule with separate member identities in
local PostgreSQL and prove that a member email update is rejected. Re-run the
existing test suite, lint, type check, and production build.

## Out of scope

Replacing the two parallel SQL trees with a generated system is a larger
separate decision. This repair makes both current paths safe without changing
their operational workflow.
