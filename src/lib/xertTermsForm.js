// ─── Digital terms and conditions acceptance ────────────────────────────────
// The poster QR code opens /forms/terms-and-conditions. Because the club must
// screen someone before they train, this form names the PEQ as its
// prerequisite: opening it sends a first-time visitor through the
// Pre-Exercise Questionnaire, and the terms open automatically afterwards.
//
// The wording comes from src/lib/xertTermsAgreement.js so the agreement people
// accept here is the same one published on the website.
//
// Apply changes with: node scripts/apply-xert-terms-form.mjs --apply

import { required, section, statement, validateXertFormDefinition } from './xertFormFields.js';
import { XERT_TERMS_INTRO, XERT_TERMS_SECTIONS, XERT_TERMS_UPDATED, termsSectionText } from './xertTermsAgreement.js';
import { XERT_PEQ_FORM_ID } from './xertPeqForm.js';

export const TERMS_ACCEPT_OPTION = 'I accept the Terms and Conditions';
export const TERMS_DECLINE_OPTION = 'I decline';

function agreementBlocks() {
  const blocks = [
    section(
      'tc-00-agreement',
      `XERT Fitness Terms and Conditions (${XERT_TERMS_UPDATED})`,
      'Read the agreement below, then accept or decline at the end. Take as long as you need — the text scrolls inside its own panel.',
    ),
    statement('tc-00-agreement-intro', XERT_TERMS_INTRO),
  ];
  for (const item of XERT_TERMS_SECTIONS) {
    blocks.push(section(item.id, item.title));
    const body = termsSectionText(item);
    if (body) blocks.push(statement(`${item.id}-text`, body));
  }
  return blocks;
}

function decisionQuestions(total) {
  // Skip destinations are one-based against the full field list, and the
  // platform only allows forward jumps, so both branches jump to the end.
  const end = total + 1;
  return [
    section('tc-decision', 'Your decision', 'Nobody is signed up by reading this page. Your answer below is what counts.'),
    required('tc-accept', 'single_choice', 'Do you accept the XERT Fitness Terms and Conditions?', {
      description: 'Accepting records your agreement with the date and time. Declining is recorded too, and a XERT team member will talk it through with you.',
      options: [TERMS_ACCEPT_OPTION, TERMS_DECLINE_OPTION],
      skip_rules: [{ option: TERMS_DECLINE_OPTION, skip_to: end }],
    }),
    required('tc-signature', 'signature', 'Member signature', {
      description: 'Sign with your finger, mouse or Apple Pencil.',
    }),
    required('tc-minor', 'yes_no', 'Is the member under 18 years of age?', {
      description: 'A parent or legal guardian must also sign for anyone under 18, and accepts legal responsibility for the member’s obligations under this Agreement.',
      skip_rules: [{ option: 'No', skip_to: end }],
    }),
    required('tc-guardian-name', 'short_text', 'Parent or guardian first and last name'),
    required('tc-guardian-signature', 'signature', 'Parent or guardian signature'),
  ];
}

const blocks = agreementBlocks();
const questions = [...blocks, ...decisionQuestions(blocks.length + 6)];

export const XERT_TERMS_FORM_ID = '8126e6a2-1147-54e3-9e60-3f33144a1fd9';
export const XERT_TERMS_FORM_PREREQUISITE_ID = XERT_PEQ_FORM_ID;

export const XERT_TERMS_FORM_DEFINITION = Object.freeze({
  title: 'XERT Fitness Terms and Conditions',
  description: 'The membership agreement between XERT Fitness and you. Read it through, then accept or decline. Your name, the date and your signature are recorded with your answer.',
  form_type: 'waiver',
  slug: 'terms-and-conditions',
  questions,
  show_progress_bar: true,
  thank_you_message: 'Thanks — your answer has been recorded with today’s date. If you accepted, you are good to train. If you declined, a XERT team member will talk it through with you before your first session.',
  collect_name: true,
  collect_name_required: true,
  collect_email: true,
  collect_email_required: true,
  collect_phone: true,
  collect_phone_required: false,
  one_response_per_email: false,
  notify_admin: true,
  tags: ['terms', 'membership-agreement', 'acceptance'],
});

export function validateXertTermsFormDefinition(definition = XERT_TERMS_FORM_DEFINITION) {
  return validateXertFormDefinition(definition);
}
