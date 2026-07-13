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
    <section id="events" className="relative overflow-hidden py-20" style={{ backgroundColor: '#0d1720' }}>
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

      <div className="absolute top-0 left-0 right-0 h-px" style={{ backgroundColor: 'rgba(123,167,188,0.2)' }} />

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
          <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>
            South East Queensland Event Calendar
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-10 mb-12">
          <div>
            <h2
              className="font-display uppercase"
              style={{ fontSize: 'clamp(2.5rem,6vw,4.5rem)', lineHeight: 0.95, color: '#F1F3F4' }}
            >
              Xert Annual Event<br />
              <span style={{ color: '#7BA7BC' }}>Calendar 2026.</span>
            </h2>
            <p className="font-display text-2xl uppercase mt-6 mb-4" style={{ color: '#D1DDE6' }}>
              Train with Purpose. Compete Together.
            </p>
            <p className="font-body text-base leading-relaxed max-w-xl" style={{ color: 'rgba(209,221,230,0.7)' }}>
              At XERT, programming follows the South East Queensland sporting and fitness calendar. Members choose their events, train together and build toward shared goals throughout the year.
            </p>
          </div>

          <div className="border p-5 sm:p-6" style={{ borderColor: 'rgba(123,167,188,0.18)', backgroundColor: 'rgba(16,24,32,0.78)' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 flex items-center justify-center" style={{ backgroundColor: '#7BA7BC' }}>
                <Clock className="w-5 h-5" style={{ color: '#101820' }} />
              </div>
              <div>
                <p className="font-display text-xl uppercase text-xert-offwhite leading-none">Coming Up</p>
                <p className="font-body text-xs uppercase tracking-wider mt-1" style={{ color: 'rgba(209,221,230,0.45)' }}>
                  Next events on the XERT radar
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map(event => {
                  const state = getEventState(event);
                  return (
                    <div
                      key={`${event.name}-${event.date_label}`}
                      className={`flex items-start gap-4 p-4 border transition-[border-color,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] ${
                        state.key === 'live'
                          ? 'border-xert-steel'
                          : 'border-[rgba(123,167,188,0.12)] hover:border-xert-steel'
                      }`}
                      style={{
                        backgroundColor: state.key === 'live' ? 'rgba(123,167,188,0.12)' : 'rgba(50,72,90,0.16)',
                      }}
                    >
                      <CalendarDays className="w-5 h-5 mt-0.5 shrink-0" style={{ color: '#7BA7BC' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-display text-lg uppercase leading-tight text-xert-offwhite">{event.name}</p>
                          <span className="font-body text-[10px] uppercase tracking-wider px-2 py-1 shrink-0" style={{ color: '#101820', backgroundColor: '#D1DDE6' }}>
                            {eventType(event)}
                          </span>
                        </div>
                        <p className="font-body text-sm mt-1" style={{ color: 'rgba(209,221,230,0.65)' }}>
                          {formatEventRange(event)} - {eventMonth(event)}
                        </p>
                        <p className="font-body text-xs uppercase tracking-wider mt-2" style={{ color: state.key === 'live' ? '#7BA7BC' : 'rgba(123,167,188,0.55)' }}>
                          {state.label}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-5 border text-center" style={{ borderColor: 'rgba(123,167,188,0.12)' }}>
                  <p className="font-display text-lg uppercase text-xert-offwhite">2026 calendar complete.</p>
                  <p className="font-body text-sm mt-1" style={{ color: 'rgba(209,221,230,0.55)' }}>
                    Check back for the next training year.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-6">
          <div className="lg:sticky lg:top-20 self-start">
            <p className="font-display text-sm uppercase tracking-widest mb-3" style={{ color: 'rgba(123,167,188,0.6)' }}>
              View Month
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
              {eventMonths.map(month => {
                const isActive = month.month === activeMonth;
                return (
                  <button
                    key={month.month}
                    type="button"
                    onClick={() => setActiveMonth(month.month)}
                    className="flex items-center justify-between gap-3 border px-4 py-3 text-left transition-colors"
                    style={{
                      borderColor: isActive ? '#7BA7BC' : 'rgba(123,167,188,0.16)',
                      backgroundColor: isActive ? 'rgba(123,167,188,0.14)' : 'rgba(50,72,90,0.1)',
                    }}
                  >
                    <span className="font-display text-lg uppercase" style={{ color: isActive ? '#F1F3F4' : 'rgba(209,221,230,0.68)' }}>
                      {month.month}
                    </span>
                    <span className="font-body text-xs tabular-nums" style={{ color: '#7BA7BC' }}>
                      {month.events.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-end justify-between gap-4 mb-5">
              <div>
                <p className="font-body text-xs uppercase tracking-[0.2em] mb-2" style={{ color: '#7BA7BC' }}>
                  {selectedMonth.events.length} Events
                </p>
                <h3 className="font-display text-4xl uppercase text-xert-offwhite leading-none">{selectedMonth.month}</h3>
              </div>
              <Trophy className="w-8 h-8 hidden sm:block" style={{ color: 'rgba(123,167,188,0.35)' }} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedMonth.events.map(event => {
                const state = getEventState(event);
                return (
                  <article
                    key={`${selectedMonth.month}-${event.name}`}
                    className="border p-5 min-h-[10rem] flex flex-col"
                    style={{
                      borderColor: state.key === 'live' ? '#7BA7BC' : 'rgba(123,167,188,0.16)',
                      backgroundColor: state.key === 'complete' ? 'rgba(16,24,32,0.5)' : 'rgba(50,72,90,0.16)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ backgroundColor: state.key === 'complete' ? 'rgba(123,167,188,0.12)' : '#7BA7BC' }}>
                        <Target className="w-5 h-5" style={{ color: state.key === 'complete' ? '#7BA7BC' : '#101820' }} />
                      </div>
                      <span className="font-body text-[10px] uppercase tracking-wider px-2 py-1" style={{ color: '#101820', backgroundColor: state.key === 'complete' ? 'rgba(209,221,230,0.5)' : '#D1DDE6' }}>
                        {state.label}
                      </span>
                    </div>

                    <p className="font-body text-sm uppercase tracking-wider mb-2" style={{ color: '#7BA7BC' }}>
                      {formatEventRange(event)}
                    </p>
                    <h4 className="font-display text-2xl uppercase leading-tight text-xert-offwhite mb-3">{event.name}</h4>
                    <p className="font-body text-sm mt-auto" style={{ color: 'rgba(209,221,230,0.56)' }}>
                      {eventType(event)} event
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="mt-8">
              <Link
                to="/events"
                className="xert-btn-ghost group inline-flex min-h-[44px] items-center gap-2 px-6 py-3 font-display text-sm uppercase tracking-widest"
              >
                View full calendar
                <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
                  &rarr;
                </span>
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t" style={{ borderColor: 'rgba(123,167,188,0.16)' }}>
          <p className="font-display text-2xl uppercase mb-2" style={{ color: '#F1F3F4' }}>
            Train for Life. Compete for Fun.
          </p>
          <p className="font-body text-sm leading-relaxed max-w-3xl" style={{ color: 'rgba(209,221,230,0.66)' }}>
            XERT is built around preparing members for real-world events, from local sport to endurance racing, functional fitness competitions and personal challenges.
          </p>
        </div>
      </div>
    </section>
  );
}
