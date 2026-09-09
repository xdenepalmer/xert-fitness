import {readFileSync} from 'node:fs';

/** Existing invariant checks follow the cohesive member surface extraction. */
export function readMembersSource() {
  return ['MembersManager.jsx','MemberDrawer.jsx','MemberQueues.jsx','MemberDialogs.jsx','MemberConfirmation.jsx']
    .map(file => readFileSync(new URL(`../../src/components/admin/${file}`, import.meta.url), 'utf8')).join('\n');
}
