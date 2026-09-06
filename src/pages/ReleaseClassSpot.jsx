import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import PublicNav from '@/components/public/PublicNav';
import PublicFooter from '@/components/public/PublicFooter';
import { cancelClassSignup } from '@/lib/submitForms';
import { friendlySignupError } from '@/lib/classSignup';

/**
 * Someone who took a spot through the public timetable has no account, so the
 * only handle they have on their own place is the token issued when they signed
 * up. Without a way to use it, a place nobody can release keeps the class
 * reading full while the room is not — the exact failure a capacity system
 * exists to prevent.
 */
export default function ReleaseClassSpot() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [state, setState] = useState(token ? 'ready' : 'missing');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { if (!token) setState('missing'); }, [token]);

  const release = async () => {
    setState('working');
    setError('');
    try {
      const outcome = await cancelClassSignup(token);
      setResult(outcome);
      setState('done');
    } catch (releaseError) {
      setError(friendlySignupError(releaseError));
      setState('failed');
    }
  };

  const className = result?.class_title ? `“${result.class_title}”` : 'that class';

  return (
    <div className="bg-xert-navy min-h-screen flex flex-col">
      <PublicNav />
      <main id="main" className="flex-1 pt-16">
        <section className="px-6 py-16 sm:py-24">
          <div className="mx-auto max-w-lg xert-card p-6 sm:p-8">
            <h1 className="font-display text-2xl uppercase text-xert-offwhite">Release your spot</h1>

            {state === 'missing' && (
              <>
                <p className="mt-3 font-body text-sm text-xert-pale/70">
                  This link is missing its release code. Use the link in your confirmation email, or
                  call XERT and we will free the spot for you.
                </p>
                <Link to="/timetable" className="xert-btn-ghost mt-6 inline-flex min-h-[52px] items-center justify-center px-6 font-display text-sm uppercase tracking-wide">
                  Back to the timetable
                </Link>
              </>
            )}

            {(state === 'ready' || state === 'working' || state === 'failed') && (
              <>
                <p className="mt-3 font-body text-sm text-xert-pale/70">
                  Giving your place back frees it for the next person. You can sign up again any time
                  there is room.
                </p>
                {error && (
                  <div role="alert" className="mt-4 rounded-xl border p-3"
                    style={{ color: '#f0a1a1', borderColor: 'rgba(240,161,161,0.35)', backgroundColor: 'rgba(240,161,161,0.08)' }}>
                    <p className="font-body text-sm">{error}</p>
                  </div>
                )}
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={release} disabled={state === 'working'}
                    className="xert-btn-primary inline-flex min-h-[52px] flex-1 items-center justify-center px-6 font-display text-sm uppercase tracking-wide disabled:opacity-50">
                    {state === 'working' ? 'Releasing…' : 'Release my spot'}
                  </button>
                  <Link to="/timetable"
                    className="xert-btn-ghost inline-flex min-h-[52px] flex-1 items-center justify-center px-6 font-display text-sm uppercase tracking-wide">
                    Keep it
                  </Link>
                </div>
              </>
            )}

            {state === 'done' && (
              <>
                <p className="mt-3 font-body text-sm text-xert-pale/70">
                  {result?.already_cancelled
                    ? `Your place in ${className} was already released. Nothing else to do.`
                    : `Your place in ${className} is released. Thanks for letting us know — someone else can take it now.`}
                </p>
                <Link to="/timetable" className="xert-btn-primary mt-6 inline-flex min-h-[52px] items-center justify-center px-6 font-display text-sm uppercase tracking-wide">
                  See what else is on
                </Link>
              </>
            )}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
