import React, { useMemo, useState } from 'react';
import { CalendarDays, Clock, Target, Trophy } from 'lucide-react';

const PHOTO = '/assets/event-calendar.jpg';

const eventMonths = [
  {
    month: 'July',
    events: [
      { title: 'Gold Coast Marathon', dateLabel: '4-5 Jul', start: '2026-07-04', end: '2026-07-05', type: 'Run' },
      { title: 'ACTÍVATE Brisbane', dateLabel: '12 Jul', start: '2026-07-12', type: 'Fitness' },
      { title: 'The Guzzler Ultra', dateLabel: '18-19 Jul', start: '2026-07-18', end: '2026-07-19', type: 'Ultra' },
      { title: 'Max Adventure Sunshine Coast', dateLabel: '25 Jul', start: '2026-07-25', type: 'Adventure' },
    ],
  },
  {
    month: 'August',
    events: [
      { title: 'Sunshine Coast Marathon Festival', dateLabel: '2 Aug', start: '2026-08-02', type: 'Run' },
      { title: 'Brisbane to Gold Coast Cycle Challenge', dateLabel: '23 Aug', start: '2026-08-23', type: 'Cycle' },
      { title: 'Coastal High Trail Run', dateLabel: '29 Aug', start: '2026-08-29', type: 'Trail' },
    ],
  },
  {
    month: 'September',
    events: [
      { title: 'Turf Games Gold Coast', dateLabel: '12-13 Sep', start: '2026-09-12', end: '2026-09-13', type: 'Functional' },
      { title: 'IRONMAN 70.3 Sunshine Coast', dateLabel: '13 Sep', start: '2026-09-13', type: 'Triathlon' },
      { title: 'Bridge to Brisbane', dateLabel: '13 Sep', start: '2026-09-13', type: 'Run' },
      { title: 'Butterfly Effect', dateLabel: '26-27 Sep', start: '2026-09-26', end: '2026-09-27', type: 'Community' },
      { title: 'Xert Endurance Challenge', dateLabel: 'Last Saturday of September', start: '2026-09-26', type: 'XERT' },
    ],
  },
  {
    month: 'October',
    events: [
      { title: 'AP&ES Games', dateLabel: '11-12 Oct', start: '2026-10-11', end: '2026-10-12', type: 'Games' },
      { title: 'Blackall 100', dateLabel: '17 Oct', start: '2026-10-17', type: 'Ultra' },
      { title: 'Cricket Season Begins', dateLabel: 'October', start: '2026-10-01', type: 'Sport' },
    ],
  },
  {
    month: 'November',
    events: [
      { title: 'Noosa Triathlon', dateLabel: '1 Nov', start: '2026-11-01', type: 'Triathlon' },
      { title: 'Robina Triathlon', dateLabel: '15 Nov', start: '2026-11-15', type: 'Triathlon' },
    ],
  },
  {
    month: 'December',
    events: [
      { title: 'Summer Touch Football Season', dateLabel: 'December', start: '2026-12-01', type: 'Sport' },
      { title: 'Cricket Season', dateLabel: 'December', start: '2026-12-01', type: 'Sport' },
      { title: 'Xert Team Competition', dateLabel: 'First Saturday of December', start: '2026-12-05', type: 'XERT' },
    ],
  },
];

const allEvents = eventMonths.flatMap(month =>
  month.events.map(event => ({ ...event, month: month.month }))
);

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function getEventState(event, now = new Date()) {
  const today = startOfDay(now);
  const start = startOfDay(`${event.start}T00:00:00`);
  const end = endOfDay(`${event.end || event.start}T00:00:00`);

  if (today > end) return { key: 'complete', label: 'Complete' };
  if (today >= start && today <= end) return { key: 'live', label: 'Happening now' };
  return { key: 'upcoming', label: 'Coming up' };
}

function getInitialMonth() {
  const upcoming = allEvents
    .filter(event => getEventState(event).key !== 'complete')
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return upcoming[0]?.month || eventMonths[0].month;
}

export default function EventWall() {
  const [activeMonth, setActiveMonth] = useState(getInitialMonth);

  const upcomingEvents = useMemo(() => {
    return allEvents
      .filter(event => getEventState(event).key !== 'complete')
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 4);
  }, []);

  const selectedMonth = eventMonths.find(month => month.month === activeMonth) || eventMonths[0];

  return (
    <section id="events" className="relative overflow-hidden py-20" style={{ backgroundColor: '#0d1720' }}>
      <div className="absolute inset-0 opacity-10">
        <img
          src={PHOTO}
          alt=""
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
                      key={`${event.title}-${event.dateLabel}`}
                      className="flex items-start gap-4 p-4 border"
                      style={{
                        borderColor: state.key === 'live' ? '#7BA7BC' : 'rgba(123,167,188,0.12)',
                        backgroundColor: state.key === 'live' ? 'rgba(123,167,188,0.12)' : 'rgba(50,72,90,0.16)',
                      }}
                    >
                      <CalendarDays className="w-5 h-5 mt-0.5 shrink-0" style={{ color: '#7BA7BC' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-display text-lg uppercase leading-tight text-xert-offwhite">{event.title}</p>
                          <span className="font-body text-[10px] uppercase tracking-wider px-2 py-1 shrink-0" style={{ color: '#101820', backgroundColor: '#D1DDE6' }}>
                            {event.type}
                          </span>
                        </div>
                        <p className="font-body text-sm mt-1" style={{ color: 'rgba(209,221,230,0.65)' }}>
                          {event.dateLabel} - {event.month}
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
                    key={`${selectedMonth.month}-${event.title}`}
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
                      {event.dateLabel}
                    </p>
                    <h4 className="font-display text-2xl uppercase leading-tight text-xert-offwhite mb-3">{event.title}</h4>
                    <p className="font-body text-sm mt-auto" style={{ color: 'rgba(209,221,230,0.56)' }}>
                      {event.type} event
                    </p>
                  </article>
                );
              })}
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
