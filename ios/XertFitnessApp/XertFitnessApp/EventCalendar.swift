import Foundation

enum XertEventCalendar {
    static let fallback: [EventItem] = [
        event("Gold Coast Marathon", "run", "2026-07-04", "2026-07-05", "Gold Coast", 1),
        event("ACTÍVATE Brisbane", "fitness", "2026-07-12", nil, "Brisbane", 2),
        event("The Guzzler Ultra", "ultra", "2026-07-18", "2026-07-19", "South East Queensland", 3),
        event("Max Adventure Sunshine Coast", "adventure", "2026-07-25", nil, "Sunshine Coast", 4),
        event("Sunshine Coast Marathon Festival", "run", "2026-08-02", nil, "Sunshine Coast", 5),
        event("Brisbane to Gold Coast Cycle Challenge", "cycling", "2026-08-23", nil, "Brisbane to Gold Coast", 6),
        event("Coastal High Trail Run", "trail", "2026-08-29", nil, "Gold Coast", 7),
        event("Turf Games Gold Coast", "functional", "2026-09-12", "2026-09-13", "Gold Coast", 8),
        event("IRONMAN 70.3 Sunshine Coast", "triathlon", "2026-09-13", nil, "Sunshine Coast", 9),
        event("Bridge to Brisbane", "run", "2026-09-13", nil, "Brisbane", 10),
        event("Butterfly Effect", "community", "2026-09-26", "2026-09-27", "South East Queensland", 11),
        event("XERT Endurance Challenge", "xert", "2026-09-26", nil, "Kingaroy", 12),
        event("Cricket Season Begins", "sport", "2026-10-01", nil, "South East Queensland", 13),
        event("AP&ES Games", "games", "2026-10-11", "2026-10-12", "South East Queensland", 14),
        event("Blackall 100", "ultra", "2026-10-17", nil, "Blackall Range", 15),
        event("Noosa Triathlon", "triathlon", "2026-11-01", nil, "Noosa", 16),
        event("Robina Triathlon", "triathlon", "2026-11-15", nil, "Robina", 17),
        event("Summer Touch Football Season", "sport", "2026-12-01", nil, "South East Queensland", 18),
        event("Cricket Season", "sport", "2026-12-01", nil, "South East Queensland", 19),
        event("XERT Team Competition", "xert", "2026-12-05", nil, "Kingaroy", 20),
    ]

    private static func event(
        _ name: String,
        _ category: String,
        _ start: String,
        _ end: String?,
        _ location: String,
        _ order: Int
    ) -> EventItem {
        EventItem(
            id: nil,
            name: name,
            category: category,
            event_date: start,
            end_date: end,
            location: location,
            region: "South East Queensland",
            url: nil,
            published: true,
            sort_order: order
        )
    }
}
