import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { shouldManageDialogTab } from '../src/lib/adminDialogLayer.js';

// Strip comments so a comment line can neither satisfy nor trip an assertion.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readSource(relativePath) {
  return stripComments(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

const classCalendar = readSource('../src/components/admin/ClassCalendarAdmin.jsx');
const events = readSource('../src/components/admin/EventsManager.jsx');
const members = readSource('../src/components/admin/MembersManager.jsx');
const commandCentre = readSource('../src/pages/AdminCommandCentre.jsx');
const authContext = readSource('../src/lib/SupabaseAuthContext.jsx');
const contentManager = readSource('../src/components/admin/ContentManager.jsx');

test('the class editor is remounted per subject and refuses to clobber an open editor', () => {
  // The editor's identity follows its subject, so switching from editing an
  // existing class to a create intent remounts it with a fresh empty form
  // instead of reusing the edited record on the create branch.
  assert.match(classCalendar, /<SessionEditor\s+key=\{editingSession\?\.id \?\? 'new'\}/);
  // The create intent must not null the session while an editor is already open.
  assert.match(classCalendar, /initialAction !== 'create'\) return;\s*if \(showEditor\) \{/);
});

test('per-member roster and booking status selects carry an accessible name', () => {
  assert.match(classCalendar, /<select value=\{r\.status\}[\s\S]*?aria-label=\{`Roster status for \$\{r\.full_name/);
  assert.match(classCalendar, /<select value=\{b\.status\}[\s\S]*?aria-label=\{`Booking request status for \$\{b\.full_name/);
});

test('the event editor is remounted per subject', () => {
  assert.match(events, /<EventEditor\s+key=\{editing\?\.id \?\? 'new'\}/);
});

test('section navigation consults the unsaved-changes guard before navigating', () => {
  assert.match(commandCentre, /export function planAdminNavigation/);
  assert.match(commandCentre, /if \(hasUnsavedChanges\) return \{ prompt: true, switchedSection: false \};/);
  // setSection must run the plan (which prompts on unsaved changes) before it
  // ever navigates — even when the requested section equals the current one.
  assert.match(
    commandCentre,
    /const plan = planAdminNavigation\(\{ nextSection, currentSection: section, hasUnsavedChanges \}\);[\s\S]*?if \(plan\.prompt\) \{[\s\S]*?return false;[\s\S]*?\}[\s\S]*?navigate\(getAdminSectionPath/,
  );
  // The old same-section early-navigate branch (which bypassed the guard) is gone.
  assert.doesNotMatch(commandCentre, /if \(nextSection === section\) \{\s*navigate\(/);
});

test('planAdminNavigation prompts on unsaved changes even for a same-section request', () => {
  // The pure decision lives in a JSX module (not importable under node --test),
  // so its behaviour is asserted from source; the shape below fails on the old
  // ordering where a same-section request navigated before the guard ran.
  assert.match(
    commandCentre,
    /function planAdminNavigation\(\{ nextSection, currentSection, hasUnsavedChanges \}\) \{\s*if \(hasUnsavedChanges\) return \{ prompt: true, switchedSection: false \};\s*return \{ prompt: false, switchedSection: nextSection !== currentSection \};/,
  );
});

test('the member drawer is keyed per member and its detail fetch is guarded', () => {
  assert.match(members, /<MemberDrawer\s+key=\{viewing\.id\}/);
  assert.match(
    members,
    /let active = true;[\s\S]*?adminMemberDetail\(member\.id\)[\s\S]*?return \(\) => \{ active = false; \};\s*\}, \[member\.id\]\)/,
  );
});

test('the dialog layer yields the Tab cycle when focus leaves the workspace', () => {
  const layer = readSource('../src/lib/adminDialogLayer.js');
  assert.match(layer, /if \(!shouldManageDialogTab\(workspace, document\.activeElement\)\) return;/);

  // Focus inside the workspace: this layer keeps trapping.
  assert.equal(shouldManageDialogTab({ contains: () => true }, {}), true);
  // Focus in a portalled Radix dialog (outside the workspace): yield to its own scope.
  assert.equal(shouldManageDialogTab({ contains: () => false }, {}), false);
  // Degenerate inputs never claim ownership of the Tab cycle.
  assert.equal(shouldManageDialogTab({ contains: () => true }, null), false);
  assert.equal(shouldManageDialogTab(null, {}), false);
});

test('CMS drafts are scoped to the signed-in admin and swept on sign-out', () => {
  assert.match(contentManager, /readSiteContentDraft\(window\.localStorage, userId, section\.key\)/);
  assert.match(contentManager, /writeSiteContentDraft\(window\.localStorage, userId, section\.key, data\)/);
  assert.match(contentManager, /userId=\{user\?\.id\}/);

  assert.match(authContext, /import \{ clearSiteContentDrafts \} from '@\/lib\/siteContentDraft'/);
  assert.match(authContext, /event === 'SIGNED_OUT'\) clearSiteContentDrafts\(window\.localStorage\)/);
  // signOut proactively sweeps before delegating to Supabase.
  assert.match(authContext, /const signOut = async \(\) => \{\s*clearSiteContentDrafts\(window\.localStorage\);/);
});
