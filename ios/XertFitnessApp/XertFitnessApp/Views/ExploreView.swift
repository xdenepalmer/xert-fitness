import SwiftUI

struct ExploreView: View {
    @EnvironmentObject private var store: XertStore
    let onNavigate: (XertPrimaryDestination) -> Void

    private var about: AdminSiteContentData { store.publicContent(for: .about) }
    private var contact: AdminSiteContentData { store.publicContent(for: .contact) }
    private var faq: AdminSiteContentData { store.publicContent(for: .faq) }
    private var aboutParagraphs: [String] { about.paragraphs ?? [] }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    XertPageHero(
                        imageName: "HeroTraining",
                        eyebrow: "Inside XERT",
                        title: "Train With Purpose.",
                        subtitle: "Meet the team, understand the training system and find the right way to join XERT.",
                        badge: "Kingaroy · Coaching · Community"
                    )
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)

                if !store.unavailableDataSources.isDisjoint(with: [.coaches, .siteContent]) {
                    Section { DataAvailabilityNotice(sources: [.coaches, .siteContent]) }
                        .listRowBackground(Color.xertInk)
                }

                Section("About XERT Fitness") {
                    ForEach(aboutParagraphs.indices, id: \.self) { index in
                        Text(aboutParagraphs[index])
                            .foregroundStyle(Color.xertPale)
                            .fixedSize(horizontal: false, vertical: true)
                            .listRowBackground(Color.xertInk)
                    }
                    Button("Book your first session") { onNavigate(.booking) }
                        .foregroundStyle(Color.xertSteel)
                        .listRowBackground(Color.xertInk)
                }

                Section("Coaches and practitioners") {
                    if store.coaches.isEmpty {
                        Text("Coach, nutrition, massage and physio profiles are being finalised.")
                            .foregroundStyle(Color.xertPale.opacity(0.65))
                    } else {
                        ForEach(store.coaches) { coach in
                            NavigationLink {
                                CoachProfileView(coach: coach)
                            } label: {
                                CoachSummaryRow(coach: coach)
                            }
                        }
                    }
                }

                Section("Functional training guide") {
                    ForEach(TrainingGuideTopic.all) { topic in
                        NavigationLink(topic.title) {
                            TrainingGuideDetailView(topic: topic)
                        }
                        .listRowBackground(Color.xertInk)
                    }
                }

                Section("Frequently asked questions") {
                    ForEach(faq.items ?? []) { item in
                        DisclosureGroup(item.q) {
                            Text(item.a).foregroundStyle(Color.xertPale.opacity(0.75)).padding(.vertical, 8)
                        }
                        .tint(Color.xertSteel)
                        .listRowBackground(Color.xertInk)
                    }
                }

                opportunitiesSection
                contactSection
                XertScrollEndSpacer()
            }
            .xertListBackground()
            .listStyle(.plain)
            .navigationTitle("Explore")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .tabBar)
            .refreshable { await store.refresh() }
        }
    }

    private var opportunitiesSection: some View {
        Section("Ways to join XERT") {
            NavigationLink {
                NativeInterestFormView(kind: .member)
            } label: {
                Label("Register foundation interest", systemImage: "person.crop.circle.badge.plus")
            }
            NavigationLink {
                NativeInterestFormView(kind: .trainer)
            } label: {
                Label("Apply to coach at XERT", systemImage: "figure.strengthtraining.traditional")
            }
            NavigationLink {
                NativeInterestFormView(kind: .partner)
            } label: {
                Label("Partner with XERT", systemImage: "cross.case")
            }
        }
        .foregroundStyle(Color.xertSteel)
    }

    @ViewBuilder
    private var contactSection: some View {
        Section("Contact XERT") {
            if let email = contact.email, let url = URL(string: "mailto:\(email)") {
                Link(destination: url) { Label(email, systemImage: "envelope") }
            }
            if let phone = contact.phone?.trimmingCharacters(in: .whitespacesAndNewlines),
               !phone.isEmpty,
               let url = URL(string: "tel:\(phone.filter { !$0.isWhitespace })") {
                Link(destination: url) { Label(phone, systemImage: "phone") }
            }
            if let address = contact.address {
                Link(destination: URL(string: "https://www.openstreetmap.org/#map=14/-26.5309/151.8400")!) {
                    Label(address, systemImage: "mappin.and.ellipse")
                }
            }
            if let handle = contact.instagram_handle,
               let raw = contact.instagram_url,
               let url = URL(string: raw) {
                Link(destination: url) { Label(handle, systemImage: "camera") }
            }
            if let intro = contact.intro {
                Text(intro).font(.footnote).foregroundStyle(Color.xertPale.opacity(0.65))
            }
        }
        .foregroundStyle(Color.xertSteel)
    }
}

private struct NativeInterestFormView: View {
    @EnvironmentObject private var store: XertStore
    @Environment(\.dismiss) private var dismiss
    let kind: NativeInterestKind
    @State private var draft = NativeInterestDraft()
    @State private var submitted = false

    var body: some View {
        Form {
            Section("Contact") {
                TextField("Full name", text: $draft.fullName).textContentType(.name)
                TextField("Email", text: $draft.email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                TextField("Phone", text: $draft.phone).textContentType(.telephoneNumber).keyboardType(.phonePad)
                if kind == .partner {
                    TextField("Business or practice name", text: $draft.businessName).textContentType(.organizationName)
                }
            }

            switch kind {
            case .member: memberFields
            case .trainer: trainerFields
            case .partner: partnerFields
            }

            Section {
                Toggle("XERT may contact me about this enquiry", isOn: $draft.consentsToContact)
                if kind == .member {
                    Toggle("Send me XERT launch and timetable updates", isOn: $draft.mailingList)
                }
                Button {
                    Task {
                        if await store.submitInterest(kind: kind, draft: draft) { submitted = true }
                    }
                } label: {
                    HStack {
                        if store.isSubmittingInterest { ProgressView() }
                        Text(store.isSubmittingInterest ? "Submitting..." : "Submit \(kind.title)")
                    }
                }
                .disabled(store.isSubmittingInterest)
            } footer: {
                Text("Your details go directly to XERT's protected owner CRM for follow-up.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.xertNavy)
        .navigationTitle(kind.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: prefillContact)
        .alert("Thanks - we have it.", isPresented: $submitted) {
            Button("Done") { dismiss() }
        } message: {
            Text("XERT will follow up using the contact details you provided.")
        }
    }

    private var memberFields: some View {
        Group {
            Section("About you") {
                Picker("Age range", selection: $draft.ageRange) {
                    Text("Choose").tag("")
                    ForEach(["16–20", "21–30", "31–40", "41–55", "56+"], id: \.self) { Text($0).tag($0) }
                }
                TextField("Suburb or town", text: $draft.suburbTown)
                Picker("Occupation group", selection: $draft.occupationGroup) {
                    Text("Optional").tag("")
                    ForEach(Self.occupations, id: \.self) { Text($0).tag($0) }
                }
            }
            Section("Training") {
                Picker("Current training level", selection: $draft.trainingLevel) {
                    Text("Choose").tag("")
                    ForEach(Self.trainingLevels, id: \.self) { Text($0).tag($0) }
                }
                NativeMultiSelect(title: "Training goals", options: Self.trainingGoals, selection: $draft.goals)
                NativeMultiSelect(title: "Preferred training times", options: Self.trainingTimes, selection: $draft.preferredTimes)
            }
            Section("Interests") {
                Toggle("Group classes", isOn: $draft.groupClasses)
                Toggle("Personal training", isOn: $draft.personalTraining)
                Toggle("Workshops", isOn: $draft.workshops)
                Toggle("Event preparation", isOn: $draft.eventPrep)
                TextField("Injuries or limitations (optional)", text: $draft.injuries, axis: .vertical).lineLimit(3...8)
                TextField("Biggest reason for joining", text: $draft.joiningReason, axis: .vertical).lineLimit(3...8)
            }
        }
    }

    private var trainerFields: some View {
        Group {
            Section("Experience") {
                TextField("Qualifications", text: $draft.qualifications, axis: .vertical)
                Picker("Years of experience", selection: $draft.yearsExperience) {
                    Text("Choose").tag("")
                    ForEach(["Under 1 year", "1–2 years", "3–5 years", "5–10 years", "10+ years"], id: \.self) { Text($0).tag($0) }
                }
                TextField("Functional training experience", text: $draft.functionalExperience, axis: .vertical).lineLimit(4...10)
                NativeMultiSelect(title: "Availability", options: Self.trainerAvailability, selection: $draft.availability)
            }
            Section("Coaching fit") {
                NativeMultiSelect(title: "Specialties", options: Self.trainerSpecialties, selection: $draft.specialties)
                Toggle("Available for group classes", isOn: $draft.groupClasses)
                Toggle("Available for personal training", isOn: $draft.personalTraining)
                Toggle("Available for workshops", isOn: $draft.workshops)
                Toggle("Current First Aid / CPR", isOn: $draft.firstAidCPR)
                Picker("Insurance status", selection: $draft.insuranceStatus) {
                    Text("Optional").tag("")
                    ForEach(["Current PI/PL insurance", "Expired — can renew", "Not currently insured", "Unsure"], id: \.self) { Text($0).tag($0) }
                }
                TextField("Short introduction", text: $draft.shortIntro, axis: .vertical).lineLimit(3...8)
                TextField("Social or website links", text: $draft.socialLinks).keyboardType(.URL).textInputAutocapitalization(.never)
            }
        }
    }

    private var partnerFields: some View {
        Group {
            Section("Practice") {
                TextField("Profession or specialty", text: $draft.profession)
                NativeMultiSelect(title: "Services offered", options: Self.partnerServices, selection: $draft.services)
                Toggle("Open to subcontracting at XERT", isOn: $draft.subcontractInterest)
                Toggle("Interested in running workshops", isOn: $draft.workshops)
                Picker("Preferred partnership model", selection: $draft.preferredModel) {
                    Text("Optional").tag("")
                    ForEach(Self.partnerModels, id: \.self) { Text($0).tag($0) }
                }
                TextField("Availability", text: $draft.availabilityText)
                TextField("Website or social link", text: $draft.websiteSocialLink).keyboardType(.URL).textInputAutocapitalization(.never)
                TextField("Tell us about your practice", text: $draft.shortIntro, axis: .vertical).lineLimit(3...8)
            }
        }
    }

    private func prefillContact() {
        guard draft.fullName.isEmpty else { return }
        draft.fullName = store.profile?.full_name ?? ""
        draft.email = store.profile?.email ?? ""
        draft.phone = store.profile?.phone ?? ""
    }

    private static let occupations = ["Emergency services", "Mine worker", "Hospital / healthcare", "Teacher / education", "Council / government", "Trade / labour", "Office / admin", "Student", "Local business owner", "Other"]
    private static let trainingLevels = ["New / beginner", "Some gym experience", "Regular trainer", "Advanced", "Returning after time off"]
    private static let trainingGoals = ["Strength", "Conditioning", "Weight loss / body composition", "Confidence", "Event preparation", "Sport performance", "General health", "Community / accountability", "PT support"]
    private static let trainingTimes = ["Early morning", "Mid-morning", "Lunch", "Afternoon", "After work", "Evening", "Weekends"]
    private static let trainerAvailability = ["Early mornings", "Mid-mornings", "Afternoons", "Evenings", "Weekends"]
    private static let trainerSpecialties = ["Strength", "Conditioning", "Olympic lifting", "Endurance", "Mobility", "Rehabilitation", "Sport performance", "Beginners", "Older adults", "Youth"]
    private static let partnerServices = ["Physiotherapy", "Nutrition / dietetics", "Psychology / mental performance", "Massage therapy", "Strength & conditioning education", "Medical / GP", "Podiatry", "Occupational therapy", "Other allied health"]
    private static let partnerModels = ["Referral partner", "Regular sessions at XERT", "Workshops only", "Online services", "Flexible / open to discussion"]
}

private struct NativeMultiSelect: View {
    let title: String
    let options: [String]
    @Binding var selection: Set<String>

    var body: some View {
        DisclosureGroup {
            ForEach(options, id: \.self) { option in
                Toggle(option, isOn: Binding(
                    get: { selection.contains(option) },
                    set: { selected in
                        if selected { selection.insert(option) } else { selection.remove(option) }
                    }
                ))
            }
        } label: {
            HStack {
                Text(title)
                Spacer()
                if !selection.isEmpty { Text("\(selection.count)").foregroundStyle(Color.xertSteel) }
            }
        }
        .tint(Color.xertSteel)
    }
}

private struct CoachSummaryRow: View {
    let coach: AdminCoach

    var body: some View {
        HStack(spacing: 12) {
            CoachPhoto(coach: coach, size: 58)
            VStack(alignment: .leading, spacing: 4) {
                Text(coach.name).font(.headline).foregroundStyle(Color.xertOffWhite)
                Text(coach.role ?? coach.category.capitalized).font(.caption).foregroundStyle(Color.xertSteel)
                if let goal = coach.currently_training_for {
                    Text("Training for: \(goal)").font(.caption2).foregroundStyle(Color.xertPale.opacity(0.55)).lineLimit(2)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

private struct CoachProfileView: View {
    let coach: AdminCoach

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                CoachPhoto(coach: coach, size: 220).frame(maxWidth: .infinity)
                VStack(alignment: .leading, spacing: 6) {
                    Text(coach.name).xertDisplay(34)
                    Text(coach.role ?? coach.category.capitalized).xertEyebrow()
                }
                if let bio = coach.bio { Text(bio).foregroundStyle(Color.xertPale) }
                if let experience = coach.experience {
                    Label(experience, systemImage: "dumbbell").foregroundStyle(Color.xertPale)
                }
                if let goal = coach.currently_training_for {
                    Label("Currently training for: \(goal)", systemImage: "target").foregroundStyle(Color.xertPale)
                }
                if let social = coach.social_url, let url = URL(string: social) {
                    Link(destination: url) { Label("Follow", systemImage: "camera") }
                        .buttonStyle(.xertGhost)
                }
            }
            .padding()
        }
        .xertScreenBackground()
        .navigationTitle("The Team")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct CoachPhoto: View {
    let coach: AdminCoach
    let size: CGFloat

    var body: some View {
        Group {
            if let raw = coach.photo_url, let url = URL(string: raw) {
                AsyncImage(url: url) { image in image.resizable().scaledToFill() }
                    placeholder: { initials }
            } else { initials }
        }
        .frame(width: size, height: size).clipped()
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.25), lineWidth: 1))
    }

    private var initials: some View {
        Text(coach.name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased())
            .font(.title2.weight(.bold)).foregroundStyle(Color.xertSteel)
            .frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.xertInk)
    }
}

private struct TrainingGuideTopic: Identifiable {
    let title: String
    let body: String
    var id: String { title }

    static let all = [
        TrainingGuideTopic(title: "What is functional training?", body: "Functional training builds strength, power and conditioning around movement patterns used in everyday life and sport: squatting, hinging, pushing, pulling, carrying and sprinting. Every XERT class is coached and programmed with a clear intent."),
        TrainingGuideTopic(title: "How is XERT different?", body: "A commercial gym sells access to equipment. XERT is coach-led: every class is scaled to the member, programming runs in structured blocks, and the annual event calendar gives the room concrete goals to train toward."),
        TrainingGuideTopic(title: "Who can train at XERT?", body: "Everyone is coached from the start. Beginners learn fundamentals safely while experienced athletes work toward higher standards and event goals. Sessions scale for both in the same room."),
        TrainingGuideTopic(title: "Why train toward events?", body: "A real goal turns vague intentions into measurable progress. XERT members choose functional fitness, endurance, obstacle, team or charity events and train toward them together."),
        TrainingGuideTopic(title: "What does the soft launch involve?", body: "XERT opens in stages with a limited foundation timetable, gathers feedback and refines class times before expanding. Early interest directly shapes timetable, coaching demand and capacity.")
    ]
}

private struct TrainingGuideDetailView: View {
    let topic: TrainingGuideTopic

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("TRAINING GUIDE").xertEyebrow()
                Text(topic.title).xertDisplay(34)
                Text(topic.body).font(.body).foregroundStyle(Color.xertPale).fixedSize(horizontal: false, vertical: true)
            }
            .padding(24)
        }
        .xertScreenBackground()
        .navigationTitle("Training Guide")
        .navigationBarTitleDisplayMode(.inline)
    }
}
