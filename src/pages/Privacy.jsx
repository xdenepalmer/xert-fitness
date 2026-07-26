import React from 'react';
import LegalPage from '@/components/public/LegalPage';

const sections = [
  {
    title: 'Information We Collect',
    content: [
      'We collect information you provide when creating an account, registering interest, contacting XERT, purchasing a session pack, booking a class, choosing a training goal or completing Member Readiness. This may include your name, email, phone number, suburb, training preferences, goals, booking history and information you voluntarily provide about injuries or limitations.',
      'When you submit a public interest, coaching or partnership form, we also record limited attribution details from that visit so we can understand how people find XERT: the referring website (if your browser sends one), campaign parameters such as UTM source, medium, campaign and content when present in the link, and the landing path you used to open the form.',
      'Member Readiness stores the name, phone number and relationship of the emergency contact you nominate, your confirmation that the contact knows they are listed, and versioned receipts showing which required documents you acknowledged, when XERT confirmed the acknowledgement and whether it came from the website or iOS app. The readiness form does not collect screening answers, diagnoses or a medical-clearance outcome.',
      'If you enable notifications in the iOS app, we store a device notification token for that install so XERT can deliver class, booking and account notices through Apple Push Notification service. Tokens are tied to your account, can be disabled on sign-out, and are removed when the account is deleted.',
      'Our services also receive limited technical information needed for security and operation, such as authentication records, request timestamps and payment status. XERT does not store your complete card details.'
    ]
  },
  {
    title: 'Sensitive And Health Information',
    content: [
      'Under Australian privacy law, health information is sensitive information. Optional free-text about injuries or physical limitations on the member interest form, optional notes on PT or class booking requests that may describe injuries or medical limitations, and choosing the PT training goal "Rehab / return to fitness" are treated as health information.',
      'XERT only collects those details when you choose to provide them and tick a separate health-information consent checkbox on that form. Contact-only consent is not enough. You can leave injuries or notes blank, and choose a non-rehab training goal, and still submit.',
      'Member-interest injury details are not shown in admin lead lists, bulk lead CSV exports or campaign analytics. Authorised XERT administrators can open a recorded reveal on an individual lead when consent was given, so they can follow up safely; each reveal is logged. PT and class booking notes you consent to share, and a consented rehab training goal, are available to authorised administrators in those request queues for the same purpose.'
    ]
  },
  {
    title: 'How We Use Information',
    content: [
      'We use your information to operate memberships, respond to enquiries, manage bookings and credits, tailor coaching, plan classes and events, process purchases, support emergency preparation, confirm current readiness acknowledgements, provide support, maintain security and meet legal or accounting obligations.',
      'Attribution details from form submissions are used to understand campaign and referral performance. Marketing messages are sent only where you have opted in or where otherwise permitted. You can ask us to stop at any time.'
    ]
  },
  {
    title: 'Services And Disclosure',
    content: [
      'XERT uses service providers including Supabase for authentication and application data, Vercel for website and API hosting, Stripe for payments, and Apple services when you choose native calendar or notification features. These providers are headquartered in the United States and store or process personal information outside Australia (commonly in the United States and other regions they operate). They process information under their own security and privacy commitments.',
      'The website also loads fonts from Google (fonts.googleapis.com / fonts.gstatic.com) and may embed an OpenStreetMap map on the contact page. Those services can receive your IP address and basic browser information when a page is viewed.',
      'Other members cannot access your Member Readiness information. Authorized XERT administrators can see completion status. Emergency-contact details are available only from your individual member record through a recorded reveal; they are not included in member search, bulk member or lead CSV exports, campaign analytics, notifications or public profiles.',
      'We do not sell personal information. We may disclose information where required by law, to protect people or the service, or as part of a business transfer subject to appropriate safeguards.'
    ]
  },
  {
    title: 'Retention And Security',
    content: [
      'We retain information only for as long as it is reasonably needed for the purposes above. Account deletion removes your member profile, emergency contact, readiness acknowledgements, credits, bookings, PT requests, training goals, iOS notification device tokens and public interest or enquiry records matched to your account email (including member, trainer and partner interest leads and anonymous PT requests) through the linked account-deletion process. Paid order records may be retained in anonymized form for financial integrity, and payment providers may retain records required by law.',
      'We use access controls, row-level database policies, encrypted connections and restricted server credentials. No online system can guarantee absolute security, so please use a unique password and contact us if you suspect unauthorized access.'
    ]
  },
  {
    title: 'Your Choices And Rights',
    content: [
      'You can review and update account details, manage training goals, cancel eligible bookings and delete your account from the website or iOS app. You may also request access to, correction of or deletion of personal information by contacting XERT.',
      'XERT aims to handle personal information consistently with applicable Australian privacy requirements. If you have a concern, contact us first so we can investigate and respond.'
    ]
  },
  {
    title: 'Contact',
    content: ['Privacy questions and requests can be sent to byronhawley@gmail.com. XERT Fitness operates in Kingaroy, Queensland 4610, Australia.']
  }
];

export default function Privacy() {
  return <LegalPage eyebrow="Member Privacy" title="Privacy Policy" updated="26 July 2026" intro="This policy explains how XERT Fitness collects, uses, protects and manages personal information across its website, member services and iOS app." sections={sections} />;
}
