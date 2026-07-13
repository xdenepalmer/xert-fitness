import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var email = ""
    @State private var password = ""
    @State private var passwordConfirmation = ""
    @State private var isCreatingAccount = false
    @State private var acceptedAccountTerms = false
    @State private var fullName = ""
    @State private var phone = ""
    @State private var didSaveProfile = false
    @State private var passwordResetSent = false
    @State private var bookingToCancel: BookingItem?
    @State private var addingBookingToCalendarID: UUID?
    @State private var bookingCalendarNotice: BookingCalendarNotice?
    @State private var showingDeleteConfirmation = false
    @FocusState private var focusedProfileField: ProfileField?

    private enum ProfileField {
        case fullName, phone
    }

    var body: some View {
        let timeline = BookingTimeline(bookings: store.bookings)
        NavigationStack {
            Form {
                if store.isSignedIn {
                    signedInSections(timeline: timeline)
                } else {
                    signedOutSections
                }
            }
            .xertListBackground()
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.large)
            .refreshable {
                await store.refresh()
            }
            .onAppear(perform: syncProfileForm)
            .onChange(of: store.profile) { _ in
                syncProfileForm()
            }
            .confirmationDialog(
                "Cancel booking?",
                isPresented: Binding(
                    get: { bookingToCancel != nil },
                    set: { if !$0 { bookingToCancel = nil } }
                ),
                presenting: bookingToCancel
            ) { booking in
                Button("Keep booking", role: .cancel) {
                    bookingToCancel = nil
                }
                Button("Cancel booking", role: .destructive) {
                    bookingToCancel = nil
                    Task { await store.cancel(booking) }
                }
            } message: { booking in
                Text(booking.cancellationMessage)
            }
            .confirmationDialog(
                "Permanently delete your XERT account?",
                isPresented: $showingDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Keep Account", role: .cancel) {}
                Button("Delete Account", role: .destructive) {
                    Task { _ = await store.deleteAccount() }
                }
            } message: {
                Text("Your member profile, credits, bookings and training goals will be removed. Purchase records are anonymized.")
            }
            .alert(item: $bookingCalendarNotice) { notice in
                Alert(
                    title: Text(notice.title),
                    message: Text(notice.message),
                    dismissButton: .default(Text("OK"))
                )
            }
        }
    }

    // MARK: - Signed-in profile

    @ViewBuilder
    private func signedInSections(timeline: BookingTimeline) -> some View {
        if store.isUsingStaleMemberData {
            Section {
                StaleMemberDataNotice()
            }
            .listRowBackground(Color.xertInk)
        }
        if !store.unavailableDataSources.isDisjoint(with: [.credits, .bookings, .orders, .profile, .eventGoals, .privateSessions]) {
            Section {
                DataAvailabilityNotice(sources: [.credits, .bookings, .orders, .profile, .eventGoals, .privateSessions])
            }
            .listRowBackground(Color.xertInk)
        }

        membershipSection
        accountDetailsSection
        reminderSettingsSection
        signOutSection
        accountControlSection
        legalSection
        purchaseHistorySection
        privateSessionHistorySection
        bookingSections(timeline: timeline)
    }

    private var membershipSection: some View {
        Section {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(spacing: 12) {
                        creditSummary
                        signedInSummary
                    }
                } else {
                    HStack(alignment: .top, spacing: 12) {
                        creditSummary
                        signedInSummary
                    }
                }
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
            .listRowSeparator(.hidden)
        } header: {
            Text("Membership").xertEyebrow()
        }
    }

    private var creditSummary: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Credits")
                .xertEyebrow()
            Text("\(store.creditTotal)")
                .xertDisplay(34)
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
        .padding(14)
        .xertCardStyle()
    }

    private var signedInSummary: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Signed in")
                .xertEyebrow()
            Text(store.authSession?.user?.email ?? "Member")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.xertPale)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
        .padding(14)
        .xertCardStyle()
    }

    private var reminderSettingsSection: some View {
        Section {
            Toggle(
                "Class reminders",
                isOn: Binding(
                    get: { store.classRemindersEnabled },
                    set: { enabled in
                        Task { await store.setClassRemindersEnabled(enabled) }
                    }
                )
            )
            .tint(.xertSteel)
            .disabled(store.isUpdatingReminderPreference)

            Text("Receive a device notification two hours before each confirmed class. You can switch this off at any time.")
                .font(.footnote)
                .foregroundStyle(Color.xertMuted)
        } header: {
            Text("Notifications").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
    }

    private var accountDetailsSection: some View {
        Section {
            TextField("Full name", text: $fullName)
                .textContentType(.name)
                .focused($focusedProfileField, equals: .fullName)
                .submitLabel(.next)
                .onSubmit { focusedProfileField = .phone }
                .foregroundStyle(Color.xertOffWhite)
                .tint(Color.xertSteel)
            TextField("Mobile number", text: $phone)
                .textContentType(.telephoneNumber)
                .keyboardType(.phonePad)
                .focused($focusedProfileField, equals: .phone)
                .foregroundStyle(Color.xertOffWhite)
                .tint(Color.xertSteel)
            Button {
                Task {
                    let saved = await store.updateProfile(fullName: fullName, phone: phone)
                    didSaveProfile = saved
                    if saved { focusedProfileField = nil }
                }
            } label: {
                HStack {
                    Text(store.isSavingProfile ? "Saving..." : "Save Account Details")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.xertSteel)
                    Spacer()
                    if store.isSavingProfile {
                        ProgressView()
                            .tint(Color.xertPale)
                    }
                }
            }
            .disabled(store.isSavingProfile)
            .onChange(of: fullName) { _ in didSaveProfile = false }
            .onChange(of: phone) { _ in didSaveProfile = false }

            if didSaveProfile {
                Label("Account details saved", systemImage: "checkmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.xertSteel)
            }
        } header: {
            Text("Account Details").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
    }

    private var signOutSection: some View {
        Section {
            Button("Sign Out", role: .destructive) {
                store.signOut()
            }
            .buttonStyle(.xertGhost)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
            .listRowSeparator(.hidden)
        }
    }

    private var accountControlSection: some View {
        Section {
            Button("Delete Account", role: .destructive) {
                showingDeleteConfirmation = true
            }
            .disabled(store.isDeletingAccount)
            Text("Permanently removes your profile, credits, bookings and training goals. This cannot be undone.")
                .font(.footnote)
                .foregroundStyle(Color.xertMuted)
        } header: {
            Text("Account Control").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
    }

    private var purchaseHistorySection: some View {
        Section {
            if store.orders.isEmpty {
                Text("No purchases yet.")
                    .foregroundStyle(Color.xertMuted)
            } else {
                ForEach(store.orders) { order in
                    VStack(alignment: .leading, spacing: 4) {
                        if dynamicTypeSize.isAccessibilitySize {
                            VStack(alignment: .leading, spacing: 6) {
                                purchaseName(order)
                                purchaseAmount(order)
                                purchaseDate(order)
                                purchaseStatus(order)
                            }
                        } else {
                            HStack(alignment: .firstTextBaseline) {
                                purchaseName(order)
                                Spacer()
                                purchaseAmount(order)
                            }
                            HStack {
                                purchaseDate(order)
                                Spacer()
                                purchaseStatus(order)
                            }
                            .font(.subheadline)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        } header: {
            Text("Purchase History").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
    }

    private var privateSessionHistorySection: some View {
        Section {
            if store.privateSessionRequests.isEmpty {
                Text("No PT requests yet.")
                    .foregroundStyle(Color.xertMuted)
            } else {
                ForEach(store.privateSessionRequests) { request in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(request.requested_session_type)
                            .font(.headline)
                            .foregroundStyle(Color.xertOffWhite)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(request.displayStatus.uppercased())
                            .font(.caption2.weight(.bold))
                            .tracking(1.2)
                            .foregroundStyle(.xertSteel)
                        Text([
                            request.created_at.formatted(date: .abbreviated, time: .omitted),
                            request.preferred_day,
                            request.preferred_time
                        ].compactMap { $0 }.joined(separator: " · "))
                            .font(.subheadline)
                            .foregroundStyle(Color.xertPale)
                        if let goal = request.training_goal {
                            Text("Goal: \(goal)")
                                .font(.footnote)
                                .foregroundStyle(Color.xertMuted)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        } header: {
            Text("PT Requests").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
    }

    private func purchaseName(_ order: OrderItem) -> some View {
        Text(order.products?.name ?? "Session pack")
            .font(.headline)
            .foregroundStyle(Color.xertOffWhite)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func purchaseAmount(_ order: OrderItem) -> some View {
        Text(order.displayAmount)
            .font(.headline.monospacedDigit())
            .foregroundStyle(.xertSteel)
    }

    private func purchaseDate(_ order: OrderItem) -> some View {
        Text(order.activityDate.formatted(date: .abbreviated, time: .omitted))
            .font(.subheadline)
            .foregroundStyle(Color.xertPale)
    }

    private func purchaseStatus(_ order: OrderItem) -> some View {
        Text(order.displayStatus.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(1.2)
            .foregroundStyle(order.status == "paid" ? Color.xertSteel : Color.xertMuted)
    }

    @ViewBuilder
    private func bookingSections(timeline: BookingTimeline) -> some View {
        if store.bookings.isEmpty {
            Section {
                Text("No bookings yet.")
                    .foregroundStyle(Color.xertMuted)
            } header: {
                Text("Bookings").xertEyebrow()
            }
            .listRowBackground(Color.xertInk)
        } else {
            if !timeline.pending.isEmpty {
                Section {
                    bookingRows(timeline.pending)
                } header: {
                    Text("Requests & Waitlist").xertEyebrow()
                }
                .listRowBackground(Color.xertInk)
            }
            if !timeline.upcoming.isEmpty {
                Section {
                    bookingRows(timeline.upcoming)
                } header: {
                    Text("Upcoming Classes").xertEyebrow()
                }
                .listRowBackground(Color.xertInk)
            }
            if !timeline.history.isEmpty {
                Section {
                    bookingRows(timeline.history)
                } header: {
                    Text("Booking History").xertEyebrow()
                }
                .listRowBackground(Color.xertInk)
            }
        }
    }

    // MARK: - Signed-out member access

    @ViewBuilder
    private var signedOutSections: some View {
        // Each interactive element gets its OWN row: custom ButtonStyles do not
        // isolate their tap target inside a list row, so sharing a row would let
        // taps on the logo/headline/padding trigger the primary auth action.
        Section {
            memberAccessHero
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowSeparator(.hidden)

            if isCreatingAccount {
                termsAgreement
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    .listRowSeparator(.hidden)
            }

            primaryAuthButton
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                .listRowSeparator(.hidden)

            if !isCreatingAccount {
                forgotPasswordControls
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    .listRowSeparator(.hidden)
            }
        }

        Section {
            Button(isCreatingAccount ? "Already have an account?" : "Create a member account") {
                isCreatingAccount.toggle()
                passwordConfirmation = ""
                acceptedAccountTerms = false
            }
            .buttonStyle(.xertGhost)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
            .listRowSeparator(.hidden)
        }

        legalSection
    }

    private var memberAccessHero: some View {
        VStack(spacing: 22) {
            XertLogoHeader(height: 34)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)

            VStack(spacing: 8) {
                Text(isCreatingAccount ? "Join XERT" : "Member Access")
                    .xertDisplay(36)
                    .multilineTextAlignment(.center)
                Text(isCreatingAccount
                    ? "Create your member account to book classes and track goals."
                    : "Sign in to manage your bookings, credits and training goals.")
                    .font(.footnote)
                    .foregroundStyle(Color.xertMuted)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)

            credentialFields
        }
    }

    private var credentialFields: some View {
        VStack(spacing: 12) {
            if isCreatingAccount {
                TextField("Full name", text: $fullName)
                    .textContentType(.name)
                    .submitLabel(.next)
                    .xertAccountField()
                TextField("Mobile number (optional)", text: $phone)
                    .textContentType(.telephoneNumber)
                    .keyboardType(.phonePad)
                    .submitLabel(.next)
                    .xertAccountField()
            }
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .onChange(of: email) { _ in passwordResetSent = false }
                .xertAccountField()
            SecureField("Password", text: $password)
                .textContentType(isCreatingAccount ? .newPassword : .password)
                .xertAccountField()
            if isCreatingAccount {
                SecureField("Confirm password", text: $passwordConfirmation)
                    .textContentType(.newPassword)
                    .xertAccountField()
            }
        }
    }

    private var termsAgreement: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle("I agree to the Terms and acknowledge the Privacy Policy", isOn: $acceptedAccountTerms)
                .font(.footnote)
                .foregroundStyle(Color.xertPale)
                .tint(Color.xertSteel)
            HStack(spacing: 16) {
                Link("Terms of Use", destination: AppConfig.webURL(path: "terms"))
                Link("Privacy Policy", destination: AppConfig.webURL(path: "privacy"))
            }
            .font(.footnote)
            .tint(Color.xertSteel)
            // Borderless keeps each link individually tappable inside the row
            // instead of letting a row tap activate them.
            .buttonStyle(.borderless)
        }
        .padding(14)
        .xertCardStyle()
    }

    private var primaryAuthButton: some View {
        Button {
            Task {
                if isCreatingAccount {
                    await store.signUp(
                        fullName: fullName,
                        email: email,
                        phone: phone,
                        password: password,
                        confirmation: passwordConfirmation,
                        acceptedTerms: acceptedAccountTerms
                    )
                } else {
                    await store.signIn(email: email, password: password)
                }
            }
        } label: {
            Text(isCreatingAccount ? "Create Account" : "Sign In")
        }
        .buttonStyle(.xertPrimary)
        .disabled(authActionDisabled)
        .opacity(authActionDisabled ? 0.55 : 1)
    }

    private var forgotPasswordControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                Task {
                    passwordResetSent = await store.requestPasswordReset(email: email)
                }
            } label: {
                HStack {
                    Text(store.isRequestingPasswordReset ? "Sending reset link..." : "Forgot password?")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.xertSteel)
                    Spacer()
                    if store.isRequestingPasswordReset {
                        ProgressView()
                            .tint(Color.xertPale)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isRequestingPasswordReset)

            if passwordResetSent {
                Text("If an XERT account uses this email, a reset link is on its way.")
                    .font(.footnote)
                    .foregroundStyle(Color.xertMuted)
            }
        }
    }

    // MARK: - Shared helpers

    private func syncProfileForm() {
        fullName = store.profile?.full_name ?? ""
        phone = store.profile?.phone ?? ""
    }

    private var authActionDisabled: Bool {
        if store.isLoading || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return true
        }
        if !isCreatingAccount { return password.count < 6 }
        return fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || password.count < 8
            || passwordConfirmation != password
            || !acceptedAccountTerms
    }

    @ViewBuilder
    private func bookingRows(_ bookings: [BookingItem]) -> some View {
        ForEach(bookings) { booking in
            VStack(alignment: .leading, spacing: 4) {
                Text(booking.title)
                    .font(.headline)
                    .foregroundStyle(Color.xertOffWhite)
                Text(booking.start_time.formatted(date: .abbreviated, time: .shortened))
                    .font(.subheadline)
                    .foregroundStyle(Color.xertPale)
                Text(booking.stateLabel.uppercased())
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(.xertSteel)
                if booking.status == "confirmed" && booking.start_time > Date() {
                    Button {
                        Task { await addBookingToCalendar(booking) }
                    } label: {
                        Label(
                            addingBookingToCalendarID == booking.id ? "Adding to calendar..." : "Add to Calendar",
                            systemImage: "calendar.badge.plus"
                        )
                    }
                    .buttonStyle(.borderless)
                    .disabled(addingBookingToCalendarID != nil)
                }
                if booking.isCancellable() {
                    Button(booking.status == "waitlisted" ? "Leave waitlist" : "Cancel booking", role: .destructive) {
                        bookingToCancel = booking
                    }
                    .disabled(store.cancellingBookingID == booking.id)
                }
            }
            .padding(.vertical, 4)
        }
    }

    @MainActor
    private func addBookingToCalendar(_ booking: BookingItem) async {
        addingBookingToCalendarID = booking.id
        defer { addingBookingToCalendarID = nil }
        do {
            let result = try await EventCalendarWriter.add(booking)
            bookingCalendarNotice = result == .added
                ? BookingCalendarNotice(title: "Added to Calendar", message: "\(booking.title) is now in your calendar.")
                : BookingCalendarNotice(title: "Already in Calendar", message: "\(booking.title) is already saved in your calendar.")
        } catch {
            bookingCalendarNotice = BookingCalendarNotice(
                title: "Could Not Add Class",
                message: error.localizedDescription
            )
        }
    }

    private var legalSection: some View {
        Section {
            Link("Privacy Policy", destination: AppConfig.webURL(path: "privacy"))
            Link("Terms of Use", destination: AppConfig.webURL(path: "terms"))
            Link("Contact XERT Support", destination: AppConfig.webURL(path: "contact"))
        } header: {
            Text("Legal & Support").xertEyebrow()
        }
        .listRowBackground(Color.xertInk)
        .tint(Color.xertSteel)
    }
}

private struct BookingCalendarNotice: Identifiable {
    let id = UUID()
    let title: String
    let message: String
}

// MARK: - Brand input field

private extension View {
    /// Dark brand input: ink surface, hairline steel border, sharp 2pt corners.
    func xertAccountField() -> some View {
        textFieldStyle(.plain)
            .font(.subheadline)
            .foregroundStyle(Color.xertOffWhite)
            .tint(Color.xertSteel)
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(Color.xertInk)
            .overlay(
                RoundedRectangle(cornerRadius: 2)
                    .stroke(Color.xertSteel.opacity(0.3), lineWidth: 1)
            )
    }
}

private extension BookingItem {
    var cancellationMessage: String {
        if status == "waitlisted" {
            return "This will remove you from the waitlist for \(title). No class credit is currently reserved."
        }
        if BookingCancellationPolicy.returnsCredit(status: status, startTime: start_time) {
            return "This will remove you from \(title) and return your class credit."
        }
        return "This will remove you from \(title). Confirmed bookings cancelled within 12 hours do not return a class credit."
    }
}
