import React from "react";

/**
 * Shared shell for the member auth pages: navy page under a soft steel glow,
 * rounded steel icon tile, eyebrow rule plus Bebas display headline, and the
 * shared rounded card so auth carries the same finish as the rest of the site.
 */
export default function AuthLayout({ icon: Icon, eyebrow = "Member access", title, subtitle, footer = null, children }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-xert-navy px-4 py-16">
      <div aria-hidden="true" className="xert-glow-top absolute inset-0 pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-10 xert-enter xert-enter-up">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-xert-steel mb-5 shadow-[0_12px_30px_-12px_rgba(123,167,188,0.7)]">
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
        <div className="xert-card p-6 sm:p-8 xert-enter xert-enter-up" style={{ animationDelay: '100ms' }}>
          {children}
        </div>
        {footer && (
          <p className="text-center font-body text-sm text-xert-pale/60 mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
