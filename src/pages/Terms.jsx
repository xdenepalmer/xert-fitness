import React from 'react';
import LegalPage from '@/components/public/LegalPage';
import { useSiteContent } from '@/lib/siteContent';
import { TERMS_DEFAULTS } from '@/lib/contentDefaults';


export default function Terms() {
  // Copy is editable in Admin → Site Content; the defaults render immediately
  // so the page is never blank while the CMS value loads.
  const content = useSiteContent('terms', TERMS_DEFAULTS);
  const sections = Array.isArray(content.sections) && content.sections.length
    ? content.sections
    : TERMS_DEFAULTS.sections;
  return <LegalPage eyebrow="Service Agreement" title="Terms Of Use" updated={content.updated || '11 August 2026'} intro={content.intro || TERMS_DEFAULTS.intro} sections={sections} />;
}
