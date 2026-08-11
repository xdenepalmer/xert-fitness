import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { metadataForPath, SITE_NAME, SOCIAL_IMAGE } from './pageMetadata';

function setMeta(selector, attribute, value, content) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, value);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

export default function RouteMetadata() {
  const { pathname } = useLocation();

  // Route-owned install metadata must update before the admin auth/profile
  // gate paints. This also makes a direct /admin visit install the owner PWA
  // even when the visitor is currently signed out or profile verification is
  // temporarily unavailable.
  useLayoutEffect(() => {
    const metadata = metadataForPath(pathname);
    const adminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
    const canonicalURL = new URL(metadata.path || '/', window.location.origin).href;
    // Absolute URL is required: social crawlers cannot resolve a relative image.
    const imageURL = new URL(metadata.image || SOCIAL_IMAGE.url, window.location.origin).href;

    document.title = metadata.title;
    setMeta('meta[name="description"]', 'name', 'description', metadata.description);
    setMeta('meta[name="robots"]', 'name', 'robots', metadata.indexable ? 'index, follow' : 'noindex, nofollow');
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME);
    setMeta('meta[property="og:title"]', 'property', 'og:title', metadata.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', metadata.description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalURL);
    setMeta('meta[property="og:image"]', 'property', 'og:image', imageURL);
    setMeta('meta[property="og:image:width"]', 'property', 'og:image:width', String(SOCIAL_IMAGE.width));
    setMeta('meta[property="og:image:height"]', 'property', 'og:image:height', String(SOCIAL_IMAGE.height));
    setMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', SOCIAL_IMAGE.alt);
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', metadata.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', metadata.description);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', imageURL);
    setMeta(
      'meta[name="apple-mobile-web-app-title"]',
      'name',
      'apple-mobile-web-app-title',
      adminRoute ? 'XERT Owner' : 'XERT',
    );

    let manifest = document.head.querySelector('link[rel="manifest"]');
    if (!manifest) {
      manifest = document.createElement('link');
      manifest.setAttribute('rel', 'manifest');
      document.head.appendChild(manifest);
    }
    manifest.setAttribute('href', adminRoute ? '/admin-manifest.json' : '/manifest.json');

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalURL);
  }, [pathname]);

  return null;
}
