import React from 'react';
import LegalPage from '@/components/public/LegalPage';
import { XERT_TERMS_INTRO, XERT_TERMS_SECTIONS, XERT_TERMS_UPDATED } from '@/lib/xertTermsAgreement';

// The membership agreement, published in full. The acceptance form at
// /forms/terms-and-conditions is built from the same module, so what a member
// signs and what the website shows can never drift apart. That is also why
// this page is not editable in Site Content: it is a signed legal document,
// changed in one place and republished to the form with the same commit.
export default function Terms() {
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
