import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift');
const home = read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift');

test('push navigation carries the exact notice into Home', () => {
  assert.match(root, /@State private var announcementID: UUID\?/);
  assert.match(root, /@State private var announcementNavigationRequest = 0/);
  assert.match(root, /HomeView\([\s\S]*announcementID: announcementID[\s\S]*announcementNavigationRequest: announcementNavigationRequest/);
  assert.match(root, /consumePendingAnnouncementID\(\)[\s\S]*announcementID = pendingAnnouncementID[\s\S]*announcementNavigationRequest \+= 1[\s\S]*selectedTab = 0/);
});

test('native Home exposes a stable notice badge and bounded preview', () => {
  assert.match(home, /noticeCount: store\.announcements\.count/);
  assert.match(home, /noticeCount > 0 \? "bell\.fill" : "bell"/);
  assert.ok(home.includes(String.raw`accessibilityLabel("Member notices, \(noticeCount) available")`));
  assert.match(home, /store\.announcements\.prefix\(2\)/);
  assert.match(home, /actionTitle: store\.announcements\.count > 2 \? "View all" : nil/);
});

test('notice centre supports push highlighting, actions and dismissal', () => {
  assert.match(home, /struct MemberNoticeCenter: View/);
  assert.match(home, /highlightedAnnouncementID/);
  assert.match(home, /showingNoticeCenter = true/);
  assert.match(home, /lastHandledAnnouncementRequest/);
  assert.match(home, /onAction: \{ announcement in[\s\S]*handleAnnouncementAction\(announcement\)/);
  assert.match(home, /onDismiss: \{ announcement in[\s\S]*store\.dismissAnnouncement\(announcement\)/);
  assert.match(home, /presentationDetents\(\[\.medium, \.large\]\)/);
});

test('shared native sections preserve existing calls while allowing a header command', () => {
  assert.match(root, /struct XertSection<Content: View>/);
  assert.match(root, /actionTitle: String\? = nil/);
  assert.match(root, /action: \(\(\) -> Void\)\? = nil/);
  assert.match(root, /if let actionTitle, let action[\s\S]*Button\(actionTitle, action: action\)/);
});
