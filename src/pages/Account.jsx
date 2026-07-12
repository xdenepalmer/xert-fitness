import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, Loader2, Receipt, Ticket, X } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { getMyCredits, getMyBookings, getMyOrders, cancelBooking, updateMyProfile } from '@/lib/bookingData';
import { cancellationMessage, cancellationReturnsCredit } from '@/lib/bookingCancellation';
import { useToast } from '@/components/ui/use-toast';

function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const cardStyle = { borderColor: 'rgba(123,167,188,0.16)', backgroundColor: 'rgba(50,72,90,0.14)' };

export default function Account() {
  const { session, user, profile, loading: authLoading, signOut } = useSupabaseAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [credits, setCredits] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancellationTarget, setCancellationTarget] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  const purchaseSuccess = searchParams.get('purchase') === 'success';

  const refresh = useCallback(async () => {
    try {
      const [c, b, o] = await Promise.all([getMyCredits(), getMyBookings(), getMyOrders()]);
      setCredits(c);
      setBookings(b);
      setOrders(o);
    } catch (e) {
      toast({ title: 'Could not load your account', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (session) refresh();
  }, [session, refresh]);

  useEffect(() => {
    setProfileForm({
      full_name: profile?.full_name || '',
      phone: profile?.phone || '',
    });
  }, [profile]);

  useEffect(() => {
    if (!cancellationTarget) return undefined;
    const dismissOnEscape = event => {
      if (event.key === 'Escape') setCancellationTarget(null);
    };
    window.addEventListener('keydown', dismissOnEscape);
    return () => window.removeEventListener('keydown', dismissOnEscape);
  }, [cancellationTarget]);

  // After a Stripe purchase the webhook may land a moment after redirect —
  // poll briefly so the new credits appear without a manual refresh.
  useEffect(() => {
    if (!purchaseSuccess || !session) return;
    const timers = [2000, 5000, 10000].map(ms => setTimeout(refresh, ms));
    return () => timers.forEach(clearTimeout);
  }, [purchaseSuccess, session, refresh]);

  const handleCancel = async (booking) => {
    setCancellingId(booking.booking_id);
    try {
      await cancelBooking(booking.booking_id);
      toast({
        title: 'Booking cancelled',
        description: cancellationReturnsCredit(booking)
          ? 'Your class credit has been returned.'
          : 'Cancelled within 12 hours of the class, so the credit was used.',
      });
      await refresh();
    } catch (e) {
      toast({ title: 'Could not cancel', description: e.message, variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
  };

  const confirmCancellation = () => {
    if (!cancellationTarget) return;
    const booking = cancellationTarget;
    setCancellationTarget(null);
    void handleCancel(booking);
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await updateMyProfile({
        full_name: profileForm.full_name.trim() || null,
        phone: profileForm.phone.trim() || null,
      });
      setEditingProfile(false);
      toast({ title: 'Account details saved', description: 'Your contact details are up to date.' });
    } catch (e) {
      toast({ title: 'Could not save account details', description: e.message, variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#101820' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#7BA7BC' }} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
        <PublicNav />
        <main className="max-w-md mx-auto px-6 pt-40 pb-20 text-center">
          <h1 className="font-display text-3xl uppercase text-xert-offwhite mb-3">Sign in to your account</h1>
          <p className="font-body text-sm mb-8" style={{ color: 'rgba(209,221,230,0.6)' }}>
            View your class credits, bookings and purchases.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/login" className="px-6 py-3 font-display text-base uppercase tracking-wide"
              style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
              Log In
            </Link>
            <Link to="/register" className="px-6 py-3 font-display text-base uppercase tracking-wide border"
              style={{ borderColor: 'rgba(123,167,188,0.35)', color: '#D1DDE6' }}>
              Create Account
            </Link>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const now = Date.now();
  const pending = bookings.filter(b => b.status === 'requested' && new Date(b.start_time).getTime() > now);
  const upcoming = bookings.filter(b => b.status === 'confirmed' && new Date(b.start_time).getTime() > now);
  const past = bookings.filter(b => !['requested', 'confirmed'].includes(b.status) || new Date(b.start_time).getTime() <= now);
  const displayName = profileForm.full_name.trim() || user?.email;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />

      <main className="max-w-4xl mx-auto px-6 pt-28 pb-20">
        {purchaseSuccess && (
          <div className="flex items-center gap-3 border p-4 mb-8"
            style={{ borderColor: '#7BA7BC', backgroundColor: 'rgba(123,167,188,0.12)' }}>
            <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#7BA7BC' }} />
            <p className="font-body text-sm" style={{ color: '#D1DDE6' }}>
              Payment received — your class credits are being added now.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
              <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>My Account</span>
            </div>
            <h1 className="font-display uppercase text-xert-offwhite" style={{ fontSize: 'clamp(2rem,5vw,3rem)', lineHeight: 0.95 }}>
              {displayName}
            </h1>
          </div>
          <button onClick={signOut}
            className="font-body text-xs uppercase tracking-wider px-4 py-2 border transition-colors"
            style={{ borderColor: 'rgba(123,167,188,0.3)', color: 'rgba(209,221,230,0.6)' }}>
            Sign Out
          </button>
        </div>

        {/* Member details */}
        <section className="mb-10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-display text-2xl uppercase" style={{ color: 'rgba(209,221,230,0.85)' }}>
              Account Details
            </h2>
            {!editingProfile && (
              <button onClick={() => setEditingProfile(true)}
                className="font-body text-xs uppercase tracking-wider px-3 py-2 border transition-colors"
                style={{ borderColor: 'rgba(123,167,188,0.3)', color: '#7BA7BC' }}>
                Edit
              </button>
            )}
          </div>

          {editingProfile ? (
            <form onSubmit={handleProfileSave} className="border p-5" style={cardStyle}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="font-body text-xs uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.55)' }}>
                  Full name
                  <input value={profileForm.full_name}
                    onChange={e => setProfileForm(current => ({ ...current, full_name: e.target.value }))}
                    autoComplete="name"
                    className="block w-full mt-2 px-3 py-2.5 border bg-transparent font-body text-sm text-xert-offwhite focus:outline-none"
                    style={{ borderColor: 'rgba(123,167,188,0.3)' }} />
                </label>
                <label className="font-body text-xs uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.55)' }}>
                  Mobile number
                  <input value={profileForm.phone}
                    onChange={e => setProfileForm(current => ({ ...current, phone: e.target.value }))}
                    autoComplete="tel"
                    inputMode="tel"
                    className="block w-full mt-2 px-3 py-2.5 border bg-transparent font-body text-sm text-xert-offwhite focus:outline-none"
                    style={{ borderColor: 'rgba(123,167,188,0.3)' }} />
                </label>
              </div>
              <div className="flex flex-wrap justify-end gap-3 mt-5">
                <button type="button" onClick={() => { setEditingProfile(false); setProfileForm({ full_name: profile?.full_name || '', phone: profile?.phone || '' }); }}
                  className="px-4 py-2.5 font-body text-xs uppercase tracking-wider border"
                  style={{ borderColor: 'rgba(123,167,188,0.3)', color: 'rgba(209,221,230,0.6)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={savingProfile}
                  className="px-4 py-2.5 font-display text-sm uppercase disabled:opacity-50"
                  style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
                  {savingProfile ? 'Saving...' : 'Save details'}
                </button>
              </div>
            </form>
          ) : (
            <div className="border p-5 grid grid-cols-1 sm:grid-cols-2 gap-5" style={cardStyle}>
              <div>
                <p className="font-body text-[11px] uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.4)' }}>Email</p>
                <p className="font-body text-sm mt-1" style={{ color: '#D1DDE6' }}>{user?.email}</p>
              </div>
              <div>
                <p className="font-body text-[11px] uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.4)' }}>Mobile</p>
                <p className="font-body text-sm mt-1" style={{ color: '#D1DDE6' }}>{profileForm.phone || 'Not provided'}</p>
              </div>
            </div>
          )}
        </section>

        {/* Credits */}
        <section className="mb-10">
          <div className="border p-6 flex flex-col sm:flex-row sm:items-center gap-6" style={cardStyle}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 flex items-center justify-center shrink-0" style={{ backgroundColor: '#7BA7BC' }}>
                <Ticket className="w-6 h-6" style={{ color: '#101820' }} />
              </div>
              <div>
                <p className="font-display text-4xl uppercase leading-none text-xert-offwhite">
                  {loading ? '—' : credits?.total ?? 0}
                </p>
                <p className="font-body text-xs uppercase tracking-wider mt-1" style={{ color: 'rgba(209,221,230,0.5)' }}>
                  Class credits available
                </p>
              </div>
            </div>
            <div className="sm:ml-auto flex flex-wrap items-center gap-3">
              {!loading && credits?.batches?.length > 0 && (
                <p className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.45)' }}>
                  Next expiry: {formatDate(credits.batches[0].expires_at)}
                </p>
              )}
              <Link to="/booking" className="px-5 py-3 font-display text-base uppercase tracking-wide"
                style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
                {credits?.total > 0 ? 'Book A Class' : 'Buy A Pack'}
              </Link>
            </div>
          </div>
        </section>

        {/* Pending booking requests */}
        {pending.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-2xl uppercase mb-4" style={{ color: 'rgba(209,221,230,0.85)' }}>
              Awaiting Confirmation
            </h2>
            <div className="space-y-3">
              {pending.map(b => (
                <div key={b.booking_id} className="border p-5 flex flex-wrap items-center gap-4" style={cardStyle}>
                  <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(123,167,188,0.14)' }}>
                    <Clock className="w-5 h-5" style={{ color: '#7BA7BC' }} />
                  </div>
                  <div className="flex-1 min-w-[12rem]">
                    <p className="font-display text-xl uppercase leading-tight text-xert-offwhite">
                      {b.title || b.class_type || 'XERT Class'}
                    </p>
                    <p className="font-body text-sm mt-0.5" style={{ color: 'rgba(209,221,230,0.6)' }}>
                      {formatDateTime(b.start_time)}
                      {b.coach_name ? ` · Coach ${b.coach_name}` : ''}
                    </p>
                    <p className="font-body text-xs mt-1" style={{ color: 'rgba(123,167,188,0.75)' }}>
                      Your credit is reserved while XERT reviews this request.
                    </p>
                  </div>
                  <button
                    onClick={() => setCancellationTarget(b)}
                    disabled={cancellingId === b.booking_id}
                    className="inline-flex items-center gap-1.5 font-body text-xs uppercase tracking-wider px-3 py-2 border transition-colors disabled:opacity-50"
                    style={{ borderColor: 'rgba(123,167,188,0.3)', color: 'rgba(209,221,230,0.6)' }}>
                    {cancellingId === b.booking_id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <X className="w-3.5 h-3.5" />}
                    Cancel request
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming bookings */}
        <section className="mb-10">
          <h2 className="font-display text-2xl uppercase mb-4" style={{ color: 'rgba(209,221,230,0.85)' }}>
            Upcoming Classes
          </h2>
          {loading ? (
            <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.5)' }}>Loading…</p>
          ) : upcoming.length === 0 ? (
            <div className="border p-6" style={cardStyle}>
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.55)' }}>
                No upcoming classes booked.{' '}
                <Link to="/booking" style={{ color: '#7BA7BC' }}>Browse the timetable</Link> to book your next session.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map(b => (
                <div key={b.booking_id} className="border p-5 flex flex-wrap items-center gap-4" style={cardStyle}>
                  <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(123,167,188,0.14)' }}>
                    <CalendarDays className="w-5 h-5" style={{ color: '#7BA7BC' }} />
                  </div>
                  <div className="flex-1 min-w-[12rem]">
                    <p className="font-display text-xl uppercase leading-tight text-xert-offwhite">
                      {b.title || b.class_type || 'XERT Class'}
                    </p>
                    <p className="font-body text-sm mt-0.5" style={{ color: 'rgba(209,221,230,0.6)' }}>
                      {formatDateTime(b.start_time)}
                      {b.coach_name ? ` · Coach ${b.coach_name}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setCancellationTarget(b)}
                    disabled={cancellingId === b.booking_id}
                    className="inline-flex items-center gap-1.5 font-body text-xs uppercase tracking-wider px-3 py-2 border transition-colors disabled:opacity-50"
                    style={{ borderColor: 'rgba(123,167,188,0.3)', color: 'rgba(209,221,230,0.6)' }}>
                    {cancellingId === b.booking_id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <X className="w-3.5 h-3.5" />}
                    Cancel
                  </button>
                </div>
              ))}
              <p className="font-body text-xs flex items-center gap-1.5" style={{ color: 'rgba(209,221,230,0.4)' }}>
                <Clock className="w-3.5 h-3.5" />
                Cancel more than 12 hours before class and your credit is returned automatically.
              </p>
            </div>
          )}
        </section>

        {/* Purchase history */}
        <section className="mb-10">
          <h2 className="font-display text-2xl uppercase mb-4" style={{ color: 'rgba(209,221,230,0.85)' }}>
            Purchases
          </h2>
          {loading ? (
            <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.5)' }}>Loading…</p>
          ) : orders.length === 0 ? (
            <div className="border p-6" style={cardStyle}>
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.55)' }}>No purchases yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map(o => (
                <div key={o.id} className="border p-4 flex items-center gap-4" style={cardStyle}>
                  <Receipt className="w-4 h-4 shrink-0" style={{ color: '#7BA7BC' }} />
                  <p className="font-body text-sm flex-1" style={{ color: 'rgba(209,221,230,0.7)' }}>
                    {o.products?.name || 'Session pack'}
                  </p>
                  <p className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.45)' }}>{formatDate(o.paid_at || o.created_at)}</p>
                  <p className="font-display text-lg uppercase" style={{ color: '#7BA7BC' }}>
                    ${((o.amount_cents || 0) / 100).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Past classes */}
        {past.length > 0 && (
          <section>
            <h2 className="font-display text-2xl uppercase mb-4" style={{ color: 'rgba(209,221,230,0.85)' }}>
              Past &amp; Cancelled
            </h2>
            <div className="space-y-2">
              {past.slice(0, 10).map(b => (
                <div key={b.booking_id} className="border p-4 flex items-center gap-4 opacity-70" style={cardStyle}>
                  <p className="font-body text-sm flex-1" style={{ color: 'rgba(209,221,230,0.6)' }}>
                    {b.title || b.class_type || 'XERT Class'}
                  </p>
                  <p className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.4)' }}>{formatDateTime(b.start_time)}</p>
                  <span className="font-body text-[10px] uppercase tracking-wider px-2 py-1"
                    style={{ backgroundColor: 'rgba(123,167,188,0.14)', color: 'rgba(209,221,230,0.55)' }}>
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <PublicFooter />
      {cancellationTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="cancel-booking-title" aria-describedby="cancel-booking-description" onMouseDown={event => { if (event.target === event.currentTarget) setCancellationTarget(null); }}>
          <div className="w-full max-w-md border p-6" style={{ borderColor: 'rgba(123,167,188,0.3)', backgroundColor: '#101820' }}>
            <h2 id="cancel-booking-title" className="font-display text-2xl uppercase text-xert-offwhite">Cancel booking?</h2>
            <p id="cancel-booking-description" className="font-body text-sm leading-relaxed mt-3" style={{ color: 'rgba(209,221,230,0.68)' }}>
              {cancellationMessage(cancellationTarget)}
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6">
              <button type="button" autoFocus onClick={() => setCancellationTarget(null)}
                className="px-4 py-2.5 border font-body text-xs uppercase tracking-wider transition-colors"
                style={{ borderColor: 'rgba(123,167,188,0.3)', color: 'rgba(209,221,230,0.65)' }}>
                Keep booking
              </button>
              <button type="button" onClick={confirmCancellation}
                className="px-4 py-2.5 font-body text-xs uppercase tracking-wider transition-colors"
                style={{ backgroundColor: '#c94e44', color: '#fff' }}>
                Cancel booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
