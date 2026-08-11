import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native repeat planner is bounded, calendar-aware and preserves draft safety', async () => {
  const planner = await read('../ios/XertFitnessApp/XertFitnessApp/AdminClassRepeat.swift');

  assert.match(planner, /static let intervalOptions = \[1, 2, 7, 8, 14\]/);
  assert.match(planner, /static let maximumCopies = 26/);
  assert.match(planner, /calendar\.date\([\s\S]*byAdding: \.day/);
  assert.match(planner, /draft\.status = mode\.rawValue/);
  assert.match(planner, /draft\.publicVisible = mode == \.published && classSession\.public_visible == true/);
  assert.match(planner, /Published copies must start in the future/);
  assert.match(planner, /end <= start/);
});

test('native repeat creation uses one atomic bounded PostgREST insert', async () => {
  const api = await read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const start = api.indexOf('func adminCreateClasses(');
  const end = api.indexOf('func adminUpdateClass(', start);
  assert.notEqual(start, -1, 'bulk class API should exist');
  assert.notEqual(end, -1, 'bulk class API boundary should exist');
  const method = api.slice(start, end);

  assert.match(method, /minimumCopies\.\.\.AdminClassRepeatPlan\.maximumCopies/);
  assert.match(method, /let payloads = try drafts\.map\(adminClassPayload\)/);
  assert.match(method, /path: "\/rest\/v1\/class_sessions"/);
  assert.match(method, /request\.httpBody = try JSONEncoder\(\)\.encode\(payloads\)/);
  assert.match(method, /ids\.count == drafts\.count/);
  assert.doesNotMatch(method, /for .*adminCreateClass|drafts\.map \{[^}]*adminCreateClass/);
});

test('native timetable repeat mutation rejects stale sources and forces reconciliation after uncertainty', async () => {
  const store = await read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift');
  const start = store.indexOf('func repeatClass(');
  const end = store.indexOf('func cancelClass(', start);
  assert.notEqual(start, -1, 'repeat mutation should exist');
  assert.notEqual(end, -1, 'repeat mutation boundary should exist');
  const method = store.slice(start, end);

  assert.match(method, /loadedSources\.contains\("full timetable"\)/);
  assert.match(method, /!refreshUnavailableSources\.contains\("full timetable"\)/);
  assert.match(method, /guard currentClass == classSession/);
  assert.match(method, /plan\.makeDrafts\(from: currentClass\)/);
  assert.match(method, /api\.adminCreateClasses\(session: session, drafts: drafts\)/);
  assert.match(method, /markScheduleSourceUnavailable\("full timetable"\)/);
  assert.match(method, /Do not repeat this block again; refresh Full Timetable/);
});

test('native repeat sheet exposes interval, count, publish choice, preview and busy protection', async () => {
  const [schedule, sheet] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminClassRepeatView.swift'),
  ]);

  const scheduleStart = schedule.indexOf('private struct AdminScheduleView: View');
  const scheduleEnd = schedule.indexOf('private struct AdminClassCancellationFollowUpView: View', scheduleStart);
  const timetable = schedule.slice(scheduleStart, scheduleEnd);
  assert.match(timetable, /@State private var repeatingClass: AdminClassSession\?/);
  assert.match(timetable, /Label\("Repeat class\.\.\."/);
  assert.match(timetable, /\.sheet\(item: \$repeatingClass\)[\s\S]*AdminClassRepeatView/);

  assert.match(sheet, /Stepper\([\s\S]*AdminClassRepeatPlan\.minimumCopies\.\.\.AdminClassRepeatPlan\.maximumCopies/);
  assert.match(sheet, /Picker\("Status", selection: \$plan\.mode\)/);
  assert.match(sheet, /plan\.previewDates\(for: classSession\)/);
  assert.match(sheet, /safeAreaInset\(edge: \.bottom, spacing: 0\)/);
  assert.match(sheet, /interactiveDismissDisabled\(isCreating\)/);
  assert.match(sheet, /XertHaptics\.play\(\.success\)/);
  assert.match(sheet, /XertHaptics\.play\(\.error\)/);
  assert.match(sheet, /accessibilityIdentifier\("owner\.classRepeat\.create"\)/);
});
