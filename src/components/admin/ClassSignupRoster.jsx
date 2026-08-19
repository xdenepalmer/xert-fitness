import React from 'react';
import { Loader2, Mail, Phone } from 'lucide-react';

const STATUS_CHIP = {
  confirmed: 'border-green-600/40 text-green-400',
  requested: 'border-xert-orange/40 text-xert-orange',
  waitlisted: 'border-blue-600/40 text-blue-400',
  attended: 'border-green-600/40 text-green-400',
  cancelled: 'border-xert-steel/30 text-xert-concrete/40',
  declined: 'border-xert-steel/30 text-xert-concrete/40',
  no_show: 'border-xert-red/40 text-xert-red',
};

/**
 * Everyone attached to one class: people who took a spot through the public
 * timetable, people whose request is still pending, and members booked with
 * credits. Contact details sit next to each name so the owner can act on the
 * list without leaving the calendar.
 */
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
  const confirmed = signups.filter(s => s.status === 'confirmed');
  const pending = signups.filter(s => s.status === 'requested');
  const other = signups.filter(s => !['confirmed', 'requested'].includes(s.status));
  const activeMembers = members.filter(m => ['requested', 'confirmed'].includes(m.status));
  const taken = confirmed.length + activeMembers.length;

  const row = person => (
    <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 bg-xert-ink p-3">
      <div className="min-w-0">
        <p className="font-body text-sm text-xert-offwhite">{person.full_name || person.member_name || 'Unnamed'}</p>
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
        </div>
        {person.notes && <p className="mt-1 font-body text-xs text-xert-concrete/45">{person.notes}</p>}
      </div>
      {onStatusChange && statuses.length > 0 ? (
        <select
          value={person.status}
          onChange={event => onStatusChange(person.id, event.target.value)}
          disabled={updatingId === person.id}
          aria-label={`Status for ${person.full_name || 'attendee'}`}
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

  const group = (title, people, emptyCopy) => (
    <div className="mb-4 last:mb-0">
      <h5 className="mb-2 font-body text-xs uppercase tracking-wider text-xert-concrete/45">
        {title} ({people.length})
      </h5>
      {people.length === 0
        ? <p className="font-body text-xs text-xert-concrete/35">{emptyCopy}</p>
        : <div className="space-y-2">{people.map(row)}</div>}
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
            {pending.length > 0 ? ` · ${pending.length} awaiting your decision` : ''}
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
          {group('Attending', confirmed, 'Nobody has taken a spot yet.')}
          {group('Awaiting decision', pending, 'No pending requests or interest.')}
          {activeMembers.length > 0 && group('Members booked with credits', activeMembers, '')}
          {other.length > 0 && group('Cancelled and declined', other, '')}
        </>
      )}
    </div>
  );
}
