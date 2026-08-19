import SwiftUI

/// Month-grid geometry, kept free of any view so it can be reasoned about and
/// unit-tested on its own. The admin and member calendars lay out identically;
/// only what each puts inside a day cell differs.
enum XertCalendarMonth {
    /// Day cells for the month containing `anchor`, with leading blanks so the
    /// first of the month lands under the correct weekday.
    static func cells(for anchor: Date, calendar: Calendar = .current) -> [Date?] {
        guard let interval = calendar.dateInterval(of: .month, for: anchor),
              let dayCount = calendar.range(of: .day, in: .month, for: anchor)?.count else {
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

    /// Weekday initials rotated to the locale's first weekday.
    static func weekdaySymbols(calendar: Calendar = .current) -> [String] {
        let symbols = calendar.veryShortStandaloneWeekdaySymbols
        let first = calendar.firstWeekday - 1
        guard symbols.count == 7, (0..<7).contains(first) else { return symbols }
        return Array(symbols[first...]) + Array(symbols[..<first])
    }

    static func shifted(_ anchor: Date, by months: Int, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .month, value: months, to: anchor) ?? anchor
    }

    static func accessibilityLabel(for day: Date, count: Int) -> String {
        let name = day.formatted(.dateTime.weekday(.wide).day().month(.wide))
        return count == 0 ? name : "\(name), \(count) class\(count == 1 ? "" : "es")"
    }
}

/// A month grid whose day cells show up to three dots. The caller supplies the
/// dot colours for a date, so the same grid serves the owner's status view and
/// the member's class-type view.
struct XertMonthCalendarView: View {
    @Binding var monthAnchor: Date
    @Binding var selectedDay: Date
    let dotColors: (Date) -> [Color]
    let dayCount: (Date) -> Int
    var accentColor: Color = .xertSteel

    private var calendar: Calendar { .current }

    var body: some View {
        VStack(spacing: 12) {
            header
            weekdayRow
            grid
        }
    }

    private var header: some View {
        HStack {
            Button {
                monthAnchor = XertCalendarMonth.shifted(monthAnchor, by: -1)
                XertHaptics.play(.softImpact)
            } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(accentColor)
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
            .foregroundStyle(accentColor)

            Button {
                monthAnchor = XertCalendarMonth.shifted(monthAnchor, by: 1)
                XertHaptics.play(.softImpact)
            } label: {
                Image(systemName: "chevron.right").frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(accentColor)
            .accessibilityLabel("Next month")
        }
    }

    private var weekdayRow: some View {
        HStack(spacing: 4) {
            ForEach(XertCalendarMonth.weekdaySymbols(), id: \.self) { symbol in
                Text(symbol)
                    .font(.caption2.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .foregroundStyle(Color.xertPale.opacity(0.5))
            }
        }
    }

    private var grid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
            ForEach(Array(XertCalendarMonth.cells(for: monthAnchor).enumerated()), id: \.offset) { entry in
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
        let dots = dotColors(day)
        return Button {
            selectedDay = day
            XertHaptics.play(.softImpact)
        } label: {
            VStack(spacing: 4) {
                Text(day.formatted(.dateTime.day()))
                    .font(.subheadline.weight(isToday ? .bold : .regular))
                    .foregroundStyle(isToday ? accentColor : Color.xertOffWhite)
                HStack(spacing: 3) {
                    ForEach(Array(dots.prefix(3).enumerated()), id: \.offset) { dot in
                        Circle().fill(dot.element).frame(width: 5, height: 5)
                    }
                }
                .frame(height: 6)
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? accentColor.opacity(0.18) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? accentColor : Color.clear, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(XertCalendarMonth.accessibilityLabel(for: day, count: dayCount(day)))
    }
}
