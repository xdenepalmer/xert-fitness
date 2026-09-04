import React from 'react';
import LegalPage from '@/components/public/LegalPage';
import { XERT_TERMS_INTRO, XERT_TERMS_SECTIONS, XERT_TERMS_UPDATED } from '@/lib/xertTermsAgreement';

// The signed membership agreement, published so members can read it any time.
// The acceptance form at /forms/terms-and-conditions is built from the same
// module, so what is signed and what is published can never drift apart.
export default function MembershipTerms() {
  return (
    <LegalPage
      eyebrow="Membership Agreement"
      title="Terms And Conditions"
      updated={XERT_TERMS_UPDATED}
      intro={XERT_TERMS_INTRO}
      sections={XERT_TERMS_SECTIONS}
    />
  );
}
