import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('native financial mutations cannot become false failures when ledger readback fails', async () => {
  const store = await read(
    '../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift',
  )

  for (const contract of [
    {
      name: 'reconciliation',
      start: 'func reconcileOrder(',
      end: 'func refundOrder(',
      mutation: 'result = try await api.adminReconcileOrder',
      warning: 'Do not repeat the reconciliation',
    },
    {
      name: 'refund',
      start: 'func refundOrder(',
      end: 'private func refreshOrdersAfterConfirmedOperation',
      mutation: 'result = try await api.adminRefundOrder',
      warning: 'Do not submit another refund',
    },
  ]) {
    const start = store.indexOf(contract.start)
    const end = store.indexOf(contract.end, start)
    const source = store.slice(start, end)
    assert.ok(start >= 0 && end > start, `${contract.name} operation should exist`)
    assert.ok(source.includes(contract.mutation))
    assert.match(source, /await refreshOrdersAfterConfirmedOperation\(/)
    assert.ok(source.includes(contract.warning))
    assert.ok(
      source.indexOf('return result') >
        source.indexOf('await refreshOrdersAfterConfirmedOperation('),
      `${contract.name} should return its confirmed receipt after readback`,
    )
    assert.doesNotMatch(
      source,
      /orders = try await api\.adminOrders/,
      `${contract.name} should not combine mutation and readback failure`,
    )
  }
})

test('native order readback marks stale data and warns the owner not to retry money movement', async () => {
  const [store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ])

  const helperStart = store.indexOf(
    'private func refreshOrdersAfterConfirmedOperation',
  )
  const helperEnd = store.indexOf('func leads(', helperStart)
  const helper = store.slice(helperStart, helperEnd)
  assert.ok(helperStart >= 0 && helperEnd > helperStart)
  assert.match(helper, /orders = try await api\.adminOrders/)
  assert.match(helper, /loadedSources\.insert\("orders"\)/)
  assert.match(helper, /refreshUnavailableSources\.removeAll \{ \$0 == "orders" \}/)
  assert.match(helper, /refreshUnavailableSources\.append\("orders"\)/)
  assert.match(helper, /orderOperationStatusIsWarning = true/)

  const detailStart = view.indexOf('private struct AdminOrderDetailView: View')
  const detailEnd = view.indexOf('private struct AdminBookingRequestsView', detailStart)
  const detail = view.slice(detailStart, detailEnd)
  assert.match(detail, /admin\.orderOperationStatusMessage/)
  assert.match(detail, /admin\.orderOperationStatusIsWarning/)
  assert.match(detail, /exclamationmark\.triangle\.fill/)
  assert.ok((detail.match(/\.joined\(separator: " "\)/g) || []).length >= 2)
})

test('native money movement is blocked whenever the order ledger becomes stale', async () => {
  const [store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ])

  for (const startMarker of ['func reconcileOrder(', 'func refundOrder(']) {
    const start = store.indexOf(startMarker)
    const end = store.indexOf('\n    func ', start + startMarker.length)
    const source = store.slice(start, end)
    assert.match(source, /loadedSources\.contains\("orders"\)/)
    assert.match(source, /!refreshUnavailableSources\.contains\("orders"\)/)
    assert.match(source, /!isLoading/)
  }
  assert.match(
    store,
    /orders = try await orderRequest[\s\S]*orderOperationStatusMessage = nil[\s\S]*orderOperationStatusIsWarning = false/,
  )

  const detailStart = view.indexOf('private struct AdminOrderDetailView: View')
  const detailEnd = view.indexOf('private struct AdminBookingRequestsView', detailStart)
  const detail = view.slice(detailStart, detailEnd)
  assert.match(detail, /private var orderLedgerIsCurrent: Bool/)
  assert.match(detail, /accessibilityIdentifier\("owner\.order\.staleGuard"\)/)
  assert.match(detail, /\.disabled\(isOperating \|\| !orderLedgerIsCurrent\)/)
  assert.match(
    detail,
    /\.disabled\(isOperating \|\| !orderLedgerIsCurrent \|\| refundConfirmation != "REFUND"\)/,
  )
})
