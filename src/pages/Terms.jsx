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
      'XERT coaching and website content are general fitness services, not medical diagnosis or treatment. Consult a qualified health professional where needed and follow reasonable safety directions from XERT staff.',
      'Member Readiness is an administrative preparation flow. Completing it, reviewing a screening source or acknowledging a document does not mean XERT has medically assessed or cleared you to exercise. If XERT presents an additional participation document, the complete version shown at that time applies only after your separate express acknowledgement.'
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
    title: 'Health And Safety',
    content: [
      'XERT Fitness is a strength and conditioning facility. Training carries an inherent risk of injury and you take part at your own risk. You must follow all reasonable directions from XERT staff, use equipment only as instructed and stop immediately if something does not feel right.',
      'Warm up before training and cool down afterwards. Do not attempt a lift, load or movement beyond your current capability, and ask a coach whenever you are unsure. Report any equipment fault, spill or hazard to a staff member straight away.',
      'Wear enclosed athletic footwear and appropriate training attire, bring a towel and water bottle, wipe down equipment after use and return weights to the racks. XERT may refuse entry to, or remove, anyone whose behaviour puts themselves or others at risk.'
    ]
  },
  {
    title: 'Medical Conditions',
    content: [
      'You must disclose to XERT any injury, illness, disability, pregnancy, medication or medical condition that could affect your ability to exercise safely, both before your first session and whenever your circumstances change.',
      'If you have or suspect a heart condition, high blood pressure, a respiratory condition, a joint or back problem, or you have been advised by a doctor to limit physical activity, obtain medical clearance before training with XERT.',
      'XERT coaches are not medical practitioners and do not diagnose, treat or clear you to exercise. Any guidance given is general fitness coaching only. You remain responsible for deciding, with your own health professionals, whether training is appropriate for you.',
      'Health information you give XERT is sensitive information under the Privacy Act 1988 (Cth). It is collected only to keep you safe while training, is accessible only to staff who need it for that purpose, and is not used for marketing.'
    ]
  },
  {
    title: 'Free Trial Day',
    content: [
      'A free trial day is a single complimentary session for new participants. It is offered once per person, is not transferable, is not redeemable for cash or credit, and cannot be combined with another introductory offer unless XERT agrees in writing.',
      'Before your trial session you must complete the health and safety declaration and these terms, and disclose any relevant medical condition. XERT may decline or reschedule a trial where a session is full, where a coach is unavailable, or where it is not satisfied the session is safe for you.',
      'The same health, safety, conduct and liability terms that apply to members apply during a free trial day.'
    ]
  },
  {
    title: 'Privacy',
    content: [
      'XERT collects your name, contact details, emergency contact and relevant health information so it can run sessions safely, contact you about bookings and meet its record-keeping obligations. Providing this information is voluntary, but without it XERT may not be able to let you train.',
      'Your information is stored securely, is not sold, and is disclosed to third parties only where you have agreed, where it is needed to deliver the service (for example payment processing), or where the law requires or permits it. Emergency contact details may be used to contact that person if you are injured or unwell.',
      'You may request access to the personal information XERT holds about you, ask for it to be corrected, or withdraw a consent at any time by contacting byronhawley@gmail.com. Further detail is set out in the XERT Privacy Policy.'
    ]
  },
  {
    title: 'Marketing Permission And Photography',
    content: [
      'Photography and video are sometimes taken at XERT for social media, the website and other promotional material. Consent for this is entirely optional, is recorded separately when you sign up, and is never a condition of training with XERT.',
      'If you consent, you grant XERT permission to use images and footage in which you appear for promotional purposes without payment. If you do not consent, tell a staff member before a session is filmed or photographed.',
      'You may withdraw marketing and photography consent at any time by contacting XERT. XERT will stop using your image in new material and will remove it from material it controls where reasonably practicable, though it may not be able to recall material already printed or shared externally.',
      'Members and guests must not photograph or film other people at XERT without their permission.'
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
  return <LegalPage eyebrow="Service Agreement" title="Terms Of Use" updated="11 August 2026" intro="These terms set clear expectations for using XERT Fitness services, booking training and managing a member account." sections={sections} />;
}
