import React from 'react';
import LegalPage from '@/components/public/LegalPage';

const sections = [
  {
    title: 'Information We Collect',
    content: [
      'We collect information you provide when creating an account, registering interest, contacting XERT, purchasing a session pack, booking a class or choosing a training goal. This may include your name, email, phone number, suburb, training preferences, goals, booking history and information you voluntarily provide about injuries or limitations.',
      'Our services also receive limited technical information needed for security and operation, such as authentication records, request timestamps and payment status. XERT does not store your complete card details.'
    ]
  },
  {
    title: 'How We Use Information',
    content: [
      'We use your information to operate memberships, respond to enquiries, manage bookings and credits, tailor coaching, plan classes and events, process purchases, provide support, maintain security and meet legal or accounting obligations.',
      'Marketing messages are sent only where you have opted in or where otherwise permitted. You can ask us to stop at any time.'
    ]
  },
  {
    title: 'Services And Disclosure',
    content: [
      'XERT uses service providers including Supabase for authentication and application data, Vercel for website and API hosting, Stripe for payments, and Apple services when you choose native calendar or notification features. These providers process information under their own security and privacy commitments.',
      'We do not sell personal information. We may disclose information where required by law, to protect people or the service, or as part of a business transfer subject to appropriate safeguards.'
    ]
  },
  {
    title: 'Retention And Security',
    content: [
      'We retain information only for as long as it is reasonably needed for the purposes above. Account deletion removes your member profile, credits, bookings and training goals. Paid order records may be retained in anonymized form for financial integrity, and payment providers may retain records required by law.',
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
  return <LegalPage eyebrow="Member Privacy" title="Privacy Policy" updated="12 July 2026" intro="This policy explains how XERT Fitness collects, uses, protects and manages personal information across its website, member services and iOS app." sections={sections} />;
}
