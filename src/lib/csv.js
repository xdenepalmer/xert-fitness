// Client-side CSV download helper for admin exports.

// Spreadsheet applications treat a cell whose text begins with one of these as
// a live formula, so untrusted text (public lead forms, PT enquiries, booking
// notes) could execute in an admin's Excel or Google Sheets when they open an
// export. Quoting does not help — the quotes are stripped during CSV parsing,
// before the formula is evaluated. The cell content itself has to be defused.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

// Plain numbers are left alone so genuinely numeric columns (a -50.00 refund,
// for instance) stay usable as numbers in the exported sheet.
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

function neutraliseFormula(str) {
  if (!FORMULA_TRIGGER.test(str) || PLAIN_NUMBER.test(str)) return str;
  return `'${str}`;
}

export function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const raw = Array.isArray(value) ? value.join('; ') : String(value);
  const str = neutraliseFormula(raw);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Builds the CSV text for rows (array of objects).
 * columns: [{ key, label }] — controls order and headers.
 */
export function buildCsv(rows, columns) {
  const cols = columns || Object.keys(rows[0]).map(k => ({ key: k, label: k }));
  return [
    cols.map(c => escapeCell(c.label)).join(','),
    ...rows.map(row => cols.map(c => escapeCell(row[c.key])).join(',')),
  ].join('\n');
}

/**
 * Downloads rows (array of objects) as a CSV file.
 * columns: [{ key, label }] — controls order and headers.
 */
export function downloadCsv(filename, rows, columns) {
  if (!rows || rows.length === 0) return;
  const blob = new Blob(['﻿' + buildCsv(rows, columns)], {
    type: 'text/csv;charset=utf-8;',
  });
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
