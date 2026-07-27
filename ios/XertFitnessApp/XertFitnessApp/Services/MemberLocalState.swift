import Foundation

enum MemberLocalState {
    static func clear(for userID: UUID, defaults: UserDefaults = .standard) {
        PendingCheckoutStore.clear(defaults: defaults)
        XertWorkspaceOrderStore.clear(for: userID, defaults: defaults)
        XertPinnedWorkspaceStore.clear(for: userID, defaults: defaults)
        XertOwnerWorkspacePinsStore.clear(for: userID, defaults: defaults)
        AdminSiteContentDraftStore.clearAll(ownerID: userID, defaults: defaults)
        AdminAttendanceDraftStore.clearAll(ownerID: userID, defaults: defaults)
        AdminAnnouncementDraftStore.clearAll(ownerID: userID, defaults: defaults)
        AdminCatalogueDraftStore.clearAll(ownerID: userID, defaults: defaults)
        AdminIntakeDraftStore.clearAll(ownerID: userID, defaults: defaults)
        MemberBookingCache.clear(for: userID, defaults: defaults)
        ClassReminderNavigation.clearPending(defaults: defaults)
        AnnouncementPushNavigation.clearPending(defaults: defaults)
        XertQuickActionNavigation.clearPending(defaults: defaults)
        ClassReminderPreference.setEnabled(false, defaults: defaults)
        MemberPushPreference.setEnabled(false, defaults: defaults)
        AppPrivacyLock.setEnabled(false, defaults: defaults)
        PushDeviceTokenStore.clear(defaults: defaults)
    }
}
