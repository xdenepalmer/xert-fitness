-- Add server-maintained row versions used by the admin schedule editor.
alter table public.availability_blocks
  add column if not exists updated_at timestamptz not null default now();

alter table public.blackout_periods
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_availability_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.touch_availability_updated_at() from public, anon, authenticated;

drop trigger if exists availability_blocks_touch_updated_at on public.availability_blocks;
create trigger availability_blocks_touch_updated_at
  before update on public.availability_blocks
  for each row execute function public.touch_availability_updated_at();

drop trigger if exists blackout_periods_touch_updated_at on public.blackout_periods;
create trigger blackout_periods_touch_updated_at
  before update on public.blackout_periods
  for each row execute function public.touch_availability_updated_at();

insert into public.xert_schema_capabilities (capability)
values ('schedule_optimistic_locking')
on conflict (capability) do nothing;
