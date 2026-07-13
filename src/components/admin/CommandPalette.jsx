// @ts-nocheck -- cmdk's polymorphic JavaScript wrappers are isolated here.
import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, DollarSign, Ticket, CalendarDays, Inbox, Dumbbell,
  CalendarRange, PenSquare, UserSquare2, Trophy, ClipboardList, UserCog,
  BellRing, Handshake, Settings, BarChart3, ExternalLink, Plus, User, ShieldCheck, ScrollText,
} from 'lucide-react';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { adminSearchMembers } from '@/lib/adminData';

const NAV_COMMANDS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'health', label: 'Operations Health', icon: ShieldCheck },
  { key: 'audit', label: 'Admin Audit', icon: ScrollText },
  { key: 'gym-members', label: 'Members', icon: Users },
  { key: 'orders', label: 'Orders & Revenue', icon: DollarSign },
  { key: 'products', label: 'Session Packs', icon: Ticket },
  { key: 'calendar', label: 'Class Calendar', icon: CalendarDays },
  { key: 'bookings', label: 'Booking Requests', icon: Inbox },
  { key: 'pt-requests', label: 'PT Requests', icon: Dumbbell },
  { key: 'availability', label: 'Availability / Blackouts', icon: CalendarRange },
  { key: 'announcements', label: 'Member Notices', icon: BellRing },
  { key: 'content', label: 'Site Content (CMS)', icon: PenSquare },
  { key: 'coaches', label: 'Coaches & Team', icon: UserSquare2 },
  { key: 'events', label: 'Event Calendar', icon: Trophy },
  { key: 'members', label: 'Member Leads', icon: ClipboardList },
  { key: 'trainers', label: 'Trainer Applicants', icon: UserCog },
  { key: 'partners', label: 'Partner Enquiries', icon: Handshake },
  { key: 'settings', label: 'Soft Launch Settings', icon: Settings },
  { key: 'campaigns', label: 'Campaign Stats', icon: BarChart3 },
];

const QUICK_COMMANDS = [
  { key: 'calendar', label: 'Create a new class', icon: Plus },
  { key: 'products', label: 'Create a session pack', icon: Plus },
  { key: 'coaches', label: 'Add a coach or practitioner', icon: Plus },
  { key: 'events', label: 'Add an event', icon: Plus },
  { key: 'announcements', label: 'Create a member notice', icon: BellRing },
];

/**
 * Global ⌘K / Ctrl+K palette: jump to any admin section, run quick actions,
 * or find a member by name/email.
 */
export default function CommandPalette({ open, onOpenChange, onNavigate }) {
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [memberSearchError, setMemberSearchError] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
      setMembers([]);
      setMemberSearchLoading(false);
      setMemberSearchError('');
      return undefined;
    }

    const memberQuery = query.replace(/^member\s+/i, '').trim();
    if (memberQuery.length < 2) {
      setMembers([]);
      setMemberSearchLoading(false);
      setMemberSearchError('');
      return undefined;
    }

    let active = true;
    setMembers([]);
    setMemberSearchLoading(true);
    setMemberSearchError('');
    const timeoutId = window.setTimeout(() => {
      adminSearchMembers(memberQuery, 12)
        .then(results => { if (active) setMembers(results); })
        .catch(error => {
          if (!active) return;
          setMembers([]);
          setMemberSearchError(error.message || 'Member search is unavailable.');
        })
        .finally(() => { if (active) setMemberSearchLoading(false); });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [open, query]);

  const run = (sectionKey, params) => {
    onNavigate(sectionKey, params);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Jump to a section, action or member…" />
      <CommandList>
        <CommandEmpty>
          {memberSearchLoading
            ? 'Searching members...'
            : memberSearchError || (query.trim().length >= 2 ? 'No matching command or member.' : 'Nothing found.')}
        </CommandEmpty>

        <CommandGroup heading="Quick actions">
          {QUICK_COMMANDS.map(c => {
            const Icon = c.icon;
            return (
              <CommandItem key={`q-${c.label}`} onSelect={() => run(c.key, { action: 'create' })}>
                <Icon className="text-xert-steel" />
                <span>{c.label}</span>
              </CommandItem>
            );
          })}
          <CommandItem onSelect={() => { window.open('/', '_blank'); onOpenChange(false); }}>
            <ExternalLink className="text-xert-steel" />
            <span>Open public site</span>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Go to">
          {NAV_COMMANDS.map(c => {
            const Icon = c.icon;
            return (
              <CommandItem key={c.key} value={`go ${c.label}`} onSelect={() => run(c.key)}>
                <Icon className="text-xert-steel" />
                <span>{c.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {members.length > 0 && (
          <CommandGroup heading="Members">
            {members.map(m => (
              <CommandItem key={m.id} value={`member ${m.full_name || ''} ${m.email || ''} ${m.phone || ''}`}
                className="group data-[selected=true]:bg-xert-steel data-[selected=true]:text-xert-ink"
                onSelect={() => run('gym-members', { member: m.id })}>
                <User className="text-xert-steel group-data-[selected=true]:text-xert-ink" />
                <span>{m.full_name || m.email}</span>
                <span className="ml-auto text-xs text-muted-foreground group-data-[selected=true]:text-xert-ink/70">
                  {m.credits_remaining} credit{Number(m.credits_remaining) === 1 ? '' : 's'}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
