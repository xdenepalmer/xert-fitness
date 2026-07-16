-- Durable, retry-safe observability for verified Stripe webhook deliveries.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  status text not null check (status in ('processing', 'processed', 'ignored', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  order_id uuid references public.orders(id) on delete set null,
  first_received_at timestamptz not null,
  last_received_at timestamptz not null,
  finished_at timestamptz,
  last_error_code text,
  check (event_id = btrim(event_id) and char_length(event_id) between 5 and 255),
  check (event_type = btrim(event_type) and char_length(event_type) between 3 and 160),
  check (last_error_code is null or (
    last_error_code = btrim(last_error_code)
    and char_length(last_error_code) between 1 and 120
    and last_error_code ~ '^[A-Za-z0-9_.:-]+$'
  ))
);

create index if not exists stripe_webhook_events_status_received_idx
  on public.stripe_webhook_events(status, last_received_at desc);
create index if not exists stripe_webhook_events_order_idx
  on public.stripe_webhook_events(order_id, last_received_at desc)
  where order_id is not null;

alter table public.stripe_webhook_events enable row level security;
drop policy if exists "stripe_webhook_events_admin_read" on public.stripe_webhook_events;
create policy "stripe_webhook_events_admin_read" on public.stripe_webhook_events
  for select to authenticated using (public.is_admin());

create or replace function public.begin_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_received_at timestamptz
)
returns table(already_finished boolean, attempt_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Stripe webhook ledger requires service role';
  end if;
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or char_length(p_event_id) > 255
     or p_event_type is null or p_event_type <> btrim(p_event_type)
     or char_length(p_event_type) not between 3 and 160
     or p_livemode is null or p_received_at is null then
    raise exception 'Invalid Stripe webhook ledger payload';
  end if;

  insert into public.stripe_webhook_events (
    event_id, event_type, livemode, status, attempts,
    first_received_at, last_received_at
  ) values (
    p_event_id, p_event_type, p_livemode, 'processing', 1,
    p_received_at, p_received_at
  )
  on conflict (event_id) do update
  set attempts = public.stripe_webhook_events.attempts + 1,
      last_received_at = excluded.last_received_at,
      status = case
        when public.stripe_webhook_events.status in ('processed', 'ignored')
          then public.stripe_webhook_events.status
        else 'processing'
      end,
      last_error_code = case
        when public.stripe_webhook_events.status in ('processed', 'ignored')
          then public.stripe_webhook_events.last_error_code
        else null
      end
  returning * into v_event;

  if v_event.event_type <> p_event_type or v_event.livemode <> p_livemode then
    raise exception 'Stripe webhook event identity mismatch';
  end if;

  return query select
    v_event.status in ('processed', 'ignored'),
    v_event.attempts;
end;
$$;

create or replace function public.finish_stripe_webhook_event(
  p_event_id text,
  p_status text,
  p_order_id uuid,
  p_error_code text,
  p_finished_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
  v_error_code text := nullif(btrim(p_error_code), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Stripe webhook ledger requires service role';
  end if;
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_status not in ('processed', 'ignored', 'failed')
     or p_finished_at is null
     or (v_error_code is not null and (
       char_length(v_error_code) > 120
       or v_error_code !~ '^[A-Za-z0-9_.:-]+$'
     )) then
    raise exception 'Invalid Stripe webhook completion payload';
  end if;

  select events.* into v_event
  from public.stripe_webhook_events as events
  where events.event_id = p_event_id
  for update;
  if v_event.event_id is null then
    raise exception 'Stripe webhook ledger event not found';
  end if;

  if v_event.status in ('processed', 'ignored') and p_status = 'failed' then
    return;
  end if;

  update public.stripe_webhook_events as events
  set status = p_status,
      order_id = coalesce(events.order_id, p_order_id),
      finished_at = p_finished_at,
      last_error_code = case when p_status = 'failed' then v_error_code else null end
  where events.event_id = p_event_id;
end;
$$;

revoke execute on function public.begin_stripe_webhook_event(text, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.begin_stripe_webhook_event(text, text, boolean, timestamptz)
  to service_role;
revoke execute on function public.finish_stripe_webhook_event(text, text, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.finish_stripe_webhook_event(text, text, uuid, text, timestamptz)
  to service_role;

insert into public.xert_schema_capabilities (capability)
values ('stripe_webhook_ledger')
on conflict (capability) do update set installed_at = excluded.installed_at;
