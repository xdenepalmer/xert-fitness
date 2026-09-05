import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CreditCard, LoaderCircle } from 'lucide-react';
import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import { supabase } from '@/lib/supabase';
import {
  CASUAL_VISIT_ACTION, casualVisitValidationError, formatCasualVisitPrice, normalizeCasualVisitPriceCents,
} from '@/lib/casualVisit';

// Pay for a single visit on your own phone. The club never handles anyone's
// card: the visitor fills this in, and Stripe takes the payment with their
// name, email and phone already carried across.
export default function CasualVisit() {
  const [params] = useSearchParams();
  const [visitor, setVisitor] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const [priceCents, setPriceCents] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const paid = params.get('paid') === '1';
  const cancelled = params.get('cancelled') === '1';

  useEffect(() => {
    document.title = 'Casual visit | XERT Fitness';
    let active = true;
    supabase.from('admin_settings').select('casual_visit_price_cents, casual_payments_enabled').limit(1).maybeSingle()
      .then(({ data }) => { if (active && data) setPriceCents(normalizeCasualVisitPriceCents(data.casual_visit_price_cents)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const update = (field, value) => setVisitor(current => ({ ...current, [field]: value }));
  const validation = casualVisitValidationError(visitor);

  const pay = async event => {
    event.preventDefault();
    setError('');
    if (validation) { setError(validation); return; }
    setSending(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: CASUAL_VISIT_ACTION, ...visitor }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) throw new Error(body.error || 'The payment page could not be opened. Please try again.');
      window.location.assign(body.url);
    } catch (paymentError) {
      setError(paymentError.message);
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-xert-navy">
      <PublicNav />
      <main id="main" className="relative flex-1 px-6 py-24 sm:py-28">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-96 pointer-events-none xert-glow-top" />
        <div className="relative mx-auto w-full max-w-lg">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px w-6 bg-xert-steel" aria-hidden="true" />
            <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">Casual visit</span>
          </div>

          {paid ? (
            <div className="xert-card p-6 sm:p-8">
              <CheckCircle2 className="mb-4 h-9 w-9 text-emerald-300" aria-hidden="true" />
              <h1 className="font-display text-4xl uppercase leading-tight text-xert-offwhite">Payment received</h1>
              <p className="mt-4 font-body text-sm leading-relaxed text-xert-pale/75">
                Thanks — your receipt is on its way by email, and the team has been told you are here.
                If you have not filled in the pre-exercise questionnaire yet, do that before you train.
              </p>
              <Link to="/forms/peq-casual" className="mt-6 inline-flex min-h-12 items-center justify-center bg-xert-steel px-5 font-display text-sm uppercase tracking-wide text-xert-navy transition-colors hover:bg-xert-pale">
                Fill in the questionnaire
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-display text-[clamp(2.25rem,7vw,3.25rem)] uppercase leading-tight text-xert-offwhite">
                Pay for today&apos;s visit
              </h1>
              <p className="mt-4 max-w-prose font-body text-sm leading-relaxed text-xert-pale/75">
                One visit, one class, no membership. Enter your details and pay on your own phone
                {priceCents ? <> — <strong className="text-xert-offwhite">{formatCasualVisitPrice(priceCents)}</strong></> : null}.
              </p>

              {cancelled && (
                <p role="status" className="mt-6 border border-amber-300/30 bg-amber-300/10 p-3 font-body text-sm text-amber-100">
                  That payment was cancelled. Nothing has been charged — you can try again below.
                </p>
              )}

              <form onSubmit={pay} className="mt-8 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="xert-label">First name</span>
                    <input required autoComplete="given-name" className="xert-input mt-1" value={visitor.first_name}
                      onChange={event => update('first_name', event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="xert-label">Last name</span>
                    <input required autoComplete="family-name" className="xert-input mt-1" value={visitor.last_name}
                      onChange={event => update('last_name', event.target.value)} />
                  </label>
                </div>
                <label className="block">
                  <span className="xert-label">Email</span>
                  <input required type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off"
                    className="xert-input mt-1" value={visitor.email} onChange={event => update('email', event.target.value)} />
                  <span className="mt-1 block font-body text-xs text-xert-pale/45">Your receipt goes here.</span>
                </label>
                <label className="block">
                  <span className="xert-label">Phone</span>
                  <input required type="tel" autoComplete="tel" inputMode="tel" className="xert-input mt-1"
                    value={visitor.phone} onChange={event => update('phone', event.target.value)} placeholder="0400 000 000" />
                </label>

                {error && <p role="alert" className="border border-red-300/30 bg-red-300/10 p-3 font-body text-sm text-red-100">{error}</p>}

                <button type="submit" disabled={sending}
                  className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 bg-xert-steel px-5 font-display text-sm uppercase tracking-wide text-xert-navy transition-colors hover:bg-xert-pale disabled:opacity-50">
                  {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {sending ? 'Opening secure payment…' : priceCents ? `Pay ${formatCasualVisitPrice(priceCents)}` : 'Continue to payment'}
                </button>
                <p className="font-body text-xs leading-relaxed text-xert-pale/45">
                  Payment is taken by Stripe on their secure page. XERT never sees or stores your card details.
                  New here? Please also complete the <Link to="/forms/peq-casual" className="text-xert-steel underline">pre-exercise questionnaire</Link> before you train.
                </p>
              </form>
            </>
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
