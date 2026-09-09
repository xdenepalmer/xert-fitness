/** An explicit open roster remains visible without changing the matching results. */
export function calendarListWithSelectedSession(matchingRows, sessions, selectedSessionId) {
  const selected = selectedSessionId && !matchingRows.some(row => row.id === selectedSessionId)
    ? sessions.find(row => row.id === selectedSessionId)
    : null;
  return {
    rows: selected ? [selected, ...matchingRows] : matchingRows,
    selectedOutsideFilters: selected?.id ?? null,
  };
}
