// Fictional records for the independent UI-kit browser matrix. No live IDs.
export const kitRows = Array.from({ length: 320 }, (_, index) => ({
  id: `fixture-member-${String(index + 1).padStart(3, '0')}`,
  name: `Member ${String(index + 1).padStart(3, '0')}`,
  email: `member-${index + 1}@example.invalid`,
  status: ['active', 'pending', 'cancelled', 'unknown'][index % 4],
  amountInCents: ((index * 971) % 43000) + 100,
  joinedAt: new Date(Date.UTC(2026, 0, (index % 28) + 1, 12)).toISOString(),
  detail: index % 7 === 0
    ? 'A deliberately long fictional note that must remain readable when this row wraps, the container narrows, text is enlarged, or the owner changes row density. Important information must not be hidden to preserve a guessed fixed row height.'
    : 'Fictional browser-verification record.',
}));

export const kitTimeline = [
  { id: 'fixture-event-1', timestamp: '2026-09-01T01:00:00Z', title: 'Membership requested', detail: 'Fictional member completed a reviewable request.' },
  { id: 'fixture-event-2', timestamp: '2026-09-01T02:00:00Z', title: 'Request reviewed', detail: 'Fictional owner reviewed the request.' },
  { id: 'fixture-event-3', timestamp: '2026-09-02T03:00:00Z', title: 'First visit recorded', detail: 'Fictional timeline entry for responsive layout verification.' },
];
