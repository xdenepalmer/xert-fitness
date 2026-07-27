import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('owner notice recovery is bounded, account scoped, and server-version guarded', async () => {
  const [store, models, localState] = await Promise.all([
    read('ios/XertFitnessApp/XertFitnessApp/Services/AdminAnnouncementDraftStore.swift'),
    read('ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('ios/XertFitnessApp/XertFitnessApp/Services/MemberLocalState.swift'),
  ])

  assert.match(models, /struct AdminAnnouncementDraft: Codable, Hashable/)
  assert.match(store, /maximumAge: TimeInterval = 12 \* 60 \* 60/)
  assert.match(store, /snapshot\.ownerID == ownerID/)
  assert.match(store, /snapshot\.announcementID == announcementID/)
  assert.match(store, /snapshot\.baselineUpdatedAt == baselineUpdatedAt/)
  assert.match(store, /draft\.body\.count <= 2_000/)
  assert.match(store, /static func clearAll\(ownerID: UUID/)
  assert.match(localState, /AdminAnnouncementDraftStore\.clearAll\(ownerID: userID/)
})

test('every native notice composer persists and clears recoverable edits', async () => {
  const view = await read('ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift')
  const composerCalls = view.match(/AdminAnnouncementComposer\(/g) || []

  assert.equal(composerCalls.length, 3)
  assert.equal((view.match(/ownerID: session\.user\?\.id/g) || []).length >= 3, true)
  assert.match(view, /\.task\(id: draft\)[\s\S]*persistRecoveryDraft\(\)/)
  assert.match(view, /Task\.sleep\(nanoseconds: 350_000_000\)/)
  assert.match(view, /Recovered unsaved edits from/)
  assert.match(view, /Discard recovered edits/)
  assert.match(view, /AdminAnnouncementDraftStore\.load\([\s\S]*baselineUpdatedAt: announcement\?\.updated_at/)
  assert.match(view, /guard !hasCommitted else \{ return \}/)
  assert.match(view, /guard await onSave\(draft\) else \{ return \}[\s\S]*finishCommittedDraft\(\)/)
  assert.match(view, /guard await onPublish\(draft, publishRequestID\) else \{ return \}[\s\S]*finishCommittedDraft\(\)/)
  assert.match(view, /hasCommitted = true[\s\S]*clearRecoveryDraft\(\)[\s\S]*dismiss\(\)/)
  assert.ok((view.match(/AdminAnnouncementDraftStore\.clear\(/g) || []).length >= 3)
})
