import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('native launch controls recover only against the exact live settings version', async () => {
  const [view, store, models, tests] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/AdminCatalogueDraftStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift'),
  ])

  assert.match(models, /struct AdminPlatformSettings: Identifiable, Codable, Hashable/)
  assert.match(store, /case platformSettings/)

  const start = view.indexOf('private struct AdminPlatformView: View')
  const end = view.indexOf('private struct AdminOperationsHealthView', start)
  const controls = view.slice(start, end)
  assert.ok(start >= 0 && end > start)
  assert.match(controls, /AdminCatalogueDraftStore\.load\([\s\S]*kind: \.platformSettings/)
  assert.match(controls, /baselineToken: live\?\.updated_at/)
  assert.match(controls, /AdminCatalogueDraftStore\.save\([\s\S]*kind: \.platformSettings/)
  assert.match(controls, /draft\.updated_at == live\.updated_at/)
  assert.match(controls, /draft\.updated_at == admin\.settings\?\.updated_at/)
  assert.match(controls, /\.task\(id: draft\)[\s\S]*persistRecoveryDraft\(\)/)
  assert.match(controls, /AdminRecoveredCatalogueDraftNotice/)
  assert.match(controls, /resetToLatestLiveSettings/)
  assert.match(tests, /testAdminPlatformSettingsDraftRecoveryRequiresTheExactLiveVersion/)
})

test('native launch controls visibly block stale drafts and clear recovery after safe exits', async () => {
  const view = await read(
    '../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift',
  )
  const start = view.indexOf('private struct AdminPlatformView: View')
  const end = view.indexOf('private struct AdminOperationsHealthView', start)
  const controls = view.slice(start, end)

  assert.match(controls, /private var liveDraftConflict: Bool/)
  assert.match(controls, /draft\.updated_at != live\.updated_at/)
  assert.match(controls, /&& !liveDraftConflict/)
  assert.match(controls, /Live controls changed after this draft began/)
  assert.match(controls, /Label\("Load latest live controls", systemImage: "arrow\.clockwise"\)/)
  assert.match(controls, /accessibilityIdentifier\("owner\.platform\.versionConflict"\)/)
  assert.match(controls, /if saved \{[\s\S]*clearRecoveryDraft\(\)[\s\S]*draft = admin\.settings/)

  const rootStart = view.indexOf('struct AdminCommandCentreView: View')
  const rootEnd = view.indexOf('private struct AdminWorkspaceSwitcher', rootStart)
  const root = view.slice(rootStart, rootEnd)
  assert.match(root, /private func clearPlatformRecoveryDraft\(\)/)
  assert.match(root, /if didSave \{[\s\S]*clearPlatformRecoveryDraft\(\)[\s\S]*performOwnerExit\(request\)/)
  assert.match(root, /private func discardPlatformDraftAndComplete[\s\S]*clearPlatformRecoveryDraft\(\)/)
})
