import EventKit
import Foundation

enum EventCalendarWriteResult: Equatable {
    case added
    case alreadyExists
}

enum BookingCalendarPlanner {
    static let fallbackDuration: TimeInterval = 60 * 60

    static func endDate(for booking: BookingItem) -> Date {
        guard let endTime = booking.end_time, endTime > booking.start_time else {
            return booking.start_time.addingTimeInterval(fallbackDuration)
        }
        return endTime
    }
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

    static func add(_ booking: BookingItem) async throws -> EventCalendarWriteResult {
        let store = EKEventStore()
        guard await requestAccess(using: store) else {
            throw EventCalendarWriterError.accessDenied
        }
        guard let calendar = store.defaultCalendarForNewEvents else {
            throw EventCalendarWriterError.calendarUnavailable
        }

        let start = booking.start_time
        let end = BookingCalendarPlanner.endDate(for: booking)

        let event = EKEvent(eventStore: store)
        event.calendar = calendar
        event.title = booking.title
        event.startDate = start
        event.endDate = end
        event.isAllDay = false
        event.location = booking.location_zone
        event.notes = [
            booking.coach_name.map { "Coach: \($0)" },
            "Booked with XERT Fitness.",
        ].compactMap { $0 }.joined(separator: "\n")
        try store.save(event, span: .thisEvent, commit: true)
        return .added
    }

    private static func requestAccess(using store: EKEventStore) async -> Bool {
        if #available(iOS 17.0, *) {
            // Write-only is enough to create events; full read access is not required.
            return (try? await store.requestWriteOnlyAccessToEvents()) ?? false
        }

        return await withCheckedContinuation { continuation in
            store.requestAccess(to: .event) { granted, _ in
                continuation.resume(returning: granted)
            }
        }
    }
}
