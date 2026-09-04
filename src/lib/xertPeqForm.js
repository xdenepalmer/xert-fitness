// ─── Pre-Exercise Questionnaire, Risk Warning & Participant Acknowledgement ──
// Everyone training at XERT completes this before they set foot on the floor.
// It is the prerequisite for the terms agreement: the poster QR code opens the
// terms, and the terms form sends people here first.
//
// Apply changes with: node scripts/apply-xert-peq-form.mjs --apply

import { field, required, section, statement, acknowledgement, validateXertFormDefinition } from './xertFormFields.js';

const questions = [
  section(
    '9ec24044-f7b0-58f4-811b-6928af6af070',
    'Participant details',
    'Please provide accurate contact and emergency details.',
  ),
  required('84703ad7-a28d-4904-9868-6c832ce38055', 'name_fields', 'Full name'),
  required('5c82d136-9308-5dd9-99e7-eb7308421522', 'date', 'Date of birth'),
  required('f2d5b64e-774a-4f5e-95ca-0af9b05b0301', 'number', 'Age', {
    description: 'Enter your age in completed years.',
    placeholder: 'Age',
  }),
  required('5d5d7d53-d5ea-4743-8f94-22ecd5fd6ded', 'phone', 'Mobile'),
  required('e4c4e161-43e3-5462-a865-f27c411ac809', 'email', 'Email'),
  required('b6e0fb34-f230-5b3d-91be-7f4892c72243', 'address', 'Address', {
    description: 'Street address, suburb, state, postcode and country.',
  }),
  required('c4fe2148-605d-4a3e-9dde-b7abf480ecd3', 'short_text', 'Emergency contact name'),
  required('74d53d87-5826-4055-b5e8-a1daf825852e', 'phone', 'Emergency contact number'),

  section(
    '488c14d9-662f-5016-9946-8b651d807274',
    'Pre-exercise questionnaire',
    'Please select Yes or No for every question. This screen helps identify when guidance may be needed before exercise; it is not medical advice or medical clearance.',
  ),
  required('49fed5d3-4830-55ec-b690-0170e5081760', 'yes_no', 'Have you ever had, or been told by a doctor that you have had, a stroke?'),
  required('7b7d7a7f-9b18-5b6d-9a91-b8de712d2702', 'yes_no', 'Has a doctor or health professional ever told you that you have a heart condition?'),
  required('c310388c-8fbe-5892-b3a7-40ac82bc378c', 'yes_no', 'Do you experience unexplained chest pain at rest or during physical activity or exercise?'),
  required('615f75e8-621a-56ab-889a-ad12a8177beb', 'yes_no', 'Do you experience faintness, dizziness or loss of balance during physical activity or exercise?'),
  required('7f22b4f2-c72e-51e8-8b58-49d5c21f3407', 'yes_no', 'Have you experienced an asthma attack requiring medical attention within the last 12 months?'),
  required('ccccb901-da9b-5ba9-8afa-039f10e0ac34', 'yes_no', 'If you have diabetes (Type 1 or Type 2), have you experienced difficulty controlling your blood glucose within the last three months?'),
  required('1f5c7987-fdb8-5b89-b328-dfc2e797fa7e', 'yes_no', 'Do you have any medical condition, injury or other health concern that may make participating in physical activity or exercise unsafe for you?'),
  required('3b0812a4-ce40-5b3c-93ef-2d9c276c81cf', 'yes_no', 'Do you have a diagnosed muscle, bone or joint condition that may be aggravated by physical activity or exercise?'),
  statement(
    'dbd8cae2-b743-50fe-9dbf-25ecf377c8b4',
    'If you answered YES to any question\nSeek guidance from an appropriately qualified allied health professional or medical practitioner before undertaking exercise. Where appropriate, tell XERT if a health professional is supervising you or has approved your participation.\n\nIf you answered NO to every question\nIf you have no other health concerns affecting your ability to exercise, you may proceed at an appropriate intensity. Increase volume and intensity gradually and tell your coach if anything changes.',
    'Based on the intent of the AUSactive Adult Pre-Exercise Screening System. This form does not diagnose, treat or clear a medical condition.',
  ),
  acknowledgement(
    '6e4bde0c-c478-5844-bc02-8605e8f266ec',
    'Pre-exercise declaration',
    'To the best of my knowledge, the information I have provided is true, complete and accurate. I will tell XERT about any material change before or during future participation.',
  ),

  section(
    '14ca7c65-5a59-557a-a6a1-97f5151e7f7d',
    'Risk warning & participant acknowledgement',
    'Important notice — participation in physical activity involves risk. Please read this section carefully.',
  ),
  statement(
    '0a4db884-4374-4abf-8b48-da8cf68f15f3',
    '1. XERT provides functional fitness and exercise services that may include strength training, conditioning, cardiovascular exercise, resistance training, bodyweight movements, free weights, exercise machines, functional training equipment and other programmed physical activities.\n\n2. Physical exercise involves inherent risks. These may include muscular soreness, strains, sprains, falls, collisions, aggravation of existing injuries or medical conditions and, in rare circumstances, serious injury or other adverse health events.\n\n3. I voluntarily choose to participate in XERT training and acknowledge and accept the inherent risks associated with physical exercise.\n\n4. I am responsible for exercising within my abilities, following reasonable coaching and safety instructions, using equipment appropriately and telling my coach if I experience pain, dizziness, unusual shortness of breath, illness, injury or other symptoms that may affect my ability to exercise safely.\n\n5. I will promptly tell XERT about any injury, illness, medical condition, medication or material change in my health that may affect my ability to participate safely.',
  ),
  statement(
    '30b8ccc8-e2df-4920-a479-e8e99910cc69',
    '6. I understand that XERT coaches may modify, stop or decline my participation in an exercise or session when they reasonably consider this necessary for safety.\n\n7. I remain responsible for my own actions, including actions contrary to coaching instructions, misuse of equipment, failure to disclose relevant information or voluntarily undertaking an activity outside my capabilities.\n\n8. To the maximum extent permitted by applicable law, I acknowledge that participation is undertaken at my own risk in relation to the inherent risks of the recreational activities provided by XERT.\n\n9. Nothing in this acknowledgement excludes, restricts or modifies any right, consumer guarantee, duty or liability that cannot lawfully be excluded, restricted or modified under applicable Australian law.\n\n10. I have had the opportunity to read this document, ask questions where necessary and understand the nature of the activities and associated risks before participating.',
  ),
  acknowledgement(
    'b7a4464c-0b66-45d0-9a8e-5a8a0cc03101',
    'Participant declaration',
    'I have read and understood the pre-exercise questionnaire and risk acknowledgement, understand the inherent risks associated with physical exercise, and voluntarily agree to participate subject to these acknowledgements.',
  ),

  section(
    '66596cbd-e19f-4110-88e7-c5b54df13201',
    'Additional terms',
    'Please confirm how XERT may handle your personal information.',
  ),
  acknowledgement(
    '6f45c338-790e-4994-930a-a02d2bb4010a',
    'Privacy acknowledgement',
    'I understand that XERT will handle my personal information, including emergency contact and health-screening information, for participation, safety, administration and other purposes described in the XERT Privacy Policy. I confirm I am authorised to provide my emergency contact’s details.',
  ),

  section(
    'e2e8ff91-dda1-4517-94db-8dd434103301',
    'Participant declaration and signatures',
    'Signatures are captured in black ink for clear printable records.',
  ),
  required('9ed92db0-5fc6-4acf-9e4f-baa280143401', 'short_text', 'Participant name'),
  required('576cbb02-2819-488f-a7d8-1719d8d53840', 'signature', 'Participant signature', {
    description: 'By signing, you confirm that you have read and agreed to the declarations above. Today’s date is recorded with your signature, so there is no date to fill in.',
  }),

  section(
    '584f206f-300f-4722-b655-fb576c8b4401',
    'Referral and marketing preferences',
    'These answers do not affect your ability to participate.',
  ),
  required('f27341c0-c910-4434-b07a-7e3fd09a4501', 'yes_no', 'Are you visiting as part of the Friends Train Free Saturdays campaign?', {
    skip_rules: [{ option: 'No', skip_to: 33 }],
  }),
  required('2486526d-cee2-57c1-aafc-89ccb655480c', 'short_text', 'Referring member’s first and last name'),
  required('eefcd865-5ac9-4cab-af9e-158f5c7fe605', 'yes_no', 'Do you consent to XERT using identifiable photos or video of you in its marketing?', {
    description: 'Select Yes to consent or No to opt out. XERT will not knowingly feature you in marketing if you select No. You can withdraw consent for future use by contacting XERT.',
  }),
];

// A record of its own. The form that used to carry this definition holds the
// signed terms responses from August and September 2026, and stays the terms
// form; submitted responses are immutable and never move between forms.
export const XERT_PEQ_FORM_ID = '000cc2da-1c51-59bf-a33e-c76bee4d7188';

export const XERT_PEQ_FORM_DEFINITION = Object.freeze({
  title: 'Pre-Exercise Questionnaire, Risk Warning & Participant Acknowledgement',
  description: 'Please complete every section and sign below. Required Yes/No answers use large checkbox-style controls that work with touch, keyboard and screen readers.',
  form_type: 'waiver',
  slug: 'peq',
  questions,
  show_progress_bar: true,
  thank_you_message: 'Thanks — your completed participant acknowledgement has been received. A XERT team member will review any health or safety concerns before training.',
  collect_name: false,
  collect_name_required: false,
  collect_email: false,
  collect_email_required: false,
  collect_phone: false,
  collect_phone_required: false,
  one_response_per_email: false,
  notify_admin: true,
  tags: ['peq', 'waiver', 'pre-exercise', 'participant-acknowledgement'],
});

export function validateXertPeqFormDefinition(definition = XERT_PEQ_FORM_DEFINITION) {
  return validateXertFormDefinition(definition);
}
