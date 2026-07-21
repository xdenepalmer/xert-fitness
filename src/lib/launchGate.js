export const REQUIRED_LAUNCH_CHECKS = Object.freeze([
  'supabase',
  'admins',
  'schema-contract',
  'products',
  'commerce-config',
  'classes',
  'platform-controls',
]);

const OPTIONAL_LAUNCH_CHECKS = Object.freeze([
  'push-notifications',
  'coaches',
  'cms',
]);

export function resolveLaunchGate(checks = []) {
  const byKey = new Map((checks || []).filter(Boolean).map(check => [check.key, check]));
  const required = REQUIRED_LAUNCH_CHECKS.map(key => byKey.get(key)).filter(Boolean);
  const missingKeys = REQUIRED_LAUNCH_CHECKS.filter(key => !byKey.has(key));
  const unavailable = required.filter(check => check.status === 'error');
  const blockers = required.filter(check => check.status !== 'ok');
  const warnings = OPTIONAL_LAUNCH_CHECKS
    .map(key => byKey.get(key))
    .filter(check => check && check.status !== 'ok');
  const completed = required.filter(check => check.status === 'ok').length;

  if (missingKeys.length > 0 || unavailable.length > 0) {
    return {
      state: 'verifying',
      title: 'Verification incomplete',
      detail: 'Do not open member bookings or payments until every required launch check can be verified.',
      completed,
      total: REQUIRED_LAUNCH_CHECKS.length,
      blockers,
      warnings,
      missingKeys,
      next: unavailable[0] || blockers[0] || null,
    };
  }

  if (blockers.length > 0) {
    return {
      state: 'blocked',
      title: 'Hold launch',
      detail: `${blockers.length} required launch gate${blockers.length === 1 ? '' : 's'} need attention.`,
      completed,
      total: REQUIRED_LAUNCH_CHECKS.length,
      blockers,
      warnings,
      missingKeys: [],
      next: blockers[0],
    };
  }

  const platformPhase = byKey.get('platform-controls')?.phase;
  if (!['preflight', 'live'].includes(platformPhase)) {
    return {
      state: 'verifying',
      title: 'Verification incomplete',
      detail: 'The launch-switch state could not be verified. Refresh before opening bookings or payments.',
      completed: Math.max(0, completed - 1),
      total: REQUIRED_LAUNCH_CHECKS.length,
      blockers: [],
      warnings,
      missingKeys: ['platform-controls-phase'],
      next: byKey.get('platform-controls') || null,
    };
  }
  const live = platformPhase === 'live';
  return {
    state: live ? 'live-ready' : 'preflight-ready',
    title: live ? 'Launch path is live' : 'Ready to open',
    detail: live
      ? 'Automated service checks passed with bookings and payments enabled. Complete the controlled live member smoke test.'
      : 'Automated preflight checks passed with launch switches safely paused. Complete the pre-open smoke test, then open deliberately.',
    completed,
    total: REQUIRED_LAUNCH_CHECKS.length,
    blockers: [],
    warnings,
    missingKeys: [],
    next: null,
  };
}
