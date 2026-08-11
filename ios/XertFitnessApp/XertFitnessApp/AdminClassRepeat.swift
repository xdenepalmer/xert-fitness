import Foundation

enum AdminClassRepeatMode: String, CaseIterable, Identifiable, Hashable {
    case draft
    case published

    var id: String { rawValue }

    var title: String {
        switch self {
        case .draft: return "Draft"
        case .published: return "Published"
        }
    }

    var detail: String {
        switch self {
        case .draft:
            return "Review each copy before it appears to members."
        case .published:
            return "Copies open immediately using this class's public visibility."
        }
    }
}

enum AdminClassRepeatPlanError: LocalizedError, Equatable {
    case invalid(String)

    var errorDescription: String? {
        switch self {
        case .invalid(let message): return message
        }
    }
}

struct AdminClassRepeatPlan: Hashable {
    static let intervalOptions = [1, 2, 7, 8, 14]
    static let minimumCopies = 1
    static let maximumCopies = 26

    var intervalDays: Int
    var copyCount: Int
    var mode: AdminClassRepeatMode

    init(
        classSession: AdminClassSession,
        intervalDays: Int = 8,
        copyCount: Int = 4,
        mode: AdminClassRepeatMode? = nil
    ) {
        self.intervalDays = intervalDays
        self.copyCount = copyCount
        self.mode = mode ?? (classSession.status == AdminClassRepeatMode.published.rawValue ? .published : .draft)
    }

    func validationMessage(for classSession: AdminClassSession, now: Date = Date()) -> String? {
        guard classSession.start_time != nil else {
            return "This class needs a valid start time before it can be repeated."
        }
        guard Self.intervalOptions.contains(intervalDays) else {
            return "Choose a supported repeat interval."
        }
        guard (Self.minimumCopies...Self.maximumCopies).contains(copyCount) else {
            return "Create between \(Self.minimumCopies) and \(Self.maximumCopies) class copies."
        }
        if let start = classSession.start_time,
           let end = classSession.end_time,
           end <= start {
            return "This class has an invalid end time. Fix it before repeating the class."
        }
        if mode == .published,
           let firstDate = repeatedDate(
               for: classSession,
               copyIndex: 0,
               calendar: Self.brisbaneCalendar
           ),
           firstDate <= now {
            return "Published copies must start in the future. Choose Draft or repeat a future class."
        }
        return nil
    }

    func makeDrafts(
        from classSession: AdminClassSession,
        calendar: Calendar = AdminClassRepeatPlan.brisbaneCalendar,
        now: Date = Date()
    ) throws -> [AdminClassDraft] {
        if let validationMessage = validationMessage(for: classSession, now: now) {
            throw AdminClassRepeatPlanError.invalid(validationMessage)
        }
        guard let originalStart = classSession.start_time else {
            throw AdminClassRepeatPlanError.invalid(
                "This class needs a valid start time before it can be repeated."
            )
        }

        let explicitDuration = classSession.end_time.map { $0.timeIntervalSince(originalStart) }
        return try (0..<copyCount).map { index in
            guard let copiedStart = repeatedDate(
                for: classSession,
                copyIndex: index,
                calendar: calendar
            ) else {
                throw AdminClassRepeatPlanError.invalid(
                    "XERT could not calculate every repeat date. Choose a smaller repeat block."
                )
            }

            var draft = AdminClassDraft(classSession: classSession, now: copiedStart)
            draft.startTime = copiedStart
            draft.hasEndTime = explicitDuration != nil
            if let explicitDuration {
                draft.endTime = copiedStart.addingTimeInterval(explicitDuration)
            }
            draft.status = mode.rawValue
            draft.publicVisible = mode == .published && classSession.public_visible == true
            return draft
        }
    }

    func previewDates(
        for classSession: AdminClassSession,
        limit: Int = 3,
        calendar: Calendar = AdminClassRepeatPlan.brisbaneCalendar
    ) -> [Date] {
        guard limit > 0 else { return [] }
        return (0..<min(copyCount, limit)).compactMap {
            repeatedDate(for: classSession, copyIndex: $0, calendar: calendar)
        }
    }

    func finalDate(
        for classSession: AdminClassSession,
        calendar: Calendar = AdminClassRepeatPlan.brisbaneCalendar
    ) -> Date? {
        guard copyCount > 0 else { return nil }
        return repeatedDate(for: classSession, copyIndex: copyCount - 1, calendar: calendar)
    }

    private func repeatedDate(
        for classSession: AdminClassSession,
        copyIndex: Int,
        calendar: Calendar
    ) -> Date? {
        guard let start = classSession.start_time, copyIndex >= 0 else { return nil }
        return calendar.date(
            byAdding: .day,
            value: (copyIndex + 1) * intervalDays,
            to: start
        )
    }

    static var brisbaneCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_AU")
        calendar.timeZone = TimeZone(identifier: "Australia/Brisbane") ?? .current
        return calendar
    }
}
