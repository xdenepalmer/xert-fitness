import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LogOut, ExternalLink, X, Search, CircleAlert, ChevronRight,
} from 'lucide-react';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { getAdminBadgeCounts } from '@/lib/adminData';
import { ADMIN_BADGE_REFRESH_INTERVAL_MS, shouldRefreshAdminData } from '@/lib/adminFreshness';
import { useAdminDialogLayer } from '@/lib/adminDialogLayer';
import CommandPalette from '@/components/admin/CommandPalette';
import {
  ADMIN_HUBS, ADMIN_MOBILE_WORKSPACES, ADMIN_WORKSPACES, hubForSection,
} from '@/lib/adminWorkspaces';

const LOGO = '/assets/xert-logo-horizontal-light.png';


export default function AdminLayout({ activeSection, onSectionChange, hasUnsavedChanges = false, onConfirmLeave = _action => true, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopNavigation, setDesktopNavigation] = useState(
    () => window.matchMedia('(min-width: 1024px)').matches,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [badges, setBadges] = useState({});
  const [badgesUnavailable, setBadgesUnavailable] = useState(false);
  const { user, profile, signOut } = useSupabaseAuth();
  const sidebarRef = useRef(null);
  const menuButtonRef = useRef(null);
  const workspaceRef = useRef(null);
  const mainRef = useRef(null);

  useAdminDialogLayer(workspaceRef);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = event => {
      setDesktopNavigation(event.matches);
      if (event.matches) setSidebarOpen(false);
    };
    sync(query);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    setPaletteOpen(false);
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [activeSection]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    if (!desktopNavigation && !sidebarOpen) sidebar.setAttribute('inert', '');
    else sidebar.removeAttribute('inert');
  }, [desktopNavigation, sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen || desktopNavigation) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => {
      sidebarRef.current?.querySelector('button, a[href]')?.focus();
    });

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSidebarOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll('button:not([disabled]), a[href]') || [])
        .filter(element => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!sidebarRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [desktopNavigation, sidebarOpen]);

  // ⌘K / Ctrl+K opens the command palette.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keep attention counts current without polling while the admin tab is hidden.
  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    let lastRefreshAt = Number.NaN;

    const refreshBadges = async () => {
      if (requestInFlight || !active) return;
      requestInFlight = true;
      try {
        const data = await getAdminBadgeCounts();
        if (!active) return;
        setBadges(data);
        setBadgesUnavailable(false);
      } catch {
        if (!active) return;
        setBadges({});
        setBadgesUnavailable(true);
      } finally {
        requestInFlight = false;
        lastRefreshAt = Date.now();
      }
    };

    const refreshWhenVisible = () => {
      if (shouldRefreshAdminData({ visibilityState: document.visibilityState, lastRefreshAt })) {
        void refreshBadges();
      }
    };

    void refreshBadges();
    const intervalId = window.setInterval(refreshWhenVisible, ADMIN_BADGE_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  const activeItem = ADMIN_WORKSPACES.find(item => item.key === activeSection);
  const activeLabel = activeItem?.label || 'Command Centre';
  const currentHub = hubForSection(activeSection);
  const hubBadge = hub => hub.items.reduce((total, item) => total + Number(badges[item.key] || 0), 0);
  const navigateTo = item => {
    const navigated = onSectionChange(item.key);
    if (navigated !== false) {
      setSidebarOpen(false);
      if (!desktopNavigation) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
  };
  const initials = (profile?.full_name || user?.email || 'A')
    .split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden overscroll-none bg-[#0b1218]">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        ref={sidebarRef}
        id="admin-navigation"
        aria-label="Admin navigation"
        aria-hidden={!desktopNavigation && !sidebarOpen ? 'true' : undefined}
        role={!desktopNavigation ? 'dialog' : undefined}
        aria-modal={!desktopNavigation && sidebarOpen ? 'true' : undefined}
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[min(88dvh,48rem)] min-h-0 w-full flex-col overflow-hidden rounded-t-2xl shadow-2xl transform transition-transform duration-200 lg:static lg:h-full lg:max-h-none lg:w-72 lg:translate-y-0 lg:rounded-none lg:shadow-none bg-gradient-to-b from-xert-navy to-[#0b1218] border-r border-xert-steel/15 ${sidebarOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-xert-steel/30 lg:hidden" />
        {/* Brand */}
        <div className="relative overflow-hidden px-5 pb-3 pt-2 lg:py-4 border-b border-xert-steel/15">
          <div className="relative">
            <img src={LOGO} alt="XERT" className="h-6 w-auto mb-2" />
            <div className="flex items-center gap-2">
              {badgesUnavailable ? (
                <CircleAlert className="w-3.5 h-3.5 text-amber-300" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-xert-steel" />
              )}
              <p className="font-display text-[11px] uppercase tracking-[0.3em] text-xert-steel/75" >
                {badgesUnavailable ? 'Counts unavailable' : 'Command Centre'}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => { setSidebarOpen(false); menuButtonRef.current?.focus(); }} aria-label="Close admin navigation" title="Close navigation"
 className="lg:hidden absolute top-2 right-2 inline-flex min-h-11 min-w-11 items-center justify-center text-xert-pale/50" >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Command centre sections" className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {ADMIN_HUBS.map(hub => {
            const HubIcon = hub.icon;
            const isCurrentHub = currentHub.key === hub.key;
            const count = hubBadge(hub);
            return (
              <div key={hub.key} className="py-0.5">
                <button type="button" onClick={() => navigateTo(hub.items[0])}
                  aria-current={isCurrentHub && hub.items.length === 1 ? 'page' : undefined}
                  aria-expanded={hub.items.length > 1 ? isCurrentHub : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isCurrentHub ? 'bg-white/[0.06] text-xert-offwhite' : 'text-xert-pale/60 hover:bg-white/[0.04] hover:text-xert-offwhite'}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors ${isCurrentHub ? 'bg-xert-steel text-xert-navy' : 'bg-white/[0.05] text-xert-steel'}`}>
                    <HubIcon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-body text-sm font-semibold">{hub.label}</span>
                    <span className="block truncate font-body text-[11px] text-xert-pale/40">{hub.detail}</span>
                  </span>
                  {count > 0 && !isCurrentHub && (
                    <span className="shrink-0 rounded-full bg-xert-steel/20 px-2 py-0.5 font-body text-[11px] font-semibold tabular-nums text-xert-steel">{count}</span>
                  )}
                </button>
                {isCurrentHub && hub.items.length > 1 && (
                  <div className="mb-1 ml-[3.1rem] mt-1 space-y-0.5 border-l border-white/[0.06] pl-3">
                    {hub.items.map(item => {
                      const active = activeSection === item.key;
                      return (
                        <button type="button" key={item.key} onClick={() => navigateTo(item)} title={item.detail}
                          aria-current={active ? 'page' : undefined}
                          className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left font-body text-[13px] transition-colors ${active ? 'bg-xert-steel/15 font-semibold text-xert-offwhite' : 'text-xert-pale/55 hover:bg-white/[0.04] hover:text-xert-offwhite'}`}>
                          <span className="flex-1 truncate">{item.label}</span>
                          {badges[item.key] > 0 && (
                            <span className="shrink-0 rounded-full bg-xert-steel/20 px-1.5 py-0.5 font-body text-[10px] font-semibold tabular-nums text-xert-steel">{badges[item.key]}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer: account */}
        <div className="space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-4 border-t border-xert-steel/15">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-xert-steel/15 font-display text-base text-xert-steel"
>
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-body text-xs truncate text-xert-pale" >{profile?.full_name || 'Admin'}</p>
              <p className="font-body text-[10px] truncate text-xert-pale/35" title={user?.email}>{user?.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/" onClick={event => { if (!onConfirmLeave(() => window.location.assign('/'))) event.preventDefault(); }}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] font-body text-sm font-medium text-xert-pale/70 transition-colors hover:border-xert-steel/60 hover:text-xert-offwhite">
              <ExternalLink className="h-4 w-4" /> Site
            </Link>
            <button type="button" onClick={() => { if (onConfirmLeave(() => void signOut())) void signOut(); }}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] font-body text-sm font-medium text-xert-pale/70 transition-colors hover:border-xert-steel/60 hover:text-xert-offwhite">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <button type="button" className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => { setSidebarOpen(false); menuButtonRef.current?.focus(); }} aria-label="Close admin navigation" />
      )}

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div ref={workspaceRef} data-admin-workspace className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="relative z-30 shrink-0 border-b border-white/[0.06] bg-[#0b1218]/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-8 sm:pt-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-xert-steel/15 text-xert-steel lg:hidden">
                <currentHub.icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <h1 className="flex min-w-0 items-center gap-1.5 font-body text-base font-semibold normal-case tracking-normal text-xert-offwhite sm:text-lg">
                  {currentHub.items.length > 1 && (
                    <span className="hidden items-center gap-1.5 sm:inline-flex">
                      <span className="text-xert-pale/45">{currentHub.label}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-xert-pale/30" aria-hidden="true" />
                    </span>
                  )}
                  <span className="truncate">{activeLabel}</span>
                </h1>
                {hasUnsavedChanges && (
                  <p className="mt-0.5 inline-flex items-center gap-1.5 font-body text-[11px] font-medium text-amber-300" role="status">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Unsaved changes
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
            <button ref={menuButtonRef} type="button" onClick={() => setSidebarOpen(true)} aria-label="Open account and navigation"
              aria-expanded={sidebarOpen} aria-controls="admin-navigation"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] font-display text-sm text-xert-steel transition-colors hover:border-xert-steel/60 lg:hidden">
              {initials}
            </button>
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search admin tools" title="Search admin tools"
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 font-body text-sm text-xert-pale/60 transition-colors hover:border-xert-steel/60 hover:text-xert-offwhite">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
            </button>
            </div>
          </div>
          {currentHub.items.length > 1 && (
            <div role="tablist" aria-label={`${currentHub.label} pages`} className="flex gap-2 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden">
              {currentHub.items.map(item => {
                const active = activeSection === item.key;
                return (
                  <button type="button" role="tab" key={item.key} aria-selected={active} onClick={() => navigateTo(item)}
                    className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 font-body text-sm font-medium transition-colors ${active ? 'bg-xert-steel text-xert-navy' : 'bg-white/[0.05] text-xert-pale/70 hover:bg-white/[0.09] hover:text-xert-offwhite'}`}>
                    {item.label}
                    {badges[item.key] > 0 && (
                      <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${active ? 'bg-xert-navy/20 text-xert-navy' : 'bg-xert-steel/20 text-xert-steel'}`}>{badges[item.key]}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </header>

        {/* Content */}
        <main ref={mainRef} data-admin-scroll-region className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain lg:[scrollbar-gutter:stable]">
          <div className="relative">
            {children}
          </div>
        </main>

        {/* Thumb-reachable owner jobs. The full catalogue remains in More. */}
        <nav aria-label="Owner shortcuts" data-admin-mobile-dock
          className="relative z-30 shrink-0 border-t border-white/[0.06] bg-[#0b1218]/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden">
          <div className="grid grid-cols-5">
            {ADMIN_MOBILE_WORKSPACES.map(item => {
              const active = currentHub.key === item.hub;
              const Icon = item.icon;
              const hub = ADMIN_HUBS.find(candidate => candidate.key === item.hub);
              const count = hub ? hubBadge(hub) : 0;
              return (
                <button type="button" key={item.key}
                  onClick={() => {
                    if (active && activeSection === item.key) {
                      if (mainRef.current) mainRef.current.scrollTop = 0;
                    } else {
                      onSectionChange(item.key);
                    }
                  }}
                  aria-current={active ? 'page' : undefined}
                  aria-label={`Open ${item.label}`}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 font-body text-[11px] font-semibold transition-colors ${active ? 'text-xert-offwhite' : 'text-xert-pale/45'}`}>
                  <span className={`relative grid h-8 w-12 place-items-center rounded-full transition-colors ${active ? 'bg-xert-steel/20' : ''}`}>
                    <Icon className={`h-5 w-5 ${active ? 'text-xert-steel' : ''}`} />
                    {count > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-xert-steel px-1 text-[9px] tabular-nums text-xert-navy">{count}</span>
                    )}
                  </span>
                  <span>{item.mobileLabel}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={onSectionChange} />
    </div>
  );
}
