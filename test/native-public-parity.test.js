import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native Explore mirrors public CMS, team, training and acquisition workflows', async () => {
  const [root, explore, home, booking, store, api, cache] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/ExploreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/PublicDataCache.swift'),
  ]);

  assert.match(root, /ExploreView/);
  assert.match(root, /Label\("Explore", systemImage: "safari"\)/);
  for (const feature of ['About XERT Fitness', 'Coaches and practitioners', 'Functional training guide', 'Frequently asked questions', 'Contact XERT']) {
    assert.match(explore, new RegExp(feature));
  }
  for (const kind of ['\.member', '\.trainer', '\.partner']) assert.match(explore, new RegExp(`NativeInterestFormView\\(kind: ${kind}\\)`));
  assert.match(explore, /NativeMultiSelect/);
  assert.match(home, /content: store\.publicContent\(for: \.hero\)/);
  assert.match(home, /content\.photos[\s\S]*compactMap[\s\S]*publicPhotoURL/);
  assert.match(booking, /store\.publicContent\(for: \.booking\)\.intro/);
  assert.match(store, /func submitInterest\(kind: NativeInterestKind/);
  assert.match(api, /func coaches\(\)/);
  assert.match(api, /func siteContent\(\)/);
  assert.match(api, /func submitMemberInterest/);
  assert.match(api, /func submitTrainerInterest/);
  assert.match(api, /func submitPartnerInterest/);
  assert.match(api, /source = "ios_app"|submitPublicInterest/);
  assert.match(cache, /let coaches: \[AdminCoach\]/);
  assert.match(cache, /let siteContent: \[AdminSiteContentRow\]/);
});

test('native acquisition forms protect long drafts and expose reachable validation', async () => {
  const [explore, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/ExploreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Models.swift'),
  ]);
  const form = explore.slice(
    explore.indexOf('private struct NativeInterestFormView'),
    explore.indexOf('private struct NativeMultiSelect'),
  );
  const contract = models.slice(
    models.indexOf('enum NativeInterestKind'),
    models.indexOf('struct CheckoutResponse'),
  );

  assert.match(form, /@State private var baselineDraft = NativeInterestDraft\(\)/);
  assert.match(form, /@FocusState private var focusedField: InterestField\?/);
  assert.match(form, /draft\.validationMessage\(for: kind\)/);
  assert.match(form, /interest\.validation/);
  assert.match(form, /\.scrollDismissesKeyboard\(\.interactively\)/);
  assert.match(form, /ToolbarItemGroup\(placement: \.keyboard\)[\s\S]*Button\("Done"\)/);
  assert.match(form, /\.navigationBarBackButtonHidden\(true\)/);
  assert.match(form, /Discard unfinished[\s\S]*Discard application/);
  assert.match(form, /\.interactiveDismissDisabled\(hasUnsavedChanges \|\| store\.isSubmittingInterest\)/);
  assert.match(form, /baselineDraft = draft[\s\S]*submitted = true/);
  assert.match(form, /frame\(width: 44, height: 44\)/);

  assert.match(contract, /func validationMessage\(for kind: NativeInterestKind\) -> String\?/);
  assert.match(contract, /\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$/);
  assert.match(contract, /phone\.filter\(\{ \$0\.isNumber \}\)\.count >= 8/);
  assert.match(contract, /must be \\\(maximum\.formatted\(\)\) characters or fewer/);
  assert.match(contract, /Website or social link must begin with http:\/\/ or https:\/\//);
  assert.doesNotMatch(contract, /String\(clean\.prefix\(5_000\)\)/);
});
