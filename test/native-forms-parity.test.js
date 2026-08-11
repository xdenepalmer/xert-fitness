import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native Create form commands consume one safe editor intent in or outside Forms', async () => {
  const [forms, commandCentre] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormsView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  assert.match(commandCentre, /@State private var createFormIntentID: UUID\?/);
  assert.match(commandCentre, /@State private var pendingCreateFormNavigation = false/);
  assert.match(
    commandCentre,
    /private func requestCreateForm\(\)[\s\S]*currentWorkspace == \.forms[\s\S]*pendingCreateFormNavigation = true[\s\S]*openWorkspace\(\.forms\)/,
  );
  assert.match(
    commandCentre,
    /workspace == \.forms, pendingCreateFormNavigation[\s\S]*pendingCreateFormNavigation = false[\s\S]*createFormIntentID = UUID\(\)/,
  );
  assert.match(commandCentre, /title: "Create a form"[\s\S]*requestCreateForm\(\)/);
  assert.match(commandCentre, /if action == \.newForm \{[\s\S]*requestCreateForm\(\)[\s\S]*return/);
  assert.match(
    commandCentre,
    /case \.forms:[\s\S]*AdminFormsView\([\s\S]*createIntentID: \$createFormIntentID/,
  );
  assert.match(commandCentre, /onDismiss: runPendingLauncherAction/);

  assert.match(forms, /@Binding private var createIntentID: UUID\?/);
  assert.match(forms, /createIntentID: Binding<UUID\?> = \.constant\(nil\)/);
  assert.match(forms, /\.onAppear\(perform: consumeCreateIntent\)/);
  assert.match(forms, /\.onChange\(of: createIntentID\) \{ _ in consumeCreateIntent\(\) \}/);
  assert.match(
    forms,
    /private func consumeCreateIntent\(\)[\s\S]*createIntentID = nil[\s\S]*guard editor == nil[\s\S]*editor = AdminFormEditorContext\(form: nil\)/,
  );
});

test('native form skip logic only offers effective forward destinations', async () => {
  const [view, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormsView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);

  const questionEditor = view.slice(
    view.indexOf('private struct AdminFormQuestionEditor'),
    view.indexOf('private struct AdminFormDetailView'),
  );
  assert.match(questionEditor, /currentIndex \+ 2/);
  assert.match(questionEditor, /private var validSkipTargets: Set<Int>/);
  assert.match(questionEditor, /Text\("End form"\)\.tag\(questions\.count \+ 1\)/);
  assert.match(questionEditor, /validSkipTargets\.contains\(target\)/);
  assert.match(questionEditor, /hasInvalidSkipRules[\s\S]*Clear obsolete skip rules/);
  assert.doesNotMatch(questionEditor, /ForEach\(Array\(questions\.enumerated\(\)\)/);
  assert.match(models, /Skip logic can only jump forward to a later question or the end of the form/);
});

test('native form duplication creates an unpublished independent draft', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormsView.swift');
  const context = view.slice(
    view.indexOf('private struct AdminFormEditorContext'),
    view.indexOf('private struct AdminFormEditorView'),
  );

  assert.match(context, /static func duplicate\(_ form: AdminForm\)/);
  assert.match(context, /let titleSuffix = " \(Copy\)"/);
  assert.match(context, /draft\.title = .*titleSuffix/);
  assert.match(context, /draft\.slug = .*copy/);
  assert.match(context, /draft\.isActive = false/);
  assert.match(context, /copy\.id = UUID\(\)\.uuidString\.lowercased\(\)/);
  assert.match(context, /Self\(form: nil, initialDraft: draft, startsDirty: true\)/);
  assert.match(view, /Button\("Duplicate and edit"\)/);
});

test('native form editor protects dirty work and summary adapts to large text', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormsView.swift');
  const editor = view.slice(
    view.indexOf('private struct AdminFormEditorView'),
    view.indexOf('private struct AdminFormQuestionEditor'),
  );

  assert.match(view, /@Environment\(\\\.dynamicTypeSize\)/);
  assert.match(view, /dynamicTypeSize\.isAccessibilitySize/);
  assert.match(view, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(editor, /private var isDirty: Bool/);
  assert.match(editor, /\.interactiveDismissDisabled\(isDirty \|\| isSaving\)/);
  assert.match(editor, /\.adminOwnerExitState\(/);
  assert.match(editor, /Discard unsaved form edits\?/);
  assert.match(editor, /editorExitCoordinator\?\.clear\(id: exitStateID\)/);
});
