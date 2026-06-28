/**
 * captureLeadSource
 * Reads UTM params, referrer and landing path from the current browser context.
 * Call once at form init and merge into the submission payload.
 */
export function captureLeadSource() {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);

  return {
    source: params.get('source') || params.get('utm_source') || document.referrer?.split('/')[2] || null,
    campaign: params.get('campaign') || params.get('utm_campaign') || null,
    utm_source: params.get('utm_source') || null,
    utm_medium: params.get('utm_medium') || null,
    utm_campaign: params.get('utm_campaign') || null,
    utm_content: params.get('utm_content') || null,
    referrer: document.referrer || null,
    landing_path: window.location.pathname + window.location.search || null,
  };
}