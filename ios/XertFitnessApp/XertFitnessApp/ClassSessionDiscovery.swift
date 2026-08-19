import Foundation

enum ClassSessionDateWindow: String, CaseIterable, Identifiable {
    case all
    case today
    case sevenDays

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "Any time"
        case .today: return "Today"
        case .sevenDays: return "7 days"
        }
    }
}

enum ClassSessionFit: String, CaseIterable, Identifiable {
    case all
    case spotsAvailable
    case beginnerFriendly

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .spotsAvailable: return "Spots"
        case .beginnerFriendly: return "Beginner"
        }
    }
}

enum ClassSessionDiscovery {
    /// `day` narrows the list to a single date chosen on the month calendar.
    /// It composes with the other filters rather than replacing them, so a
    /// search term or fit still applies to the day the member pressed.
    static func sessions(
        from sessions: [ClassSession],
        search: String = "",
        dateWindow: ClassSessionDateWindow = .all,
        fit: ClassSessionFit = .all,
        day: Date? = nil,
        now: Date = Date(),
        calendar: Calendar = EventItem.calendar
    ) -> [ClassSession] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let startOfToday = calendar.startOfDay(for: now)
        let endOfWindow = calendar.date(byAdding: .day, value: 7, to: startOfToday)

        return sessions.filter { session in
            let matchesSearch = query.isEmpty || [
                session.title,
                session.class_type,
                session.coach_name,
                session.location_zone,
                session.description,
                session.intensity_level,
            ]
                .compactMap { $0 }
                .contains { $0.localizedCaseInsensitiveContains(query) }

            let matchesDate: Bool
            switch dateWindow {
            case .all:
                matchesDate = true
            case .today:
                matchesDate = calendar.isDate(session.start_time, inSameDayAs: now)
            case .sevenDays:
                matchesDate = session.start_time >= startOfToday
                    && endOfWindow.map { session.start_time < $0 } == true
            }

            let matchesFit: Bool
            switch fit {
            case .all:
                matchesFit = true
            case .spotsAvailable:
                matchesFit = !session.isFull
            case .beginnerFriendly:
                matchesFit = session.beginner_friendly == true
            }

            let matchesDay = day.map { calendar.isDate(session.start_time, inSameDayAs: $0) } ?? true

            return matchesSearch && matchesDate && matchesFit && matchesDay
        }
        .sorted {
            if $0.start_time != $1.start_time { return $0.start_time < $1.start_time }
            return $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
        }
    }
}
