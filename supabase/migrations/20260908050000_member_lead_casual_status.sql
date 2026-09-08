-- Not everyone who comes through the door joins. Somebody who trains casually
-- is a real outcome for a member lead, not a lost one, so the pipeline gets a
-- 'casual' status to sit alongside 'joined'. The trainer and partner pipelines
-- are unchanged.

create or replace function public.xert_lead_status_allowed(p_lead_type text, p_status text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(trim(coalesce(p_lead_type, '')))
    when 'member_interest' then lower(trim(coalesce(p_status, ''))) in (
      'new', 'contacted', 'warm', 'hot', 'foundation_offer_sent',
      'booked_trial', 'joined', 'casual', 'not_suitable', 'archived'
    )
    when 'trainer_interest' then lower(trim(coalesce(p_status, ''))) in (
      'new', 'reviewing', 'contacted', 'interview', 'shortlisted',
      'not_suitable', 'hired', 'archived'
    )
    when 'partner_interest' then lower(trim(coalesce(p_status, ''))) in (
      'new', 'reviewing', 'contacted', 'meeting', 'approved',
      'not_suitable', 'archived'
    )
    else false
  end;
$$;
