-- Finish the zero-downtime rollout after the versioned public client is live.
-- The old RPC cannot prove which live form definition a respondent saw.

revoke all on function public.submit_xert_form_response(text, jsonb, text, text, text, integer, text)
from public, anon, authenticated;

insert into public.xert_schema_capabilities (capability)
values ('form_response_snapshots')
on conflict (capability) do update set installed_at = excluded.installed_at;
