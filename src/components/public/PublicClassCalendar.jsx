import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ClassSessionCard, { CLASS_DOT_COLORS } from '@/components/public/ClassSessionCard';
import {
  WEEKDAY_LABELS,
  dateFromKey,
  groupSessionsByDay,
  localDateKey,
  monthGrid,
  monthOf,
  shiftMonth,
  upcomingDayKeys,
} from '@/lib/classCalendar';

const chipTime = value => new Date(value).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });

export default function PublicClassCalendar({ sessions, bookingsEnabled, onBook }) {
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState(() => localDateKey(new Date()));
  const detailRef = useRef(null);
  const hasAutoFocused = useRef(false);
  const skipInitialScroll = useRef(true);

  const { byDay } = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  const grid = useMemo(() => monthGrid(month.year, month.monthIndex), [month]);
  const nextDays = useMemo(() => upcomingDayKeys(byDay, { limit: 3 }), [byDay]);

  // When the published timetable first loads, land on the next day with a class.
  useEffect(() => {
    if (hasAutoFocused.current || nextDays.length === 0) return;
    hasAutoFocused.current = true;
    const firstKey = nextDays[0];
    const firstDay = dateFromKey(firstKey);
    if (!firstDay) return;
    setSelectedDayKey(firstKey);
    setMonth(monthOf(firstDay));
  }, [nextDays]);

  useEffect(() => {
    if (skipInitialScroll.current) {
      skipInitialScroll.current = false;
      return;
    }
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedDayKey]);

  const selectDay = key => {
    setSelectedDayKey(key);
    const day = dateFromKey(key);
    if (day && (day.getFullYear() !== month.year || day.getMonth() !== month.monthIndex)) {
      setMonth(monthOf(day));
    }
  };

  const monthCount = grid.weeks.flat().reduce(
    (count, cell) => count + (cell.inMonth ? (byDay[cell.key]?.length || 0) : 0),
    0
  );
  const selectedDate = dateFromKey(selectedDayKey);
  const selectedSessions = byDay[selectedDayKey] || [];
  const selectedLabel = selectedDate
    ? selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  return (
    <div>
      {/* Month navigation */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMonth(current => shiftMonth(current, -1))} aria-label="Previous month"
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-xert-steel/30 text-xert-concrete/60 hover:border-xert-steel hover:text-xert-offwhite transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setMonth(current => shiftMonth(current, 1))} aria-label="Next month"
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-xert-steel/30 text-xert-concrete/60 hover:border-xert-steel hover:text-xert-offwhite transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
          <h3 className="ml-2 font-display text-2xl text-xert-offwhite uppercase">{grid.label}</h3>
        </div>
        <p className="font-body text-xs text-xert-concrete/45" aria-live="polite">
          {monthCount === 0 ? 'No classes this month yet' : `${monthCount} ${monthCount === 1 ? 'class' : 'classes'} this month`}
        </p>
      </div>

      {/* Jump to the next days with classes */}
      {nextDays.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="font-body text-xs uppercase tracking-wider text-xert-concrete/40">Next up:</span>
          {nextDays.map(key => {
            const day = dateFromKey(key);
            return (
              <button key={key} type="button" onClick={() => selectDay(key)} aria-pressed={selectedDayKey === key}
                className={`min-h-11 border px-3 font-body text-xs uppercase tracking-wider transition-colors
                  ${selectedDayKey === key ? 'border-xert-steel bg-xert-steel/15 text-xert-offwhite' : 'border-xert-steel/25 text-xert-concrete/55 hover:border-xert-steel'}`}>
                {day?.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                <span className="ml-1.5 text-xert-steel">{byDay[key].length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Month grid */}
      <div className="border border-xert-steel/20 bg-xert-ink">
        <div className="grid grid-cols-7 border-b border-xert-steel/20">
          {WEEKDAY_LABELS.map(label => (
            <div key={label} className="px-1 py-2 text-center font-body text-[10px] uppercase tracking-[0.18em] text-xert-concrete/40 sm:px-2">
              {label}
            </div>
          ))}
        </div>
        <div role="grid" aria-label={`Class timetable for ${grid.label}`}>
          {grid.weeks.map((week, weekIndex) => (
            <div role="row" key={week[0].key} className={`grid grid-cols-7 ${weekIndex === 0 ? '' : 'border-t border-xert-steel/10'}`}>
              {week.map(cell => {
                const cellSessions = byDay[cell.key] || [];
                const isSelected = cell.key === selectedDayKey;
                const ariaLabel = [
                  cell.date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }),
                  cellSessions.length ? `${cellSessions.length} ${cellSessions.length === 1 ? 'class' : 'classes'}` : 'no classes',
                ].join(', ');
                return (
                  <div role="gridcell" key={cell.key} className="border-r border-xert-steel/10 last:border-r-0">
                    <button
                      type="button"
                      onClick={() => selectDay(cell.key)}
                      aria-label={ariaLabel}
                      aria-pressed={isSelected}
                      className={`flex min-h-[56px] w-full flex-col items-stretch gap-1 p-1 text-left transition-colors sm:min-h-[88px] sm:p-1.5
                        ${isSelected ? 'bg-xert-steel/15 outline outline-1 outline-xert-steel' : 'hover:bg-xert-steel/5'}
                        ${cell.inMonth ? '' : 'opacity-35'}`}
                    >
                      <span className={`inline-flex h-6 w-6 items-center justify-center font-display text-sm tabular-nums
                        ${cell.isToday ? 'bg-xert-steel text-xert-navy' : cellSessions.length ? 'text-xert-offwhite' : 'text-xert-concrete/45'}`}>
                        {cell.dayOfMonth}
                      </span>
                      {/* Dots on small screens */}
                      <span className="flex flex-wrap gap-1 sm:hidden" aria-hidden="true">
                        {cellSessions.slice(0, 4).map(session => (
                          <span key={session.id} className={`h-1.5 w-1.5 rounded-full ${CLASS_DOT_COLORS[session.class_type] || 'bg-xert-steel'}`} />
                        ))}
                        {cellSessions.length > 4 && <span className="font-body text-[9px] leading-none text-xert-concrete/50">+{cellSessions.length - 4}</span>}
                      </span>
                      {/* Chips on larger screens */}
                      <span className="hidden flex-col gap-1 sm:flex" aria-hidden="true">
                        {cellSessions.slice(0, 3).map(session => (
                          <span key={session.id} className="flex items-center gap-1.5 truncate px-0.5 font-body text-[10px] leading-tight text-xert-concrete/75">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CLASS_DOT_COLORS[session.class_type] || 'bg-xert-steel'}`} />
                            <span className="truncate">{session.start_time ? `${chipTime(session.start_time)} ` : ''}{session.title}</span>
                          </span>
                        ))}
                        {cellSessions.length > 3 && (
                          <span className="px-0.5 font-body text-[10px] text-xert-concrete/50">+{cellSessions.length - 3} more</span>
                        )}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Selected day details */}
      <div ref={detailRef} className="mt-6 scroll-mt-24" aria-live="polite">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-0.5 w-6 bg-xert-steel" aria-hidden="true" />
          <h3 className="font-display text-xl text-xert-offwhite uppercase">{selectedLabel}</h3>
        </div>
        {selectedSessions.length === 0 ? (
          <div className="border border-xert-steel/20 py-10 text-center">
            <p className="font-body text-sm text-xert-concrete/50">
              No classes on this day{nextDays.length > 0 ? ' — tap a highlighted date to see what’s on.' : '.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedSessions.map(session => (
              <ClassSessionCard key={session.id} session={session} bookingsEnabled={bookingsEnabled} onBook={onBook} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
