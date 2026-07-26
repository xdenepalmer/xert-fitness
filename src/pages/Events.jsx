import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarPlus, ExternalLink, MapPin, Target, Trophy } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import PageHeader from '@/components/public/PageHeader';
import Skeleton from '@/components/public/Skeleton';
import { addMyEventGoal, getEvents, getMyEventGoals, removeMyEventGoal } from '@/lib/bookingData';
import { getSoftLaunchSettings, getDefaultSettings } from '@/lib/adminData';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { downloadEventIcs, formatEventRange, getEventState, groupEventsByMonth, sortEvents } from '@/lib/eventCalendar';

function canTrackEventGoal(event) {
  return Boolean(event?.id && event.source !== 'xert-default');
}

export default function Events() {
  const { session } = useSupabaseAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [showPast, setShowPast] = useState(false);
  const [goalEventIds, setGoalEventIds] = useState(() => new Set());
  const [savingGoalId, setSavingGoalId] = useState(null);
  // Same-paint double-tap on Train for this can mint two add/remove goal RPCs
  // before `savingGoalId` re-renders (Account cancel / LeadTable lock parity).
  const goalLockRef = useRef(false);
  const [settings, setSettings] = useState(getDefaultSettings());
  // Fail closed: Book CTAs stay off until launch settings confirm bookings_enabled
  // (Home / Soft Launch timetable parity).
  const bookingsEnabled = settings.bookings_enabled === true;

  useEffect(() => {
    getEvents()
      .then(setEvents)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getSoftLaunchSettings().then(s => { if (s) setSettings(s); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!session) {
      setGoalEventIds(new Set());
      return undefined;
    }
    let active = true;
    getMyEventGoals()
      .then(goals => {
        if (active) setGoalEventIds(new Set(goals.map(goal => goal.event_id)));
      })
      .catch(error => {
        if (active)
          toast({
            title: 'Could not load training goals',
            description: error.message,
            variant: 'destructive'
          });
      });
    return () => {
      active = false;
    };
  }, [session, toast]);

  const handleGoalToggle = async event => {
    if (!session) {
      navigate('/login');
      return;
    }
    if (!canTrackEventGoal(event) || goalLockRef.current || savingGoalId) return;
    const eventId = event.id;
    const alreadySelected = goalEventIds.has(eventId);
    goalLockRef.current = true;
    setSavingGoalId(eventId);
    try {
      if (alreadySelected) {
        await removeMyEventGoal(eventId);
      } else {
        await addMyEventGoal(eventId);
      }
      setGoalEventIds(current => {
        const next = new Set(current);
        if (alreadySelected) next.delete(eventId);
        else next.add(eventId);
        return next;
      });
      toast({
        title: alreadySelected ? 'Training goal removed' : 'Training goal saved',
        description: alreadySelected ? `${event.name} has been removed from your account.` : `${event.name} is now one of your XERT training goals.`
      });
    } catch (error) {
      toast({
        title: 'Could not update training goal',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSavingGoalId(null);
      goalLockRef.current = false;
    }
  };

  const categories = useMemo(() => {
    const set = new Set(events.map(e => e.category).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [events]);

  const orderedEvents = useMemo(() => sortEvents(events), [events]);

  const filtered = useMemo(() => (activeCategory === 'all' ? orderedEvents : orderedEvents.filter(e => e.category === activeCategory)), [orderedEvents, activeCategory]);

  const visibleEvents = useMemo(() => filtered.filter(ev => showPast || getEventState(ev).key !== 'complete'), [filtered, showPast]);

  const byMonth = useMemo(() => groupEventsByMonth(visibleEvents), [visibleEvents]);

  const comingUp = useMemo(() => orderedEvents.filter(ev => getEventState(ev).key !== 'complete').slice(0, 3), [orderedEvents]);

  const usingDefaultCalendar = events.some(ev => ev.source === 'xert-default');

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />

      <main id="main" className="pb-20">
        <PageHeader
          eyebrow="South East Queensland"
          title={<>Event Schedule<br /></>}
          accent="2026."
          intro="XERT programming follows the South East Queensland sporting and fitness calendar. Choose your events, train with purpose and build toward shared goals through the year — from marathons and triathlons to functional fitness, ultra running and community racing."
          containerClassName="max-w-6xl"
        />

        <div id="goals" className="max-w-6xl mx-auto px-6 scroll-mt-32">
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
                      <article
                        key={`next-${ev.id || ev.name}`}
                        className="border p-4"
                        style={{
                          borderColor: state.key === 'live' ? '#7BA7BC' : 'rgba(123,167,188,0.16)',
                          backgroundColor: 'rgba(50,72,90,0.16)'
                        }}
                      >
                        <p className="font-body text-[10px] uppercase tracking-wider mb-2" style={{ color: '#7BA7BC' }}>
                          {state.label}
                        </p>
                        <h2 className="font-display text-xl uppercase leading-tight text-xert-offwhite">{ev.name}</h2>
                        <p className="font-body text-sm mt-2" style={{ color: 'rgba(209,221,230,0.58)' }}>
                          {formatEventRange(ev)} · {ev.location}
                        </p>
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
                      className="min-h-11 px-3 py-2.5 font-body text-xs uppercase tracking-wider border transition-colors"
                      style={{
                        borderColor: active ? '#7BA7BC' : 'rgba(123,167,188,0.24)',
                        backgroundColor: active ? 'rgba(123,167,188,0.14)' : 'transparent',
                        color: active ? '#F1F3F4' : 'rgba(209,221,230,0.6)'
                      }}
                    >
                      {cat === 'all' ? 'All events' : cat}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowPast(v => !v)}
                  className="min-h-11 ml-0 sm:ml-2 px-3 py-2.5 font-body text-xs uppercase tracking-wider border transition-colors"
                  style={{
                    borderColor: showPast ? '#7BA7BC' : 'rgba(123,167,188,0.24)',
                    backgroundColor: showPast ? 'rgba(123,167,188,0.14)' : 'transparent',
                    color: showPast ? '#F1F3F4' : 'rgba(209,221,230,0.6)'
                  }}
                >
                  {showPast ? 'Hide completed' : 'Show completed'}
                </button>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="mt-10">
            {loading && (
              <div role="status">
                <span className="sr-only">Loading the 2026 calendar…</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="border p-4" style={{ borderColor: 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(50,72,90,0.16)' }}>
                      <Skeleton className="h-3 w-20 mb-3" />
                      <Skeleton className="h-6 w-3/4 mb-3" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-8 w-40 mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="border p-5" style={{ borderColor: 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(50,72,90,0.16)' }}>
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                      <Skeleton className="h-7 w-3/4 mb-3" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {error && (
              <p className="font-body text-sm" style={{ color: '#f0a1a1' }}>
                Couldn’t load events: {error}
              </p>
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

            {!loading &&
              !error &&
              byMonth.map(({ month, events: list }) => (
                <section key={month} className="mb-10">
                  <div className="flex items-baseline gap-4 mb-4">
                    <h2 className="font-display text-3xl uppercase text-xert-offwhite leading-none">{month}</h2>
                    <span className="font-body text-xs uppercase tracking-wider" style={{ color: '#7BA7BC' }}>
                      {list.length} {list.length === 1 ? 'event' : 'events'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {list.map(ev => {
                      const state = getEventState(ev);
                      const trackable = canTrackEventGoal(ev);
                      const selectedGoal = trackable && goalEventIds.has(ev.id);
                      return (
                        <article
                          key={ev.id}
                          className="group border p-5 flex flex-col transition-colors"
                          style={{
                            borderColor: 'rgba(123,167,188,0.16)',
                            backgroundColor: 'rgba(50,72,90,0.16)'
                          }}
                        >
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <span className="font-body text-sm uppercase tracking-wider" style={{ color: '#7BA7BC' }}>
                              {formatEventRange(ev)}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className="font-body text-[10px] uppercase tracking-wider px-2 py-1"
                                style={{
                                  color: state.key === 'complete' ? 'rgba(16,24,32,0.64)' : '#101820',
                                  backgroundColor: state.key === 'complete' ? 'rgba(209,221,230,0.52)' : '#D1DDE6'
                                }}
                              >
                                {state.label}
                              </span>
                              {ev.category && (
                                <span
                                  className="font-body text-[10px] uppercase tracking-wider px-2 py-1 hidden sm:inline-block"
                                  style={{
                                    color: '#101820',
                                    backgroundColor: '#D1DDE6'
                                  }}
                                >
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
                          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                            {ev.url && (
                              <a href={ev.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-body text-xs uppercase tracking-wider" style={{ color: '#7BA7BC' }}>
                                <ExternalLink className="w-3.5 h-3.5" />
                                Event details
                              </a>
                            )}
                            {ev.event_date && (
                              <button type="button" onClick={() => downloadEventIcs(ev)} className="inline-flex min-h-11 items-center gap-2 font-body text-xs uppercase tracking-wider" style={{ color: '#7BA7BC' }}>
                                <CalendarPlus className="w-3.5 h-3.5" />
                                Add to calendar
                              </button>
                            )}
                            {trackable && state.key !== 'complete' && (
                              <button
                                type="button"
                                aria-pressed={selectedGoal}
                                disabled={savingGoalId !== null}
                                onClick={() => void handleGoalToggle(ev)}
                                className="inline-flex min-h-11 items-center gap-2 font-body text-xs uppercase tracking-wider disabled:opacity-50"
                                style={{
                                  color: selectedGoal ? '#D1DDE6' : '#7BA7BC'
                                }}
                              >
                                <Target className="w-3.5 h-3.5" />
                                {savingGoalId === ev.id ? 'Saving goal...' : selectedGoal ? 'Training goal' : 'Train for this'}
                              </button>
                            )}
                          </div>
                        </article>
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
                {bookingsEnabled
                  ? 'Training toward one of these? Book a session and prepare with structured coaching.'
                  : 'Training toward one of these? Register interest and XERT will follow up when class spots open.'}
              </p>
            </div>
            {bookingsEnabled ? (
              <a href="/booking" className="xert-btn-primary inline-flex items-center justify-center px-6 py-3 font-display text-base uppercase tracking-wide sm:ml-auto shrink-0">
                Book A Session
              </a>
            ) : (
              <a href="/#eoi" className="xert-btn-primary inline-flex items-center justify-center px-6 py-3 font-display text-base uppercase tracking-wide sm:ml-auto shrink-0">
                Register interest
              </a>
            )}
          </div>
        </div>
      </main>

      <PublicFooter showBookCta={bookingsEnabled} />
      {bookingsEnabled && <StickyMobileCTA />}
    </div>
  );
}
