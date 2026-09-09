import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('calendar weekday headers and date rows share a bounded scroller and token-sized targets', () => {
  const board = read('src/components/admin/ClassCalendarBoard.jsx');
  const css = read('src/components/admin/calendar.css');
  assert.match(board, /className="calendar-month-scroll" role="region" aria-label="Calendar dates" tabIndex=\{0\}/);
  assert.match(board, /calendar-month-grid[\s\S]*Weekday header[\s\S]*role="grid"/);
  assert.match(css, /\.calendar-month-scroll \{[^}]*max-width: 100%;[^}]*overflow-x: auto/);
  assert.match(css, /\.calendar-month-grid \{[^}]*min-width: calc\(7 \* \(var\(--control-height\) \+ var\(--nav-line-width\)\)\)/);
  assert.match(css, /\.calendar-day-cell \{[^}]*min-width: var\(--control-height\);[^}]*min-height: var\(--control-height\)/);
});
