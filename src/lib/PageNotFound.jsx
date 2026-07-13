import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function PageNotFound() {
  const location = useLocation();
  const pageName = location.pathname.replace(/^\//, '');

  return (
    <div className="min-h-screen bg-xert-navy flex items-center justify-center px-6 py-24">
      <div className="max-w-xl w-full text-center xert-enter xert-enter-up">
        {/* Eyebrow */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="h-px w-6 bg-xert-steel" aria-hidden="true" />
          <p className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">Off the beaten track</p>
          <span className="h-px w-6 bg-xert-steel" aria-hidden="true" />
        </div>

        <h1 className="font-display text-[7rem] sm:text-[9rem] leading-none text-xert-steel">404</h1>
        <h2 className="font-display text-3xl sm:text-4xl uppercase tracking-wide text-xert-offwhite mt-2">
          Page Not Found
        </h2>

        <p className="font-body text-sm leading-relaxed text-xert-pale/70 mt-4">
          {pageName ? (
            <>Nothing lives at <span className="text-xert-pale">/{pageName}</span>. </>
          ) : (
            <>That page does not exist. </>
          )}
          Head back to the gym floor and keep training.
        </p>

        <div className="mt-10">
          <Link
            to="/"
            className="xert-btn-primary inline-flex items-center justify-center px-8 py-3.5 font-display text-base uppercase tracking-wide"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
