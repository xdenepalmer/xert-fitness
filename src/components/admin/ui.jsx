import React from 'react';

// ─── Command Centre UI kit ───────────────────────────────────────────────────
// The owner workspaces grew one screen at a time: fourteen variants of the
// primary button, page titles in four sizes, eight private copies of the input
// class, and hundreds of inline rgba() colours that could not be themed or
// searched. Every workspace now composes these tokens instead. A change here
// reaches all of them at once, and the tests in test/admin-ui-kit.test.js keep
// raw copies from creeping back.

/** Screen gutters: tighter on phones, the classic 24px on desktop. */
export const ADMIN_PAGE = 'px-4 py-5 sm:px-8 sm:py-7 mx-auto w-full max-w-6xl';

export const ADMIN_TEXT = Object.freeze({
  /** The one page title. Condensed display face, sized for a phone first. */
  pageTitle: 'font-display text-3xl tracking-wide text-xert-offwhite sm:text-4xl',
  /** Small steel eyebrow above a group of content. */
  sectionHeading: 'font-body text-xs font-semibold uppercase tracking-[0.14em] text-xert-steel/70',
  /** Supporting copy under a title. */
  lede: 'font-body text-sm text-xert-pale/55',
});

/** Text inputs. 16px on phones so iOS Safari never zooms the page on focus. */
export const ADMIN_INPUT_BARE = 'min-h-11 rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2 font-body text-base text-xert-offwhite placeholder:text-xert-pale/30 focus:outline-none focus:border-xert-steel/70 focus:ring-4 focus:ring-xert-steel/10 disabled:opacity-50 sm:text-sm';
export const ADMIN_INPUT = `w-full ${ADMIN_INPUT_BARE}`;
export const ADMIN_LABEL = 'block font-body text-xs text-xert-pale/45 uppercase tracking-wider mb-1';

const BUTTON_BASE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 font-body text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export const ADMIN_BUTTON = Object.freeze({
  primary: `${BUTTON_BASE} bg-xert-steel text-xert-navy shadow-lg shadow-xert-steel/20 hover:bg-xert-pale`,
  ghost: `${BUTTON_BASE} border border-white/10 bg-white/[0.03] text-xert-pale hover:border-xert-steel/60 hover:bg-white/[0.06] hover:text-xert-offwhite`,
  danger: `${BUTTON_BASE} border border-red-300/40 text-red-200 hover:border-red-300 hover:text-red-100`,
});

/** Card surface used for panels and list rows. */
export const ADMIN_PANEL = 'rounded-2xl border border-white/[0.06] bg-white/[0.035] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]';

export function AdminPageHeader({ eyebrow = 'Command Centre', title, description, children }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className={ADMIN_TEXT.sectionHeading}>{eyebrow}</p>}
        <h2 className={`${ADMIN_TEXT.pageTitle} mt-1`}>{title}</h2>
        {description && <p className={`${ADMIN_TEXT.lede} mt-2 max-w-2xl`}>{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </header>
  );
}

export function AdminSectionHeading({ id, children, trailing = null, className = '' }) {
  return (
    <div className={`mb-3 flex items-center justify-between gap-3 ${className}`}>
      <h3 id={id} className={ADMIN_TEXT.sectionHeading}>{children}</h3>
      {trailing}
    </div>
  );
}

export function AdminButton({ variant = 'primary', className = '', type = 'button', ...props }) {
  const buttonType = type === 'submit' || type === 'reset' ? type : 'button';
  return <button type={buttonType} className={`${ADMIN_BUTTON[variant] || ADMIN_BUTTON.primary} ${className}`} {...props} />;
}
