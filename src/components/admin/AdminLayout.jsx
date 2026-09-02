import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LogOut, ExternalLink, Menu, X, Search, CircleAlert,
} from 'lucide-react';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { getAdminBadgeCounts } from '@/lib/adminData';
import { ADMIN_BADGE_REFRESH_INTERVAL_MS, shouldRefreshAdminData } from '@/lib/adminFreshness';
import { useAdminDialogLayer } from '@/lib/adminDialogLayer';
import CommandPalette from '@/components/admin/CommandPalette';
import {
  ADMIN_MOBILE_WORKSPACES, ADMIN_WORKSPACE_GROUPS, ADMIN_WORKSPACES,
} from '@/lib/adminWorkspaces';

const LOGO = '/assets/xert-logo-horizontal-light.png';

const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(123,167,188,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(123,167,188,0.04) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};

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
  const mobileWorkspaceKeys = new Set(ADMIN_MOBILE_WORKSPACES.map(item => item.key));
  const mobileOtherBadgeCount = Object.entries(badges).reduce(
    (total, [key, count]) => mobileWorkspaceKeys.has(key) ? total : total + Number(count || 0),
    0,
  );
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
          <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
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
        <nav aria-label="Command centre sections" className="flex-1 overflow-y-auto overscroll-contain py-2 lg:py-3">
          {ADMIN_WORKSPACE_GROUPS.map(group => (
            <div key={group.key} className="mb-1">
              {group.label && (
                <p className="px-5 pt-4 pb-1.5 font-body text-[10px] font-semibold uppercase tracking-[0.22em] text-xert-steel/55" >
                  {group.label}
                </p>
              )}
              {group.items.map(item => {
                const active = activeSection === item.key;
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => {
                      const navigated = onSectionChange(item.key);
                      if (navigated !== false) {
                        setSidebarOpen(false);
                        if (!desktopNavigation) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
                      }
                    }}
                    aria-current={active ? 'page' : undefined}
                    title={item.detail}
                    className={`relative flex min-h-11 w-full items-center gap-3 px-5 py-2.5 text-left transition-all group hover:text-xert-offwhite ${active ? 'bg-xert-steel/10 text-xert-offwhite' : 'text-xert-pale/55'}`}
                  >
                    {/* Active accent bar */}
                    <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r bg-xert-steel transition-all ${active ? 'h-[60%]' : 'h-0'}`} />
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-xert-steel' : 'text-xert-steel/45'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body text-[13px]">{item.label}</span>
                      {active && <span className="mt-0.5 block truncate font-body text-[10px] text-xert-pale/40">{item.detail}</span>}
                    </span>
                    {badges[item.key] > 0 && (
                      <span className="shrink-0 min-w-[1.25rem] px-1 py-0.5 text-center font-body text-[10px] tabular-nums bg-xert-steel/20 text-xert-steel border border-xert-steel/35"
>
                        {badges[item.key]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer: account */}
        <div className="space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-4 border-t border-xert-steel/15">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0 flex items-center justify-center font-display text-sm bg-xert-steel/15 text-xert-steel border border-xert-steel/30"
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
              className="flex min-h-11 items-center justify-center gap-1.5 py-2 font-body text-[10px] uppercase tracking-wider transition-colors border border-xert-steel/20 text-xert-pale/50 hover:border-xert-steel/50 hover:text-xert-offwhite">
              <ExternalLink className="w-3 h-3" /> Site
            </Link>
            <button type="button" onClick={() => { if (onConfirmLeave(() => void signOut())) void signOut(); }}
              className="flex min-h-11 items-center justify-center gap-1.5 py-2 font-body text-[10px] uppercase tracking-wider transition-colors border border-xert-steel/20 text-xert-pale/50 hover:border-xert-steel/50 hover:text-xert-offwhite">
              <LogOut className="w-3 h-3" /> Sign out
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
        <header className="relative z-30 flex shrink-0 items-center justify-between gap-3 px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-6 sm:py-3.5 bg-[#0b1218]/90 border-b border-xert-steel/15 backdrop-blur">
          <div className="flex min-w-0 items-center gap-4">
            <div className="min-w-0">
              <p className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-xert-steel/55 sm:block">Command Centre</p>
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate font-display text-base uppercase tracking-wide sm:text-lg text-xert-offwhite" >{activeLabel}</h1>
                {hasUnsavedChanges && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 font-body text-[9px] font-semibold uppercase tracking-wider text-amber-300 sm:hidden" role="status">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                    Unsaved
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <span className="hidden sm:inline font-body text-[10px] uppercase tracking-wider text-amber-300" role="status">
                Unsaved admin changes
              </span>
            )}
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search admin tools" title="Search admin tools"
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 px-3 py-1.5 font-body text-[11px] transition-colors border border-xert-steel/25 text-xert-pale/50 hover:border-xert-steel hover:text-xert-offwhite">
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline px-1.5 py-0.5 text-[9px] font-body uppercase border border-xert-steel/30 text-xert-steel/70"
>
                Ctrl K
              </kbd>
            </button>
            <span className="hidden md:block font-body text-[11px] uppercase tracking-widest text-xert-steel/40" >
              {new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
        </header>

        {/* Content */}
        <main ref={mainRef} data-admin-scroll-region className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain lg:[scrollbar-gutter:stable]">
          <div className="absolute inset-0 pointer-events-none" style={{ ...GRID_BG, maskImage: 'linear-gradient(180deg, black, transparent 320px)', WebkitMaskImage: 'linear-gradient(180deg, black, transparent 320px)' }} />
          <div className="relative">
            {children}
          </div>
        </main>

        {/* Thumb-reachable owner jobs. The full catalogue remains in More. */}
        <nav aria-label="Owner shortcuts" data-admin-mobile-dock
          className="relative z-30 shrink-0 border-t border-xert-steel/15 bg-[#0b1218]/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden">
          <div className="grid grid-cols-4">
            {ADMIN_MOBILE_WORKSPACES.map(item => {
              const active = activeSection === item.key;
              const Icon = item.icon;
              return (
                <button type="button" key={item.key}
                  onClick={() => {
                    if (active) {
                      if (mainRef.current) mainRef.current.scrollTop = 0;
                    } else {
                      onSectionChange(item.key);
                    }
                  }}
                  aria-current={active ? 'page' : undefined}
                  aria-label={`Open ${item.label}`}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 font-body text-[10px] font-semibold transition-colors ${active ? 'text-xert-pale' : 'text-xert-pale/45'}`}>
                  <span className={`absolute inset-x-4 top-0 h-0.5 rounded-full ${active ? 'bg-xert-steel' : 'bg-transparent'}`} />
                  <span className="relative">
                    <Icon className={`h-5 w-5 ${active ? 'text-xert-steel' : ''}`} />
                    {badges[item.key] > 0 && (
                      <span className="absolute -right-2.5 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-xert-steel px-1 text-[9px] tabular-nums text-xert-navy">
                        {Math.min(99, Number(badges[item.key]))}
                      </span>
                    )}
                  </span>
                  <span>{item.mobileLabel}</span>
                </button>
              );
            })}
            <button ref={menuButtonRef} type="button" onClick={() => setSidebarOpen(true)}
              aria-label="Open all admin tools" title="All admin tools"
              aria-expanded={sidebarOpen} aria-controls="admin-navigation"
              aria-current={!mobileWorkspaceKeys.has(activeSection) ? 'page' : undefined}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 font-body text-[10px] font-semibold transition-colors ${!mobileWorkspaceKeys.has(activeSection) ? 'text-xert-pale' : 'text-xert-pale/45'}`}>
              <span className={`absolute inset-x-4 top-0 h-0.5 rounded-full ${!mobileWorkspaceKeys.has(activeSection) ? 'bg-xert-steel' : 'bg-transparent'}`} />
              <span className="relative">
                <Menu className={`h-5 w-5 ${!mobileWorkspaceKeys.has(activeSection) ? 'text-xert-steel' : ''}`} />
                {mobileOtherBadgeCount > 0 && (
                  <span className="absolute -right-2.5 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-xert-steel px-1 text-[9px] tabular-nums text-xert-navy">
                    {Math.min(99, mobileOtherBadgeCount)}
                  </span>
                )}
              </span>
              <span>More</span>
            </button>
          </div>
        </nav>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={onSectionChange} />
    </div>
  );
}
