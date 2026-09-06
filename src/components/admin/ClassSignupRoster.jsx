import React from 'react';
import { Loader2, Mail, Phone } from 'lucide-react';

import { gymTimeLabel } from '@/lib/gymTime';
import { rosterPeople, rosterPlacesHeld } from '@/lib/classRoster';

const STATUS_CHIP = {
  confirmed: 'border-green-600/40 text-green-400',
  requested: 'border-xert-orange/40 text-xert-orange',
  waitlisted: 'border-blue-600/40 text-blue-400',
  attended: 'border-green-600/40 text-green-400',
  cancelled: 'border-xert-steel/30 text-xert-concrete/40',
  declined: 'border-xert-steel/30 text-xert-concrete/40',
  no_show: 'border-xert-red/40 text-xert-red',
};

const SOURCE_LABEL = {
  member: 'Member credit',
  signup: 'Timetable sign-up',
};

export default function ClassSignupRoster({
  session,
  signups = [],
  members = [],
  loading = false,
  statuses = [],
  updatingId = null,
  onStatusChange,
  onClose,
}) {
  const people = rosterPeople(signups, members);
  const taken = rosterPlacesHeld(people);
  const inClass = people.filter(person => person.status === 'confirmed');
  const pending = people.filter(person => person.status === 'requested');
  const waiting = people.filter(person => person.status === 'waitlisted');
  const markedOff = people.filter(person => ['attended', 'no_show'].includes(person.status));
  const closed = people.filter(person => ['cancelled', 'declined'].includes(person.status));
  const spotsLeft = session?.capacity ? Math.max(session.capacity - taken, 0) : null;

  const row = (person, index, group) => (
    <div key={`${person.source}-${person.rowId}`} className="flex flex-wrap items-center justify-between gap-3 bg-xert-ink p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-body text-sm text-xert-offwhite">{person.name}</p>
          <span className="shrink-0 border border-xert-steel/25 px-1.5 py-0.5 font-body text-[10px] uppercase tracking-wide text-xert-concrete/45">
            {SOURCE_LABEL[person.source]}
          </span>
          {group === 'waiting' && (
            <span className="shrink-0 font-body text-[10px] uppercase tracking-wide text-blue-400">
              #{index + 1} in the queue
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-3">
          {person.email && (
            <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1 font-body text-xs text-xert-concrete/55 hover:text-xert-steel">
              <Mail className="h-3 w-3" aria-hidden="true" />{person.email}
            </a>
          )}
          {person.phone && (
            <a href={`tel:${String(person.phone).replace(/\s+/g, '')}`} className="inline-flex items-center gap-1 font-body text-xs text-xert-concrete/55 hover:text-xert-steel">
              <Phone className="h-3 w-3" aria-hidden="true" />{person.phone}
            </a>
          )}
          {person.training_level && (
            <span className="font-body text-xs text-xert-concrete/40">{person.training_level}</span>
          )}
          {person.bookedAt && (
            <span className="font-body text-xs text-xert-concrete/35">Booked {gymTimeLabel(person.bookedAt) || '—'}</span>
          )}
        </div>
        {person.notes && <p className="mt-1 font-body text-xs text-xert-concrete/45">{person.notes}</p>}
      </div>
      {onStatusChange && statuses.length > 0 ? (
        <select
          value={person.status}
          onChange={event => onStatusChange(person, event.target.value)}
          disabled={updatingId === person.rowId}
          aria-label={`Status for ${person.name}`}
          className="min-h-11 border border-xert-steel/40 bg-xert-charcoal px-2 font-body text-xs text-xert-offwhite focus:border-xert-red focus:outline-none disabled:opacity-50"
        >
          {statuses.map(status => <option key={status} value={status}>{status}</option>)}
        </select>
      ) : (
        <span className={`border px-2 py-0.5 font-body text-[10px] uppercase ${STATUS_CHIP[person.status] || 'border-xert-steel/30 text-xert-concrete/40'}`}>
          {person.status}
        </span>
      )}
    </div>
  );

  const group = (title, list, emptyCopy, key = '') => (
    <div className="mb-4 last:mb-0">
      <h5 className="mb-2 font-body text-xs uppercase tracking-wider text-xert-concrete/45">
        {title} ({list.length})
      </h5>
      {list.length === 0
        ? <p className="font-body text-xs text-xert-concrete/35">{emptyCopy}</p>
        : <div className="space-y-2">{list.map((person, index) => row(person, index, key))}</div>}
    </div>
  );

  return (
    <div className="border border-xert-steel/25 bg-xert-charcoal p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-display text-sm uppercase text-xert-offwhite">
            {session?.title || 'Class'} — sign-ups
          </h4>
          <p className="mt-0.5 font-body text-xs text-xert-concrete/50">
            {taken}{session?.capacity ? ` of ${session.capacity}` : ''} spot{taken === 1 ? '' : 's'} taken
            {spotsLeft !== null ? ` · ${spotsLeft} left` : ''}
            {pending.length > 0 ? ` · ${pending.length} awaiting your decision` : ''}
            {waiting.length > 0 ? ` · ${waiting.length} on the waitlist` : ''}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose}
            className="min-h-11 border border-xert-steel/30 px-3 font-body text-xs uppercase text-xert-concrete/60 transition-colors hover:border-xert-steel">
            Close
          </button>
        )}
      </div>

      {loading ? (
        <p className="inline-flex items-center gap-2 font-body text-sm text-xert-concrete/50">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading sign-ups…
        </p>
      ) : (
        <>
          {group('In the class', inClass, 'Nobody has taken a spot yet.')}
          {group('Awaiting decision', pending, 'No pending requests or interest.')}
          {waiting.length > 0 && group('Waitlist — first in line first', waiting, '', 'waiting')}
          {markedOff.length > 0 && group('Marked off', markedOff, '')}
          {closed.length > 0 && group('Cancelled and declined', closed, '')}
        </>
      )}
    </div>
  );
}
