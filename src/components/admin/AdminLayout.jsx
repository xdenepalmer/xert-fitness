import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, DollarSign, Ticket, CalendarDays, Inbox, Dumbbell,
  CalendarRange, PenSquare, UserSquare2, Trophy, ClipboardList, UserCog,
  Handshake, Settings, BarChart3, LogOut, ExternalLink, Menu, X, Search,
  BellRing, CircleAlert, ShieldCheck, ScrollText,
} from 'lucide-react';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { getAdminBadgeCounts } from '@/lib/adminData';
import { ADMIN_BADGE_REFRESH_INTERVAL_MS, shouldRefreshAdminData } from '@/lib/adminFreshness';
import { useAdminDialogLayer } from '@/lib/adminDialogLayer';
import CommandPalette from '@/components/admin/CommandPalette';

const LOGO = '/assets/xert-logo-horizontal-light.png';

const NAV_GROUPS = [
  {
    heading: null,
    items: [
      { key: 'overview', label: 'Overview', icon: LayoutDashboard },
      { key: 'health', label: 'Operations Health', icon: ShieldCheck },
      { key: 'audit', label: 'Admin Audit', icon: ScrollText },
    ],
  },
  {
    heading: 'Members & Money',
    items: [
      { key: 'gym-members', label: 'Members', icon: Users },
      { key: 'orders', label: 'Orders & Revenue', icon: DollarSign },
      { key: 'products', label: 'Session Packs', icon: Ticket },
    ],
  },
  {
    heading: 'Classes',
    items: [
      { key: 'calendar', label: 'Class Calendar', icon: CalendarDays },
      { key: 'bookings', label: 'Booking Requests', icon: Inbox },
      { key: 'pt-requests', label: 'PT Requests', icon: Dumbbell },
      { key: 'availability', label: 'Availability / Blackouts', icon: CalendarRange },
    ],
  },
  {
    heading: 'Site Content',
    items: [
      { key: 'announcements', label: 'Member Notices', icon: BellRing },
      { key: 'content', label: 'Site Content (CMS)', icon: PenSquare },
      { key: 'coaches', label: 'Coaches & Team', icon: UserSquare2 },
      { key: 'events', label: 'Event Calendar', icon: Trophy },
    ],
  },
  {
    heading: 'Launch & Leads',
    items: [
      { key: 'members', label: 'Member Leads', icon: ClipboardList },
      { key: 'trainers', label: 'Trainer Applicants', icon: UserCog },
      { key: 'partners', label: 'Partner Enquiries', icon: Handshake },
      { key: 'settings', label: 'Soft Launch Settings', icon: Settings },
      { key: 'campaigns', label: 'Campaign Stats', icon: BarChart3 },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items);

const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(123,167,188,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(123,167,188,0.04) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};

export default function AdminLayout({ activeSection, onSectionChange, hasUnsavedChanges = false, onConfirmLeave = () => true, children }) {
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
  }, [activeSection]);

  const activeLabel = ALL_ITEMS.find(n => n.key === activeSection)?.label || 'Command Centre';
  const initials = (profile?.full_name || user?.email || 'A')
    .split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#0b1218' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        ref={sidebarRef}
        id="admin-navigation"
        aria-label="Admin navigation"
        aria-hidden={!desktopNavigation && !sidebarOpen ? 'true' : undefined}
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col transform transition-transform lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          background: 'linear-gradient(180deg, #101820 0%, #0b1218 100%)',
          borderRight: '1px solid rgba(123,167,188,0.14)',
        }}
      >
        {/* Brand */}
        <div className="relative p-5 overflow-hidden" style={{ borderBottom: '1px solid rgba(123,167,188,0.14)' }}>
          <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
          <div className="relative">
            <img src={LOGO} alt="XERT" className="h-7 w-auto mb-2" />
            <div className="flex items-center gap-2">
              {badgesUnavailable ? (
                <CircleAlert className="w-3.5 h-3.5" style={{ color: '#e0b36a' }} />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#7BA7BC' }} />
              )}
              <p className="font-display text-[11px] uppercase tracking-[0.3em]" style={{ color: 'rgba(123,167,188,0.75)' }}>
                {badgesUnavailable ? 'Counts unavailable' : 'Command Centre'}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => { setSidebarOpen(false); menuButtonRef.current?.focus(); }} aria-label="Close admin navigation" title="Close navigation"
            className="lg:hidden absolute top-2 right-2 inline-flex min-h-11 min-w-11 items-center justify-center" style={{ color: 'rgba(209,221,230,0.5)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Command centre sections" className="flex-1 overflow-y-auto py-3">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="mb-1">
              {group.heading && (
                <p className="px-5 pt-4 pb-1.5 font-body text-[10px] uppercase tracking-[0.22em]" style={{ color: 'rgba(123,167,188,0.38)' }}>
                  {group.heading}
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
                      if (navigated !== false) setSidebarOpen(false);
                    }}
                    aria-current={active ? 'page' : undefined}
                    className="relative flex min-h-11 w-full items-center gap-3 px-5 py-2.5 text-left transition-all group"
                    style={{
                      backgroundColor: active ? 'rgba(123,167,188,0.1)' : 'transparent',
                      color: active ? '#F1F3F4' : 'rgba(209,221,230,0.55)',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#F1F3F4'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(209,221,230,0.55)'; }}
                  >
                    {/* Active accent bar */}
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r transition-all"
                      style={{ height: active ? '60%' : '0%', backgroundColor: '#7BA7BC' }} />
                    <Icon className="w-4 h-4 shrink-0 transition-colors"
                      style={{ color: active ? '#7BA7BC' : 'rgba(123,167,188,0.45)' }} />
                    <span className="font-body text-[13px] flex-1">{item.label}</span>
                    {badges[item.key] > 0 && (
                      <span className="shrink-0 min-w-[1.25rem] px-1 py-0.5 text-center font-body text-[10px] tabular-nums"
                        style={{ backgroundColor: 'rgba(123,167,188,0.2)', color: '#7BA7BC', border: '1px solid rgba(123,167,188,0.35)' }}>
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
        <div className="p-4 space-y-3" style={{ borderTop: '1px solid rgba(123,167,188,0.14)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0 flex items-center justify-center font-display text-sm"
              style={{ backgroundColor: 'rgba(123,167,188,0.16)', color: '#7BA7BC', border: '1px solid rgba(123,167,188,0.3)' }}>
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-body text-xs truncate" style={{ color: '#D1DDE6' }}>{profile?.full_name || 'Admin'}</p>
              <p className="font-body text-[10px] truncate" style={{ color: 'rgba(209,221,230,0.35)' }} title={user?.email}>{user?.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/" onClick={event => { if (!onConfirmLeave()) event.preventDefault(); }}
              className="flex min-h-11 items-center justify-center gap-1.5 py-2 font-body text-[10px] uppercase tracking-wider transition-colors"
              style={{ border: '1px solid rgba(123,167,188,0.2)', color: 'rgba(209,221,230,0.5)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(123,167,188,0.5)'; e.currentTarget.style.color = '#F1F3F4'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(123,167,188,0.2)'; e.currentTarget.style.color = 'rgba(209,221,230,0.5)'; }}>
              <ExternalLink className="w-3 h-3" /> Site
            </Link>
            <button type="button" onClick={() => { if (onConfirmLeave()) void signOut(); }}
              className="flex min-h-11 items-center justify-center gap-1.5 py-2 font-body text-[10px] uppercase tracking-wider transition-colors"
              style={{ border: '1px solid rgba(123,167,188,0.2)', color: 'rgba(209,221,230,0.5)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(123,167,188,0.5)'; e.currentTarget.style.color = '#F1F3F4'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(123,167,188,0.2)'; e.currentTarget.style.color = 'rgba(209,221,230,0.5)'; }}>
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
      <div ref={workspaceRef} data-admin-workspace className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between"
          style={{
            backgroundColor: 'rgba(11,18,24,0.92)',
            borderBottom: '1px solid rgba(123,167,188,0.14)',
            backdropFilter: 'blur(10px)',
          }}>
          <div className="flex items-center gap-4">
            <button ref={menuButtonRef} type="button" onClick={() => setSidebarOpen(true)} aria-label="Open admin navigation" title="Open navigation"
              aria-expanded={sidebarOpen} aria-controls="admin-navigation"
              className="lg:hidden inline-flex min-h-11 min-w-11 items-center justify-center" style={{ color: 'rgba(209,221,230,0.5)' }}>
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="h-4 w-0.5" style={{ backgroundColor: '#7BA7BC' }} />
              <h1 className="font-display text-base uppercase tracking-wide" style={{ color: '#F1F3F4' }}>
                {activeLabel}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <span className="hidden sm:inline font-body text-[10px] uppercase tracking-wider" style={{ color: '#e0b36a' }} role="status">
                Unsaved admin changes
              </span>
            )}
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search admin tools" title="Search admin tools"
              className="flex min-h-11 items-center gap-2 px-3 py-1.5 font-body text-[11px] transition-colors"
              style={{ border: '1px solid rgba(123,167,188,0.25)', color: 'rgba(209,221,230,0.5)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#7BA7BC'; e.currentTarget.style.color = '#F1F3F4'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(123,167,188,0.25)'; e.currentTarget.style.color = 'rgba(209,221,230,0.5)'; }}>
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline px-1.5 py-0.5 text-[9px] font-body uppercase"
                style={{ border: '1px solid rgba(123,167,188,0.3)', color: 'rgba(123,167,188,0.7)' }}>
                Ctrl K
              </kbd>
            </button>
            <span className="hidden md:block font-body text-[11px] uppercase tracking-widest" style={{ color: 'rgba(123,167,188,0.4)' }}>
              {new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto relative">
          <div className="absolute inset-0 pointer-events-none" style={{ ...GRID_BG, maskImage: 'linear-gradient(180deg, black, transparent 320px)', WebkitMaskImage: 'linear-gradient(180deg, black, transparent 320px)' }} />
          <div className="relative">
            {children}
          </div>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={onSectionChange} />
    </div>
  );
}
