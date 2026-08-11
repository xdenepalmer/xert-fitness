// ─── Site content defaults — single source of truth ─────────────────────────
// Used by BOTH the public pages (as fallbacks when the CMS is empty) and the
// admin Site Content editor (as prefill), so what admins see in the editor is
// always exactly what the site is showing.

export const HERO_PHOTOS = [
  '/assets/hero-training-1.jpg',
  '/assets/hero-training-2.jpg',
  '/assets/training-style.jpg',
  '/assets/training-philosophy.jpg',
  '/assets/event-calendar.jpg',
];

export const HERO_DEFAULTS = {
  headline: 'Beat Your Best.',
  subheading: 'Structured functional fitness coaching designed for strength, conditioning, movement quality and long-term performance.',
  supporting: 'Semi-private training in Kingaroy with real coaching, progressive programming and sustainable progress.',
  photos: HERO_PHOTOS,
};

export const CONTACT_DEFAULTS = {
  email: 'byronhawley@gmail.com',
  phone: '',
  address: 'Kingaroy, Queensland 4610',
  instagram_handle: '@xert_fit',
  instagram_url: 'https://instagram.com/xert_fit',
  intro: 'Have a question about classes, coaching, allied health partnerships or booking your first session? Reach out and we will help you plan your training.',
};

export const BOOKING_DEFAULTS = {
  intro: 'XERT operates through a booking-based system to maintain coaching quality and controlled class sizes. Initial class sizes are set to 8 people and will gradually increase as the business launches.',
};

export const ABOUT_DEFAULTS = {
  paragraphs: [
    'XERT Fitness is a semi-private functional fitness studio based in Kingaroy, Queensland. We exist to help everyday people through to athletes train with structure and purpose. Every class at XERT is coached and deliberately programmed, blending strength, conditioning, movement quality and long-term performance.',
    'Our programming follows the South East Queensland sporting and fitness calendar, so members always have a real goal ahead of them. Whether you are training for general fitness, preparing for a specific event, or chasing a strength milestone, your coach leads every session and helps you understand what the goal in front of you requires.',
    'The training system combines structured functional fitness classes, an accessory training area, and support for health, performance, recovery and nutrition. Sessions are scalable, booking-based and designed to maintain coaching quality while helping members train consistently.',
    'XERT is built around a simple philosophy: train for life, compete for fun. Members choose events, train together and build toward shared goals throughout the year.',
  ],
};

export const FAQ_DEFAULTS = {
  items: [
    { q: 'When is XERT opening?', a: "Soft launch is planned for August. We'll open in stages — limited class capacity at first, building out as demand and space allow. Register your foundation interest to be notified first." },
    { q: 'What classes will be available?', a: 'XERT offers structured functional training across strength, aerobic capacity, threshold and intensive sessions. Classes follow progressive training blocks and are coached so members understand the purpose of each session.' },
    { q: 'Do I need to be fit to join?', a: 'No. XERT is built for all levels — from complete beginners to experienced athletes. Coaches scale every session to the individual. The most important thing is showing up and committing to the process.' },
    { q: 'What is the event prep focus?', a: 'XERT follows the South East Queensland sporting and fitness calendar. Members can choose from endurance races, triathlons, trail runs, functional fitness events, local sport and XERT challenges, then train toward those goals together.' },
    { q: 'Is there personal training available?', a: 'Yes. 1-on-1 personal training sessions will be available in addition to group classes. You can request a PT session through the timetable page.' },
    { q: 'What allied health services will be available?', a: 'XERT is building relationships with physiotherapists, nutritionists, psychologists and other practitioners who will operate inside the facility. This means recovery, injury management and performance support are available without leaving the building.' },
    { q: 'Where is XERT located?', a: 'XERT is based in Kingaroy, Queensland 4610. The facility includes a main class training area, accessory training space, onsite parking, bathroom and changeroom access.' },
    { q: 'How do I book my first session?', a: 'Create a free account, purchase a class pass or pack on the booking page, then pick your class from the timetable. Your first session is coached end-to-end — arrive 10 minutes early and we will look after the rest.' },
  ],
};


export const TERMS_DEFAULTS = {
  intro: 'These terms set clear expectations for using XERT Fitness services, booking training and managing a member account.',
  sections: [
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
  }  ],
};

export const CONTENT_DEFAULTS = {
  hero: HERO_DEFAULTS,
  contact: CONTACT_DEFAULTS,
  booking: BOOKING_DEFAULTS,
  about: ABOUT_DEFAULTS,
  faq: FAQ_DEFAULTS,
  terms: TERMS_DEFAULTS,
};
