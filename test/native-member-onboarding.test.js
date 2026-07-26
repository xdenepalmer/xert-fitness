import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native member readiness uses the authoritative private RPC contract', async () => {
  const [models, api, store] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Models.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
  ]);

  assert.match(models, /struct MemberOnboardingState: Codable, Hashable/);
  assert.match(models, /let required_documents: \[MemberOnboardingDocument\]/);
  assert.match(models, /let accepted_documents: \[MemberOnboardingAcceptance\]/);
  assert.match(models, /p_source = "ios_app"/);
  assert.match(models, /adultReadinessDocumentKey = "adult_readiness_acknowledgement"/);
  assert.match(models, /var confirmsAdultEligibility: Bool/);
  assert.match(models, /guard draft\.confirmsAdultEligibility else/);
  assert.match(models, /draft\.acceptedDocumentIDs\.contains\(adultDocument\.id\)/);
  assert.doesNotMatch(models, /let p_(?:is_adult|confirms_adult_eligibility)/);
  assert.match(models, /\(6\.\.\.32\)\.contains\(value\.count\)/);
  assert.match(models, /\(6\.\.\.15\)\.contains\(digitCount\)/);
  assert.match(models, /range: 2\.\.\.60/);

  assert.match(api, /func memberOnboarding[\s\S]*path: "my_member_onboarding"/);
  assert.match(api, /func saveMemberOnboarding[\s\S]*path: "save_my_member_onboarding"/);

  assert.match(store, /@Published private\(set\) var isLoadingMemberOnboarding = false/);
  assert.match(store, /private var onboardingOperationVersion = MemberStateVersion\(\)/);
  assert.match(store, /let onboardingVersion = beginMemberOnboardingRead\(\)[\s\S]*async let onboardingRequest = loadMemberOnboardingIfRequested/);
  assert.match(store, /loadedOnboarding[\s\S]*onboardingOperationVersion\.isCurrent\(onboardingVersion\)[\s\S]*applyMemberOnboarding/);
  const saveOperation = store.slice(
    store.indexOf('func saveMemberOnboarding('),
    store.indexOf('func updatePassword('),
  );
  assert.match(saveOperation, /onboardingOperationVersion\.invalidate\(\)/);
  assert.match(saveOperation, /isLoadingMemberOnboarding = false/);
  assert.match(saveOperation, /onboardingOperationVersion\.isCurrent\(onboardingVersion\)/);
  const readOperation = store.slice(
    store.indexOf('func refreshMemberOnboarding()'),
    store.indexOf('func saveMemberOnboarding('),
  );
  assert.match(readOperation, /!isLoadingMemberOnboarding/);
  assert.match(readOperation, /beginMemberOnboardingRead\(\)/);
  assert.match(readOperation, /finishMemberOnboardingRead\(operationVersion: onboardingVersion\)/);
  const clearMemberData = store.slice(
    store.indexOf('private func clearMemberData()'),
    store.indexOf('private func applyMemberOnboarding'),
  );
  assert.match(clearMemberData, /memberOnboarding = nil/);
  assert.match(clearMemberData, /onboardingLoaded = false/);
  assert.match(clearMemberData, /onboardingErrorMessage = nil/);
});

test('native readiness form is private, editable, complete and advisory', async () => {
  const [view, home, account] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/MemberOnboardingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift'),
  ]);

  assert.match(view, /Form \{/);
  assert.match(view, /\.privacySensitive\(\)/);
  assert.match(view, /\.interactiveDismissDisabled\(hasUnsavedChanges/);
  assert.match(view, /Text\(document\.body\)/);
  assert.match(view, /Text\("V\\\(document\.version\)"\)/);
  assert.match(view, /if let sourceURL = document\.sourceURL/);
  assert.match(view, /I confirm I am 18 years of age or older and acknowledge this document/);
  assert.match(view, /Under 18\? Do not submit this adult form\./);
  assert.match(view, /Contact XERT with a parent or guardian/);
  assert.match(view, /AppConfig\.webURL\(path: "contact"\)/);
  assert.doesNotMatch(view, /Follow its adult, under-18 and parent or guardian instructions/);
  assert.match(view, /does not diagnose a condition or block class browsing or bookings/);
  assert.match(view, /\.disabled\(isSaveInFlight\)[\s\S]*\.scrollDismissesKeyboard/);
  assert.match(view, /isSubmitting = true[\s\S]*defer \{ isSubmitting = false \}[\s\S]*store\.saveMemberOnboarding/);
  assert.match(view, /store\.isLoadingMemberOnboarding \|\| isSaveInFlight/);
  assert.match(view, /if next\.emergencyContact(?:Name|Phone|Relationship) != value \{ next\.contactIsAware = false \}/);
  assert.match(view, /if let draftingUserID, draftingUserID != state\.user_id/);
  assert.match(view, /guard onboarding != nil else \{[\s\S]*clearPrivateDraft\(\)/);
  assert.match(view, /private func clearPrivateDraft\(\)[\s\S]*draft = nil[\s\S]*baseline = nil/);
  assert.doesNotMatch(view, /@AppStorage|@SceneStorage|UserDefaults|NSUserActivity|onContinueUserActivity/);

  for (const launcher of [home, account]) {
    assert.match(launcher, /MemberReadinessStatusCard/);
    assert.match(launcher, /MemberOnboardingView\(\)/);
    assert.match(launcher, /\.presentationDetents\(\[\.large\]\)/);
  }
});

test('native admin lead pipelines use explicit privacy-safe projections', async () => {
  const api = await read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const leadPipeline = api.slice(
    api.indexOf('func adminLeads('),
    api.indexOf('func adminCampaignAttribution('),
  );

  assert.match(leadPipeline, /URLQueryItem\(name: "select", value: adminLeadSelect\(for: pipeline\)\)/);
  assert.match(leadPipeline, /id,full_name,email,phone,status,admin_notes,created_at,utm_source,utm_medium,utm_campaign/);
  assert.match(leadPipeline, /suburb_town,current_training_level,main_training_goals,preferred_training_times/);
  assert.match(leadPipeline, /qualifications,years_experience,functional_training_experience,specialties,short_intro/);
  assert.match(leadPipeline, /profession,business_name,services_offered,short_intro,website_social_link/);
  assert.doesNotMatch(leadPipeline, /value: "\*"/);
  assert.doesNotMatch(
    leadPipeline,
    /injuries_or_limitations_optional|health_info_consent|consent_to_contact|mailing_list_consent/,
  );
});
