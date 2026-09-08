/** Resolve a semantic color for canvas and encoders which cannot consume CSS variables.
 * Read on use so inherited themes are respected. QR encoders require a hex string.
 */
export function resolveSemanticColor(name, element = document.documentElement) {
  if (!/^[a-z][a-z0-9.-]*$/.test(name)) throw new TypeError('Invalid semantic token name');
  const key = name.replaceAll('.', '-');
  const value = getComputedStyle(element).getPropertyValue(`--${key}`).trim();
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)) return value;
  if (/^#[\da-f]{3,4}$/i.test(value)) return '#' + [...value.slice(1)].map(channel => channel + channel).join('');
  // Read the actual overridden value, never the independently generated -rgb twin.
  // Support browser RGB serialization (comma or space syntax), percentages and alpha.
  const rgb = value.match(/^rgba?\(([^()]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].trim().split(/[\s,/]+/);
    if ((parts.length === 3 || parts.length === 4) && parts.every(part => /^\d*\.?\d+%?$/.test(part))) {
      const channels = parts.slice(0, 3).map(part => part.endsWith('%') ? parseFloat(part) * 255 / 100 : parseFloat(part));
      const alpha = parts.length === 4 ? parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1) : 1;
      if (channels.every(channel => channel >= 0 && channel <= 255) && alpha >= 0 && alpha <= 1) {
        return '#' + [...channels, ...(alpha < 1 ? [alpha * 255] : [])].map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('');
      }
    }
  }
  throw new Error(`Missing resolved semantic color: ${name}`);
}
