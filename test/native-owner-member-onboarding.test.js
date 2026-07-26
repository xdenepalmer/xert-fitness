import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('owner member records show readiness without leaking emergency details into the directory', async () => {
  const [models, api, store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  assert.match(models, /struct AdminMemberOnboardingSummary:[\s\S]*let onboarding_complete: Bool/);
  assert.match(models, /struct AdminMemberEmergencyContactReveal:[\s\S]*let audit_event_id: UUID/);
  assert.match(api, /adminMemberOnboardingSummaries[\s\S]*admin_member_onboarding_summary/);
  assert.match(api, /adminRevealMemberEmergencyContact[\s\S]*admin_reveal_member_emergency_contact/);
  assert.match(store, /memberDetailGeneration/);
  assert.match(store, /async let onboardingRequest = api\.adminMemberOnboardingSummary/);
  assert.match(store, /func revealMemberEmergencyContact[\s\S]*loadedMemberDetailID == memberID/);
  assert.match(store, /func clearMemberDetail[\s\S]*revealedMemberEmergencyContact = nil/);
  assert.match(store, /func clearRevealedMemberEmergencyContact\(\)[\s\S]*emergencyContactRevealGeneration &\+= 1[\s\S]*revealedMemberEmergencyContact = nil/);
  assert.match(view, /onChange\(of: scenePhase\)[\s\S]*phase == \.active else \{[\s\S]*clearRevealedMemberEmergencyContact\(\)/);

  const directory = view.slice(
    view.indexOf('private struct AdminMembersView'),
    view.indexOf('private struct AdminMemberDetailView'),
  );
  assert.doesNotMatch(directory, /emergency.?contact/i);

  const detail = view.slice(
    view.indexOf('private struct AdminMemberDetailView'),
    view.indexOf('private struct AdminCreditGrantView'),
  );
  assert.match(detail, /Section\("Member readiness"\)/);
  assert.match(detail, /Label\("Reveal emergency contact", systemImage: "cross\.case"\)/);
  assert.match(detail, /Every reveal is recorded with the administrator and time/);
  assert.match(detail, /revealed_at\.formatted[\s\S]*\.privacySensitive\(\)/);
  assert.match(detail, /\.onDisappear \{ admin\.clearMemberDetail\(memberID: current\.id\) \}/);
  assert.doesNotMatch(detail, /\.task[\s\S]{0,180}revealMemberEmergencyContact/);
});
