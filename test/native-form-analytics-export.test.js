import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native form detail exposes compact response analytics and status coverage', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormsView.swift');
  const detail = view.slice(
    view.indexOf('private struct AdminFormDetailView'),
    view.indexOf('private enum AdminFormResponseCSVExport'),
  );

  assert.match(detail, /Section\("Analytics"\)/);
  assert.match(detail, /GridItem\(\.adaptive\(minimum: dynamicTypeSize\.isAccessibilitySize/);
  assert.match(detail, /averageCompletionSeconds/);
  assert.match(detail, /statusCount\("new"\)/);
  assert.match(detail, /statusCount\("reviewed"\)/);
  assert.match(detail, /statusCount\("followed_up"\)/);
  assert.match(detail, /statusCount\("closed"\)/);
  assert.match(detail, /accessibilityLabel\("\\\(label\), \\\(value\)"\)/);
});

test('native response CSV is a real ShareLink file with robust escaping', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormsView.swift');
  const exporter = view.slice(
    view.indexOf('private enum AdminFormResponseCSVExport'),
    view.indexOf('private struct AdminFormResponseView'),
  );

  assert.match(view, /ShareLink\(item: exportURL/);
  assert.match(exporter, /"Submitted", "Name", "Email", "Phone", "Status", "Time \(seconds\)"/);
  assert.match(exporter, /!\(\$0\.hidden \?\? false\)/);
  assert.match(exporter, /!\["section_break", "statement"\]\.contains\(\$0\.type\)/);
  assert.match(exporter, /replacingOccurrences\(of: "\\\"", with: "\\\"\\\""\)/);
  assert.match(exporter, /"=\+-@"\.contains/);
  assert.match(exporter, /joined\(separator: "\\r\\n"\)/);
  assert.match(exporter, /"\\u\{FEFF\}/);
  assert.match(exporter, /write\(to: fileURL, options: \.atomic\)/);
});

test('native response export owns and cleans its temporary file lifecycle', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormsView.swift');
  const detail = view.slice(
    view.indexOf('private struct AdminFormDetailView'),
    view.indexOf('private struct AdminFormResponseView'),
  );

  assert.match(detail, /FileManager\.default\.temporaryDirectory/);
  assert.match(detail, /UUID\(\)\.uuidString/);
  assert.match(detail, /directory\.deletingLastPathComponent\(\)\.standardizedFileURL == rootDirectory\.standardizedFileURL/);
  assert.match(detail, /\.onDisappear \{ discardCSVExport\(\) \}/);
  assert.match(detail, /Button[\s\S]*Label\("Prepare responses CSV"/);
  assert.match(detail, /\.onChange\(of: responses\) \{ _ in discardCSVExport\(\) \}/);
  assert.match(detail, /Button\("Try CSV export again"\)/);
  assert.match(detail, /catch \{[\s\S]*exportErrorMessage = "The responses CSV could not be prepared\."/);
});
