import { CalendarDays, ClipboardList, Dumbbell, Users } from 'lucide-react';
import {
  adminListMembers, adminSessionRoster, getClassBookings, getClassSessions,
  getMemberLeads, getPTRequests,
} from '@/lib/adminData';

// ─── Audiences for owner broadcasts ─────────────────────────────────────────
// Text members and Email members pick from the same groups, so a change to
// who counts as "a class" or "member leads" reaches both screens at once.

export const BROADCAST_AUDIENCES = Object.freeze([
  { key: 'members', label: 'All members', detail: 'Every signed-up member account', icon: Users },
  { key: 'class', label: 'A class', detail: 'Sign-ups, requests and roster for one class', icon: CalendarDays },
  { key: 'leads', label: 'Member leads', detail: 'People who expressed interest in joining', icon: ClipboardList },
  { key: 'pt', label: 'PT requests', detail: 'Private training enquiries', icon: Dumbbell },
]);

export function formatBroadcastSessionLabel(session) {
  const when = session.start_time
    ? new Date(session.start_time).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : 'unscheduled';
  return `${session.title || session.class_type} — ${when}`;
}

/** Classes worth broadcasting about: anything that has not finished more than six hours ago. */
export async function loadBroadcastSessions() {
  const loaded = await getClassSessions(false);
  return loaded.filter(session => session.start_time
    && new Date(session.start_time).getTime() > Date.now() - 6 * 60 * 60 * 1000);
}

async function collectPagedRows(fetchPage) {
  const rows = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await fetchPage(page);
    rows.push(...result.rows);
    if (result.rows.length < result.pageSize) break;
  }
  return rows;
}

export async function loadAudienceRows(audience, sessionId) {
  if (audience === 'members') {
    const members = await adminListMembers();
    return members.map(member => ({ ...member, detail: 'Member' }));
  }
  if (audience === 'leads') {
    const leads = await collectPagedRows(page => getMemberLeads({ page, pageSize: 200 }));
    return leads.map(lead => ({ ...lead, detail: `Lead · ${lead.status || 'new'}` }));
  }
  if (audience === 'pt') {
    const requests = await collectPagedRows(page => getPTRequests({ page, pageSize: 200, includeSummary: false }));
    return requests.map(request => ({ ...request, detail: `PT · ${request.status || 'requested'}` }));
  }
  if (audience === 'class') {
    if (!sessionId) return [];
    const [signups, roster] = await Promise.all([
      getClassBookings({ class_session_id: sessionId }),
      adminSessionRoster(sessionId).catch(() => []),
    ]);
    return [
      ...roster.map(member => ({ ...member, detail: `Roster · ${member.status}` })),
      ...signups.map(signup => ({ ...signup, detail: `Sign-up · ${signup.status}` })),
    ];
  }
  return [];
}
