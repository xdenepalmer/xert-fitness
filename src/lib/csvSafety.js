/** Prevent spreadsheet programs interpreting user-entered cells as formulas. */
export function protectCSVFormula(value) {
  return String(value ?? '').replace(/^(\s*)([=+\-@])/, "$1'$2");
}
