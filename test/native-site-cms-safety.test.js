import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('native site CMS keeps owner drafts private and removes legacy unscoped copy', async () => {
  const [models, store, view, swiftTests] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift'),
  ]);

  const draftStore = models.slice(
    models.indexOf('enum AdminSiteContentDraftStore'),
    models.indexOf('struct AdminBookingSession'),
  );
  const cms = view.slice(
    view.indexOf('private struct AdminSiteContentEditor'),
    view.indexOf('private struct AdminCampaignAttributionView'),
  );

  assert.match(draftStore, /ownerID\.uuidString\.lowercased\(\)/);
  assert.match(draftStore, /defaults\.removeObject\(forKey: legacyKey\(section\)\)/);
  assert.match(draftStore, /guard let ownerID else \{ return nil \}/);
  assert.match(draftStore, /guard let ownerID, let encoded/);
  assert.match(cms, /ownerID: session\.user\?\.id/);
  assert.match(cms, /AdminSiteContentDraftStore\.save\(value, section: section, ownerID: ownerID\)/);
  assert.match(store, /AdminSiteContentDraftStore\.clear\(section, ownerID: session\.user\?\.id\)/);
  assert.match(swiftTests, /XCTAssertNil\(AdminSiteContentDraftStore\.load\(\.faq, ownerID: otherOwnerID/);
  assert.match(swiftTests, /XCTAssertNil\(defaults\.data\(forKey: "xert\.admin\.site-content\.draft\.faq"\)\)/);
});

test('native site CMS uses stable identity and bounds-safe collection edits', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  const cms = view.slice(
    view.indexOf('private struct AdminSiteContentEditor'),
    view.indexOf('private struct AdminCampaignAttributionView'),
  );

  assert.match(cms, /ForEach\(draft\.items \?\? \[\]\) \{ item in/);
  assert.match(cms, /faqRow\(itemID: item\.id\)/);
  assert.match(cms, /firstIndex\(where: \{ \$0\.id == itemID \}\)/);
  assert.match(cms, /draft\.items\?\.removeAll \{ \$0\.id == itemID \}/);
  assert.match(cms, /@State private var photoItemIDs: \[UUID\]/);
  assert.match(cms, /@State private var paragraphItemIDs: \[UUID\]/);
  assert.match(cms, /ForEach\(photoItemIDs, id: \\\.self\) \{ itemID in/);
  assert.match(cms, /heroPhotoRow\(itemID: itemID\)/);
  assert.match(cms, /ForEach\(paragraphItemIDs, id: \\\.self\) \{ itemID in/);
  assert.match(cms, /editableTextListRow\(itemID: itemID\)/);
  assert.match(cms, /paragraphItemIDs\.firstIndex\(of: itemID\)/);
  assert.match(cms, /moveParagraph\(id: itemID, to: to\)/);
  assert.match(cms, /removeParagraph\(id: itemID\)/);
  assert.match(cms, /movePhoto\(id: itemID, to: to\)/);
  assert.match(cms, /removePhoto\(id: itemID\)/);
  assert.match(cms, /private func replaceDraft\(with value: AdminSiteContentData\)/);
  assert.match(cms, /photoItemIDs = \(value\.photos \?\? \[\]\)\.map/);
  assert.match(cms, /values\.indices\.contains\(source\)/);
  assert.match(cms, /values\.indices\.contains\(index\)/);
  assert.match(cms, /ToolbarItemGroup\(placement: \.keyboard\)/);
  assert.match(cms, /ToolbarItem\(placement: \.navigationBarTrailing\)/);
  assert.match(cms, /private var canPublish: Bool/);
  assert.match(cms, /Button\(action: publish\)/);
  assert.match(cms, /editorIsFocused = false[\s\S]*removingElement/);
  assert.doesNotMatch(cms, /ForEach\(\(draft\.items \?\? \[\]\)\.indices/);
  assert.doesNotMatch(cms, /ForEach\(\(draft\.(?:photos|paragraphs) \?\? \[\]\)\.indices/);
  assert.doesNotMatch(cms, /draft\.items\?\[index\]\.(?:q|a)/);
  assert.doesNotMatch(cms, /draft\.(?:items|paragraphs|photos)\?\.remove\(at: index\)/);
});
