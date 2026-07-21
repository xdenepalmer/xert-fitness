const ACTIVATION_STAGE_DEFINITIONS = Object.freeze([
  { key: 'accounts_created', label: 'Accounts', detail: 'Created in cohort' },
  { key: 'readiness_complete', label: 'Ready', detail: 'Member setup complete' },
  { key: 'training_access', label: 'Access', detail: 'Pack or credits activated' },
  { key: 'first_booking', label: 'Booked', detail: 'First class booked' },
  { key: 'first_attended', label: 'Attended', detail: 'First class completed' },
  { key: 'returned', label: 'Returned', detail: 'Second class completed' },
]);

const ACTIVATION_REASON_LABELS = Object.freeze({
  setup_incomplete: 'Setup incomplete',
  readiness_incomplete: 'Setup incomplete',
  no_training_access: 'No training access',
  no_first_booking: 'No first booking',
  no_first_attendance: 'No completed class',
});

function boundedCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
}

export function activationStagePresentation(snapshot) {
  const denominator = boundedCount(snapshot?.accounts_created);
  let previousCount = null;

  return ACTIVATION_STAGE_DEFINITIONS.map(stage => {
    const count = boundedCount(snapshot?.[stage.key]);
    const inconsistent = count !== null && previousCount !== null && count > previousCount;
    if (count !== null) previousCount = count;

    const rate = denominator !== null && denominator > 0 && count !== null
      ? Math.min(100, Math.round((count / denominator) * 100))
      : null;

    return {
      ...stage,
      count,
      countLabel: count === null ? '—' : String(count),
      rate,
      rateLabel: rate === null ? 'Not enough data' : `${rate}% of accounts`,
      inconsistent,
    };
  });
}

export function activationSnapshotPresentation(snapshot, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const maximumAgeMs = Number.isFinite(options.maximumAgeMs)
    ? Math.max(0, options.maximumAgeMs)
    : 15 * 60 * 1000;
  const stages = activationStagePresentation(snapshot);
  const asOf = snapshot?.as_of ? new Date(snapshot.as_of) : null;
  const asOfMs = asOf?.getTime();
  const validAsOf = Number.isFinite(asOfMs);
  const ageMs = validAsOf ? now.getTime() - asOfMs : null;

  return {
    stages,
    partial: stages.some(stage => stage.count === null),
    inconsistent: stages.some(stage => stage.inconsistent),
    stale: !validAsOf || ageMs < -60_000 || ageMs > maximumAgeMs,
    asOf: validAsOf ? asOf : null,
    cohortDays: boundedCount(snapshot?.cohort_days),
  };
}

export function activationQueuePresentation(rows, limit = 12) {
  const safeLimit = Math.max(1, Math.min(20, Math.floor(Number(limit) || 12)));
  const seen = new Set();

  return (Array.isArray(rows) ? rows : [])
    .filter(member => {
      const id = String(member?.id || '').trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, safeLimit)
    .map(member => ({
      ...member,
      activationReasonLabel: ACTIVATION_REASON_LABELS[member.reason] || 'Activation follow-up',
    }));
}
