// @ts-nocheck -- cmdk's polymorphic JavaScript wrappers are isolated here.
import React, { useEffect, useState } from 'react';
import {
  ExternalLink, User,
} from 'lucide-react';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { adminSearchMembers } from '@/lib/adminData';
import { ADMIN_QUICK_ACTIONS, ADMIN_WORKSPACES } from '@/lib/adminWorkspaces';

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

    const isMemberSearch = /^member\s+/i.test(query);
    const memberQuery = query.replace(/^member\s+/i, '').trim();
    if (!isMemberSearch || memberQuery.length < 2) {
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
    const navigated = onNavigate(sectionKey, params);
    if (navigated !== false) onOpenChange(false);
  };
  const memberSearchRequested = /^member\s+/i.test(query);
  const memberSearchTerm = query.replace(/^member\s+/i, '').trim();
  const emptyMessage = memberSearchLoading
    ? 'Searching members...'
    : memberSearchError
      || (memberSearchRequested
        ? memberSearchTerm.length < 2 ? 'Type at least two letters after member.' : 'No matching member.'
        : query.trim() ? 'No matching admin task.' : 'Nothing found.');

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Find an owner task">
      <CommandInput value={query} onValueChange={setQuery} placeholder="Find a task, or type member + name…" inputMode="search" enterKeyHint="search" />
      <CommandList className="max-h-[min(68dvh,34rem)] overscroll-contain sm:max-h-[420px]">
        <CommandEmpty>
          {emptyMessage}
        </CommandEmpty>

        <CommandGroup heading="Quick actions">
          {ADMIN_QUICK_ACTIONS.map(c => {
            const Icon = c.icon;
            return (
              <CommandItem key={`q-${c.label}`} onSelect={() => run(c.key, c.params)}>
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
          {ADMIN_WORKSPACES.map(c => {
            const Icon = c.icon;
            return (
              <CommandItem key={c.key} value={`go ${c.label} ${c.detail}`} onSelect={() => run(c.key)}>
                <Icon className="text-xert-steel" />
                <span className="min-w-0">
                  <span className="block">{c.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.detail}</span>
                </span>
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
