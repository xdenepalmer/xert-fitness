import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', icon: '◈' },
  { key: 'members', label: 'Member Leads', icon: '◉' },
  { key: 'trainers', label: 'Trainer Applicants', icon: '◎' },
  { key: 'partners', label: 'Partner Enquiries', icon: '◌' },
  { key: 'calendar', label: 'Class Calendar', icon: '▦' },
  { key: 'bookings', label: 'Booking Requests', icon: '▷' },
  { key: 'pt-requests', label: 'PT Requests', icon: '▸' },
  { key: 'availability', label: 'Availability / Blackouts', icon: '▣' },
  { key: 'settings', label: 'Soft Launch Settings', icon: '⚙' },
  { key: 'campaigns', label: 'Campaign Stats', icon: '◀' },
];

export default function AdminLayout({ activeSection, onSectionChange, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useSupabaseAuth();

  return (
    <div className="min-h-screen bg-xert-black flex">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-xert-ink border-r border-xert-steel/20 flex flex-col transform transition-transform lg:translate-x-0 lg:static lg:flex ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand */}
        <div className="p-5 border-b border-xert-steel/20">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl text-xert-offwhite font-black uppercase">XERT</span>
            <span className="font-display text-xs text-xert-concrete/40 uppercase tracking-widest">COMMAND</span>
          </div>
          <p className="font-body text-xs text-xert-concrete/30 mt-1 uppercase tracking-wider">Admin</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => { onSectionChange(item.key); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                activeSection === item.key
                  ? 'bg-xert-charcoal text-xert-offwhite border-l-2 border-xert-red'
                  : 'text-xert-concrete/50 hover:text-xert-offwhite hover:bg-xert-charcoal/50'
              }`}
            >
              <span className="text-xert-red/70 text-sm">{item.icon}</span>
              <span className="font-body text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer: account + public link */}
        <div className="p-4 border-t border-xert-steel/20 space-y-3">
          {user?.email && (
            <p className="font-body text-xs text-center text-xert-concrete/30 truncate" title={user.email}>{user.email}</p>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 py-2 font-body text-xs text-xert-concrete/40 hover:text-xert-offwhite uppercase tracking-wider transition-colors border border-xert-steel/20 hover:border-xert-steel/40"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
          <Link to="/" className="block text-center font-body text-xs text-xert-concrete/30 hover:text-xert-concrete/60 uppercase tracking-wider transition-colors">
            ← View public site
          </Link>
        </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-xert-ink border-b border-xert-steel/20 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-xert-concrete/50 hover:text-xert-offwhite p-1">
              <div className="w-5 h-0.5 bg-current mb-1" />
              <div className="w-5 h-0.5 bg-current mb-1" />
              <div className="w-5 h-0.5 bg-current" />
            </button>
            <h1 className="font-display text-base text-xert-offwhite uppercase tracking-wide">
              {NAV_ITEMS.find(n => n.key === activeSection)?.label || 'Command'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:block font-body text-xs text-xert-concrete/30 uppercase tracking-widest">XERT Fitness</span>
            <div className="w-2 h-2 rounded-full bg-xert-red" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}