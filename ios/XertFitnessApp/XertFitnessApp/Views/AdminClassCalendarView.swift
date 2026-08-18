import SwiftUI

enum AdminScheduleViewMode: String, CaseIterable, Identifiable {
    case calendar
    case list

    var id: String { rawValue }

    var title: String {
        switch self {
        case .calendar: return "Calendar"
        case .list: return "List"
        }
    }
}

/// The interactive month calendar for the owner's Class Calendar workspace:
/// press a date to see and manage that day's classes, quick-add a preset from
/// the shared class bank, or start a custom class pre-filled with the date.
/// Rendered as List sections inside AdminScheduleView.
struct AdminClassCalendarSections: View {
    @ObservedObject var admin: AdminStore
    let session: AuthSession
    let timetableIsCurrent: Bool
    let onCreateClass: (Date) -> Void

    private enum TemplatesState: Equatable {
        case loading
        case ready
        case unavailable(String)
    }

    @State private var monthAnchor = Date()
    @State private var selectedDay = Date()
    @State private var templates: [AdminClassTemplate] = []
    @State private var templatesState = TemplatesState.loading
    @State private var bankTimes: [UUID: Date] = [:]
    @State private var bankPublish: [UUID: Bool] = [:]
    @State private var addingTemplateID: UUID?
    private let api = XertAPI()

    private var calendar: Calendar { Calendar.current }

    private var sessionsByDay: [Date: [AdminClassSession]] {
        var groups: [Date: [AdminClassSession]] = [:]
        for item in admin.classSessions {
            guard let start = item.start_time else { continue }
            groups[calendar.startOfDay(for: start), default: []].append(item)
        }
        return groups
    }

    private var selectedDaySessions: [AdminClassSession] {
        (sessionsByDay[calendar.startOfDay(for: selectedDay)] ?? [])
            .sorted { ($0.start_time ?? .distantPast) < ($1.start_time ?? .distantPast) }
    }

    private var quickAddAllowed: Bool {
        timetableIsCurrent && admin.savingClassID == nil
    }

    var body: some View {
        Section {
            VStack(spacing: 12) {
                monthHeader
                weekdayHeader
                monthGrid
            }
            .padding(.vertical, 6)
            .listRowBackground(Color.xertInk)
            .task { await loadTemplates() }
        }

        Section(selectedDayTitle) {
            if selectedDaySessions.isEmpty {
                Text("No classes on this day yet.")
                    .font(.caption)
                    .foregroundStyle(Color.xertPale.opacity(0.6))
                    .listRowBackground(Color.xertInk)
            }
            ForEach(selectedDaySessions) { item in
                NavigationLink {
                    AdminClassEditor(
                        admin: admin,
                        session: session,
                        classSession: item,
                        mutationAllowed: timetableIsCurrent
                    )
                } label: {
                    calendarSessionRow(item)
                }
                .listRowBackground(Color.xertInk)
            }
            Button {
                XertHaptics.play(.softImpact)
                onCreateClass(newClassStart(for: selectedDay))
            } label: {
                Label("New class this day", systemImage: "calendar.badge.plus")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(Color.xertSteel)
            .disabled(!timetableIsCurrent)
            .accessibilityIdentifier("owner.calendar.newClassThisDay")
            .listRowBackground(Color.xertInk)
        }

        Section("Add from the class bank") {
            switch templatesState {
            case .loading:
                HStack(spacing: 10) {
                    ProgressView().tint(Color.xertSteel)
                    Text("Loading saved classes…")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.6))
                }
                .listRowBackground(Color.xertInk)
            case .unavailable(let reason):
                VStack(alignment: .leading, spacing: 10) {
                    Label(reason, systemImage: "tray.and.arrow.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.orange)
                        .fixedSize(horizontal: false, vertical: true)
                    Button {
                        templatesState = .loading
                        Task { await loadTemplates() }
                    } label: {
                        Label("Retry class bank", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.orange)
                }
                .listRowBackground(Color.xertInk)
            case .ready:
                if templates.isEmpty {
                    Text("No saved classes yet. Build the bank in the web Command Centre and presets will appear here.")
                        .font(.caption)
                        .foregroundStyle(Color.xertPale.opacity(0.6))
                        .listRowBackground(Color.xertInk)
                }
                ForEach(templates) { template in
                    bankRow(template)
                        .listRowBackground(Color.xertInk)
                }
            }
        }
    }

    // MARK: - Month grid

    private var monthHeader: some View {
        HStack {
            Button {
                shiftMonth(by: -1)
            } label: {
                Image(systemName: "chevron.left")
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.xertSteel)
            .accessibilityLabel("Previous month")
            Spacer()
            Text(monthAnchor.formatted(.dateTime.month(.wide).year()))
                .font(.headline)
                .foregroundStyle(Color.xertOffWhite)
            Spacer()
            Button {
                monthAnchor = Date()
                selectedDay = Date()
                XertHaptics.play(.softImpact)
            } label: {
                Text("Today")
                    .font(.caption.weight(.bold))
                    .frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.xertSteel)
            Button {
                shiftMonth(by: 1)
            } label: {
                Image(systemName: "chevron.right")
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.xertSteel)
            .accessibilityLabel("Next month")
        }
    }

    private var weekdayHeader: some View {
        HStack(spacing: 4) {
            ForEach(orderedWeekdaySymbols, id: \.self) { symbol in
                Text(symbol)
                    .font(.caption2.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .foregroundStyle(Color.xertPale.opacity(0.5))
            }
        }
    }

    private var monthGrid: some View {
        let cells = monthCells()
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
            ForEach(Array(cells.enumerated()), id: \.offset) { entry in
                if let day = entry.element {
                    dayCell(day)
                } else {
                    Color.clear.frame(height: 52)
                }
            }
        }
    }

    private func dayCell(_ day: Date) -> some View {
        let isSelected = calendar.isDate(day, inSameDayAs: selectedDay)
        let isToday = calendar.isDateInToday(day)
        let daySessions = sessionsByDay[calendar.startOfDay(for: day)] ?? []
        return Button {
            selectedDay = day
            XertHaptics.play(.softImpact)
        } label: {
            VStack(spacing: 4) {
                Text(day.formatted(.dateTime.day()))
                    .font(.subheadline.weight(isToday ? .bold : .regular))
                    .foregroundStyle(isToday ? Color.xertSteel : Color.xertOffWhite)
                HStack(spacing: 3) {
                    ForEach(Array(dotColors(for: daySessions).prefix(3).enumerated()), id: \.offset) { dot in
                        Circle().fill(dot.element).frame(width: 5, height: 5)
                    }
                }
                .frame(height: 6)
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? Color.xertSteel.opacity(0.18) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? Color.xertSteel : Color.clear, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(dayAccessibilityLabel(day, count: daySessions.count))
    }

    private func dotColors(for sessions: [AdminClassSession]) -> [Color] {
        sessions.map { item in
            switch item.status {
            case "published": return .green
            case "full": return Color.xertSteel
            case "draft": return .orange
            case "cancelled": return .red
            default: return Color.xertPale.opacity(0.4)
            }
        }
    }

    private func dayAccessibilityLabel(_ day: Date, count: Int) -> String {
        let name = day.formatted(.dateTime.weekday(.wide).day().month(.wide))
        return count == 0 ? name : "\(name), \(count) class\(count == 1 ? "" : "es")"
    }

    private var orderedWeekdaySymbols: [String] {
        let symbols = calendar.veryShortStandaloneWeekdaySymbols
        let first = calendar.firstWeekday - 1
        guard symbols.count == 7, (0..<7).contains(first) else { return symbols }
        return Array(symbols[first...]) + Array(symbols[..<first])
    }

    private func monthCells() -> [Date?] {
        guard let interval = calendar.dateInterval(of: .month, for: monthAnchor),
              let dayCount = calendar.range(of: .day, in: .month, for: monthAnchor)?.count else {
            return []
        }
        let firstWeekday = calendar.component(.weekday, from: interval.start)
        let leading = (firstWeekday - calendar.firstWeekday + 7) % 7
        var cells: [Date?] = Array(repeating: nil, count: leading)
        for offset in 0..<dayCount {
            cells.append(calendar.date(byAdding: .day, value: offset, to: interval.start))
        }
        return cells
    }

    private func shiftMonth(by value: Int) {
        guard let next = calendar.date(byAdding: .month, value: value, to: monthAnchor) else { return }
        monthAnchor = next
        XertHaptics.play(.softImpact)
    }

    private var selectedDayTitle: String {
        selectedDay.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }

    private func newClassStart(for day: Date) -> Date {
        calendar.startOfDay(for: day).addingTimeInterval(9 * 3_600)
    }

    // MARK: - Day sessions

    private func calendarSessionRow(_ item: AdminClassSession) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(item.start_time?.formatted(date: .omitted, time: .shortened) ?? "Time TBC")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.xertSteel)
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.xertOffWhite)
                    .lineLimit(1)
            }
            HStack(spacing: 8) {
                Text(item.status.uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(dotColors(for: [item]).first ?? Color.xertPale)
                if item.public_visible == true {
                    Text("PUBLIC")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.xertPale.opacity(0.55))
                }
                Text("Cap \(item.capacity ?? 0)")
                    .font(.caption2)
                    .foregroundStyle(Color.xertPale.opacity(0.55))
                if let coach = item.coach_name, !coach.isEmpty {
                    Text(coach)
                        .font(.caption2)
                        .foregroundStyle(Color.xertPale.opacity(0.55))
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - Class bank

    private func bankRow(_ template: AdminClassTemplate) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(template.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.xertOffWhite)
            Text(bankSummary(template))
                .font(.caption2)
                .foregroundStyle(Color.xertPale.opacity(0.55))
            HStack(spacing: 12) {
                DatePicker(
                    "Start time",
                    selection: timeBinding(for: template),
                    displayedComponents: .hourAndMinute
                )
                .labelsHidden()
                Toggle("Publish", isOn: publishBinding(for: template))
                    .font(.caption)
                    .toggleStyle(.switch)
                    .tint(Color.xertSteel)
                    .fixedSize()
                Button {
                    Task { await addTemplate(template) }
                } label: {
                    if addingTemplateID == template.id {
                        ProgressView().tint(Color.xertNavy)
                            .frame(minWidth: 52, minHeight: 34)
                    } else {
                        Text("Add")
                            .font(.caption.weight(.bold))
                            .frame(minWidth: 52, minHeight: 34)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.xertSteel)
                .disabled(!quickAddAllowed || addingTemplateID != nil)
                .accessibilityLabel("Add \(template.name) to \(selectedDayTitle)")
            }
        }
        .padding(.vertical, 4)
    }

    private func bankSummary(_ template: AdminClassTemplate) -> String {
        var parts: [String] = []
        if let type = template.class_type, !type.isEmpty { parts.append(type) }
        parts.append("\(template.duration_minutes ?? 60)min")
        parts.append("Cap \(template.capacity ?? 8)")
        if let coach = template.coach_name, !coach.isEmpty { parts.append(coach) }
        return parts.joined(separator: " · ")
    }

    private func timeBinding(for template: AdminClassTemplate) -> Binding<Date> {
        Binding(
            get: { bankTimes[template.id] ?? referenceTime(minute: template.defaultStartMinute) },
            set: { bankTimes[template.id] = $0 }
        )
    }

    private func publishBinding(for template: AdminClassTemplate) -> Binding<Bool> {
        Binding(
            get: { bankPublish[template.id] ?? false },
            set: { bankPublish[template.id] = $0 }
        )
    }

    private func referenceTime(minute: Int) -> Date {
        calendar.startOfDay(for: Date()).addingTimeInterval(TimeInterval(minute * 60))
    }

    private func addTemplate(_ template: AdminClassTemplate) async {
        guard quickAddAllowed, addingTemplateID == nil else { return }
        let time = bankTimes[template.id] ?? referenceTime(minute: template.defaultStartMinute)
        let components = calendar.dateComponents([.hour, .minute], from: time)
        let startMinute = (components.hour ?? 6) * 60 + (components.minute ?? 0)
        let draft = template.draft(
            on: selectedDay,
            startMinute: startMinute,
            publish: bankPublish[template.id] ?? false,
            calendar: calendar
        )
        addingTemplateID = template.id
        let succeeded = await admin.saveClass(session: session, classSession: nil, draft: draft)
        addingTemplateID = nil
        XertHaptics.play(succeeded ? .success : .error)
    }

    private func loadTemplates() async {
        do {
            templates = try await api.adminClassTemplates(session: session)
            templatesState = .ready
        } catch {
            templatesState = .unavailable(
                "The class bank could not be loaded. If it has never been set up, apply the class_template_bank migration, then retry."
            )
        }
    }
}
