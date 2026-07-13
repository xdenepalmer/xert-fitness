const METRIC_KEYS = [
  'members', 'trainers', 'partners', 'newMembers', 'ptInterest', 'eventPrepInterest',
  'pendingLegacy', 'pendingMembers', 'waitlistedLegacy', 'waitlistedMembers', 'ptRequests',
  'attended30Days', 'noShows30Days'
];

function settledResponse(results, index, errors) {
  const key = METRIC_KEYS[index];
  const result = results[index];
  if (result?.status === 'rejected') {
    errors.push(`${key}: ${result.reason?.message || 'unavailable'}`);
    return null;
  }
  if (result?.value?.error) {
    errors.push(`${key}: ${result.value.error.message || 'unavailable'}`);
    return null;
  }
  return result?.value || null;
}

function exactCount(response) {
  return Number.isFinite(response?.count) ? response.count : null;
}

function sumKnownCounts(first, second) {
  const a = exactCount(first);
  const b = exactCount(second);
  return a === null || b === null ? null : a + b;
}

function topSelections(rows, key, label) {
  const counts = {};
  rows.forEach(row => {
    (row[key] || []).forEach(value => {
      counts[value] = (counts[value] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([value, count]) => ({ [label]: value, count }));
}

export function dashboardMetricsFromSettled(results) {
  const errors = [];
  const responses = METRIC_KEYS.map((_, index) => settledResponse(results, index, errors));
  const [members, trainers, partners, newMembers, ptInterest, eventPrepInterest,
    pendingLegacy, pendingMembers, waitlistedLegacy, waitlistedMembers, ptRequests,
    attended30Days, noShows30Days] = responses;
  const memberRows = members?.data || [];
  const memberCount = exactCount(members);
  const attendedCount = exactCount(attended30Days);
  const noShowCount = exactCount(noShows30Days);
  const attendanceDecisions = attendedCount === null || noShowCount === null
    ? null
    : attendedCount + noShowCount;

  return {
    totalMembers: memberCount,
    newThisWeek: exactCount(newMembers),
    trainerApplicants: exactCount(trainers),
    partnerEnquiries: exactCount(partners),
    ptInterest: exactCount(ptInterest),
    eventPrepInterest: exactCount(eventPrepInterest),
    topTimes: members ? topSelections(memberRows, 'preferred_training_times', 'time') : null,
    topGoals: members ? topSelections(memberRows, 'main_training_goals', 'goal') : null,
    pendingBookings: sumKnownCounts(pendingLegacy, pendingMembers),
    waitlistedBookings: sumKnownCounts(waitlistedLegacy, waitlistedMembers),
    ptRequests: exactCount(ptRequests),
    attended30Days: attendedCount,
    noShows30Days: noShowCount,
    attendanceRate30Days: attendanceDecisions
      ? Math.round((attendedCount / attendanceDecisions) * 100)
      : attendanceDecisions,
    insightsSampled: memberCount !== null && memberRows.length < memberCount,
    insightSampleSize: memberRows.length,
    errors
  };
}
