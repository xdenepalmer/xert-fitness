import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, Target, Trophy } from 'lucide-react';
import {
  XERT_2026_EVENTS,
  formatEventRange,
  getEventState,
  groupEventsByMonth,
  parseCalendarDate,
  sortEvents,
} from '@/lib/eventCalendar';

const PHOTO = '/assets/event-calendar.jpg';

const eventMonths = groupEventsByMonth(XERT_2026_EVENTS);
const allEvents = sortEvents(XERT_2026_EVENTS);

const SOLID_TILE = { backgroundColor: '#7BA7BC', color: '#101820' };

function eventType(event) {
  if (event.category === 'xert') return 'XERT';
  return (event.category || 'Event').replace(/^\w/, char => char.toUpperCase());
}

function eventMonth(event) {
  return eventMonths.find(month => month.events.some(monthEvent => monthEvent.id === event.id))?.month || '';
}

function getInitialMonth() {
  const upcoming = allEvents
    .filter(event => getEventState(event).key !== 'complete')
    .sort((a, b) => parseCalendarDate(a.event_date).getTime() - parseCalendarDate(b.event_date).getTime());

  return upcoming[0] ? eventMonth(upcoming[0]) : eventMonths[0].month;
}

function surfaceFor(state) {
  if (state.key === 'live') return 'xert-card-accent';
  if (state.key === 'complete') return 'xert-card-flat';
  return 'xert-card';
}

export default function EventWall() {
  const [activeMonth, setActiveMonth] = useState(getInitialMonth);

  const upcomingEvents = useMemo(() => {
    return allEvents
      .filter(event => getEventState(event).key !== 'complete')
      .sort((a, b) => parseCalendarDate(a.event_date).getTime() - parseCalendarDate(b.event_date).getTime())
      .slice(0, 4);
  }, []);

  const selectedMonth = eventMonths.find(month => month.month === activeMonth) || eventMonths[0];

  return (
    <section id="events" className="relative overflow-hidden bg-xert-ink py-14 sm:py-20">
      <div className="absolute inset-0 opacity-10">
        <img
          src={PHOTO}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          style={{ filter: 'saturate(0.3) brightness(0.5)' }}
        />
      </div>
      <div aria-hidden="true" className="xert-glow-top absolute inset-0 pointer-events-none" />
      <div aria-hidden="true" className="xert-divider absolute top-0 left-0 right-0" />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mb-6 flex items-center gap-3 sm:mb-8">
          <div className="h-px w-6 bg-xert-steel" />
          <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">
            South East Queensland Event Calendar
          </span>
        </div>

        <div className="mb-10 grid grid-cols-1 gap-8 sm:mb-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10">
          <div>
            <h2
              className="font-display uppercase text-xert-offwhite"
              style={{ fontSize: 'clamp(2.5rem,6vw,4.5rem)', lineHeight: 0.95 }}
            >
              Xert Annual Event<br />
              <span className="text-xert-steel">Calendar 2026.</span>
            </h2>
            <p className="mt-5 mb-3 font-display text-2xl uppercase text-xert-pale">
              Train with Purpose. Compete Together.
            </p>
            <p className="max-w-[44ch] font-body text-base leading-relaxed text-xert-pale/70">
              At XERT, programming follows the South East Queensland sporting and fitness calendar. Members choose their events, train together and build toward shared goals throughout the year.
            </p>
          </div>

          <div className="xert-card p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-3 sm:mb-5">
              <div className="xert-icon-tile" style={SOLID_TILE}>
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="font-display text-xl uppercase leading-none text-xert-offwhite">Coming Up</p>
                <p className="mt-1 font-body text-xs uppercase tracking-wider text-xert-pale/50">
                  Next events on the XERT radar
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map(event => {
                  const state = getEventState(event);
                  return (
                    <div
                      key={`${event.name}-${event.date_label}`}
                      className={`flex items-start gap-3 p-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] ${
                        state.key === 'live'
                          ? 'xert-card-accent'
                          : 'xert-card-flat hover:border-xert-steel/50'
                      }`}
                    >
                      <div className="xert-icon-tile">
                        <CalendarDays className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* The type chip sits beside short names and wraps
                            under long ones instead of squeezing the title. */}
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                          <p className="font-display text-lg uppercase leading-tight text-xert-offwhite">{event.name}</p>
                          <span className="xert-chip xert-chip-solid shrink-0">
                            {eventType(event)}
                          </span>
                        </div>
                        <p className="mt-1 font-body text-sm text-xert-pale/65">
                          {formatEventRange(event)} - {eventMonth(event)}
                        </p>
                        <p className={`mt-2 font-body text-xs uppercase tracking-wider ${state.key === 'live' ? 'text-xert-steel' : 'text-xert-steel/60'}`}>
                          {state.label}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="xert-card-flat p-5 text-center">
                  <p className="font-display text-lg uppercase text-xert-offwhite">2026 calendar complete.</p>
                  <p className="mt-1 font-body text-sm text-xert-pale/55">
                    Check back for the next training year.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
          <div className="self-start lg:sticky lg:top-20">
            <p className="mb-3 font-display text-sm uppercase tracking-widest text-xert-steel/60">
              View Month
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {eventMonths.map(month => {
                const isActive = month.month === activeMonth;
                return (
                  <button
                    key={month.month}
                    type="button"
                    onClick={() => setActiveMonth(month.month)}
                    className={`flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                      isActive ? 'xert-card-accent' : 'xert-card-flat hover:border-xert-steel/40'
                    }`}
                  >
                    <span className={`font-display text-lg uppercase ${isActive ? 'text-xert-offwhite' : 'text-xert-pale/70'}`}>
                      {month.month}
                    </span>
                    <span className="font-body text-xs tabular-nums text-xert-steel">
                      {month.events.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-end justify-between gap-4 sm:mb-5">
              <div>
                <p className="mb-2 font-body text-xs uppercase tracking-[0.2em] text-xert-steel">
                  {selectedMonth.events.length} Events
                </p>
                <h3 className="font-display text-4xl uppercase leading-none text-xert-offwhite">{selectedMonth.month}</h3>
              </div>
              <Trophy className="hidden h-8 w-8 text-xert-steel/35 sm:block" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
              {selectedMonth.events.map(event => {
                const state = getEventState(event);
                return (
                  <article
                    key={`${selectedMonth.month}-${event.name}`}
                    className={`${surfaceFor(state)} flex flex-col p-5`}
                  >
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div className="xert-icon-tile" style={state.key === 'complete' ? undefined : SOLID_TILE}>
                        <Target className="w-5 h-5" />
                      </div>
                      <span className={`xert-chip ${state.key === 'complete' ? '' : 'xert-chip-solid'}`}>
                        {state.label}
                      </span>
                    </div>

                    <p className="mb-2 font-body text-sm uppercase tracking-wider text-xert-steel">
                      {formatEventRange(event)}
                    </p>
                    <h4 className="mb-3 font-display text-2xl uppercase leading-tight text-xert-offwhite">{event.name}</h4>
                    <p className="mt-auto font-body text-sm text-xert-pale/55">
                      {eventType(event)} event
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="mt-6 sm:mt-8">
              <Link
                to="/events"
                className="xert-btn-ghost group inline-flex min-h-[52px] w-full items-center justify-center gap-2 px-6 py-3 font-display text-sm uppercase tracking-widest sm:w-auto"
              >
                View full calendar
                <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
                  &rarr;
                </span>
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 sm:mt-12">
          <div aria-hidden="true" className="xert-divider mb-8" />
          <p className="mb-2 font-display text-2xl uppercase text-xert-offwhite">
            Train for Life. Compete for Fun.
          </p>
          <p className="max-w-3xl font-body text-sm leading-relaxed text-xert-pale/65">
            XERT is built around preparing members for real-world events, from local sport to endurance racing, functional fitness competitions and personal challenges.
          </p>
        </div>
      </div>
    </section>
  );
}
