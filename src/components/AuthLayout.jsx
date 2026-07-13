import React from "react";

/**
 * Shared shell for the member auth pages: navy page on the blueprint grid
 * backdrop (same pattern as PageHeader), square steel icon tile, eyebrow rule
 * plus Bebas display headline, and an ink card with a hairline steel border.
 * Sharp corners throughout so auth carries the public XERT voice.
 */
export default function AuthLayout({ icon: Icon, eyebrow = "Member access", title, subtitle, footer = null, children }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-xert-navy px-4 py-16">
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
      <div className="relative w-full max-w-md">
        <div className="text-center mb-10 xert-enter xert-enter-up">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-xert-steel mb-5">
            <Icon className="w-7 h-7 text-xert-navy" aria-hidden="true" />
          </div>
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="h-px w-6 bg-xert-steel" aria-hidden="true" />
            <span className="font-body text-xs uppercase tracking-[0.2em] text-xert-steel">{eyebrow}</span>
            <div className="h-px w-6 bg-xert-steel" aria-hidden="true" />
          </div>
          <h1 className="font-display uppercase text-4xl text-xert-offwhite leading-none">{title}</h1>
          {subtitle && <p className="mt-3 font-body text-sm text-xert-pale/70">{subtitle}</p>}
        </div>
        <div className="bg-xert-ink border border-xert-steel/20 p-6 sm:p-8 xert-enter xert-enter-up" style={{ animationDelay: '100ms' }}>
          {children}
        </div>
        {footer && (
          <p className="text-center font-body text-sm text-xert-pale/60 mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
