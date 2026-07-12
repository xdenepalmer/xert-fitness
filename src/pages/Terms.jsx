import React from 'react';
import LegalPage from '@/components/public/LegalPage';

const sections = [
  {
    title: 'Using XERT Services',
    content: [
      'These terms apply when you use the XERT Fitness website, member account, iOS app, bookings, session packs and related services. By creating an account or using a paid service, you agree to these terms and the Privacy Policy.',
      'You must provide accurate information, keep your account secure and use the service lawfully. You are responsible for activity under your account and should contact XERT promptly if you believe it has been compromised.'
    ]
  },
  {
    title: 'Training And Health',
    content: [
      'Exercise involves risk. You are responsible for deciding whether training is appropriate for you and for disclosing relevant injuries, limitations or medical advice to your coach. Stop training and seek appropriate help if you experience pain, dizziness or other concerning symptoms.',
      'XERT coaching and website content are general fitness services, not medical diagnosis or treatment. Consult a qualified health professional where needed and follow reasonable safety directions from XERT staff.'
    ]
  },
  {
    title: 'Bookings And Cancellations',
    content: [
      'A booking is confirmed only when the service shows it as confirmed. Some classes use request-to-book or waitlist workflows. Capacity, coaches, locations and times may change where reasonably necessary.',
      'For confirmed credit bookings, cancellations made more than 12 hours before class return the credit automatically. Cancellations within 12 hours generally use the credit. Requested bookings return the reserved credit when cancelled. XERT may make exceptions where appropriate.'
    ]
  },
  {
    title: 'Payments And Session Packs',
    content: [
      'Prices are shown in Australian dollars unless stated otherwise. Payments are processed by Stripe. Session packs have the credit quantity and validity period shown at purchase and cannot be transferred without XERT approval.',
      'Nothing in these terms excludes rights that cannot lawfully be excluded, including applicable rights under the Australian Consumer Law. Refund requests are assessed according to those rights and the circumstances of the service.'
    ]
  },
  {
    title: 'Availability And Liability',
    content: [
      'XERT works to keep its digital services accurate and available but does not promise uninterrupted access. Event information may change and should be confirmed with the event organizer.',
      'To the extent permitted by law, XERT is not responsible for indirect or consequential loss arising from use of the digital service. This does not limit liability that cannot legally be limited.'
    ]
  },
  {
    title: 'Changes And Contact',
    content: [
      'We may update these terms when services or legal requirements change. Material updates will be published with a revised date. Continued use after an update means the revised terms apply from that point.',
      'Questions about these terms can be sent to byronhawley@gmail.com. XERT Fitness operates in Kingaroy, Queensland 4610, Australia.'
    ]
  }
];

export default function Terms() {
  return <LegalPage eyebrow="Service Agreement" title="Terms Of Use" updated="12 July 2026" intro="These terms set clear expectations for using XERT Fitness services, booking training and managing a member account." sections={sections} />;
}
