import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CalendarPlus, ExternalLink, MapPin, Trophy } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import { getEvents } from '@/lib/bookingData';
import {
  downloadEventIcs,
  formatEventRange,
  getEventState,
  groupEventsByMonth,
  sortEvents,
} from '@/lib/eventCalendar';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    getEvents()
      .then(setEvents)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set(events.map(e => e.category).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [events]);

  const orderedEvents = useMemo(() => sortEvents(events), [events]);

  const filtered = useMemo(
    () => (activeCategory === 'all' ? orderedEvents : orderedEvents.filter(e => e.category === activeCategory)),
    [orderedEvents, activeCategory]
  );

  const visibleEvents = useMemo(
    () => filtered.filter(ev => showPast || getEventState(ev).key !== 'complete'),
    [filtered, showPast]
  );

  const byMonth = useMemo(() => groupEventsByMonth(visibleEvents), [visibleEvents]);

  const comingUp = useMemo(
    () => orderedEvents.filter(ev => getEventState(ev).key !== 'complete').slice(0, 3),
    [orderedEvents]
  );

  const usingDefaultCalendar = events.some(ev => ev.source === 'xert-default');

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />

      <main className="pt-28 pb-20">
        <div className="max-w-6xl mx-auto px-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
            <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>
              South East Queensland
            </span>
          </div>
          <h1 className="font-display uppercase text-xert-offwhite" style={{ fontSize: 'clamp(2.5rem,7vw,4.5rem)', lineHeight: 0.95 }}>
            Event Schedule<br />
            <span style={{ color: '#7BA7BC' }}>2026.</span>
          </h1>
          <p className="font-body leading-relaxed max-w-2xl mt-6" style={{ color: 'rgba(209,221,230,0.72)', fontSize: '1.0625rem' }}>
            XERT programming follows the South East Queensland sporting and fitness calendar. Choose your events, train
            with purpose and build toward shared goals through the year — from marathons and triathlons to functional
            fitness, ultra running and community racing.
          </p>

          {/* Category filter */}
          {!loading && !error && events.length > 0 && (
            <div className="mt-8 space-y-5">
              {usingDefaultCalendar && (
                <p className="font-body text-xs uppercase tracking-[0.18em]" style={{ color: 'rgba(123,167,188,0.72)' }}>
                  Showing the XERT 2026 calendar while live Supabase events are being prepared.
                </p>
              )}

              {comingUp.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {comingUp.map(ev => {
                    const state = getEventState(ev);
                    return (
                      <article key={`next-${ev.id || ev.name}`} className="border p-4" style={{ borderColor: state.key === 'live' ? '#7BA7BC' : 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(50,72,90,0.16)' }}>
                        <p className="font-body text-[10px] uppercase tracking-wider mb-2" style={{ color: '#7BA7BC' }}>{state.label}</p>
                        <h2 className="font-display text-xl uppercase leading-tight text-xert-offwhite">{ev.name}</h2>
                        <p className="font-body text-sm mt-2" style={{ color: 'rgba(209,221,230,0.58)' }}>{formatEventRange(ev)} · {ev.location}</p>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {categories.map(cat => {
                  const active = cat === activeCategory;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className="px-3 py-1.5 font-body text-xs uppercase tracking-wider border transition-colors"
                      style={{
                        borderColor: active ? '#7BA7BC' : 'rgba(123,167,188,0.24)',
                        backgroundColor: active ? 'rgba(123,167,188,0.14)' : 'transparent',
                        color: active ? '#F1F3F4' : 'rgba(209,221,230,0.6)',
                      }}
                    >
                      {cat === 'all' ? 'All events' : cat}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowPast(v => !v)}
                  className="ml-0 sm:ml-2 px-3 py-1.5 font-body text-xs uppercase tracking-wider border transition-colors"
                  style={{
                    borderColor: showPast ? '#7BA7BC' : 'rgba(123,167,188,0.24)',
                    backgroundColor: showPast ? 'rgba(123,167,188,0.14)' : 'transparent',
                    color: showPast ? '#F1F3F4' : 'rgba(209,221,230,0.6)',
                  }}
                >
                  {showPast ? 'Hide completed' : 'Show completed'}
                </button>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="mt-12">
            {loading && (
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.5)' }}>Loading the 2026 calendar…</p>
            )}
            {error && (
              <p className="font-body text-sm" style={{ color: '#f0a1a1' }}>Couldn’t load events: {error}</p>
            )}
            {!loading && !error && events.length === 0 && (
              <div className="border p-10 text-center" style={{ borderColor: 'rgba(123,167,188,0.16)' }}>
                <Trophy className="w-8 h-8 mx-auto mb-4" style={{ color: 'rgba(123,167,188,0.4)' }} />
                <p className="font-display text-2xl uppercase text-xert-offwhite">Calendar coming soon.</p>
                <p className="font-body text-sm mt-2" style={{ color: 'rgba(209,221,230,0.55)' }}>
                  The 2026 South East Queensland event schedule will be published here shortly.
                </p>
              </div>
            )}
            {!loading && !error && events.length > 0 && visibleEvents.length === 0 && (
              <div className="border p-10 text-center" style={{ borderColor: 'rgba(123,167,188,0.16)' }}>
                <Trophy className="w-8 h-8 mx-auto mb-4" style={{ color: 'rgba(123,167,188,0.4)' }} />
                <p className="font-display text-2xl uppercase text-xert-offwhite">No upcoming matches.</p>
                <p className="font-body text-sm mt-2" style={{ color: 'rgba(209,221,230,0.55)' }}>
                  Switch on completed events to review the full 2026 calendar.
                </p>
              </div>
            )}

            {!loading && !error && byMonth.map(({ month, events: list }) => (
              <section key={month} className="mb-10">
                <div className="flex items-baseline gap-4 mb-4">
                  <h2 className="font-display text-3xl uppercase text-xert-offwhite leading-none">{month}</h2>
                  <span className="font-body text-xs uppercase tracking-wider" style={{ color: '#7BA7BC' }}>
                    {list.length} {list.length === 1 ? 'event' : 'events'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {list.map(ev => {
                    const Wrapper = ev.url ? 'a' : 'div';
                    const wrapperProps = ev.url
                      ? { href: ev.url, target: '_blank', rel: 'noopener noreferrer' }
                      : {};
                    const state = getEventState(ev);
                    return (
                      <Wrapper
                        key={ev.id}
                        {...wrapperProps}
                        className="group border p-5 flex flex-col transition-colors"
                        style={{ borderColor: 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(50,72,90,0.16)' }}
                      >
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <span className="font-body text-sm uppercase tracking-wider" style={{ color: '#7BA7BC' }}>
                            {formatEventRange(ev)}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-body text-[10px] uppercase tracking-wider px-2 py-1" style={{ color: state.key === 'complete' ? 'rgba(16,24,32,0.64)' : '#101820', backgroundColor: state.key === 'complete' ? 'rgba(209,221,230,0.52)' : '#D1DDE6' }}>
                              {state.label}
                            </span>
                            {ev.category && (
                              <span className="font-body text-[10px] uppercase tracking-wider px-2 py-1 hidden sm:inline-block" style={{ color: '#101820', backgroundColor: '#D1DDE6' }}>
                                {ev.category}
                              </span>
                            )}
                          </div>
                        </div>
                        <h3 className="font-display text-2xl uppercase leading-tight text-xert-offwhite mb-2 flex items-start gap-2">
                          {ev.name}
                          {ev.url && <ExternalLink className="w-4 h-4 mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#7BA7BC' }} />}
                        </h3>
                        {ev.location && (
                          <p className="font-body text-sm mt-auto flex items-center gap-1.5" style={{ color: 'rgba(209,221,230,0.56)' }}>
                            <MapPin className="w-3.5 h-3.5" style={{ color: 'rgba(123,167,188,0.6)' }} />
                            {ev.location}
                          </p>
                        )}
                        {ev.event_date && (
                          <button
                            type="button"
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              downloadEventIcs(ev);
                            }}
                            className="inline-flex items-center gap-2 self-start mt-4 font-body text-xs uppercase tracking-wider"
                            style={{ color: '#7BA7BC' }}
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            Add to calendar
                          </button>
                        )}
                      </Wrapper>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-8 pt-8 border-t flex flex-col sm:flex-row sm:items-center gap-4" style={{ borderColor: 'rgba(123,167,188,0.16)' }}>
            <div className="flex items-center gap-3">
              <CalendarDays className="w-5 h-5" style={{ color: '#7BA7BC' }} />
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.7)' }}>
                Training toward one of these? Book a session and prepare with structured coaching.
              </p>
            </div>
            <a
              href="/booking"
              className="inline-flex items-center justify-center px-6 py-3 font-display text-base uppercase tracking-wide transition-all active:scale-[0.98] sm:ml-auto shrink-0"
              style={{ backgroundColor: '#7BA7BC', color: '#101820' }}
            >
              Book A Session
            </a>
          </div>
        </div>
      </main>

      <PublicFooter />
      <StickyMobileCTA />
    </div>
  );
}
