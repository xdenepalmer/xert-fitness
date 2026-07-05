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

export const CONTENT_DEFAULTS = {
  hero: HERO_DEFAULTS,
  contact: CONTACT_DEFAULTS,
  booking: BOOKING_DEFAULTS,
  about: ABOUT_DEFAULTS,
  faq: FAQ_DEFAULTS,
};
