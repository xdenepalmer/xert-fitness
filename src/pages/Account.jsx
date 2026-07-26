import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BellRing, CalendarDays, CheckCircle2, Clock, Dumbbell, Loader2, Receipt, Target, Ticket, X } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { dismissMemberAnnouncement, getMemberAnnouncements, getMyCredits, getMyBookings, getMyEventGoals, getMyOrders, getMyPrivateSessionRequests, cancelBooking, removeMyEventGoal, updateMyProfile } from '@/lib/bookingData';
import { cancellationMessage, cancellationReturnsCredit } from '@/lib/bookingCancellation';
import { partitionAccountBookings } from '@/lib/accountBookings';
import { summarizeExpiringCredits } from '@/lib/creditExpiry';
import { announcementAction } from '@/lib/memberAnnouncements';
import {
  clearPendingWebCheckout,
  loadPendingWebCheckout,
  pendingWebCheckoutForReturn,
  WEB_CHECKOUT_RETRY_DELAYS_MS,
  webCheckoutSettlement,
} from '@/lib/webCheckoutRecovery';
import { useToast } from '@/components/ui/use-toast';
import { deleteMyAccount } from '@/lib/accountData';

function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function privateSessionStatus(status) {
  const labels = {
    requested: 'Awaiting review',
    approved: 'Approved',
    reschedule_requested: 'Scheduling follow-up',
    declined: 'Declined',
    completed: 'Completed',
    cancelled: 'Cancelled'
  };
  return labels[status] || String(status || 'requested').replace(/_/g, ' ');
}

const cardStyle = {
  borderColor: 'rgba(123,167,188,0.16)',
  backgroundColor: 'rgba(50,72,90,0.14)'
};

export default function Account() {
  const { session, user, profile, loading: authLoading, signOut } = useSupabaseAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [credits, setCredits] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [eventGoals, setEventGoals] = useState([]);
  const [privateSessionRequests, setPrivateSessionRequests] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [dismissingAnnouncementId, setDismissingAnnouncementId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLoadedAccount, setHasLoadedAccount] = useState(false);
  const [loadedAccountUserId, setLoadedAccountUserId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [cancellationTarget, setCancellationTarget] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '' });
  // applySession runs for every auth event (token refresh, refocus) and hands us
  // a fresh profile identity. A ref lets the sync effect skip in-progress edits
  // without re-seeding the form when editing simply toggles off.
  const editingProfileRef = useRef(editingProfile);
  editingProfileRef.current = editingProfile;
  const [savingProfile, setSavingProfile] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const expiringCredits = useMemo(() => summarizeExpiringCredits(credits?.batches), [credits]);

  const purchaseSuccess = searchParams.get('purchase') === 'success';
  const [purchaseStatus, setPurchaseStatus] = useState(purchaseSuccess ? 'confirming' : null);
  const [purchaseRefreshKey, setPurchaseRefreshKey] = useState(0);
  const commerceRequestIDRef = useRef(0);

  const refresh = useCallback(async () => {
    const commerceRequestID = ++commerceRequestIDRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const [c, b, o, goals, ptRequests, memberNotices] = await Promise.all([
        getMyCredits(),
        getMyBookings(),
        getMyOrders(),
        // Event goals ship as an additive migration. Do not make the rest of
        // the member account unavailable while an existing install catches up.
        getMyEventGoals().catch(() => []),
        // PT tracking is additive for existing Supabase installs.
        getMyPrivateSessionRequests().catch(() => []),
        // Member notices are additive and must never block account essentials.
        getMemberAnnouncements().catch(() => []),
      ]);
      if (commerceRequestID === commerceRequestIDRef.current) {
        setCredits(c);
        setOrders(o);
      }
      setBookings(b);
      setEventGoals(goals);
      setPrivateSessionRequests(ptRequests);
      setAnnouncements(memberNotices);
      setLoadedAccountUserId(user?.id || '');
      setHasLoadedAccount(true);
    } catch (e) {
      setLoadError(e.message || 'Your account data could not be reached.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (session) refresh();
  }, [session, refresh]);

  const handleDismissAnnouncement = async announcement => {
    setDismissingAnnouncementId(announcement.id);
    try {
      await dismissMemberAnnouncement(announcement.id);
      setAnnouncements(current => current.filter(item => item.id !== announcement.id));
    } catch (error) {
      toast({ title: 'Notice not dismissed', description: error.message, variant: 'destructive' });
    } finally {
      setDismissingAnnouncementId(null);
    }
  };

  useEffect(() => {
    if (editingProfileRef.current) return;
    setProfileForm({
      full_name: profile?.full_name || '',
      phone: profile?.phone || ''
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

  useEffect(() => {
    if (!purchaseSuccess || !session || !user?.id) return undefined;
    let cancelled = false;
    let timeoutID;
    const pending = pendingWebCheckoutForReturn({
      userID: user.id,
      checkoutSessionID: searchParams.get('checkout_session_id'),
      storedPending: loadPendingWebCheckout(user.id),
    });
    const commerceRequestID = ++commerceRequestIDRef.current;
    setPurchaseStatus('confirming');

    const reconcile = async () => {
      for (const delay of WEB_CHECKOUT_RETRY_DELAYS_MS) {
        if (delay > 0) {
          await new Promise(resolve => { timeoutID = window.setTimeout(resolve, delay); });
        }
        if (cancelled) return;
        try {
          const [loadedCredits, loadedOrders] = await Promise.all([getMyCredits(), getMyOrders()]);
          if (cancelled) return;
          if (commerceRequestID === commerceRequestIDRef.current) {
            setCredits(loadedCredits);
            setOrders(loadedOrders);
          }
          const settlement = webCheckoutSettlement(pending, loadedOrders);
          if (settlement !== 'pending') {
            clearPendingWebCheckout();
            setPurchaseStatus(settlement);
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('purchase');
            nextParams.delete('checkout_session_id');
            setSearchParams(nextParams, { replace: true });
            return;
          }
        } catch {
          // The bounded retry loop keeps account data usable during a transient read failure.
        }
      }
      if (!cancelled) setPurchaseStatus('delayed');
    };

    void reconcile();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutID);
    };
  }, [purchaseRefreshKey, purchaseSuccess, searchParams, session, setSearchParams, user?.id]);

  const handleCancel = async booking => {
    setCancellingId(booking.booking_id);
    try {
      await cancelBooking(booking.booking_id);
      toast({
        title: 'Booking cancelled',
        description: booking.status === 'waitlisted'
          ? 'You have been removed from the waitlist.'
          : cancellationReturnsCredit(booking)
            ? 'Your class credit has been returned.'
            : 'Cancelled within 12 hours of the class, so the credit was used.'
      });
      await refresh();
    } catch (e) {
      toast({
        title: 'Could not cancel',
        description: e.message,
        variant: 'destructive'
      });
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

  const handleProfileSave = async event => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await updateMyProfile({
        full_name: profileForm.full_name.trim() || null,
        phone: profileForm.phone.trim() || null
      });
      setEditingProfile(false);
      toast({
        title: 'Account details saved',
        description: 'Your contact details are up to date.'
      });
    } catch (e) {
      toast({
        title: 'Could not save account details',
        description: e.message,
        variant: 'destructive'
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRemoveEventGoal = async goal => {
    try {
      await removeMyEventGoal(goal.event_id);
      setEventGoals(current => current.filter(item => item.event_id !== goal.event_id));
      toast({
        title: 'Training goal removed',
        description: `${goal.events?.name || 'This event'} has been removed from your account.`
      });
    } catch (e) {
      toast({
        title: 'Could not remove training goal',
        description: e.message,
        variant: 'destructive'
      });
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await deleteMyAccount(session?.access_token);
      setShowDeleteAccount(false);
      toast({ title: 'Account deleted', description: 'Your XERT member account has been permanently removed.' });
    } catch (error) {
      toast({ title: 'Could not delete account', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingAccount(false);
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
        <main id="main" className="max-w-md mx-auto px-6 pt-40 pb-20 text-center">
          <h1 className="font-display text-3xl uppercase text-xert-offwhite mb-3">Sign in to your account</h1>
          <p className="font-body text-sm mb-8" style={{ color: 'rgba(209,221,230,0.6)' }}>
            View your class credits, bookings and purchases.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/login" className="px-6 py-3 font-display text-base uppercase tracking-wide" style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
              Log In
            </Link>
            <Link
              to="/register"
              className="px-6 py-3 font-display text-base uppercase tracking-wide border"
              style={{
                borderColor: 'rgba(123,167,188,0.35)',
                color: '#D1DDE6'
              }}
            >
              Create Account
            </Link>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const { pending, upcoming, history: past } = partitionAccountBookings(bookings);
  const displayName = profileForm.full_name.trim() || user?.email;
  const accountReady = hasLoadedAccount && loadedAccountUserId === user?.id;
  const firstLoadFailed = !accountReady && Boolean(loadError);
  const initialAccountLoad = !accountReady && !loadError;
  const unavailableMessage = (
    <p className="font-body text-sm" role="status" style={{ color: '#e0b36a' }}>
      Account data unavailable. Retry above to check again.
    </p>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101820' }}>
      <PublicNav />

      <main id="main" className="max-w-4xl mx-auto px-6 pt-28 pb-20">
        {loadError && (
          <div
            className="mb-8 flex flex-col gap-3 border border-[#e0b36a]/50 bg-[#e0b36a]/10 p-4 sm:flex-row sm:items-center"
            role="alert"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-[#e0b36a]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-body text-sm font-semibold text-xert-offwhite">Could not refresh your account</p>
              <p className="mt-1 break-words font-body text-xs text-xert-pale/70">{loadError}</p>
              {hasLoadedAccount && (
                <p className="mt-1 font-body text-xs text-xert-pale/70">Your previously loaded details are still shown below.</p>
              )}
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="inline-flex min-h-11 shrink-0 items-center justify-center border border-[#e0b36a]/60 px-4 font-display text-sm uppercase text-xert-offwhite disabled:opacity-50"
            >
              {loading ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
        {purchaseStatus && (
          <div
            className="flex flex-wrap items-center gap-3 border p-4 mb-8"
            role="status"
            aria-live="polite"
            style={{
              borderColor: purchaseStatus === 'failed' || purchaseStatus === 'refunded' ? '#e0b36a' : '#7BA7BC',
              backgroundColor: purchaseStatus === 'failed' || purchaseStatus === 'refunded'
                ? 'rgba(224,179,106,0.1)'
                : 'rgba(123,167,188,0.12)'
            }}
          >
            {purchaseStatus === 'confirming'
              ? <Loader2 className="w-5 h-5 shrink-0 animate-spin" style={{ color: '#7BA7BC' }} />
              : purchaseStatus === 'confirmed'
                ? <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#7BA7BC' }} />
                : <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: '#e0b36a' }} />}
            <p className="font-body text-sm flex-1 min-w-[14rem]" style={{ color: '#D1DDE6' }}>
              {purchaseStatus === 'confirming' && 'Payment received — confirming your session pack now.'}
              {purchaseStatus === 'confirmed' && 'Payment confirmed — your session pack is ready.'}
              {purchaseStatus === 'refunded' && 'This payment was refunded. No purchased credits remain on the order.'}
              {purchaseStatus === 'failed' && 'Checkout did not complete. No session pack was activated.'}
              {purchaseStatus === 'delayed' && 'Confirmation is taking longer than usual. Your payment record remains safe.'}
            </p>
            {purchaseStatus === 'delayed' && (
              <button
                type="button"
                onClick={() => setPurchaseRefreshKey(value => value + 1)}
                className="min-h-11 px-4 border border-xert-steel/40 font-display text-sm uppercase text-xert-offwhite"
              >
                Check again
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-6" style={{ backgroundColor: '#7BA7BC' }} />
              <span className="font-body text-xs uppercase tracking-[0.2em]" style={{ color: '#7BA7BC' }}>
                My Account
              </span>
            </div>
            <h1 className="font-display uppercase text-xert-offwhite" style={{ fontSize: 'clamp(2rem,5vw,3rem)', lineHeight: 0.95 }}>
              {displayName}
            </h1>
          </div>
          <button
            onClick={signOut}
            className="font-body text-xs uppercase tracking-wider px-4 py-2 border transition-colors"
            style={{
              borderColor: 'rgba(123,167,188,0.3)',
              color: 'rgba(209,221,230,0.6)'
            }}
          >
            Sign Out
          </button>
        </div>

        {accountReady && announcements.length > 0 && (
          <section id="notices" className="mb-10 scroll-mt-32" aria-labelledby="member-notices-title">
            <div className="mb-4 flex items-center gap-2">
              <BellRing className="h-5 w-5 text-xert-steel" aria-hidden="true" />
              <h2 id="member-notices-title" className="font-display text-2xl uppercase text-xert-offwhite">Member Notices</h2>
            </div>
            <div className="space-y-3">
              {announcements.map(notice => {
                const action = announcementAction(notice);
                const tone = notice.tone === 'urgent'
                  ? { border: 'rgba(201,78,68,0.55)', label: 'Urgent', color: '#f0a1a1' }
                  : notice.tone === 'action'
                    ? { border: 'rgba(224,179,106,0.5)', label: 'Action requested', color: '#e0b36a' }
                    : { border: 'rgba(123,167,188,0.4)', label: 'Update', color: '#7BA7BC' };
                return (
                  <article key={notice.id} className="border bg-xert-ink p-5" style={{ borderColor: tone.border }}>
                    <div className="flex items-start justify-between gap-4">
                      <p className="font-body text-[10px] uppercase tracking-[0.18em]" style={{ color: tone.color }}>{tone.label}</p>
                      <button type="button" onClick={() => void handleDismissAnnouncement(notice)} disabled={dismissingAnnouncementId === notice.id} title="Dismiss notice" aria-label={'Dismiss ' + notice.title} className="min-w-11 min-h-11 -mr-2 -mt-2 inline-flex items-center justify-center text-xert-pale/50 hover:text-xert-offwhite disabled:opacity-40">
                        {dismissingAnnouncementId === notice.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      </button>
                    </div>
                    <h3 className="mt-2 font-display text-xl uppercase text-xert-offwhite">{notice.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap font-body text-sm leading-relaxed text-xert-pale/70">{notice.body}</p>
                    {action && (action.external ? (
                      <a href={action.href} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center bg-xert-steel px-4 font-display text-sm uppercase text-xert-navy">{action.label}</a>
                    ) : (
                      <Link to={action.href} className="mt-4 inline-flex min-h-11 items-center bg-xert-steel px-4 font-display text-sm uppercase text-xert-navy">{action.label}</Link>
                    ))}
                    {notice.expires_at && <p className="mt-3 font-body text-xs text-xert-pale/40">Available until {formatDateTime(notice.expires_at)}</p>}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Member details */}
        <section className="mb-10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-display text-2xl uppercase" style={{ color: 'rgba(209,221,230,0.85)' }}>
              Account Details
            </h2>
            {!editingProfile && (
              <button
                onClick={() => setEditingProfile(true)}
                className="font-body text-xs uppercase tracking-wider px-3 py-2 border transition-colors"
                style={{
                  borderColor: 'rgba(123,167,188,0.3)',
                  color: '#7BA7BC'
                }}
              >
                Edit
              </button>
            )}
          </div>

          {editingProfile ? (
            <form onSubmit={handleProfileSave} className="border p-5" style={cardStyle}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="font-body text-xs uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.55)' }}>
                  Full name
                  <input
                    value={profileForm.full_name}
                    onChange={e =>
                      setProfileForm(current => ({
                        ...current,
                        full_name: e.target.value
                      }))
                    }
                    autoComplete="name"
                    className="block w-full mt-2 px-3 py-2.5 border bg-transparent font-body text-sm text-xert-offwhite focus:outline-none"
                    style={{ borderColor: 'rgba(123,167,188,0.3)' }}
                  />
                </label>
                <label className="font-body text-xs uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.55)' }}>
                  Mobile number
                  <input
                    value={profileForm.phone}
                    onChange={e =>
                      setProfileForm(current => ({
                        ...current,
                        phone: e.target.value
                      }))
                    }
                    autoComplete="tel"
                    inputMode="tel"
                    className="block w-full mt-2 px-3 py-2.5 border bg-transparent font-body text-sm text-xert-offwhite focus:outline-none"
                    style={{ borderColor: 'rgba(123,167,188,0.3)' }}
                  />
                </label>
              </div>
              <div className="flex flex-wrap justify-end gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingProfile(false);
                    setProfileForm({
                      full_name: profile?.full_name || '',
                      phone: profile?.phone || ''
                    });
                  }}
                  className="px-4 py-2.5 font-body text-xs uppercase tracking-wider border"
                  style={{
                    borderColor: 'rgba(123,167,188,0.3)',
                    color: 'rgba(209,221,230,0.6)'
                  }}
                >
                  Cancel
                </button>
                <button type="submit" disabled={savingProfile} className="px-4 py-2.5 font-display text-sm uppercase disabled:opacity-50" style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
                  {savingProfile ? 'Saving...' : 'Save details'}
                </button>
              </div>
            </form>
          ) : (
            <div className="border p-5 grid grid-cols-1 sm:grid-cols-2 gap-5" style={cardStyle}>
              <div>
                <p className="font-body text-[11px] uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.4)' }}>
                  Email
                </p>
                <p className="font-body text-sm mt-1" style={{ color: '#D1DDE6' }}>
                  {user?.email}
                </p>
              </div>
              <div>
                <p className="font-body text-[11px] uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.4)' }}>
                  Mobile
                </p>
                <p className="font-body text-sm mt-1" style={{ color: '#D1DDE6' }}>
                  {profileForm.phone || 'Not provided'}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Credits */}
        <section className="mb-10">
          {accountReady && expiringCredits && (
            <div role="status" className="mb-3 flex flex-wrap items-center gap-3 border border-[#e0b36a]/50 bg-[#e0b36a]/10 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-[#e0b36a]" aria-hidden="true" />
              <p className="min-w-0 flex-1 font-body text-sm text-xert-pale">
                {expiringCredits.credits} class credit{expiringCredits.credits === 1 ? '' : 's'} expire{expiringCredits.credits === 1 ? 's' : ''} in {expiringCredits.daysRemaining} day{expiringCredits.daysRemaining === 1 ? '' : 's'}, on {formatDate(expiringCredits.expiresAt)}.
              </p>
              <Link to="/booking" className="inline-flex min-h-11 items-center px-4 font-display text-sm uppercase text-xert-navy bg-[#e0b36a]">
                Book A Class
              </Link>
            </div>
          )}
          <div className="border p-6 flex flex-col sm:flex-row sm:items-center gap-6" style={cardStyle}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 flex items-center justify-center shrink-0" style={{ backgroundColor: '#7BA7BC' }}>
                <Ticket className="w-6 h-6" style={{ color: '#101820' }} />
              </div>
              <div>
                <p className="font-display text-4xl uppercase leading-none text-xert-offwhite">{initialAccountLoad || firstLoadFailed ? '—' : (credits?.total ?? 0)}</p>
                <p className="font-body text-xs uppercase tracking-wider mt-1" style={{ color: 'rgba(209,221,230,0.5)' }}>
                  Class credits available
                </p>
              </div>
            </div>
            <div className="sm:ml-auto flex flex-wrap items-center gap-3">
              {accountReady && !loading && credits?.batches?.some(batch => batch.expires_at) && (
                <p className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.45)' }}>
                  Next expiry: {formatDate(credits.batches.find(batch => batch.expires_at)?.expires_at)}
                </p>
              )}
              <Link to="/booking" className="px-5 py-3 font-display text-base uppercase tracking-wide" style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
                {accountReady && credits?.total > 0 ? 'Book A Class' : 'Buy A Pack'}
              </Link>
            </div>
          </div>
        </section>

        {/* Event goals */}
        <section id="goals" className="mb-10 scroll-mt-32">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-display text-2xl uppercase" style={{ color: 'rgba(209,221,230,0.85)' }}>
              Training Goals
            </h2>
            <Link to="/events" className="font-body text-xs uppercase tracking-wider" style={{ color: '#7BA7BC' }}>
              Explore events
            </Link>
          </div>
          {initialAccountLoad ? (
            <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.5)' }}>
              Loading goals…
            </p>
          ) : firstLoadFailed ? (
            unavailableMessage
          ) : eventGoals.length === 0 ? (
            <div className="border p-6 flex flex-wrap items-center gap-4" style={cardStyle}>
              <Target className="w-5 h-5" style={{ color: '#7BA7BC' }} />
              <p className="font-body text-sm flex-1" style={{ color: 'rgba(209,221,230,0.55)' }}>
                Choose an event and make it part of your XERT training plan.
              </p>
              <Link to="/events" className="font-display text-sm uppercase px-4 py-2.5" style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
                Choose an event
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {eventGoals.map(goal => {
                const event = goal.events;
                return (
                  <div key={goal.event_id} className="border p-5 flex flex-wrap items-center gap-4" style={cardStyle}>
                    <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(123,167,188,0.14)' }}>
                      <Target className="w-5 h-5" style={{ color: '#7BA7BC' }} />
                    </div>
                    <div className="flex-1 min-w-[12rem]">
                      <p className="font-display text-xl uppercase leading-tight text-xert-offwhite">{event?.name || 'XERT event'}</p>
                      <p className="font-body text-sm mt-1" style={{ color: 'rgba(209,221,230,0.58)' }}>
                        {[formatDate(event?.event_date), event?.location].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveEventGoal(goal)}
                      className="font-body text-xs uppercase tracking-wider px-3 py-2 border transition-colors"
                      style={{
                        borderColor: 'rgba(123,167,188,0.28)',
                        color: 'rgba(209,221,230,0.65)'
                      }}
                    >
                      Remove goal
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Personal training requests */}
        <section className="mb-10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-display text-2xl uppercase" style={{ color: 'rgba(209,221,230,0.85)' }}>
              PT Requests
            </h2>
            <Link to="/timetable" className="font-body text-xs uppercase tracking-wider" style={{ color: '#7BA7BC' }}>
              Request a session
            </Link>
          </div>
          {initialAccountLoad ? (
            <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.5)' }}>Loading PT requests…</p>
          ) : firstLoadFailed ? (
            unavailableMessage
          ) : privateSessionRequests.length === 0 ? (
            <div className="border p-6 flex flex-wrap items-center gap-4" style={cardStyle}>
              <Dumbbell className="w-5 h-5" style={{ color: '#7BA7BC' }} />
              <p className="font-body text-sm flex-1" style={{ color: 'rgba(209,221,230,0.55)' }}>
                No personal training requests yet.
              </p>
              <Link to="/timetable" className="font-display text-sm uppercase px-4 py-2.5" style={{ backgroundColor: '#7BA7BC', color: '#101820' }}>
                Request PT
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {privateSessionRequests.map(request => (
                <div key={request.id} className="border p-5 flex flex-wrap items-center gap-4" style={cardStyle}>
                  <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(123,167,188,0.14)' }}>
                    <Dumbbell className="w-5 h-5" style={{ color: '#7BA7BC' }} />
                  </div>
                  <div className="flex-1 min-w-[12rem]">
                    <p className="font-display text-xl uppercase leading-tight text-xert-offwhite">{request.requested_session_type}</p>
                    <p className="font-body text-sm mt-1" style={{ color: 'rgba(209,221,230,0.58)' }}>
                      {[formatDate(request.created_at), request.preferred_day, request.preferred_time].filter(Boolean).join(' · ')}
                    </p>
                    {request.training_goal && <p className="font-body text-xs mt-1" style={{ color: 'rgba(209,221,230,0.45)' }}>Goal: {request.training_goal}</p>}
                  </div>
                  <span className="font-body text-[10px] uppercase tracking-wider px-2 py-1" style={{ backgroundColor: 'rgba(123,167,188,0.14)', color: '#7BA7BC' }}>
                    {privateSessionStatus(request.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pending booking requests */}
        {accountReady && pending.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-2xl uppercase mb-4" style={{ color: 'rgba(209,221,230,0.85)' }}>
              Requests &amp; Waitlist
            </h2>
            <div className="space-y-3">
              {pending.map(b => (
                <div key={b.booking_id} className="border p-5 flex flex-wrap items-center gap-4" style={cardStyle}>
                  <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(123,167,188,0.14)' }}>
                    <Clock className="w-5 h-5" style={{ color: '#7BA7BC' }} />
                  </div>
                  <div className="flex-1 min-w-[12rem]">
                    <p className="font-display text-xl uppercase leading-tight text-xert-offwhite">{b.title || b.class_type || 'XERT Class'}</p>
                    <p className="font-body text-sm mt-0.5" style={{ color: 'rgba(209,221,230,0.6)' }}>
                      {formatDateTime(b.start_time)}
                      {b.coach_name ? ` · Coach ${b.coach_name}` : ''}
                    </p>
                    <p className="font-body text-xs mt-1" style={{ color: 'rgba(123,167,188,0.75)' }}>
                      {b.status === 'waitlisted'
                        ? `You are ${b.waitlist_position ? `#${b.waitlist_position} ` : ''}on the waitlist. No class credit is currently reserved.`
                        : 'Your credit is reserved while XERT reviews this request.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setCancellationTarget(b)}
                    disabled={cancellingId === b.booking_id}
                    className="inline-flex items-center gap-1.5 font-body text-xs uppercase tracking-wider px-3 py-2 border transition-colors disabled:opacity-50"
                    style={{
                      borderColor: 'rgba(123,167,188,0.3)',
                      color: 'rgba(209,221,230,0.6)'
                    }}
                  >
                    {cancellingId === b.booking_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    {b.status === 'waitlisted' ? 'Leave waitlist' : 'Cancel request'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming bookings */}
        <section id="bookings" className="mb-10 scroll-mt-32">
          <h2 className="font-display text-2xl uppercase mb-4" style={{ color: 'rgba(209,221,230,0.85)' }}>
            Upcoming Classes
          </h2>
          {initialAccountLoad ? (
            <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.5)' }}>
              Loading…
            </p>
          ) : firstLoadFailed ? (
            unavailableMessage
          ) : upcoming.length === 0 ? (
            <div className="border p-6" style={cardStyle}>
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.55)' }}>
                No upcoming classes booked.{' '}
                <Link to="/booking" style={{ color: '#7BA7BC' }}>
                  Browse the timetable
                </Link>{' '}
                to book your next session.
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
                    <p className="font-display text-xl uppercase leading-tight text-xert-offwhite">{b.title || b.class_type || 'XERT Class'}</p>
                    <p className="font-body text-sm mt-0.5" style={{ color: 'rgba(209,221,230,0.6)' }}>
                      {formatDateTime(b.start_time)}
                      {b.coach_name ? ` · Coach ${b.coach_name}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setCancellationTarget(b)}
                    disabled={cancellingId === b.booking_id}
                    className="inline-flex items-center gap-1.5 font-body text-xs uppercase tracking-wider px-3 py-2 border transition-colors disabled:opacity-50"
                    style={{
                      borderColor: 'rgba(123,167,188,0.3)',
                      color: 'rgba(209,221,230,0.6)'
                    }}
                  >
                    {cancellingId === b.booking_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
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
          {initialAccountLoad ? (
            <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.5)' }}>
              Loading…
            </p>
          ) : firstLoadFailed ? (
            unavailableMessage
          ) : orders.length === 0 ? (
            <div className="border p-6" style={cardStyle}>
              <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.55)' }}>
                No purchases yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map(o => (
                <div key={o.id} className="border p-4 flex items-center gap-4" style={cardStyle}>
                  <Receipt className="w-4 h-4 shrink-0" style={{ color: '#7BA7BC' }} />
                  <p className="font-body text-sm flex-1" style={{ color: 'rgba(209,221,230,0.7)' }}>
                    {o.products?.name || 'Session pack'}
                  </p>
                  <p className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.45)' }}>
                    {formatDate(o.paid_at || o.created_at)}
                  </p>
                  <p className="font-display text-lg uppercase" style={{ color: '#7BA7BC' }}>
                    ${((o.amount_cents || 0) / 100).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Past classes */}
        {accountReady && past.length > 0 && (
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
                  <p className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.4)' }}>
                    {formatDateTime(b.start_time)}
                  </p>
                  <span
                    className="font-body text-[10px] uppercase tracking-wider px-2 py-1"
                    style={{
                      backgroundColor: 'rgba(123,167,188,0.14)',
                      color: 'rgba(209,221,230,0.55)'
                    }}
                  >
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-12 pt-8 border-t" style={{ borderColor: 'rgba(201,78,68,0.25)' }}>
          <h2 className="font-display text-xl uppercase text-xert-offwhite">Account Control</h2>
          <p className="font-body text-sm mt-2 max-w-xl" style={{ color: 'rgba(209,221,230,0.55)' }}>
            Permanently remove your profile, credits, bookings and training goals. Purchase records are anonymized.
          </p>
          <button type="button" onClick={() => setShowDeleteAccount(true)} className="mt-4 px-4 py-2.5 border font-body text-xs uppercase tracking-wider" style={{ borderColor: 'rgba(201,78,68,0.55)', color: '#f0a1a1' }}>
            Delete account
          </button>
        </section>
      </main>

      <PublicFooter />
      {cancellationTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cancel-booking-title"
          aria-describedby="cancel-booking-description"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setCancellationTarget(null);
          }}
        >
          <div
            className="w-full max-w-md border p-6"
            style={{
              borderColor: 'rgba(123,167,188,0.3)',
              backgroundColor: '#101820'
            }}
          >
            <h2 id="cancel-booking-title" className="font-display text-2xl uppercase text-xert-offwhite">
              Cancel booking?
            </h2>
            <p id="cancel-booking-description" className="font-body text-sm leading-relaxed mt-3" style={{ color: 'rgba(209,221,230,0.68)' }}>
              {cancellationMessage(cancellationTarget)}
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6">
              <button
                type="button"
                autoFocus
                onClick={() => setCancellationTarget(null)}
                className="px-4 py-2.5 border font-body text-xs uppercase tracking-wider transition-colors"
                style={{
                  borderColor: 'rgba(123,167,188,0.3)',
                  color: 'rgba(209,221,230,0.65)'
                }}
              >
                Keep booking
              </button>
              <button type="button" onClick={confirmCancellation} className="px-4 py-2.5 font-body text-xs uppercase tracking-wider transition-colors" style={{ backgroundColor: '#c94e44', color: '#fff' }}>
                Cancel booking
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteAccount && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description">
          <div className="w-full max-w-md border p-6" style={{ borderColor: 'rgba(201,78,68,0.45)', backgroundColor: '#101820' }}>
            <h2 id="delete-account-title" className="font-display text-2xl uppercase text-xert-offwhite">Delete account permanently?</h2>
            <p id="delete-account-description" className="font-body text-sm leading-relaxed mt-3" style={{ color: 'rgba(209,221,230,0.68)' }}>
              Your profile, credits, bookings and training goals will be removed. This cannot be undone.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6">
              <button type="button" autoFocus disabled={deletingAccount} onClick={() => setShowDeleteAccount(false)} className="px-4 py-2.5 border font-body text-xs uppercase tracking-wider disabled:opacity-50" style={{ borderColor: 'rgba(123,167,188,0.3)', color: 'rgba(209,221,230,0.65)' }}>Keep account</button>
              <button type="button" disabled={deletingAccount} onClick={() => void handleDeleteAccount()} className="px-4 py-2.5 font-body text-xs uppercase tracking-wider disabled:opacity-50" style={{ backgroundColor: '#c94e44', color: '#fff' }}>
                {deletingAccount ? 'Deleting...' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
