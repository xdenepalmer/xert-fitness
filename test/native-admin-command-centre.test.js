import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native app exposes the command centre only to admin profiles', async () => {
  const [models, root, view, api] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Models.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
  ]);

  assert.match(models, /let role: String\?/);
  assert.match(models, /var isAdmin: Bool \{ role == "admin" \}/);
  assert.match(root, /if store\.profile\?\.isAdmin == true[\s\S]*AdminCommandCentreView\(\)/);
  assert.match(view, /Owner access required/);
  assert.match(api, /select", value: "id,full_name,phone,email,role"/);
});

test('native owner workspace uses protected operational RPCs and real actions', async () => {
  const [api, adminStore, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  for (const rpc of [
    'admin_daily_operations',
    'admin_waitlist_overview',
    'admin_member_follow_up_queue',
    'admin_list_members_page',
    'admin_promote_next_waitlisted',
    'admin_add_member_note',
    'admin_update_request',
  ]) assert.match(api, new RegExp(`path: "${rpc}"`));

  assert.match(adminStore, /func promoteNext/);
  assert.match(adminStore, /func logFollowUp/);
  assert.match(adminStore, /func searchMembers/);
  assert.match(view, /AdminMembersView/);
  assert.match(view, /AdminClassesView/);
  assert.match(view, /AdminRetentionView/);
  assert.match(view, /AdminFinanceView/);
  assert.match(view, /AdminPlatformView/);
  assert.match(view, /AdminPTRequestsView/);
  assert.match(view, /AdminCommunicationsView/);
  assert.match(api, /adminUpdatePlatformSettings/);
  assert.match(api, /adminUpdatePTRequest/);
  assert.match(api, /adminPublishAnnouncement/);
  assert.match(api, /\/api\/admin-publish-announcement/);
  assert.match(api, /URLQueryItem\(name: "updated_at", value: "eq\.\\\(settings\.updated_at\)"\)/);
});
