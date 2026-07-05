// Client-side CSV download helper for admin exports.

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const str = Array.isArray(value) ? value.join('; ') : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Downloads rows (array of objects) as a CSV file.
 * columns: [{ key, label }] — controls order and headers.
 */
export function downloadCsv(filename, rows, columns) {
  if (!rows || rows.length === 0) return;
  const cols = columns || Object.keys(rows[0]).map(k => ({ key: k, label: k }));
  const lines = [
    cols.map(c => escapeCell(c.label)).join(','),
    ...rows.map(row => cols.map(c => escapeCell(row[c.key])).join(',')),
  ];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
