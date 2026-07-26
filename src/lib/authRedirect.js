const AUTH_PATHS = new Set(['/login', '/register', '/forgot-password', '/reset-password']);

export function safeAuthReturnPath(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || candidate.length > 1000) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, 'https://xert.local');
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    // URL parsing removes dot segments. Re-check the serialized result because
    // a value such as `/..//evil.example` normalizes to `//evil.example`, which
    // would become a cross-origin scheme-relative redirect if passed to
    // location.replace.
    if (
      parsed.origin !== 'https://xert.local'
      || !normalized.startsWith('/')
      || normalized.startsWith('//')
      || normalized.includes('\\')
      || AUTH_PATHS.has(parsed.pathname)
    ) return fallback;
    return normalized;
  } catch {
    return fallback;
  }
}

export function authPathWithNext(authPath, returnPath) {
  const safePath = safeAuthReturnPath(returnPath);
  return `${authPath}?${new URLSearchParams({ next: safePath })}`;
}
