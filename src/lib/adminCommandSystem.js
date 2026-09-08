import { attendanceRosterMembers, attendanceRoll, attendanceRowId } from './attendanceDraft.js';

const STORAGE_KEY = 'xert.admin.command-centre.v1';

export function fuzzyMatch(label, query) {
  const text = label.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return { score: 0, indices: [] };
  let paths = [{ score: 0, indices: [], cursor: 0 }];
  for (const char of needle) {
    const next = new Map();
    for (const path of paths) {
      for (let index = text.indexOf(char, path.cursor); index >= 0; index = text.indexOf(char, index + 1)) {
        const score = path.score + 10 + (index === 0 || /[^a-z0-9]/.test(text[index - 1]) ? 18 : 0) + (index === path.cursor ? 4 : 0) - (index - path.cursor);
        if (!next.has(index) || next.get(index).score < score) next.set(index, { score, indices: [...path.indices, index], cursor: index + 1 });
      }
    }
    paths = [...next.values()];
    if (!paths.length) return null;
  }
  const best = paths.sort((a, b) => b.score - a.score)[0];
  return { score: best.score, indices: best.indices };
}

export function readPreferences(storage) {
  try {
    const value = JSON.parse((storage || window.localStorage).getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function savePreferences(storage, patch) {
  try { (storage || window.localStorage).setItem(STORAGE_KEY, JSON.stringify({ ...readPreferences(storage), ...patch })); } catch { /* Private browsing and quota must never block navigation. */ }
}
export function recordCommand(history, id, now = Date.now()) {
  const safe = (Array.isArray(history) ? history : []).filter(row => typeof row?.id === 'string' && row.id.length < 80)
    .map(row => ({ id: row.id, count: Math.min(100, Math.max(1, Number(row.count) || 1)), at: Number(row.at) || 0 }));
  return [{ id, count: Math.min(100, (safe.find(row => row.id === id)?.count || 0) + 1), at: now }, ...safe.filter(row => row.id !== id)].slice(0, 20);
}
export function rankCommands(commands, query, history = []) {
  return commands.flatMap(command => {
    const match = fuzzyMatch(command.label, query);
    if (!match) return [];
    const recent = Array.isArray(history) ? history.find(row => row.id === command.id) : null;
    const weight = recent ? Math.min(6, Math.log2((Number(recent.count) || 0) + 1)) + Math.max(0, 4 - (Date.now() - recent.at) / 86400000) : 0;
    return [{ ...command, ...match, score: match.score + weight }];
  }).sort((a, b) => b.score - a.score);
}
export const NAV_SHORTCUTS = { t: 'overview', c: 'calendar', p: 'gym-members', m: 'sms', w: 'forms', b: 'orders' };
export function matchShortcut(event, { typing = false, modal = false, prefix = false } = {}) {
  if (typing || modal || event.altKey || event.isComposing) return null;
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === 'k') return 'palette';
  if (event.metaKey || event.ctrlKey) return null;
  if (key === '?') return 'shortcuts';
  if (prefix && NAV_SHORTCUTS[key]) return NAV_SHORTCUTS[key];
  return key === 'g' ? 'prefix' : null;
}

/** Scoped by a mounted command flow; optimistic consumers supply their own rollback. */
export function createMutationGate() {
  let busy = false;
  return {
    get busy() { return busy; },
    async run({ optimistic, mutate, rollback }) {
      if (busy) return undefined;
      busy = true;
      try { optimistic?.(); return await mutate(); }
      catch (error) { rollback?.(); throw error; }
      finally { busy = false; }
    },
  };
}

export function reviewedAttendance(previous, freshMembers, freshSignups, marks) {
  const fresh = attendanceRosterMembers(attendanceRoll(freshMembers, freshSignups));
  if (freshMembers.some(row => row.status === 'requested') || fresh.length !== previous.length || fresh.some(row => !previous.some(prior => attendanceRowId(prior) === attendanceRowId(row) && prior.status === row.status))) throw new Error('The roll changed. Go back and reload attendance before saving.');
  const entries = previous.map(row => ({ bookingId: attendanceRowId(row), status: marks[attendanceRowId(row)] }));
  if (!entries.length || entries.some(entry => !['attended', 'no_show'].includes(entry.status))) throw new Error('Mark every person before saving attendance.');
  return entries;
}

export function reversibleAttendance(session, roll) {
  return session?.status === 'completed' && session.public_visible === false && roll.length > 0 && roll.every(row => ['attended', 'no_show'].includes(row.status));
}
