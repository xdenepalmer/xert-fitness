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
const FORMULA_TRIGGER = /^[=+\-@\t\r\n]/;
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

export function neutralizeFormula(str) {
  return FORMULA_TRIGGER.test(str) ? `'${str}` : str;
}

export function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const raw = Array.isArray(value) ? value.join('; ') : String(value);
  const str = PLAIN_NUMBER.test(raw) ? raw : neutralizeFormula(raw);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Builds CSV text without transport encoding details such as a BOM.
 */
export function buildCsv(rows, columns) {
  if (!rows || rows.length === 0) return '';
  const cols = columns || Object.keys(rows[0]).map(k => ({ key: k, label: k }));
  return [
    cols.map(c => escapeCell(c.label)).join(','),
    ...rows.map(row => cols.map(c => escapeCell(row[c.key])).join(',')),
  ].join('\n');
}

/**
 * Serializes rows (array of objects) to a CSV string with a UTF-8 BOM.
 * columns: [{ key, label }] — controls order and headers. Pure (no DOM), so it
 * is unit-testable; downloadCsv wraps it with the browser download.
 */
export function toCsv(rows, columns) {
  if (!rows || rows.length === 0) return '';
  return '﻿' + buildCsv(rows, columns);
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
  a.rel = 'noopener';
  // Anchored in the document and revoked on a later task: Firefox aborts the
  // download when the object URL is released in the same task as the click.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
