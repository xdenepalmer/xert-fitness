-- ============================================================================
-- XERT Fitness — South East Queensland 2026 event calendar seed
-- ============================================================================
-- Idempotent: a unique index on (name, event_date) + ON CONFLICT DO NOTHING
-- means this can be re-run safely. Official website links (url) can be added
-- later via the admin tools.
-- ============================================================================

create unique index if not exists events_name_date_uidx on public.events(name, event_date);

insert into public.events (name, category, event_date, end_date, location, region, sort_order) values
  ('Gold Coast Marathon',                    'run',        '2026-07-04', '2026-07-05', 'Gold Coast',            'South East Queensland', 1),
  ('ACTÍVATE Brisbane',                      'fitness',    '2026-07-12', null,         'Brisbane',              'South East Queensland', 2),
  ('The Guzzler Ultra',                      'ultra',      '2026-07-18', '2026-07-19', 'South East Queensland', 'South East Queensland', 3),
  ('Max Adventure Sunshine Coast',           'adventure',  '2026-07-25', null,         'Sunshine Coast',        'South East Queensland', 4),
  ('Sunshine Coast Marathon Festival',       'run',        '2026-08-02', null,         'Sunshine Coast',        'South East Queensland', 5),
  ('Brisbane to Gold Coast Cycle Challenge', 'cycling',    '2026-08-23', null,         'Brisbane to Gold Coast','South East Queensland', 6),
  ('Coastal High Trail Run',                 'trail',      '2026-08-29', null,         'Gold Coast',            'South East Queensland', 7),
  ('Turf Games Gold Coast',                  'functional', '2026-09-12', '2026-09-13', 'Gold Coast',            'South East Queensland', 8),
  ('IRONMAN 70.3 Sunshine Coast',            'triathlon',  '2026-09-13', null,         'Sunshine Coast',        'South East Queensland', 9),
  ('Bridge to Brisbane',                     'run',        '2026-09-13', null,         'Brisbane',              'South East Queensland', 10),
  ('Butterfly Effect',                       'community',  '2026-09-26', '2026-09-27', 'South East Queensland', 'South East Queensland', 11),
  ('XERT Endurance Challenge',               'xert',       '2026-09-26', null,         'Kingaroy',              'South East Queensland', 12),
  ('AP&ES Games',                            'games',      '2026-10-11', '2026-10-12', 'South East Queensland', 'South East Queensland', 13),
  ('Blackall 100',                           'ultra',      '2026-10-17', null,         'Blackall Range',        'South East Queensland', 14),
  ('Cricket Season Begins',                  'sport',      '2026-10-01', null,         'South East Queensland', 'South East Queensland', 15),
  ('Noosa Triathlon',                        'triathlon',  '2026-11-01', null,         'Noosa',                 'South East Queensland', 16),
  ('Robina Triathlon',                       'triathlon',  '2026-11-15', null,         'Robina',                'South East Queensland', 17),
  ('Summer Touch Football Season',           'sport',      '2026-12-01', null,         'South East Queensland', 'South East Queensland', 18),
  ('XERT Team Competition',                  'xert',       '2026-12-05', null,         'Kingaroy',              'South East Queensland', 19)
on conflict (name, event_date) do nothing;
