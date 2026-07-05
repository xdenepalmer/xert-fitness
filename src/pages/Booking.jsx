import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Loader2, Ticket, Users } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import {
  getProducts, startCheckout, getAvailableSessions, bookSession, getMyCredits,
} from '@/lib/bookingData';
import { useToast } from '@/components/ui/use-toast';
import { useSiteContent } from '@/lib/siteContent';
import { BOOKING_DEFAULTS } from '@/lib/contentDefaults';

const steps = [
  'Purchase a session pack.',
  'Book your sessions online.',
  'Train with expert coaching in a structured semi-private environment.',
];

const PACK_CTAS = {
  'single': 'Book A Session',
  'starter-4': 'Start Your Training Block',
  'performance-10': 'Commit To Your Training',
};

const cardStyle = { borderColor: 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(50,72,90,0.14)' };

function validityLabel(days) {
  if (!days) return '';
  const weeks = Math.round(days / 7);
  return `Use within ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
}

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
  const pageContent = useSiteContent('booking', BOOKING_DEFAULTS);

  const [products, setProducts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buyingSlug, setBuyingSlug] = useState(null);
  const [bookingId, setBookingId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [prods, sess, creds] = await Promise.all([
        getProducts(),
        getAvailableSessions(),
        session ? getMyCredits() : Promise.resolve(null),
      ]);
      setProducts(prods);
      setSessions(sess);
      setCredits(creds);
    } catch (e) {
      toast({ title: 'Could not load booking data', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
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

  const handleBuy = async (product) => {
    if (!session) {
      toast({ title: 'Create an account first', description: 'Sign in or register to purchase a pack — your credits are stored on your account.' });
      navigate('/register');
      return;
    }
    setBuyingSlug(product.slug);
    try {
      await startCheckout(product.slug); // redirects on success
    } catch (e) {
      toast({ title: 'Checkout unavailable', description: e.message, variant: 'destructive' });
      setBuyingSlug(null);
    }
  };

  const handleBook = async (s) => {
    if (!session) {
      toast({ title: 'Sign in to book', description: 'Create a free account, grab a pack, and book in seconds.' });
      navigate('/login');
      return;
    }
    setBookingId(s.id);
    try {
      await bookSession(s.id);
      toast({ title: 'Class booked ✔', description: `${s.title || s.class_type} — ${formatDay(s.start_time)} ${formatTime(s.start_time)}` });
      await refresh();
    } catch (e) {
      toast({ title: 'Booking failed', description: e.message, variant: 'destructive' });
    } finally {
      setBookingId(null);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />

      <main className="pt-28 pb-20">
        <div className="max-w-6xl mx-auto px-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
            <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>
              Classes, Programs, Products
            </span>
          </div>
          <h1 className="font-display uppercase text-xert-offwhite" style={{ fontSize: 'clamp(2.5rem,7vw,4.5rem)', lineHeight: 0.95 }}>
            Simple booking.<br />
            <span style={{ color: '#7BA7BC' }}>Structured training.</span>
          </h1>
          <p className="font-body leading-relaxed max-w-2xl mt-6" style={{ color: 'rgba(209,221,230,0.72)' }}>
            {pageContent.intro}
          </p>

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
                  <p className="font-display text-4xl uppercase mb-2" style={{ color: '#7BA7BC' }}>
                    ${(pack.price_cents / 100).toFixed(2)}
                  </p>
                  <p className="font-body text-xs uppercase tracking-wider mb-5" style={{ color: 'rgba(209,221,230,0.45)' }}>
                    {validityLabel(pack.validity_days)}
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
                    disabled={buyingSlug === pack.slug}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 font-display text-base uppercase tracking-wide transition-all active:scale-[0.98] disabled:opacity-60"
                    style={{
                      backgroundColor: pack.featured ? '#7BA7BC' : 'transparent',
                      color: pack.featured ? '#101820' : '#D1DDE6',
                      border: pack.featured ? '1px solid #7BA7BC' : '1px solid rgba(123,167,188,0.35)',
                    }}>
                    {buyingSlug === pack.slug
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <>{PACK_CTAS[pack.slug] || 'Buy Pack'}<ArrowRight className="w-4 h-4" /></>}
                  </button>
                </article>
              ))}
            </div>
            {loading && products.length === 0 && (
              <p className="font-body text-sm mt-4" style={{ color: 'rgba(209,221,230,0.5)' }}>Loading session packs…</p>
            )}
          </section>

          {/* Timetable */}
          <section id="timetable" className="mt-16">
            <h2 className="font-display text-3xl uppercase text-xert-offwhite mb-2">Book A Class</h2>
            <p className="font-body text-sm mb-8" style={{ color: 'rgba(209,221,230,0.55)' }}>
              Booking uses one class credit per session. All sessions are scalable to your current level.
            </p>

            {loading ? (
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.5)' }}>Loading the timetable…</p>
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
                        return (
                          <div key={s.id} className="border p-4 flex flex-wrap items-center gap-4" style={cardStyle}>
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
                            <button
                              onClick={() => handleBook(s)}
                              disabled={full || bookingId === s.id}
                              className="px-5 py-2.5 font-display text-base uppercase tracking-wide transition-all active:scale-[0.98] disabled:opacity-40 shrink-0"
                              style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
                              {bookingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : full ? 'Full' : 'Book'}
                            </button>
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
