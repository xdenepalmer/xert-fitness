import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarPlus, ExternalLink, MapPin, Target, Trophy } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import StickyMobileCTA from '@/components/public/StickyMobileCTA';
import PageHeader from '@/components/public/PageHeader';
import Skeleton from '@/components/public/Skeleton';
import { addMyEventGoal, getEvents, getMyEventGoals, removeMyEventGoal } from '@/lib/bookingData';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { downloadEventIcs, formatEventRange, getEventState, groupEventsByMonth, sortEvents } from '@/lib/eventCalendar';

function canTrackEventGoal(event) {
  return Boolean(event?.id && event.source !== 'xert-default');
}

// The date block sits beside the event in display type; long labels such as
// "Last Saturday of September" step down so they still fit the column.
function dateBlockSize(label) {
  if (label.length <= 6) return 'text-2xl';
  if (label.length <= 12) return 'text-lg';
  return 'text-sm leading-tight';
}

const filterChipClasses = 'rounded-full border px-4 py-2.5 font-body text-xs uppercase tracking-wider transition-colors';
const filterChipActive = 'border-xert-steel bg-xert-steel text-xert-navy';
const filterChipIdle = 'border-xert-steel/25 bg-white/[0.03] text-xert-pale/65 hover:border-xert-steel';
const inlineActionClasses = 'inline-flex items-center gap-2 font-body text-xs uppercase tracking-wider text-xert-steel hover:text-xert-pale transition-colors';

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

  useEffect(() => {
    getEvents()
      .then(setEvents)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
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
    if (!canTrackEventGoal(event)) return;
    const eventId = event.id;
    const alreadySelected = goalEventIds.has(eventId);
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
    <div className="min-h-screen bg-xert-navy">
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
            <div className="mt-8 space-y-6">
              {usingDefaultCalendar && (
                <p className="font-body text-xs uppercase tracking-[0.18em] text-xert-steel/75">
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
                        className={`${state.key === 'live' ? 'xert-card-accent' : 'xert-card'} p-5`}
                      >
                        <p className={`${state.key === 'live' ? 'xert-chip xert-chip-solid' : 'xert-chip'} mb-3`}>
                          {state.label}
                        </p>
                        <h2 className="font-display text-xl uppercase leading-tight text-xert-offwhite">{ev.name}</h2>
                        <p className="font-body text-sm mt-2 text-xert-pale/60">
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
                      className={`min-h-11 ${filterChipClasses} ${active ? filterChipActive : filterChipIdle}`}
                    >
                      {cat === 'all' ? 'All events' : cat}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowPast(v => !v)}
                  className={`min-h-11 ${filterChipClasses} ml-0 sm:ml-2 ${showPast ? filterChipActive : filterChipIdle}`}
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
                    <div key={i} className="xert-card p-5">
                      <Skeleton className="h-6 w-24 mb-3 rounded-full" />
                      <Skeleton className="h-6 w-3/4 mb-3" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-8 w-40 mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="xert-card p-4 sm:p-5 flex gap-4">
                      <Skeleton className="h-8 w-14 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <Skeleton className="h-6 w-24 rounded-full" />
                          <Skeleton className="h-6 w-16 rounded-full" />
                        </div>
                        <Skeleton className="h-7 w-3/4 mb-3" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
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
              <div className="xert-card p-10 text-center">
                <span className="xert-icon-tile mx-auto mb-4"><Trophy className="w-5 h-5" /></span>
                <p className="font-display text-2xl uppercase text-xert-offwhite">Calendar coming soon.</p>
                <p className="font-body text-sm mt-2 text-xert-pale/60">
                  The 2026 South East Queensland event schedule will be published here shortly.
                </p>
              </div>
            )}
            {!loading && !error && events.length > 0 && visibleEvents.length === 0 && (
              <div className="xert-card p-10 text-center">
                <span className="xert-icon-tile mx-auto mb-4"><Trophy className="w-5 h-5" /></span>
                <p className="font-display text-2xl uppercase text-xert-offwhite">No upcoming matches.</p>
                <p className="font-body text-sm mt-2 text-xert-pale/60">
                  Switch on completed events to review the full 2026 calendar.
                </p>
              </div>
            )}

            {!loading &&
              !error &&
              byMonth.map(({ month, events: list }) => (
                <section key={month} className="mb-10">
                  <div className="sticky top-14 z-10 -mx-6 mb-4 px-6 py-3 bg-xert-navy/85 backdrop-blur-md border-b border-xert-steel/10">
                    <div className="flex items-baseline gap-3">
                      <h2 className="font-display text-3xl uppercase text-xert-offwhite leading-none">{month}</h2>
                      <span className="xert-chip">
                        {list.length} {list.length === 1 ? 'event' : 'events'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {list.map(ev => {
                      const state = getEventState(ev);
                      const trackable = canTrackEventGoal(ev);
                      const selectedGoal = trackable && goalEventIds.has(ev.id);
                      const dateLabel = formatEventRange(ev);
                      return (
                        <article
                          key={ev.id}
                          className="group xert-card p-4 sm:p-5 flex gap-4 transition-colors"
                        >
                          <div className="shrink-0 w-[4.5rem] sm:w-20 border-r border-xert-steel/15 pr-3 sm:pr-4">
                            <span className={`block font-display uppercase tracking-wide text-xert-steel ${dateBlockSize(dateLabel)}`}>
                              {dateLabel}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col">
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              <span className={state.key === 'complete' ? 'xert-chip opacity-60' : 'xert-chip xert-chip-solid'}>
                                {state.label}
                              </span>
                              {ev.category && (
                                <span className="xert-chip">
                                  {ev.category}
                                </span>
                              )}
                            </div>
                            <h3 className="font-display text-2xl uppercase leading-tight text-xert-offwhite mb-2 flex items-start gap-2">
                              {ev.name}
                              {ev.url && <ExternalLink className="w-4 h-4 mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-xert-steel" />}
                            </h3>
                            {ev.location && (
                              <p className="font-body text-sm mt-auto flex items-center gap-1.5 text-xert-pale/60">
                                <MapPin className="w-3.5 h-3.5 text-xert-steel/70" />
                                {ev.location}
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-0">
                              {ev.url && (
                                <a href={ev.url} target="_blank" rel="noopener noreferrer" className={`min-h-11 ${inlineActionClasses}`}>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Event details
                                </a>
                              )}
                              {ev.event_date && (
                                <button type="button" onClick={() => downloadEventIcs(ev)} className={`min-h-11 ${inlineActionClasses}`}>
                                  <CalendarPlus className="w-3.5 h-3.5" />
                                  Add to calendar
                                </button>
                              )}
                              {trackable && state.key !== 'complete' && (
                                <button
                                  type="button"
                                  aria-pressed={selectedGoal}
                                  disabled={savingGoalId === ev.id}
                                  onClick={() => handleGoalToggle(ev)}
                                  className={`min-h-11 ${inlineActionClasses} disabled:opacity-50 ${selectedGoal ? 'text-xert-pale' : ''}`}
                                >
                                  <Target className="w-3.5 h-3.5" />
                                  {savingGoalId === ev.id ? 'Saving goal...' : selectedGoal ? 'Training goal' : 'Train for this'}
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
          </div>

          {/* CTA */}
          <div className="xert-card-accent mt-8 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="xert-icon-tile"><CalendarDays className="w-5 h-5" /></span>
              <p className="font-body text-sm text-xert-pale/80">
                Training toward one of these? Book a session and prepare with structured coaching.
              </p>
            </div>
            <a href="/booking" className="xert-btn-primary inline-flex min-h-[52px] w-full sm:w-auto items-center justify-center px-6 font-display text-base uppercase tracking-wide sm:ml-auto shrink-0">
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
