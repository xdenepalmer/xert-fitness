-- Ensure every event from the approved XERT 2026 calendar is represented by a
-- durable row. Existing admin-managed rows are deliberately left unchanged.

create unique index if not exists events_name_date_uidx
  on public.events (name, event_date);

insert into public.events (
  name, category, event_date, end_date, location, region, sort_order, published
) values
  ('Gold Coast Marathon',                    'run',        '2026-07-04', '2026-07-05', 'Gold Coast',             'South East Queensland', 1,  true),
  ('ACTÍVATE Brisbane',                      'fitness',    '2026-07-12', null,         'Brisbane',               'South East Queensland', 2,  true),
  ('The Guzzler Ultra',                      'ultra',      '2026-07-18', '2026-07-19', 'South East Queensland',  'South East Queensland', 3,  true),
  ('Max Adventure Sunshine Coast',           'adventure',  '2026-07-25', null,         'Sunshine Coast',         'South East Queensland', 4,  true),
  ('Sunshine Coast Marathon Festival',       'run',        '2026-08-02', null,         'Sunshine Coast',         'South East Queensland', 5,  true),
  ('Brisbane to Gold Coast Cycle Challenge', 'cycling',    '2026-08-23', null,         'Brisbane to Gold Coast', 'South East Queensland', 6,  true),
  ('Coastal High Trail Run',                 'trail',      '2026-08-29', null,         'Gold Coast',             'South East Queensland', 7,  true),
  ('Turf Games Gold Coast',                  'functional', '2026-09-12', '2026-09-13', 'Gold Coast',             'South East Queensland', 8,  true),
  ('IRONMAN 70.3 Sunshine Coast',            'triathlon',  '2026-09-13', null,         'Sunshine Coast',         'South East Queensland', 9,  true),
  ('Bridge to Brisbane',                     'run',        '2026-09-13', null,         'Brisbane',               'South East Queensland', 10, true),
  ('Butterfly Effect',                       'community',  '2026-09-26', '2026-09-27', 'South East Queensland',  'South East Queensland', 11, true),
  ('XERT Endurance Challenge',               'xert',       '2026-09-26', null,         'Kingaroy',               'South East Queensland', 12, true),
  ('Cricket Season Begins',                  'sport',      '2026-10-01', null,         'South East Queensland',  'South East Queensland', 13, true),
  ('AP&ES Games',                            'games',      '2026-10-11', '2026-10-12', 'South East Queensland',  'South East Queensland', 14, true),
  ('Blackall 100',                           'ultra',      '2026-10-17', null,         'Blackall Range',         'South East Queensland', 15, true),
  ('Noosa Triathlon',                        'triathlon',  '2026-11-01', null,         'Noosa',                  'South East Queensland', 16, true),
  ('Robina Triathlon',                       'triathlon',  '2026-11-15', null,         'Robina',                 'South East Queensland', 17, true),
  ('Summer Touch Football Season',           'sport',      '2026-12-01', null,         'South East Queensland',  'South East Queensland', 18, true),
  ('Cricket Season',                         'sport',      '2026-12-01', null,         'South East Queensland',  'South East Queensland', 19, true),
  ('XERT Team Competition',                  'xert',       '2026-12-05', null,         'Kingaroy',               'South East Queensland', 20, true)
on conflict (name, event_date) do nothing;
