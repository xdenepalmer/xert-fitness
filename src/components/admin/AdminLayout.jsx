import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, DollarSign, Ticket, CalendarDays, Inbox, Dumbbell,
  CalendarRange, PenSquare, UserSquare2, Trophy, ClipboardList, UserCog,
  Handshake, Settings, BarChart3, LogOut, ExternalLink, Menu, X, Search,
  CircleAlert, ShieldCheck,
} from 'lucide-react';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { getAdminBadgeCounts } from '@/lib/adminData';
import CommandPalette from '@/components/admin/CommandPalette';

const LOGO = '/assets/xert-logo-full.png';

const NAV_GROUPS = [
  {
    heading: null,
    items: [
      { key: 'overview', label: 'Overview', icon: LayoutDashboard },
      { key: 'health', label: 'Operations Health', icon: ShieldCheck },
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

export default function AdminLayout({ activeSection, onSectionChange, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [badges, setBadges] = useState({});
  const [badgesUnavailable, setBadgesUnavailable] = useState(false);
  const { user, profile, signOut } = useSupabaseAuth();

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

  // Attention badges (new leads, pending requests) — refresh on section change.
  useEffect(() => {
    let active = true;
    getAdminBadgeCounts()
      .then(data => {
        if (!active) return;
        setBadges(data);
        setBadgesUnavailable(false);
      })
      .catch(() => {
        if (!active) return;
        setBadges({});
        setBadgesUnavailable(true);
      });
    return () => { active = false; };
  }, [activeSection]);

  const activeLabel = ALL_ITEMS.find(n => n.key === activeSection)?.label || 'Command Centre';
  const initials = (profile?.full_name || user?.email || 'A')
    .split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#0b1218' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
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
            <img src={LOGO} alt="XERT" className="h-7 w-auto mb-2" style={{ filter: 'brightness(0) invert(1)' }} />
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
          <button onClick={() => setSidebarOpen(false)}
            className="lg:hidden absolute top-4 right-4 p-1" style={{ color: 'rgba(209,221,230,0.5)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
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
                    key={item.key}
                    onClick={() => { onSectionChange(item.key); setSidebarOpen(false); }}
                    className="relative w-full flex items-center gap-3 px-5 py-2.5 text-left transition-all group"
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
            <Link to="/"
              className="flex items-center justify-center gap-1.5 py-2 font-body text-[10px] uppercase tracking-wider transition-colors"
              style={{ border: '1px solid rgba(123,167,188,0.2)', color: 'rgba(209,221,230,0.5)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(123,167,188,0.5)'; e.currentTarget.style.color = '#F1F3F4'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(123,167,188,0.2)'; e.currentTarget.style.color = 'rgba(209,221,230,0.5)'; }}>
              <ExternalLink className="w-3 h-3" /> Site
            </Link>
            <button onClick={signOut}
              className="flex items-center justify-center gap-1.5 py-2 font-body text-[10px] uppercase tracking-wider transition-colors"
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
        <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between"
          style={{
            backgroundColor: 'rgba(11,18,24,0.92)',
            borderBottom: '1px solid rgba(123,167,188,0.14)',
            backdropFilter: 'blur(10px)',
          }}>
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1" style={{ color: 'rgba(209,221,230,0.5)' }}>
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
            <button onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 font-body text-[11px] transition-colors"
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
