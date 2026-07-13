import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import PublicFooter from '@/components/public/PublicFooter';
import PublicNav from '@/components/public/PublicNav';

export default function CheckoutReturn() {
  const [searchParams] = useSearchParams();
  const successful = searchParams.get('status') === 'success';
  const status = successful ? 'success' : 'cancelled';
  const Icon = successful ? CheckCircle2 : XCircle;

  return (
    <div className="min-h-screen flex flex-col bg-xert-navy">
      <PublicNav />
      <main id="main" className="flex-1 flex items-center justify-center px-6 py-20">
        <section className="w-[calc(100vw-3rem)] min-w-0 max-w-xl border border-xert-steel/20 bg-xert-ink p-6 sm:p-10" aria-labelledby="checkout-return-title">
          <Icon className="h-10 w-10 text-xert-steel" aria-hidden="true" />
          <p className="mt-6 font-body text-xs font-semibold uppercase tracking-[0.2em] text-xert-steel">
            XERT session packs
          </p>
          <h1 id="checkout-return-title" className="mt-3 font-display text-4xl uppercase text-xert-offwhite sm:text-5xl">
            {successful ? 'Payment received' : 'Checkout cancelled'}
          </h1>
          <p className="mt-4 font-body leading-relaxed text-xert-concrete/70">
            {successful
              ? 'Your payment is being confirmed. Return to the XERT app and your new credits will appear automatically.'
              : 'No payment was taken. Return to the XERT app whenever you are ready.'}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a className="xert-btn-primary px-5 py-3 text-center font-display text-sm uppercase" href={`xertfitness://checkout?status=${status}`}>
              Return to XERT app
            </a>
            <Link className="xert-btn-ghost px-5 py-3 text-center font-display text-sm uppercase" to="/booking">
              Continue on web
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
