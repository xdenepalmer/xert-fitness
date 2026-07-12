import EventKit
import Foundation

enum EventCalendarWriteResult: Equatable {
    case added
    case alreadyExists
}

enum EventCalendarWriterError: LocalizedError {
    case missingDate
    case accessDenied
    case calendarUnavailable

    var errorDescription: String? {
        switch self {
        case .missingDate:
            return "This event does not have a confirmed date yet."
        case .accessDenied:
            return "Allow XERT to access Calendars in Settings to add this event."
        case .calendarUnavailable:
            return "No writable calendar is available on this device."
        }
    }
}

@MainActor
enum EventCalendarWriter {
    static func add(_ item: EventItem) async throws -> EventCalendarWriteResult {
        guard let startDate = item.startDate else {
            throw EventCalendarWriterError.missingDate
        }

        let store = EKEventStore()
        guard await requestAccess(using: store) else {
            throw EventCalendarWriterError.accessDenied
        }
        guard let calendar = store.defaultCalendarForNewEvents else {
            throw EventCalendarWriterError.calendarUnavailable
        }

        let start = EventItem.calendar.startOfDay(for: startDate)
        let finalDay = EventItem.calendar.startOfDay(for: item.finalDate ?? startDate)
        guard let end = EventItem.calendar.date(byAdding: .day, value: 1, to: finalDay) else {
            throw EventCalendarWriterError.missingDate
        }

        let predicate = store.predicateForEvents(
            withStart: start,
            end: end,
            calendars: [calendar]
        )
        if store.events(matching: predicate).contains(where: {
            $0.title == item.name && $0.isAllDay && $0.startDate == start && $0.endDate == end
        }) {
            return .alreadyExists
        }

        let event = EKEvent(eventStore: store)
        event.calendar = calendar
        event.title = item.name
        event.startDate = start
        event.endDate = end
        event.isAllDay = true
        event.location = item.location ?? item.region
        event.notes = "XERT training target event. Train with purpose. Compete together."
        event.url = item.externalURL
        try store.save(event, span: .thisEvent, commit: true)
        return .added
    }

    private static func requestAccess(using store: EKEventStore) async -> Bool {
        if #available(iOS 17.0, *) {
            return (try? await store.requestFullAccessToEvents()) ?? false
        }

        return await withCheckedContinuation { continuation in
            store.requestAccess(to: .event) { granted, _ in
                continuation.resume(returning: granted)
            }
        }
    }
}
