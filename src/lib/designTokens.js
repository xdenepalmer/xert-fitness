/** Resolve a semantic color for canvas and encoders which cannot consume CSS variables.
 * Read on use so inherited themes are respected. QR encoders require a hex string.
 */
export function resolveSemanticColor(name, element = document.documentElement) {
  if (!/^[a-z][a-z0-9.-]*$/.test(name)) throw new TypeError('Invalid semantic token name');
  const key = name.replaceAll('.', '-');
  const value = getComputedStyle(element).getPropertyValue(`--${key}`).trim();
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)) return value;
  // The generated channel variables also support browser overrides expressed as rgb().
  const channels = getComputedStyle(element).getPropertyValue(`--${key}-rgb`).trim().split(/\s+/).map(Number);
  if (channels.length === 3 && channels.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
    return '#' + channels.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('');
  }
  throw new Error(`Missing resolved semantic color: ${name}`);
}
