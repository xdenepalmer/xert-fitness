import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('native staff-note mutations preserve confirmed outcomes through timeline readback failure', async () => {
  const store = await read(
    '../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift',
  )
  const addStart = store.indexOf('func addMemberNote(')
  const archiveStart = store.indexOf('func archiveMemberNote(', addStart)
  const noticeStart = store.indexOf('func sendMemberNotice(', archiveStart)
  const add = store.slice(addStart, archiveStart)
  const archive = store.slice(archiveStart, noticeStart)

  assert.ok(addStart >= 0 && archiveStart > addStart && noticeStart > archiveStart)
  assert.match(add, /let noteID: UUID/)
  assert.match(add, /noteID = try await api\.adminAddMemberNote/)
  assert.match(add, /let notes = try await api\.adminMemberNotes/)
  assert.match(add, /memberDetailUnavailableSources\.append\("staff timeline"\)/)
  assert.match(add, /Staff note saved with receipt \\\(noteID\.uuidString\.lowercased\(\)\)/)
  assert.match(add, /Do not add it again/)
  assert.ok(add.lastIndexOf('return true') > add.indexOf('adminMemberNotes'))

  assert.match(archive, /try await api\.adminArchiveMemberNote/)
  assert.match(archive, /let notes = try await api\.adminMemberNotes/)
  assert.match(archive, /Do not repeat the action/)
  assert.match(archive, /memberNoteStatusIsWarning = true/)
  assert.ok(archive.lastIndexOf('return true') > archive.indexOf('adminMemberNotes'))
})

test('native member records expose note receipts and warning-aware feedback', async () => {
  const [store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ])

  assert.match(store, /@Published private\(set\) var memberNoteStatusMessage: String\?/)
  assert.match(store, /@Published private\(set\) var memberNoteStatusIsWarning = false/)
  assert.match(
    store,
    /memberNotes = notes[\s\S]*memberNoteStatusMessage = nil[\s\S]*memberNoteStatusIsWarning = false/,
  )

  const start = view.indexOf('private struct AdminMemberDetailView: View')
  const end = view.indexOf('private struct AdminMemberNoticeHistoryRow', start)
  const detail = view.slice(start, end)
  assert.match(detail, /admin\.memberNoteStatusMessage/)
  assert.match(detail, /admin\.memberNoteStatusIsWarning/)
  assert.match(detail, /textSelection\(\.enabled\)/)
  assert.match(detail, /accessibilityIdentifier\("owner\.member\.staffNote\.receipt"\)/)
  assert.ok(
    (detail.match(/XertHaptics\.play\(admin\.memberNoteStatusIsWarning \? \.warning : \.success\)/g) || [])
      .length >= 2,
  )
})
