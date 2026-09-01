import SwiftUI

struct AdminWorkoutOfDayView: View {
    private enum FocusedField: Hashable {
        case title
        case body
    }

    let session: AuthSession

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var selectedDate = AdminWorkoutOfDay.brisbaneToday
    @State private var draft = AdminWorkoutOfDayDraft()
    @State private var baseline = AdminWorkoutOfDayDraft()
    @State private var recent: [AdminWorkoutOfDay] = []
    @State private var isLoadingDay = false
    @State private var isRefreshing = false
    @State private var isSaving = false
    @State private var hasLoadedDay = false
    @State private var errorMessage: String?
    @State private var noticeMessage: String?
    @State private var pendingDate: Date?
    @State private var exitStateID = UUID()
    @FocusState private var focusedField: FocusedField?

    private let api = XertAPI()

    private var isDirty: Bool { draft != baseline }
    private var canEdit: Bool { hasLoadedDay && !isLoadingDay && !isSaving }
    private var canSave: Bool { canEdit && isDirty }

    private var quickDates: [Date] {
        [-1, 0, 1, 2].compactMap {
            AdminWorkoutOfDay.brisbaneCalendar.date(
                byAdding: .day,
                value: $0,
                to: AdminWorkoutOfDay.brisbaneToday
            )
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                pageHeader
                dayChooser
                if let noticeMessage {
                    statusBanner(noticeMessage, icon: "checkmark.circle.fill", color: .green)
                }
                if !hasLoadedDay {
                    loadingCard
                } else {
                    editorCard
                }
                recentWorkouts
            }
            .frame(maxWidth: 980, alignment: .leading)
            .padding(16)
            .frame(maxWidth: .infinity)
        }
        .xertOwnerScreen()
        .navigationTitle("Workout of the Day")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Link(destination: AppConfig.webURL(path: "display")) {
                    Label("Open TV display", systemImage: "tv")
                }
                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Label("Save", systemImage: "checkmark")
                    }
                }
                .disabled(!canSave)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
            }
        }
        .refreshable { await refresh() }
        .task { await refresh() }
        .adminOwnerExitState(
            id: exitStateID,
            title: "workout edits",
            isDirty: isDirty,
            isBusy: isSaving
        )
        .confirmationDialog(
            "Discard unsaved workout edits?",
            isPresented: Binding(
                get: { pendingDate != nil },
                set: { if !$0 { pendingDate = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let pendingDate {
                Button("Discard and change day", role: .destructive) {
                    self.pendingDate = nil
                    Task { await loadDay(pendingDate) }
                }
            }
            Button("Keep editing", role: .cancel) { pendingDate = nil }
        } message: {
            Text("Changes to \(dayLabel(selectedDate)) have not been saved.")
        }
        .alert(
            "Workout of the Day",
            isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )
        ) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var pageHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("DAILY PROGRAMMING")
                .font(.caption.weight(.bold))
                .tracking(1.8)
                .foregroundStyle(Color.xertSteel)
            Text("Workout of the Day")
                .font(XertTheme.displayFont(size: 36, relativeTo: .largeTitle))
                .textCase(.uppercase)
                .foregroundStyle(Color.xertOffWhite)
            Text("Write one workout for each Brisbane day. Publish it when it is ready and the club TV will update automatically.")
                .font(.subheadline)
                .foregroundStyle(Color.xertPale.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { headerMetrics }
                VStack(spacing: 10) { headerMetrics }
            }
        }
        .padding(18)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.22)))
    }

    @ViewBuilder
    private var headerMetrics: some View {
        metric(
            title: draft.isPublished ? "Live on TV" : "Draft",
            detail: dayLabel(selectedDate),
            icon: draft.isPublished ? "tv.fill" : "doc.text",
            color: draft.isPublished ? .green : Color.xertSteel
        )
        metric(
            title: recent.filter(\.isPublished).count.formatted(),
            detail: "Published in recent list",
            icon: "checkmark.circle",
            color: Color.xertSteel
        )
    }

    private func metric(title: String, detail: String, icon: String, color: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(color)
                .frame(width: 28, height: 28)
                .background(color.opacity(0.12))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.bold)).foregroundStyle(Color.xertOffWhite)
                Text(detail).font(.caption).foregroundStyle(Color.xertPale.opacity(0.52))
            }
            Spacer(minLength: 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.xertNavy.opacity(0.65))
    }

    private var dayChooser: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("PROGRAM DAY")
                        .font(.caption2.weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(Color.xertSteel)
                    Text(dayLabel(selectedDate))
                        .font(.headline)
                        .foregroundStyle(Color.xertOffWhite)
                }
                Spacer()
                DatePicker(
                    "Workout date",
                    selection: Binding(
                        get: { selectedDate },
                        set: { requestDate($0) }
                    ),
                    displayedComponents: .date
                )
                .labelsHidden()
                .tint(Color.xertSteel)
                .disabled(isLoadingDay || isSaving)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(quickDates, id: \.self) { date in
                        let selected = AdminWorkoutOfDay.dateKey(for: date) == draft.dateKey
                        Button {
                            requestDate(date)
                        } label: {
                            VStack(spacing: 2) {
                                Text(relativeDayLabel(date)).font(.caption.weight(.bold))
                                Text(shortDayLabel(date)).font(.caption2)
                            }
                            .foregroundStyle(selected ? Color.xertNavy : Color.xertPale)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 46)
                            .background(selected ? Color.xertSteel : Color.xertNavy)
                            .overlay(Rectangle().stroke(Color.xertSteel.opacity(selected ? 1 : 0.28)))
                        }
                        .buttonStyle(.plain)
                        .disabled(isLoadingDay || isSaving)
                    }
                }
            }
        }
        .padding(16)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.18)))
    }

    private var editorCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("TV CONTENT")
                        .font(.caption2.weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(Color.xertSteel)
                    Text(draft.sourceUpdatedAt == nil ? "Create this day" : "Edit this day")
                        .font(XertTheme.displayFont(size: 26, relativeTo: .title2))
                        .textCase(.uppercase)
                        .foregroundStyle(Color.xertOffWhite)
                }
                Spacer()
                if isDirty {
                    Label("Unsaved", systemImage: "circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                }
            }

            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text("TITLE (OPTIONAL)").font(.caption2.weight(.bold)).tracking(0.9)
                    Spacer()
                    characterCount(draft.title.count, limit: AdminWorkoutOfDay.titleLimit)
                }
                TextField("Strength + Metcon", text: $draft.title)
                    .focused($focusedField, equals: .title)
                    .textInputAutocapitalization(.sentences)
                    .padding(12)
                    .background(Color.xertNavy)
                    .overlay(Rectangle().stroke(fieldBorder(draft.title.count, limit: AdminWorkoutOfDay.titleLimit)))
                    .disabled(!canEdit)
            }

            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text("THE WORKOUT").font(.caption2.weight(.bold)).tracking(0.9)
                    Spacer()
                    characterCount(draft.body.count, limit: AdminWorkoutOfDay.bodyLimit)
                }
                ZStack(alignment: .topLeading) {
                    if draft.body.isEmpty {
                        Text("A. Back squat 5 x 5\nB. 12 min AMRAP\n   10 wall balls\n   200 m row")
                            .font(.body.monospaced())
                            .foregroundStyle(Color.xertPale.opacity(0.28))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 18)
                            .allowsHitTesting(false)
                    }
                    TextEditor(text: $draft.body)
                        .focused($focusedField, equals: .body)
                        .font(.body.monospaced())
                        .foregroundStyle(Color.xertOffWhite)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: dynamicTypeSize.isAccessibilitySize ? 320 : 260)
                        .padding(8)
                        .background(Color.clear)
                        .disabled(!canEdit)
                }
                .background(Color.xertNavy)
                .overlay(Rectangle().stroke(fieldBorder(draft.body.count, limit: AdminWorkoutOfDay.bodyLimit)))
                Text("Line breaks and spacing appear on the TV exactly as entered.")
                    .font(.caption)
                    .foregroundStyle(Color.xertPale.opacity(0.5))
            }

            Toggle(isOn: $draft.isPublished) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Show on the club TV", systemImage: "tv")
                        .font(.headline)
                        .foregroundStyle(Color.xertOffWhite)
                    Text("Keep this off to prepare a future workout as a private draft.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.55))
                }
            }
            .tint(Color.xertSteel)
            .disabled(!canEdit)

            Button {
                Task { await save() }
            } label: {
                HStack {
                    if isSaving { ProgressView().tint(Color.xertNavy) }
                    Label(
                        isSaving ? "Saving…" : draft.isPublished ? "Save & show on TV" : "Save draft",
                        systemImage: isSaving ? "clock" : "checkmark.circle.fill"
                    )
                }
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.xertSteel)
            .foregroundStyle(Color.xertNavy)
            .disabled(!canSave)
        }
        .padding(18)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.2)))
        .opacity(isLoadingDay ? 0.62 : 1)
    }

    @ViewBuilder
    private var recentWorkouts: some View {
        if !recent.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("RECENT WORKOUTS")
                    .font(.caption.weight(.bold))
                    .tracking(1.4)
                    .foregroundStyle(Color.xertSteel)
                VStack(spacing: 0) {
                    ForEach(Array(recent.enumerated()), id: \.element.id) { index, workout in
                        Button {
                            if let date = AdminWorkoutOfDay.date(from: workout.workout_date) {
                                requestDate(date)
                            }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: workout.isPublished ? "tv.fill" : "doc.text")
                                    .foregroundStyle(workout.isPublished ? Color.green : Color.xertSteel)
                                    .frame(width: 30)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(workout.displayTitle)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(Color.xertOffWhite)
                                        .lineLimit(1)
                                    Text(dayLabel(for: workout.workout_date))
                                        .font(.caption)
                                        .foregroundStyle(Color.xertPale.opacity(0.5))
                                }
                                Spacer()
                                Text(workout.isPublished ? "LIVE" : "DRAFT")
                                    .font(.caption2.weight(.bold))
                                    .tracking(0.7)
                                    .foregroundStyle(workout.isPublished ? Color.green : Color.xertPale.opacity(0.5))
                                Image(systemName: "chevron.right")
                                    .font(.caption.bold())
                                    .foregroundStyle(Color.xertSteel.opacity(0.5))
                            }
                            .padding(14)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(isLoadingDay || isSaving)
                        if index < recent.count - 1 {
                            Divider().overlay(Color.xertSteel.opacity(0.14))
                        }
                    }
                }
                .background(Color.xertInk)
                .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.18)))
            }
        }
    }

    private var loadingCard: some View {
        VStack(spacing: 12) {
            if isLoadingDay || isRefreshing {
                ProgressView()
            } else {
                Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(.title2)
                    .foregroundStyle(Color.orange)
            }
            Text(isLoadingDay || isRefreshing ? "Loading the live workout…" : "The workout could not be loaded safely.")
                .font(.subheadline)
                .foregroundStyle(Color.xertPale.opacity(0.65))
            if !isLoadingDay && !isRefreshing {
                Button {
                    Task { await refresh() }
                } label: {
                    Label("Retry workout", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .tint(Color.xertSteel)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 260)
        .background(Color.xertInk)
        .overlay(Rectangle().stroke(Color.xertSteel.opacity(0.18)))
    }

    private func statusBanner(_ message: String, icon: String, color: Color) -> some View {
        Label(message, systemImage: icon)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(13)
            .background(color.opacity(0.1))
            .overlay(Rectangle().stroke(color.opacity(0.28)))
    }

    private func characterCount(_ count: Int, limit: Int) -> some View {
        Text("\(count)/\(limit)")
            .font(.caption2.monospacedDigit())
            .foregroundStyle(count > limit ? Color.red : Color.xertPale.opacity(0.45))
    }

    private func fieldBorder(_ count: Int, limit: Int) -> Color {
        count > limit ? Color.red.opacity(0.8) : Color.xertSteel.opacity(0.26)
    }

    private func requestDate(_ date: Date) {
        let normalized = AdminWorkoutOfDay.brisbaneCalendar.startOfDay(for: date)
        guard AdminWorkoutOfDay.dateKey(for: normalized) != draft.dateKey else { return }
        focusedField = nil
        if isDirty {
            pendingDate = normalized
        } else {
            Task { await loadDay(normalized) }
        }
    }

    @MainActor
    private func refresh() async {
        guard !isRefreshing, !isSaving else { return }
        guard !isDirty else {
            errorMessage = "Save or discard this workout before refreshing live data."
            return
        }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            recent = try await api.adminWorkouts(session: session)
            try await loadDayValue(selectedDate)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func loadDay(_ date: Date) async {
        guard !isLoadingDay, !isSaving else { return }
        let previousDate = selectedDate
        selectedDate = AdminWorkoutOfDay.brisbaneCalendar.startOfDay(for: date)
        do {
            try await loadDayValue(selectedDate)
        } catch {
            selectedDate = previousDate
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func loadDayValue(_ date: Date) async throws {
        isLoadingDay = true
        defer { isLoadingDay = false }
        noticeMessage = nil
        let dateKey = AdminWorkoutOfDay.dateKey(for: date)
        let workout = try await api.adminWorkout(session: session, dateKey: dateKey)
        let loaded = AdminWorkoutOfDayDraft(workout: workout, date: date)
        selectedDate = loaded.workoutDate
        draft = loaded
        baseline = loaded
        hasLoadedDay = true
    }

    @MainActor
    private func save() async {
        guard canSave else { return }
        if let validation = draft.validationMessage {
            errorMessage = validation
            XertHaptics.play(.error)
            return
        }
        focusedField = nil
        isSaving = true
        defer { isSaving = false }
        do {
            let saved = try await api.adminSaveWorkout(session: session, draft: draft)
            let savedDraft = AdminWorkoutOfDayDraft(workout: saved, date: selectedDate)
            draft = savedDraft
            baseline = savedDraft
            selectedDate = savedDraft.workoutDate
            recent.removeAll { $0.id == saved.id }
            recent.append(saved)
            recent.sort { $0.workout_date > $1.workout_date }
            recent = Array(recent.prefix(21))
            noticeMessage = saved.isPublished
                ? "Workout published. The club TV will update automatically."
                : "Workout saved as a private draft."
            XertHaptics.play(.success)
        } catch {
            errorMessage = error.localizedDescription
            XertHaptics.play(.error)
        }
    }

    private func relativeDayLabel(_ date: Date) -> String {
        let distance = AdminWorkoutOfDay.brisbaneCalendar.dateComponents(
            [.day],
            from: AdminWorkoutOfDay.brisbaneToday,
            to: date
        ).day ?? 0
        switch distance {
        case -1: return "Yesterday"
        case 0: return "Today"
        case 1: return "Tomorrow"
        default: return Self.weekdayFormatter.string(from: date)
        }
    }

    private func shortDayLabel(_ date: Date) -> String {
        Self.shortDateFormatter.string(from: date)
    }

    private func dayLabel(_ date: Date) -> String {
        Self.longDateFormatter.string(from: date)
    }

    private func dayLabel(for dateKey: String) -> String {
        AdminWorkoutOfDay.date(from: dateKey).map(dayLabel) ?? dateKey
    }

    private static let weekdayFormatter = formatter("EEE")
    private static let shortDateFormatter = formatter("d MMM")
    private static let longDateFormatter = formatter("EEEE, d MMMM yyyy")

    private static func formatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = AdminWorkoutOfDay.brisbaneCalendar
        formatter.locale = Locale(identifier: "en_AU")
        formatter.timeZone = AdminWorkoutOfDay.brisbaneCalendar.timeZone
        formatter.dateFormat = format
        return formatter
    }
}
