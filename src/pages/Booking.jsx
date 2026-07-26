import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, Loader2, RefreshCw, Ticket, Users } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import PageHeader from '@/components/public/PageHeader';
import Skeleton from '@/components/public/Skeleton';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import {
  getProducts, getSessionPackPaymentAvailability, startCheckout, getAvailableSessions, bookSession, joinSessionWaitlist, getMyBookings, getMyCredits,
} from '@/lib/bookingData';
import { useToast } from '@/components/ui/use-toast';
import { useSiteContent } from '@/lib/siteContent';
import { getSoftLaunchSettings } from '@/lib/adminData';
import { pricesComingSoon } from '@/lib/launchSettings';
import { BOOKING_DEFAULTS } from '@/lib/contentDefaults';
import { formatPackPrice, formatPackValidity, packCta, PRICES_COMING_SOON_LABEL } from '@/lib/products';
import { activeBookingsBySession, bookingTimeConflict, classActionLabel } from '@/lib/bookingUi';
import { clearPendingWebCheckout } from '@/lib/webCheckoutRecovery';

const steps = [
  'Purchase a session pack.',
  'Book your sessions online.',
  'Train with expert coaching in a structured semi-private environment.',
];

const cardStyle = { borderColor: 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(50,72,90,0.14)' };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDay(iso) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

export default function Booking() {
  const { session } = useSupabaseAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageContent = useSiteContent('booking', BOOKING_DEFAULTS);

  const [products, setProducts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [credits, setCredits] = useState(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  // Fail closed: Book CTAs stay off until launch settings confirm bookings_enabled.
  const [bookingsEnabled, setBookingsEnabled] = useState(false);
  const [bookingAvailabilityLoaded, setBookingAvailabilityLoaded] = useState(false);
  // Default to hidden: prices stay "Coming soon" until settings confirm otherwise.
  const [comingSoon, setComingSoon] = useState(true);
  const [paymentAvailabilityLoaded, setPaymentAvailabilityLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buyingSlug, setBuyingSlug] = useState(null);
  // Stripe checkout / book_session are not safe to fire twice before React paints
  // `buyingSlug` / `bookingId` — same-paint double-click (or a second pack/class
  // while the first is still minting) can open two Checkout sessions or reserve
  // two credits. iOS guards with bookingSessionID; web needs a ref lock.
  const buyLockRef = useRef(false);
  const bookLockRef = useRef(false);
  const [bookingId, setBookingId] = useState(null);
  const [loadErrors, setLoadErrors] = useState([]);
  const requestedSession = searchParams.get('session');
  const targetSessionId = requestedSession && UUID_PATTERN.test(requestedSession)
    ? requestedSession.toLowerCase()
    : null;

  useEffect(() => {
    if (searchParams.get('purchase') !== 'cancelled') return;
    clearPendingWebCheckout();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('purchase');
    setSearchParams(nextParams, { replace: true });
    toast({ title: 'Checkout cancelled', description: 'No payment was taken.' });
  }, [searchParams, setSearchParams, toast]);

  const refresh = useCallback(async () => {
    setLoadErrors([]);
    const requests = [getProducts(), getAvailableSessions(), getSessionPackPaymentAvailability(), getSoftLaunchSettings()];
    if (session) requests.push(getMyCredits(), getMyBookings());
    const results = await Promise.allSettled(requests);
    const errors = [];
    const apply = (result, label, setter, fallback) => {
      if (result.status === 'fulfilled') setter(result.value);
      else {
        setter(fallback);
        errors.push(`${label}: ${result.reason?.message || 'unavailable'}`);
      }
    };
    apply(results[0], 'Session packs', setProducts, []);
    apply(results[1], 'Timetable', setSessions, []);
    apply(results[2], 'Pack checkout', setPaymentsEnabled, false);
    // On failure the fallback keeps pricing hidden and bookings paused (iOS parity).
    apply(results[3], 'Launch settings', settings => {
      setComingSoon(pricesComingSoon(settings));
      setBookingsEnabled(settings?.bookings_enabled === true);
    }, { prices_coming_soon: true, bookings_enabled: false });
    setPaymentAvailabilityLoaded(true);
    setBookingAvailabilityLoaded(true);
    if (session) {
      apply(results[4], 'Credits', setCredits, null);
      apply(results[5], 'Your bookings', setMyBookings, []);
    } else {
      setCredits(null);
      setMyBookings([]);
    }
    setLoadErrors(errors);
    setLoading(false);
    if (errors.length) {
      toast({ title: 'Some booking data could not load', description: 'Use retry to refresh the unavailable sections.', variant: 'destructive' });
    }
  }, [session, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  const sessionsByDay = useMemo(() => {
    const groups = new Map();
    for (const s of sessions) {
      const key = formatDay(s.start_time);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    return Array.from(groups.entries());
  }, [sessions]);

  const memberBookingsBySession = useMemo(() => activeBookingsBySession(myBookings), [myBookings]);
  const timetableUnavailable = loadErrors.some(error => error.startsWith('Timetable:'));

  useEffect(() => {
    if (!requestedSession || loading || timetableUnavailable) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('session');

    if (!targetSessionId) {
      setSearchParams(nextParams, { replace: true });
      return;
    }

    const targetExists = sessions.some(item => item.id?.toLowerCase() === targetSessionId);
    const target = document.getElementById(`class-session-${targetSessionId}`);
    if (!targetExists || !target) {
      setSearchParams(nextParams, { replace: true });
      toast({
        title: 'Class no longer available',
        description: 'The timetable has changed. Explore the latest available sessions below.',
      });
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
    setSearchParams(nextParams, { replace: true });
  }, [
    loading,
    requestedSession,
    searchParams,
    sessions,
    setSearchParams,
    targetSessionId,
    timetableUnavailable,
    toast,
  ]);

  const handleBuy = async (product) => {
    if (buyLockRef.current || buyingSlug || bookLockRef.current || bookingId) return;
    if (!paymentsEnabled) {
      toast({ title: 'Pack purchases are paused', description: 'XERT will reopen secure checkout when the next release checks are complete.' });
      return;
    }
    if (!session) {
      toast({ title: 'Create an account first', description: 'Sign in or register to purchase a pack — your credits are stored on your account.' });
      navigate('/register');
      return;
    }
    buyLockRef.current = true;
    setBuyingSlug(product.slug);
    try {
      await startCheckout(product.slug); // redirects on success
    } catch (e) {
      toast({ title: 'Checkout unavailable', description: e.message, variant: 'destructive' });
      setBuyingSlug(null);
      buyLockRef.current = false;
    }
  };

  const handleBook = async (s) => {
    if (bookLockRef.current || bookingId || buyLockRef.current || buyingSlug) return;
    if (!bookingsEnabled) {
      toast({
        title: 'Online bookings are paused',
        description: 'Browse the timetable and register interest. XERT will follow up about your place.',
      });
      return;
    }
    if (!session) {
      toast({ title: 'Sign in to book', description: 'Create a free account, grab a pack, and book in seconds.' });
      navigate('/login');
      return;
    }
    bookLockRef.current = true;
    setBookingId(s.id);
    try {
      const joiningWaitlist = s.spots_left !== null && s.spots_left <= 0;
      if (joiningWaitlist) await joinSessionWaitlist(s.id);
      else await bookSession(s.id);
      const requested = s.booking_mode === 'request_to_book';
      toast({
        title: joiningWaitlist ? 'Waitlist joined' : requested ? 'Booking request sent' : 'Class booked',
        description: joiningWaitlist
          ? `You are on the waitlist for ${s.title || s.class_type}. No class credit has been used.`
          : requested
          ? `${s.title || s.class_type} is awaiting staff confirmation. Your class credit is reserved.`
          : `${s.title || s.class_type} — ${formatDay(s.start_time)} ${formatTime(s.start_time)}`,
      });
      await refresh();
    } catch (e) {
      toast({ title: 'Booking failed', description: e.message, variant: 'destructive' });
    } finally {
      setBookingId(null);
      bookLockRef.current = false;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />

      <main id="main" className="pb-20">
        <PageHeader
          eyebrow="Classes, Programs, Products"
          title={<>Simple booking.<br /></>}
          accent="Structured training."
          intro={pageContent.intro}
          containerClassName="max-w-6xl"
        />

        <div className="max-w-6xl mx-auto px-6">
          {loadErrors.length > 0 && (
            <div role="alert" className="mt-6 border border-xert-red/40 bg-xert-steel/10 p-4 flex flex-wrap items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-xert-red" />
              <div className="flex-1 min-w-[12rem]">
                <p className="font-display text-sm uppercase text-xert-offwhite">Some booking information is unavailable</p>
                <p className="font-body text-xs mt-1 text-xert-concrete/60">{loadErrors.join(' | ')}</p>
              </div>
              <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 px-4 border border-xert-red/40 font-display text-xs uppercase text-xert-offwhite">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          )}

          {/* Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-10">
            {steps.map((step, i) => (
              <div key={step} className="border p-5" style={cardStyle}>
                <p className="font-display text-sm tabular-nums mb-3" style={{ color: '#7BA7BC' }}>STEP {i + 1}</p>
                <p className="font-body text-sm leading-relaxed" style={{ color: 'rgba(209,221,230,0.72)' }}>{step}</p>
              </div>
            ))}
          </div>

          {/* Credits banner for signed-in members */}
          {session && credits && (
            <div className="flex items-center gap-3 border p-4 mt-8"
              style={{ borderColor: credits.total > 0 ? '#7BA7BC' : 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(123,167,188,0.08)' }}>
              <Ticket className="w-5 h-5 shrink-0" style={{ color: '#7BA7BC' }} />
              <p className="font-body text-sm" style={{ color: '#D1DDE6' }}>
                {credits.total > 0
                  ? <>You have <strong>{credits.total}</strong> class credit{credits.total === 1 ? '' : 's'} — pick a class below.</>
                  : <>You have no credits yet — purchase a pack below to start booking.</>}
              </p>
              <Link to="/account" className="ml-auto font-body text-xs uppercase tracking-wider shrink-0" style={{ color: '#7BA7BC' }}>
                My Account
              </Link>
            </div>
          )}

          {/* Packs */}
          <section id="packs" className="mt-12">
            {paymentAvailabilityLoaded && !paymentsEnabled && (
              <div role="status" className="mb-4 flex items-start gap-3 border border-xert-steel/30 bg-xert-steel/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-xert-steel" />
                <div>
                  <p className="font-display text-sm uppercase text-xert-offwhite">Pack purchases are paused</p>
                  <p className="mt-1 font-body text-xs leading-relaxed text-xert-concrete/60">You can still explore packs and the timetable. Secure checkout will reopen after XERT completes its payment launch checks.</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {(loading && products.length === 0 ? [] : products).map(pack => (
                <article key={pack.id} className="relative border p-6 flex flex-col"
                  style={{
                    borderColor: pack.featured ? '#7BA7BC' : 'rgba(123,167,188,0.16)',
                    backgroundColor: pack.featured ? 'rgba(123,167,188,0.12)' : 'rgba(16,24,32,0.64)',
                  }}>
                  {pack.featured && (
                    <span className="absolute top-4 right-4 font-body text-[10px] uppercase tracking-wider px-2 py-1"
                      style={{ backgroundColor: '#D1DDE6', color: '#101820' }}>
                      Most Popular
                    </span>
                  )}
                  <div className="w-11 h-11 flex items-center justify-center mb-5"
                    style={{ backgroundColor: pack.featured ? '#7BA7BC' : 'rgba(123,167,188,0.14)' }}>
                    <Ticket className="w-5 h-5" style={{ color: pack.featured ? '#101820' : '#7BA7BC' }} />
                  </div>
                  <h2 className="font-display text-3xl uppercase text-xert-offwhite leading-none mb-2">{pack.name}</h2>
                  {comingSoon ? (
                    <p className="font-display text-2xl uppercase mb-2" style={{ color: '#7BA7BC' }}>
                      {PRICES_COMING_SOON_LABEL}
                    </p>
                  ) : (
                    <p className="font-display text-4xl uppercase mb-2" style={{ color: '#7BA7BC' }}>
                      {formatPackPrice(pack.price_cents, pack.currency)}
                    </p>
                  )}
                  <p className="font-body text-xs uppercase tracking-wider mb-5" style={{ color: 'rgba(209,221,230,0.45)' }}>
                    {formatPackValidity(pack.validity_days)}
                  </p>
                  {pack.description && (
                    <p className="font-body text-sm leading-relaxed mb-5" style={{ color: 'rgba(209,221,230,0.68)' }}>
                      {pack.description}
                    </p>
                  )}
                  <div className="space-y-3 mb-6 flex-1">
                    <div className="flex items-start gap-3">
                      <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#7BA7BC' }} />
                      <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.62)' }}>
                        {pack.sessions_count} coached session{pack.sessions_count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#7BA7BC' }} />
                      <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.62)' }}>
                        Semi-private coaching environment
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#7BA7BC' }} />
                      <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.62)' }}>
                        Flexible online booking
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleBuy(pack)}
                    disabled={!paymentsEnabled || Boolean(buyingSlug) || Boolean(bookingId)}
                    className={`${pack.featured ? 'xert-btn-primary' : 'xert-btn-ghost'} inline-flex items-center justify-center gap-2 px-5 py-3 font-display text-base uppercase tracking-wide disabled:opacity-60`}>
                    {!paymentsEnabled
                      ? 'Purchases Paused'
                      : buyingSlug === pack.slug
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <>{packCta(pack.slug)}<ArrowRight className="w-4 h-4" /></>}
                  </button>
                </article>
              ))}
            </div>
            {loading && products.length === 0 && (
              <div role="status" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <span className="sr-only">Loading session packs…</span>
                {[0, 1, 2].map(i => (
                  <div key={i} className="border p-6" style={cardStyle}>
                    <Skeleton className="w-11 h-11 mb-5" />
                    <Skeleton className="h-8 w-2/3 mb-3" />
                    <Skeleton className="h-10 w-1/2 mb-5" />
                    <div className="space-y-3 mb-6">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-4/6" />
                    </div>
                    <Skeleton className="h-12 w-full" />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Timetable */}
          <section id="timetable" className="mt-16">
            <h2 className="font-display text-3xl uppercase text-xert-offwhite mb-2">Book A Class</h2>
            <p className="font-body text-sm mb-8" style={{ color: 'rgba(209,221,230,0.55)' }}>
              Booking uses one class credit per session. All sessions are scalable to your current level.
            </p>
            {bookingAvailabilityLoaded && !bookingsEnabled && (
              <div role="status" className="mb-6 flex items-start gap-3 border border-xert-steel/30 bg-xert-steel/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-xert-steel" />
                <div>
                  <p className="font-display text-sm uppercase text-xert-offwhite">Online bookings are paused</p>
                  <p className="mt-1 font-body text-xs leading-relaxed text-xert-concrete/60">
                    Browse the timetable and register interest. XERT will follow up about your place.
                  </p>
                </div>
              </div>
            )}

            {loading ? (
              <div role="status" className="space-y-8">
                <span className="sr-only">Loading the timetable…</span>
                {[0, 1].map(day => (
                  <div key={day}>
                    <Skeleton className="h-6 w-48 mb-3" />
                    <div className="space-y-2">
                      {[0, 1, 2].map(row => (
                        <div key={row} className="border p-4 flex flex-wrap items-center gap-4" style={cardStyle}>
                          <Skeleton className="h-6 w-16 shrink-0" />
                          <div className="flex-1 min-w-[12rem] space-y-2">
                            <Skeleton className="h-5 w-1/2" />
                            <Skeleton className="h-3 w-1/3" />
                          </div>
                          <Skeleton className="h-11 w-28 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : timetableUnavailable ? (
              <div className="border border-xert-red/30 bg-xert-steel/5 p-8 text-center">
                <p className="font-display text-xl uppercase text-xert-offwhite">Timetable temporarily unavailable</p>
                <button type="button" onClick={() => void refresh()} className="mt-4 min-h-11 px-5 border border-xert-steel/40 font-display text-sm uppercase text-xert-offwhite">Try again</button>
              </div>
            ) : sessionsByDay.length === 0 ? (
              <div className="border p-10 text-center" style={cardStyle}>
                <Users className="w-8 h-8 mx-auto mb-4" style={{ color: 'rgba(123,167,188,0.4)' }} />
                <p className="font-display text-2xl uppercase text-xert-offwhite">Timetable opening soon.</p>
                <p className="font-body text-sm mt-2 max-w-md mx-auto" style={{ color: 'rgba(209,221,230,0.55)' }}>
                  Classes for the launch block are being scheduled. Grab a pack now and you&rsquo;ll be ready to book
                  the moment they go live.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {sessionsByDay.map(([day, list]) => (
                  <div key={day}>
                    <h3 className="font-display text-xl uppercase mb-3" style={{ color: 'rgba(209,221,230,0.8)' }}>{day}</h3>
                    <div className="space-y-2">
                      {list.map(s => {
                        const full = s.spots_left !== null && s.spots_left <= 0;
                        const existingBooking = memberBookingsBySession.get(s.id);
                        const isInterestOnly = s.booking_mode === 'interest_only';
                        const isRequest = s.booking_mode === 'request_to_book';
                        const timeConflict = !full && !existingBooking ? bookingTimeConflict(s, myBookings) : null;
                        const actionLabel = classActionLabel({ booking: existingBooking, conflict: timeConflict, full, bookingMode: s.booking_mode });
                        return (
                          <div
                            key={s.id}
                            id={`class-session-${s.id.toLowerCase()}`}
                            tabIndex={-1}
                            className="border p-4 flex flex-wrap items-center gap-4 focus:outline-none focus:ring-2 focus:ring-xert-steel"
                            style={cardStyle}
                          >
                            <p className="font-display text-lg uppercase tabular-nums shrink-0" style={{ color: '#7BA7BC' }}>
                              {formatTime(s.start_time)}
                            </p>
                            <div className="flex-1 min-w-[12rem]">
                              <p className="font-display text-xl uppercase leading-tight text-xert-offwhite">
                                {s.title || s.class_type || 'XERT Class'}
                              </p>
                              <p className="font-body text-xs mt-0.5" style={{ color: 'rgba(209,221,230,0.5)' }}>
                                {[s.coach_name && `Coach ${s.coach_name}`, s.intensity_level, s.duration_minutes && `${s.duration_minutes} min`]
                                  .filter(Boolean).join(' · ')}
                              </p>
                              {isRequest && (
                                <p className="font-body text-xs mt-1" style={{ color: 'rgba(123,167,188,0.7)' }}>
                                  Staff confirmation required
                                </p>
                              )}
                              {timeConflict && (
                                <p id={`booking-conflict-${s.id}`} className="font-body text-xs mt-1 text-xert-red">
                                  Overlaps {timeConflict.title || timeConflict.class_type || 'another active booking'}
                                </p>
                              )}
                            </div>
                            {s.spots_left !== null && (
                              <span className="font-body text-[11px] uppercase tracking-wider px-2 py-1 shrink-0"
                                style={{
                                  backgroundColor: full ? 'rgba(209,221,230,0.15)' : 'rgba(123,167,188,0.16)',
                                  color: full ? 'rgba(209,221,230,0.5)' : '#7BA7BC',
                                }}>
                                {full ? 'Full' : `${s.spots_left} spot${s.spots_left === 1 ? '' : 's'} left`}
                              </span>
                            )}
                            {isInterestOnly || !bookingsEnabled ? (
                              <Link to="/timetable"
                                className="xert-btn-ghost inline-flex items-center justify-center px-5 py-2.5 font-display text-base uppercase tracking-wide shrink-0">
                                Register interest
                              </Link>
                            ) : (
                              <button
                                onClick={() => handleBook(s)}
                                disabled={Boolean(existingBooking) || Boolean(timeConflict) || Boolean(bookingId) || Boolean(buyingSlug)}
                                aria-describedby={timeConflict ? `booking-conflict-${s.id}` : undefined}
                                className="xert-btn-primary inline-flex items-center justify-center px-5 py-2.5 font-display text-base uppercase tracking-wide disabled:opacity-40 shrink-0">
                                {bookingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : actionLabel}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
