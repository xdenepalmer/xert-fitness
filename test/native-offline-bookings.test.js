import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('native bookings restore from an account-scoped bounded cache on cold launch', async () => {
  const [cache, store, localState] = await Promise.all([
    source('ios/XertFitnessApp/XertFitnessApp/Services/MemberBookingCache.swift'),
    source('ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
    source('ios/XertFitnessApp/XertFitnessApp/Services/MemberLocalState.swift'),
  ])

  assert.match(cache, /stored\.userID == userID/)
  assert.match(cache, /maximumAge: TimeInterval = 7 \* 24 \* 60 \* 60/)
  assert.match(cache, /maximumBookings = 100/)
  assert.match(cache, /\.filter \{ \$0\.isActiveClassPlace && \$0\.start_time >= now \}/)
  assert.match(store, /MemberBookingCache\.loadAsync\(for: userID\)/)
  assert.match(store, /guard authSession\?\.user\?\.id == userID else \{ return \}/)
  assert.match(store, /MemberBookingCache\.encodeAsync\(snapshot\)/)
  assert.match(store, /MemberBookingCache\.saveEncoded\(encoded, for: userID\)/)
  assert.match(store, /guard canApplyMemberState\(memberVersion, session: session\) else \{ return false \}/)
  assert.match(localState, /MemberBookingCache\.clear\(for: userID, defaults: defaults\)/)
})

test('saved booking state remains read-only until an authoritative refresh', async () => {
  const [store, bookingView, accountView] = await Promise.all([
    source('ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
    source('ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    source('ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift'),
  ])

  assert.match(
    store,
    /guard !isUsingStaleMemberData, !unavailableDataSources\.contains\(\.bookings\) else/,
  )
  assert.match(
    bookingView,
    /store\.isUsingStaleMemberData \|\| store\.unavailableDataSources\.contains\(\.bookings\)/,
  )
  assert.match(accountView, /\.disabled\(hasBookingMutation \|\| bookingStateUnavailable\)/)
})
