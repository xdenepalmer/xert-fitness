import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('owner command centre remains mounted beneath the lifecycle privacy shield', async () => {
  const source = await read('ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift')
  const sceneHandler = source.match(
    /private func handleScenePhase\(_ phase: ScenePhase\) \{[\s\S]*?\n    \}/,
  )?.[0] ?? ''

  assert.match(source, /ZStack \{[\s\S]*memberTabs[\s\S]*if isPrivacyLocked/)
  assert.match(source, /memberTabs[\s\S]*\.allowsHitTesting\(!isPrivacyLocked\)[\s\S]*\.accessibilityHidden\(isPrivacyLocked\)/)
  assert.match(
    source,
    /\.fullScreenCover\(isPresented: \$showingAdminCommandCentre\)[\s\S]*ZStack \{[\s\S]*AdminCommandCentreView[\s\S]*if isPrivacyLocked/,
  )
  assert.match(
    source,
    /AdminCommandCentreView\([\s\S]*\.allowsHitTesting\(!isPrivacyLocked\)[\s\S]*\.accessibilityHidden\(isPrivacyLocked\)/,
  )
  assert.match(sceneHandler, /guard phase == \.active else/)
  assert.match(sceneHandler, /isPrivacyUnlocked = false/)
  assert.doesNotMatch(sceneHandler, /showingAdminCommandCentre = false/)
  assert.doesNotMatch(sceneHandler, /requestedAdminRoute = nil/)
  assert.match(
    source,
    /reason: protectsOwnerTools[\s\S]*Unlock the XERT Owner Command Centre/,
  )
})

test('member records keep launch actions above the safe area and scroll notes into reach', async () => {
  const source = await read(
    'ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift',
  )

  assert.match(source, /private struct AdminMemberDetailView: View[\s\S]*ScrollViewReader/)
  assert.match(source, /\.safeAreaInset\(edge: \.bottom, spacing: 0\)[\s\S]*memberActionDock/)
  assert.match(source, /proxy\.scrollTo\("owner\.member\.staffNote", anchor: \.center\)/)
  assert.match(source, /title: "Notice"[\s\S]*title: "Credits"[\s\S]*title: "Staff note"/)
  assert.match(source, /\.accessibilityIdentifier\("owner\.member\.actionDock"\)/)
})
