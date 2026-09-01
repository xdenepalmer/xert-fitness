import React from 'react';
import { classSignupState } from '@/lib/classSignup';

export const CLASS_COLORS = {
  'XERT Foundation': 'border-green-600/40 text-green-400',
  'XERT Strength': 'border-blue-600/40 text-blue-400',
  'XERT Engine': 'border-xert-orange/40 text-xert-orange',
  'XERT Hybrid': 'border-purple-600/40 text-purple-400',
  'XERT Event Prep': 'border-xert-red/40 text-xert-red',
  'XERT Team': 'border-yellow-600/40 text-yellow-400',
};

export const CLASS_DOT_COLORS = {
  'XERT Foundation': 'bg-green-400',
  'XERT Strength': 'bg-blue-400',
  'XERT Engine': 'bg-xert-orange',
  'XERT Hybrid': 'bg-purple-400',
  'XERT Event Prep': 'bg-xert-red',
  'XERT Team': 'bg-yellow-400',
};

export default function ClassSessionCard({ session, bookingsEnabled, onBook, fitbox = null, availability = null }) {
  const colorClass = CLASS_COLORS[session.class_type] || 'border-xert-steel/40 text-xert-concrete/60';
  const signup = classSignupState({ session, availability, bookingsEnabled, fitbox });
  const isFull = signup.kind === 'full';

  return (
    <div className={`bg-xert-ink border-l-2 ${isFull ? 'border-xert-steel/30 opacity-60' : 'border-xert-red'} p-5 hover:bg-xert-charcoal transition-colors`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`font-body text-xs border px-2 py-0.5 uppercase ${colorClass}`}>
              {session.class_type}
            </span>
            {session.beginner_friendly && (
              <span className="font-body text-xs border border-green-600/40 text-green-400 px-2 py-0.5 uppercase">
                Beginner friendly
              </span>
            )}
            {isFull && (
              <span className="font-body text-xs bg-xert-steel/30 text-xert-concrete/50 px-2 py-0.5 uppercase">Full</span>
            )}
          </div>
          <h3 className="font-display text-xl text-xert-offwhite uppercase">{session.title}</h3>
        </div>
        {session.intensity_level && (
          <div className="text-right shrink-0">
            <p className="font-body text-xs text-xert-concrete/40 uppercase">Intensity</p>
            <p className="font-display text-sm text-xert-concrete/70 uppercase">{session.intensity_level}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider">Date</p>
          <p className="font-display text-sm text-xert-offwhite tabular-nums">
            {session.start_time ? new Date(session.start_time).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : 'TBC'}
          </p>
        </div>
        <div>
          <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider">Time</p>
          <p className="font-display text-sm text-xert-offwhite tabular-nums">
            {session.start_time ? new Date(session.start_time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : 'TBC'}
          </p>
        </div>
        <div>
          <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider">Duration</p>
          <p className="font-display text-sm text-xert-offwhite tabular-nums">{session.duration_minutes || '—'}min</p>
        </div>
        <div>
          <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider">
            {signup.spotsLeft === null ? 'Capacity' : 'Spots left'}
          </p>
          <p className="font-display text-sm text-xert-offwhite tabular-nums">
            {signup.spotsLeft === null
              ? (session.capacity || '—')
              : `${signup.spotsLeft}${session.capacity ? ` / ${session.capacity}` : ''}`}
          </p>
        </div>
      </div>

      {session.coach_name && (
        <p className="font-body text-sm text-xert-concrete/60 mb-4">
          Coach: <span className="text-xert-concrete/80">{session.coach_name}</span>
        </p>
      )}

      {signup.detail && (
        <p className="font-body text-xs text-xert-concrete/50 mb-2">{signup.detail}</p>
      )}

      {signup.kind === 'fitbox' && (
        <a href={fitbox.url} target="_blank" rel="noopener noreferrer"
          className="xert-btn-primary block text-center w-full py-3 font-display text-sm uppercase">
          {signup.label}
        </a>
      )}

      {signup.kind === 'signup' && (
        <button onClick={() => onBook(session)}
          className="xert-btn-primary w-full py-3 font-display text-sm uppercase">
          {signup.label}
        </button>
      )}

      {(signup.kind === 'request' || signup.kind === 'interest') && (
        <button onClick={() => onBook(session)}
          className={`${signup.kind === 'request' ? 'xert-btn-primary' : 'xert-btn-ghost'} w-full py-3 font-display text-sm uppercase`}>
          {signup.label}
        </button>
      )}

      {(signup.kind === 'full' || signup.kind === 'past' || signup.kind === 'provider-unavailable') && (
        <button type="button" disabled aria-disabled="true"
          className="w-full py-3 border border-xert-deep/60 bg-xert-deep/20 text-xert-pale/40 font-display text-sm uppercase cursor-not-allowed">
          {signup.label}
        </button>
      )}
    </div>
  );
}
