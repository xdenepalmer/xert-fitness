import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('native catalogue recovery is bounded, account scoped, and stale-baseline safe', async () => {
  const [store, models, localState] = await Promise.all([
    read('ios/XertFitnessApp/XertFitnessApp/Services/AdminCatalogueDraftStore.swift'),
    read('ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('ios/XertFitnessApp/XertFitnessApp/Services/MemberLocalState.swift'),
  ])

  for (const draft of [
    'AdminClassDraft',
    'AdminAvailabilityDraft',
    'AdminBlackoutDraft',
    'AdminMemberNoticeDraft',
    'AdminProductDraft',
    'AdminEventDraft',
    'AdminCoachDraft',
  ]) {
    assert.match(models, new RegExp(`struct ${draft}: Codable, Hashable`))
  }
  assert.match(store, /maximumAge: TimeInterval = 24 \* 60 \* 60/)
  assert.match(store, /maximumEncodedBytes = 64 \* 1_024/)
  assert.match(store, /snapshot\.ownerID == ownerID/)
  assert.match(store, /snapshot\.recordID == recordID/)
  assert.match(store, /snapshot\.baselineToken == baselineToken/)
  assert.match(store, /encoder\.outputFormatting = \[\.sortedKeys\]/)
  assert.match(store, /static func clearAll\(ownerID: UUID/)
  assert.match(localState, /AdminCatalogueDraftStore\.clearAll\(ownerID: userID/)
})

test('all high-value native catalogue editors recover and atomically clear drafts', async () => {
  const view = await read(
    'ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift',
  )

  for (const kind of [
    'classSession',
    'availability',
    'blackout',
    'product',
    'event',
    'coach',
    'memberNotice',
  ]) {
    assert.match(
      view,
      new RegExp(`AdminCatalogueDraftStore\\.load\\([\\s\\S]*?kind: \\.${kind}`),
    )
    assert.match(
      view,
      new RegExp(`AdminCatalogueDraftStore\\.save\\([\\s\\S]*?kind: \\.${kind}`),
    )
    assert.match(
      view,
      new RegExp(`AdminCatalogueDraftStore\\.clear\\([\\s\\S]*?kind: \\.${kind}`),
    )
  }
  assert.match(view, /AdminRecoveredCatalogueDraftNotice/)
  assert.ok((view.match(/\.task\(id: draft\)/g) || []).length >= 5)
  assert.ok((view.match(/guard !hasCommitted else \{ return \}/g) || []).length >= 5)
  assert.ok(
    (view.match(/guard !Task\.isCancelled, !hasCommitted,/g) || []).length >= 5,
  )
  assert.match(view, /AdminCatalogueDraftStore\.baselineToken\(for: classSession\)/)
  assert.ok((view.match(/Discard recovered edits/g) || []).length >= 1)
})
