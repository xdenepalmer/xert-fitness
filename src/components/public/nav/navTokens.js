// Both fit measurement and open-sheet cleanup use the generated CSS value.
export function navDesktopMediaQuery(style = getComputedStyle(document.documentElement)) {
  return `(min-width: ${style.getPropertyValue('--nav-breakpoint-desktop').trim()})`;
}
