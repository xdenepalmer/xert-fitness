import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var store: XertStore
    @State private var email = ""
    @State private var password = ""
    @State private var isCreatingAccount = false
    @State private var fullName = ""
    @State private var phone = ""
    @State private var didSaveProfile = false
    @State private var passwordResetSent = false
    @State private var bookingToCancel: BookingItem?
    @State private var showingDeleteConfirmation = false
    @FocusState private var focusedProfileField: ProfileField?

    private enum ProfileField {
        case fullName, phone
    }

    var body: some View {
        NavigationStack {
            Form {
                if store.isSignedIn {
                    if store.isUsingStaleMemberData {
                        Section {
                            StaleMemberDataNotice()
                        }
                    }
                    if !store.unavailableDataSources.isDisjoint(with: [.credits, .bookings, .profile, .eventGoals]) {
                        Section {
                            DataAvailabilityNotice(sources: [.credits, .bookings, .profile, .eventGoals])
                        }
                    }

                    Section("Membership") {
                        HStack {
                            Text("Signed in")
                            Spacer()
                            Text(store.authSession?.user?.email ?? "Member")
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            Text("Credits")
                            Spacer()
                            Text("\(store.creditTotal)")
                                .foregroundStyle(.xertSteel)
                                .fontWeight(.bold)
                        }
                    }

                    Section("Account Details") {
                        TextField("Full name", text: $fullName)
                            .textContentType(.name)
                            .focused($focusedProfileField, equals: .fullName)
                            .submitLabel(.next)
                            .onSubmit { focusedProfileField = .phone }
                        TextField("Mobile number", text: $phone)
                            .textContentType(.telephoneNumber)
                            .keyboardType(.phonePad)
                            .focused($focusedProfileField, equals: .phone)
                        Button {
                            Task {
                                let saved = await store.updateProfile(fullName: fullName, phone: phone)
                                didSaveProfile = saved
                                if saved { focusedProfileField = nil }
                            }
                        } label: {
                            HStack {
                                Text(store.isSavingProfile ? "Saving..." : "Save Account Details")
                                Spacer()
                                if store.isSavingProfile {
                                    ProgressView()
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
                    }

                    Section {
                        Button("Sign Out", role: .destructive) {
                            store.signOut()
                        }
                    }

                    Section("Account Control") {
                        Button("Delete Account", role: .destructive) {
                            showingDeleteConfirmation = true
                        }
                        .disabled(store.isDeletingAccount)
                        Text("Permanently removes your profile, credits, bookings and training goals. This cannot be undone.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    legalSection

                    Section("Bookings") {
                        if store.bookings.isEmpty {
                            Text("No bookings yet.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(store.bookings) { booking in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(booking.title)
                                        .font(.headline)
                                    Text(booking.start_time.formatted(date: .abbreviated, time: .shortened))
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                    Text(booking.status.uppercased())
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(.xertSteel)
                                    if booking.isCancellable() {
                                        Button("Cancel booking", role: .destructive) {
                                            bookingToCancel = booking
                                        }
                                        .disabled(store.cancellingBookingID == booking.id)
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }
                } else {
                    Section(isCreatingAccount ? "Create Account" : "Sign In") {
                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .onChange(of: email) { _ in passwordResetSent = false }
                        SecureField("Password", text: $password)
                            .textContentType(isCreatingAccount ? .newPassword : .password)

                        Button {
                            Task {
                                if isCreatingAccount {
                                    await store.signUp(email: email, password: password)
                                } else {
                                    await store.signIn(email: email, password: password)
                                }
                            }
                        } label: {
                            Text(isCreatingAccount ? "Create Account" : "Sign In")
                                .frame(maxWidth: .infinity)
                        }
                        .disabled(email.isEmpty || password.count < 6 || store.isLoading)

                        if !isCreatingAccount {
                            Button {
                                Task {
                                    passwordResetSent = await store.requestPasswordReset(email: email)
                                }
                            } label: {
                                HStack {
                                    Text(store.isRequestingPasswordReset ? "Sending reset link..." : "Forgot password?")
                                    Spacer()
                                    if store.isRequestingPasswordReset {
                                        ProgressView()
                                    }
                                }
                            }
                            .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isRequestingPasswordReset)

                            if passwordResetSent {
                                Text("If an XERT account uses this email, a reset link is on its way.")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    Section {
                        Button(isCreatingAccount ? "Already have an account?" : "Create a member account") {
                            isCreatingAccount.toggle()
                        }
                    }

                    legalSection
                }
            }
            .navigationTitle("Account")
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
        }
    }

    private func syncProfileForm() {
        fullName = store.profile?.full_name ?? ""
        phone = store.profile?.phone ?? ""
    }

    private var legalSection: some View {
        Section("Legal & Support") {
            Link("Privacy Policy", destination: AppConfig.webURL(path: "privacy"))
            Link("Terms of Use", destination: AppConfig.webURL(path: "terms"))
            Link("Contact XERT Support", destination: AppConfig.webURL(path: "contact"))
        }
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
