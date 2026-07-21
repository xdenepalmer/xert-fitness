// Client-side CSV download helper for admin exports.

// Neutralize CSV formula injection (CWE-1236). Excel, Google Sheets and
// LibreOffice interpret a cell that begins with =, +, -, @, a tab or a
// carriage return as a formula. Admin exports here carry attacker-controlled
// lead data (names, notes, goals submitted through public forms), so an
// unescaped =HYPERLINK()/=WEBSERVICE()/DDE payload would execute when a staff
// member opens the file. Prefixing the value with a single quote forces the
// spreadsheet to treat the whole cell as literal text. (This also protects
// legitimate values that merely look like formulas, e.g. a "+61" phone number
// Excel would otherwise try to evaluate.)
export function neutralizeFormula(str) {
  return /^[=+\-@\t\r\n]/.test(str) ? `'${str}` : str;
}

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const raw = Array.isArray(value) ? value.join('; ') : String(value);
  const str = neutralizeFormula(raw);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Serializes rows (array of objects) to a CSV string with a UTF-8 BOM.
 * columns: [{ key, label }] — controls order and headers. Pure (no DOM), so it
 * is unit-testable; downloadCsv wraps it with the browser download.
 */
export function toCsv(rows, columns) {
  if (!rows || rows.length === 0) return '';
  const cols = columns || Object.keys(rows[0]).map(k => ({ key: k, label: k }));
  const lines = [
    cols.map(c => escapeCell(c.label)).join(','),
    ...rows.map(row => cols.map(c => escapeCell(row[c.key])).join(',')),
  ];
  return '﻿' + lines.join('\n');
}

/**
 * Downloads rows (array of objects) as a CSV file.
 * columns: [{ key, label }] — controls order and headers.
 */
export function downloadCsv(filename, rows, columns) {
  if (!rows || rows.length === 0) return;
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
