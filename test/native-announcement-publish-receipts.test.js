import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { normalizeAnnouncementPublish } from '../api/admin-publish-announcement.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('announcement publish request identities are validated and normalized', () => {
  const requestID = 'f8b3d477-d35f-4d6c-bad8-f59270aa24be'
  const normalized = normalizeAnnouncementPublish({
    request_id: requestID,
    announcement: { title: 'Launch week', body: 'Classes are now live.', tone: 'info' },
  })

  assert.equal(normalized.requestId, requestID)
  assert.throws(() => normalizeAnnouncementPublish({
    request_id: 'not-a-receipt',
    announcement: { title: 'Launch week', body: 'Classes are now live.', tone: 'info' },
  }), /ANNOUNCEMENT_REQUEST_ID_INVALID/)
})

test('native announcement publishing preserves one durable request identity', () => {
  const store = read('ios/XertFitnessApp/XertFitnessApp/Services/AdminAnnouncementDraftStore.swift')
  const view = read('ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift')
  const adminStore = read('ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift')
  const api = read('ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift')

  assert.match(store, /currentSchemaVersion = 2/)
  assert.match(store, /let publishRequestID: UUID/)
  assert.match(store, /publishRequestID: publishRequestID/)
  assert.match(view, /@State private var publishRequestID: UUID/)
  assert.match(view, /recovered\?\.publishRequestID \?\? UUID\(\)/)
  assert.match(view, /onPublish\(draft, publishRequestID\)/)
  assert.match(adminStore, /requestID: UUID = UUID\(\)/)
  assert.match(adminStore, /draft: draft,\s*requestID: requestID/)
  assert.match(api, /request_id: requestID/)
})

test('announcement endpoint replays the owner-scoped record before any second insert or push', () => {
  const endpoint = read('api/admin-publish-announcement.js')
  const replayLookup = endpoint.indexOf('findAnnouncementPublishReplay(admin, publish.requestId, user.id)')
  const insert = endpoint.indexOf('.insert({')
  const push = endpoint.indexOf('sendMemberAnnouncementPushes({ admin, announcement: result.data })')

  assert.ok(replayLookup > 0)
  assert.ok(replayLookup < insert)
  assert.ok(insert < push)
  assert.match(endpoint, /\.eq\('created_by', ownerId\)/)
  assert.match(endpoint, /\.eq\('audience', 'all'\)/)
  assert.match(endpoint, /replayed: true/)
  assert.match(endpoint, /id: publish\.requestId \|\| randomUUID\(\)/)
  assert.match(
    endpoint,
    /result\.error\?\.code === '23505'[\s\S]*findAnnouncementPublishReplay\(admin, publish\.requestId, user\.id\)[\s\S]*if \(replay\) return json\(replay\)/,
  )
})
