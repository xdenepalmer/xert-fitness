import React from 'react';

/**
 * Shared interior-page header: eyebrow rule, Bebas display headline with an
 * optional steel accent word, optional intro paragraph, and the blueprint grid
 * backdrop from the home hero so interior pages carry the same voice.
 * Entrance motion reuses the existing xert-enter classes (reduced-motion safe).
 */
export default function PageHeader({
  eyebrow,
  title,
  accent = '',
  intro = '',
  containerClassName = 'max-w-5xl',
  children = null,
}) {
  return (
    <header className="relative overflow-hidden pt-28 pb-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(123,167,188,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(123,167,188,0.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 40%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 40%, transparent)',
        }}
      />
      <div className={`relative ${containerClassName} mx-auto px-6`}>
        <div className="flex items-center gap-3 mb-6 xert-enter xert-enter-left">
          <div className="h-px w-6 bg-xert-steel" />
          <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">{eyebrow}</span>
        </div>
        <h1
          className="font-display uppercase text-xert-offwhite xert-enter xert-enter-up"
          style={{ fontSize: 'clamp(2.5rem,7vw,4.5rem)', lineHeight: 0.95 }}
        >
          {title}
          {accent ? <span className="text-xert-steel"> {accent}</span> : null}
        </h1>
        {intro ? (
          <p
            className="mt-6 font-body leading-relaxed max-w-2xl xert-enter xert-enter-up"
            style={{ color: 'rgba(209,221,230,0.78)', fontSize: '1.0625rem', animationDelay: '120ms' }}
          >
            {intro}
          </p>
        ) : null}
        {children}
      </div>
    </header>
  );
}
