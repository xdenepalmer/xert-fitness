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

const monthNavClasses = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-xert-steel/25 bg-white/[0.03] text-xert-pale/70 hover:border-xert-steel hover:text-xert-offwhite transition-colors';

function dayNumberClasses({ isSelected, isToday, hasSessions }) {
  if (isSelected && isToday) return 'bg-xert-steel text-xert-navy ring-2 ring-xert-steel/35 ring-offset-2 ring-offset-[#14202b]';
  if (isSelected) return 'bg-xert-steel text-xert-navy';
  if (isToday) return 'ring-1 ring-xert-steel text-xert-offwhite';
  if (hasSessions) return 'text-xert-offwhite';
  return 'text-xert-pale/45';
}

export default function PublicClassCalendar({ sessions, bookingsEnabled, onBook, fitbox = null, availability = {} }) {
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
            className={monthNavClasses}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setMonth(current => shiftMonth(current, 1))} aria-label="Next month"
            className={monthNavClasses}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <h3 className="ml-2 font-display text-2xl text-xert-offwhite uppercase">{grid.label}</h3>
        </div>
        <p className="font-body text-xs text-xert-pale/50" aria-live="polite">
          {monthCount === 0 ? 'No classes this month yet' : `${monthCount} ${monthCount === 1 ? 'class' : 'classes'} this month`}
        </p>
      </div>

      {/* Jump to the next days with classes */}
      {nextDays.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="font-body text-[11px] uppercase tracking-[0.16em] text-xert-pale/45">Next up:</span>
          {nextDays.map(key => {
            const day = dateFromKey(key);
            const isSelected = selectedDayKey === key;
            return (
              <button key={key} type="button" onClick={() => selectDay(key)} aria-pressed={isSelected}
                className={`inline-flex min-h-11 items-center rounded-full border px-3.5 font-body text-xs uppercase tracking-wider transition-colors
                  ${isSelected ? 'border-xert-steel bg-xert-steel text-xert-navy' : 'border-xert-steel/30 bg-white/[0.03] text-xert-pale/70 hover:border-xert-steel'}`}>
                {day?.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                <span className={`ml-1.5 ${isSelected ? 'text-xert-navy/70' : 'text-xert-steel'}`}>{byDay[key].length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Month grid */}
      <div className="xert-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-xert-steel/10 bg-white/[0.02]">
          {WEEKDAY_LABELS.map(label => (
            <div key={label} className="px-1 py-2.5 text-center font-body text-[10px] uppercase tracking-[0.18em] text-xert-pale/45 sm:px-2">
              {label}
            </div>
          ))}
        </div>
        <div role="grid" aria-label={`Class timetable for ${grid.label}`} className="p-1 sm:p-1.5">
          {grid.weeks.map((week, weekIndex) => (
            <div role="row" key={week[0].key} className={`grid grid-cols-7 gap-0.5 sm:gap-1 ${weekIndex === 0 ? '' : 'mt-0.5 sm:mt-1'}`}>
              {week.map(cell => {
                const cellSessions = byDay[cell.key] || [];
                const isSelected = cell.key === selectedDayKey;
                const ariaLabel = [
                  cell.date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }),
                  cellSessions.length ? `${cellSessions.length} ${cellSessions.length === 1 ? 'class' : 'classes'}` : 'no classes',
                ].join(', ');
                return (
                  <div role="gridcell" key={cell.key}>
                    <button
                      type="button"
                      onClick={() => selectDay(cell.key)}
                      aria-label={ariaLabel}
                      aria-pressed={isSelected}
                      className={`flex min-h-[56px] w-full flex-col items-stretch gap-1 rounded-xl p-1 text-left transition-colors sm:min-h-[88px] sm:p-1.5
                        ${isSelected ? 'bg-xert-steel/10' : 'hover:bg-white/[0.04]'}
                        ${cell.inMonth ? '' : 'opacity-35'}`}
                    >
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full font-display text-sm tabular-nums transition-colors
                        ${dayNumberClasses({ isSelected, isToday: cell.isToday, hasSessions: cellSessions.length > 0 })}`}>
                        {cell.dayOfMonth}
                      </span>
                      {/* Dots on small screens */}
                      <span className="flex flex-wrap gap-1 px-1 sm:hidden" aria-hidden="true">
                        {cellSessions.slice(0, 4).map(session => (
                          <span key={session.id} className={`h-1.5 w-1.5 rounded-full ${CLASS_DOT_COLORS[session.class_type] || 'bg-xert-steel'}`} />
                        ))}
                        {cellSessions.length > 4 && <span className="font-body text-[9px] leading-none text-xert-pale/50">+{cellSessions.length - 4}</span>}
                      </span>
                      {/* Chips on larger screens */}
                      <span className="hidden flex-col gap-1 sm:flex" aria-hidden="true">
                        {cellSessions.slice(0, 3).map(session => (
                          <span key={session.id} className="flex items-center gap-1.5 truncate px-0.5 font-body text-[10px] leading-tight text-xert-pale/75">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CLASS_DOT_COLORS[session.class_type] || 'bg-xert-steel'}`} />
                            <span className="truncate">{session.start_time ? `${chipTime(session.start_time)} ` : ''}{session.title}</span>
                          </span>
                        ))}
                        {cellSessions.length > 3 && (
                          <span className="px-0.5 font-body text-[10px] text-xert-pale/50">+{cellSessions.length - 3} more</span>
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
      <div ref={detailRef} className="mt-8 scroll-mt-24" aria-live="polite">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px w-6 bg-xert-steel" aria-hidden="true" />
          <h3 className="font-display text-xl text-xert-offwhite uppercase">{selectedLabel}</h3>
        </div>
        {selectedSessions.length === 0 ? (
          <div className="xert-card-flat px-6 py-10 text-center">
            <p className="font-body text-sm text-xert-pale/55">
              No classes on this day{nextDays.length > 0 ? ' — tap a highlighted date to see what’s on.' : '.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedSessions.map(session => (
              <ClassSessionCard key={session.id} session={session} bookingsEnabled={bookingsEnabled} onBook={onBook} fitbox={fitbox} availability={availability[session.id]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
