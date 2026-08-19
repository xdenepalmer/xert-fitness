import ClassSignupRoster from '@/components/admin/ClassSignupRoster';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Archive, CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { blackoutsOverlappingSession } from '@/lib/scheduling';
import {
  WEEKDAY_LABELS,
  dateFromKey,
  formatStartMinute,
  groupSessionsByDay,
  isPastDayKey,
  localDateKey,
  monthGrid,
  monthOf,
  monthSessionStats,
  shiftMonth,
  timeInputFromMinutes,
} from '@/lib/classCalendar';

const STATUS_CHIP = {
  published: 'border-green-600/50 text-green-300 bg-green-900/20',
  full: 'border-xert-orange/60 text-xert-orange bg-xert-steel/10',
  draft: 'border-dashed border-xert-steel/40 text-xert-concrete/50 bg-transparent',
  cancelled: 'border-xert-red/20 text-xert-red/40 line-through',
  completed: 'border-xert-steel/20 text-xert-concrete/35',
};

const STATUS_DOT = {
  published: 'bg-green-400',
  full: 'bg-xert-orange',
  draft: 'bg-xert-steel/40',
  cancelled: 'bg-xert-red/30',
  completed: 'bg-xert-steel/25',
};

const chipTime = value => new Date(value).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });

function dayBlackouts(dayKey, blackouts) {
  const day = dateFromKey(dayKey);
  if (!day || blackouts.length === 0) return [];
  return blackoutsOverlappingSession({
    start_time: day.toISOString(),
    end_time: new Date(day.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }, blackouts);
}

function TemplateQuickAddRow({ template, dayKey, onQuickAdd }) {
  const [startTime, setStartTime] = useState(() => timeInputFromMinutes(template.default_start_minute) || '06:00');
  const [publish, setPublish] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    setAdding(true);
    try {
      await onQuickAdd(template, dayKey, { startTime, publish });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border border-xert-steel/15 bg-xert-ink p-3">
      <div className="min-w-[10rem] flex-1">
        <p className="truncate font-display text-sm uppercase text-xert-offwhite">{template.name}</p>
        <p className="mt-0.5 font-body text-[11px] text-xert-concrete/45">
          {template.class_type} · usually {formatStartMinute(template.default_start_minute)} · {template.duration_minutes}min · Cap {template.capacity}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Start time for {template.name}</span>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} disabled={adding}
            className="bg-xert-charcoal border border-xert-steel/40 px-2 py-1.5 font-body text-xs text-xert-offwhite focus:outline-none focus:border-xert-red" />
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} disabled={adding} className="peer sr-only" />
          <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center border-2 border-xert-steel/50 peer-checked:border-green-500 peer-checked:bg-green-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">{publish && <span className="text-[9px] text-white">&#10003;</span>}</span>
          <span className="font-body text-[11px] uppercase tracking-wider text-xert-concrete/55">Publish</span>
        </label>
        <button type="button" onClick={handleAdd} disabled={adding}
          className="inline-flex min-h-11 items-center gap-1.5 bg-xert-steel px-3 font-display text-xs uppercase text-xert-navy hover:bg-xert-pale transition-colors disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  );
}

export default function ClassCalendarBoard({
  sessions,
  blackouts,
  templates,
  templatesAvailable,
  templatesLoading,
  onQuickAdd,
  onCreateCustom,
  onEditSession,
  onOpenRoster,
  rosterSessionId = null,
  rosterSignups = [],
  rosterMembers = [],
  rosterLoading = false,
  rosterStatuses = [],
  rosterUpdatingId = null,
  onRosterStatusChange,
  onCloseRoster,
  signupCounts = {},
  onDuplicateSession,
  onCancelSession,
  onSaveToBank,
  onManageBank,
  duplicatingSessionId,
  savingToBankId,
}) {
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState(() => localDateKey(new Date()));
  const panelRef = useRef(null);
  const skipInitialScroll = useRef(true);

  const { byDay, undated } = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  const grid = useMemo(() => monthGrid(month.year, month.monthIndex), [month]);
  const stats = useMemo(() => monthSessionStats(byDay, month.year, month.monthIndex), [byDay, month]);

  useEffect(() => {
    if (skipInitialScroll.current) {
      skipInitialScroll.current = false;
      return;
    }
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedDayKey]);

  const selectDay = key => {
    setSelectedDayKey(key);
    const day = dateFromKey(key);
    if (day && (day.getFullYear() !== month.year || day.getMonth() !== month.monthIndex)) {
      setMonth({ year: day.getFullYear(), monthIndex: day.getMonth() });
    }
  };

  const goToday = () => {
    const now = new Date();
    setMonth(monthOf(now));
    setSelectedDayKey(localDateKey(now));
  };

  const selectedDate = dateFromKey(selectedDayKey);
  const selectedSessions = byDay[selectedDayKey] || [];
  const selectedBlackouts = dayBlackouts(selectedDayKey, blackouts);
  const selectedIsPast = isPastDayKey(selectedDayKey);
  const selectedLabel = selectedDate
    ? selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Pick a date';

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
          <h3 className="ml-2 font-display text-2xl uppercase text-xert-offwhite">{grid.label}</h3>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-body text-xs text-xert-concrete/45" aria-live="polite">
            {stats.total} {stats.total === 1 ? 'class' : 'classes'} · {stats.published} live
          </p>
          <button type="button" onClick={goToday}
            className="min-h-11 border border-xert-steel/30 px-3 font-body text-xs uppercase tracking-wider text-xert-concrete/60 hover:border-xert-steel hover:text-xert-offwhite transition-colors">
            Today
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-xert-steel/20">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className="px-1 py-2 text-center font-body text-[10px] uppercase tracking-[0.18em] text-xert-concrete/40 sm:px-2">
            {label}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div role="grid" aria-label={`Class calendar for ${grid.label}`}>
        {grid.weeks.map((week, weekIndex) => (
          <div role="row" key={week[0].key} className={`grid grid-cols-7 ${weekIndex === 0 ? '' : 'border-t border-xert-steel/10'}`}>
            {week.map(cell => {
              const cellSessions = byDay[cell.key] || [];
              const cellBlackouts = dayBlackouts(cell.key, blackouts);
              const isSelected = cell.key === selectedDayKey;
              const ariaLabel = [
                cell.date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }),
                cellSessions.length ? `${cellSessions.length} ${cellSessions.length === 1 ? 'class' : 'classes'}` : 'no classes',
                cellBlackouts.length ? 'blackout' : '',
              ].filter(Boolean).join(', ');
              return (
                <div role="gridcell" key={cell.key} className="border-r border-xert-steel/10 last:border-r-0">
                  <button
                    type="button"
                    onClick={() => selectDay(cell.key)}
                    aria-label={ariaLabel}
                    aria-pressed={isSelected}
                    className={`flex min-h-[64px] w-full flex-col items-stretch gap-1 p-1 text-left transition-colors sm:min-h-[96px] sm:p-1.5
                      ${isSelected ? 'bg-xert-steel/15 outline outline-1 outline-xert-steel' : 'hover:bg-xert-steel/5'}
                      ${cell.inMonth ? '' : 'opacity-35'}`}
                  >
                    <span className="flex items-center justify-between">
                      <span className={`inline-flex h-6 w-6 items-center justify-center font-display text-sm tabular-nums
                        ${cell.isToday ? 'bg-xert-steel text-xert-navy' : 'text-xert-concrete/70'}`}>
                        {cell.dayOfMonth}
                      </span>
                      {cellBlackouts.length > 0 && <AlertTriangle aria-hidden="true" className="h-3 w-3 text-xert-orange/80" />}
                    </span>
                    {/* Compact dots on small screens */}
                    <span className="flex flex-wrap gap-1 sm:hidden" aria-hidden="true">
                      {cellSessions.slice(0, 4).map(session => (
                        <span key={session.id} className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[session.status] || STATUS_DOT.draft}`} />
                      ))}
                      {cellSessions.length > 4 && <span className="font-body text-[9px] leading-none text-xert-concrete/50">+{cellSessions.length - 4}</span>}
                    </span>
                    {/* Chips on larger screens */}
                    <span className="hidden flex-col gap-1 sm:flex" aria-hidden="true">
                      {cellSessions.slice(0, 3).map(session => (
                        <span key={session.id}
                          className={`truncate border px-1.5 py-0.5 font-body text-[10px] leading-tight ${STATUS_CHIP[session.status] || STATUS_CHIP.draft}`}>
                          {session.start_time ? `${chipTime(session.start_time)} ` : ''}{session.title}
                        </span>
                      ))}
                      {cellSessions.length > 3 && (
                        <span className="px-1.5 font-body text-[10px] text-xert-concrete/50">+{cellSessions.length - 3} more</span>
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {undated.length > 0 && (
        <p className="mt-3 font-body text-xs text-xert-concrete/45">
          {undated.length} {undated.length === 1 ? 'class has' : 'classes have'} no date yet — switch to the list view to schedule {undated.length === 1 ? 'it' : 'them'}.
        </p>
      )}

      {/* Selected day panel */}
      <section ref={panelRef} aria-labelledby="calendar-day-title" className="mt-6 scroll-mt-20 border border-xert-steel/20 bg-xert-ink">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-xert-steel/20 p-4 sm:p-5">
          <div>
            <h3 id="calendar-day-title" className="font-display text-xl uppercase text-xert-offwhite">{selectedLabel}</h3>
            <p className="mt-0.5 font-body text-xs text-xert-concrete/45">
              {selectedSessions.length === 0 ? 'Nothing scheduled' : `${selectedSessions.length} ${selectedSessions.length === 1 ? 'class' : 'classes'}`}
              {selectedIsPast ? ' · past day' : ''}
            </p>
          </div>
          <button type="button" onClick={() => onCreateCustom(selectedDayKey)}
            className="inline-flex min-h-11 items-center gap-2 bg-xert-steel px-4 font-display text-xs uppercase text-xert-navy hover:bg-xert-pale transition-colors">
            <CalendarPlus className="h-4 w-4" /> New class this day
          </button>
        </div>

        {selectedBlackouts.length > 0 && (
          <div role="alert" className="mx-4 mt-4 flex gap-2 border border-xert-orange/40 bg-xert-orange/10 p-3 sm:mx-5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-xert-orange" />
            <p className="font-body text-xs leading-relaxed text-xert-concrete/80">
              Blackout on this day: {selectedBlackouts.map(blackout => blackout.reason).join(', ')}.
            </p>
          </div>
        )}

        <div className="p-4 sm:p-5">
          {selectedSessions.length === 0 ? (
            <p className="mb-5 font-body text-sm text-xert-concrete/40">No classes on this day yet. Add one from the bank below or create a custom class.</p>
          ) : (
            <ul className="mb-6 space-y-2">
              {selectedSessions.map(session => (
                <li key={session.id} className="flex flex-wrap items-start justify-between gap-3 border border-xert-steel/15 bg-xert-charcoal p-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`border px-2 py-0.5 font-body text-[10px] uppercase ${STATUS_CHIP[session.status] || STATUS_CHIP.draft}`}>{session.status}</span>
                      {session.public_visible && <span className="border border-green-600/40 px-2 py-0.5 font-body text-[10px] uppercase text-green-400">Public</span>}
                    </div>
                    <p className="font-display text-base uppercase text-xert-offwhite">{session.title}</p>
                    <p className="mt-0.5 font-body text-xs text-xert-concrete/50">
                      {session.start_time ? chipTime(session.start_time) : 'No time'}
                      {session.end_time ? `–${chipTime(session.end_time)}` : ''} · {session.class_type}
                      {session.coach_name ? ` · ${session.coach_name}` : ''} · Cap {session.capacity}
                    </p>
                    {signupCounts[session.id]?.taken > 0 && (
                      <p className="mt-1 font-body text-xs text-xert-steel">
                        {signupCounts[session.id].taken}
                        {session.capacity ? ` / ${session.capacity}` : ''} signed up
                        {signupCounts[session.id].pending > 0 ? ` · ${signupCounts[session.id].pending} awaiting decision` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => onOpenRoster(session)}
                      aria-expanded={rosterSessionId === session.id}
                      className={`min-h-11 border px-3 font-body text-xs transition-colors ${rosterSessionId === session.id ? 'border-xert-steel bg-xert-steel/15 text-xert-offwhite' : 'border-xert-steel/30 text-xert-concrete/60 hover:border-xert-steel'}`}>
                      Sign-ups
                    </button>
                    <button type="button" onClick={() => onEditSession(session)}
                      className="min-h-11 border border-xert-steel/30 px-3 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                      Edit
                    </button>
                    <button type="button" onClick={() => onDuplicateSession(session)} disabled={Boolean(duplicatingSessionId)}
                      className="min-h-11 border border-xert-steel/30 px-3 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors disabled:opacity-50">
                      {duplicatingSessionId === session.id ? 'Duping…' : 'Dupe'}
                    </button>
                    {templatesAvailable && (
                      <button type="button" onClick={() => onSaveToBank(session)} disabled={Boolean(savingToBankId)}
                        title="Save this class as a reusable bank entry"
                        className="inline-flex min-h-11 items-center gap-1.5 border border-xert-steel/30 px-3 font-body text-xs text-xert-steel hover:border-xert-steel transition-colors disabled:opacity-50">
                        <Archive className="h-3.5 w-3.5" />
                        {savingToBankId === session.id ? 'Saving…' : 'Bank it'}
                      </button>
                    )}
                    {session.status !== 'cancelled' && (
                      <button type="button" onClick={() => onCancelSession(session)}
                        className="min-h-11 border border-xert-red/30 px-3 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors">
                        Cancel
                      </button>
                    )}
                  </div>
                  {rosterSessionId === session.id && (
                    <div className="w-full">
                      <ClassSignupRoster
                        session={session}
                        signups={rosterSignups}
                        members={rosterMembers}
                        loading={rosterLoading}
                        statuses={rosterStatuses}
                        updatingId={rosterUpdatingId}
                        onStatusChange={onRosterStatusChange}
                        onClose={onCloseRoster}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Quick add from the bank */}
          <div className="border-t border-xert-steel/15 pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h4 className="font-display text-sm uppercase text-xert-concrete/60">Add from the class bank</h4>
              <button type="button" onClick={onManageBank}
                className="min-h-11 border border-xert-steel/30 px-3 font-body text-xs uppercase tracking-wider text-xert-concrete/60 hover:border-xert-steel transition-colors">
                Manage bank
              </button>
            </div>
            {!templatesAvailable ? (
              <p className="font-body text-xs" style={{ color: '#e0b36a' }}>
                The class bank becomes available after class_template_bank.sql is applied.
              </p>
            ) : templatesLoading ? (
              <div className="h-14 animate-pulse bg-xert-charcoal" />
            ) : templates.length === 0 ? (
              <p className="font-body text-sm text-xert-concrete/40">
                No saved classes yet. Press <span className="text-xert-steel">Bank it</span> on any class, or add entries in Manage bank.
              </p>
            ) : (
              <div className="space-y-2">
                {templates.map(template => (
                  <TemplateQuickAddRow
                    key={`${template.id}:${selectedDayKey}`}
                    template={template}
                    dayKey={selectedDayKey}
                    onQuickAdd={onQuickAdd}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
