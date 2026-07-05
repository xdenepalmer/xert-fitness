import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// ─── Site content (CMS) ───────────────────────────────────────────────────────
// Content lives in public.site_content as JSONB per section key. Public pages
// render hard-coded fallbacks immediately, then overlay whatever the admin has
// saved — so an empty CMS never breaks the site.

const cache = new Map();

export async function fetchSiteContent(key) {
  if (cache.has(key)) return cache.get(key);
  const { data, error } = await supabase
    .from('site_content')
    .select('data')
    .eq('key', key)
    .maybeSingle();
  if (error) return null;
  const value = data?.data ?? null;
  cache.set(key, value);
  return value;
}

export function clearSiteContentCache() {
  cache.clear();
}

/**
 * React hook: returns `fallback` merged (shallow) with the CMS value for `key`.
 * Arrays and scalars in the CMS replace the fallback wholesale.
 */
export function useSiteContent(key, fallback) {
  const [content, setContent] = useState(fallback);

  useEffect(() => {
    let active = true;
    fetchSiteContent(key).then(value => {
      if (!active || !value) return;
      setContent(prev =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? { ...prev, ...value }
          : value
      );
    });
    return () => { active = false; };
    // `fallback` is intentionally not a dependency — it's a static default.
  }, [key]);

  return content;
}
