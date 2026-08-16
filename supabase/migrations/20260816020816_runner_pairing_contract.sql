-- Short-lived device pairing requests are reachable only by server-side Edge
-- Functions. Browser users approve a human code; the Runner exchanges its
-- high-entropy device code exactly once for a scoped token.

create table public.runner_pairing_requests (
  id bigint generated always as identity primary key,
  device_code_hash text not null,
  user_code text not null,
  device_name text not null,
  public_key text,
  capabilities jsonb not null default '{}'::jsonb,
  approved_by uuid references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  approved_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint runner_pairing_device_code_hash_unique unique (device_code_hash),
  constraint runner_pairing_user_code_unique unique (user_code),
  constraint runner_pairing_device_code_hash_format check (device_code_hash ~ '^[a-f0-9]{64}$'),
  constraint runner_pairing_user_code_format check (user_code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  constraint runner_pairing_device_name_length check (char_length(device_name) between 1 and 100),
  constraint runner_pairing_public_key_length check (public_key is null or char_length(public_key) <= 10000),
  constraint runner_pairing_approval_consistent check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null)
  ),
  constraint runner_pairing_consumption_consistent check (consumed_at is null or approved_at is not null)
);

create index runner_pairing_pending_expiry_idx
on public.runner_pairing_requests (expires_at, id)
where consumed_at is null;
create index runner_pairing_approved_by_idx
on public.runner_pairing_requests (approved_by, created_at desc)
where approved_by is not null;

alter table public.runs
  add constraint runs_source_run_id_length check (
    source_run_id is null or char_length(source_run_id) between 1 and 240
  );
create unique index runs_owner_source_run_id_uidx
on public.runs (owner_id, source_run_id)
where source_run_id is not null;

alter table public.runner_devices
  add constraint runner_devices_token_hash_format check (token_hash ~ '^[a-f0-9]{64}$');

alter table public.runner_pairing_requests enable row level security;

revoke all on public.runner_pairing_requests from public, anon, authenticated;
revoke all on sequence public.runner_pairing_requests_id_seq from public, anon, authenticated;
grant select, insert, update, delete on public.runner_pairing_requests to service_role;
grant usage, select on sequence public.runner_pairing_requests_id_seq to service_role;
grant select on public.profiles to service_role;
grant select, insert, update on public.rigs to service_role;
grant select, insert on public.runs, public.posts to service_role;
grant select, update on public.runner_devices to service_role;
grant usage, select on sequence public.rigs_id_seq, public.runs_id_seq,
  public.posts_id_seq to service_role;

create or replace function public.exchange_runner_pairing(
  p_device_code_hash text,
  p_token_hash text
)
returns table (
  device_id bigint,
  owner_id uuid,
  device_name text,
  paired_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.runner_pairing_requests%rowtype;
  paired_device public.runner_devices%rowtype;
begin
  select * into pairing
  from public.runner_pairing_requests
  where device_code_hash = p_device_code_hash
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'invalid_device_code';
  end if;
  if pairing.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'expired_token';
  end if;
  if pairing.consumed_at is not null then
    raise exception using errcode = 'P0001', message = 'device_code_consumed';
  end if;
  if pairing.approved_by is null then
    raise exception using errcode = 'P0001', message = 'authorization_pending';
  end if;

  insert into public.runner_devices (
    owner_id,
    name,
    token_hash,
    public_key,
    capabilities,
    paired_at
  ) values (
    pairing.approved_by,
    pairing.device_name,
    p_token_hash,
    pairing.public_key,
    pairing.capabilities,
    now()
  )
  returning * into paired_device;

  update public.runner_pairing_requests
  set consumed_at = now()
  where id = pairing.id;

  return query select
    paired_device.id,
    paired_device.owner_id,
    paired_device.name,
    paired_device.paired_at;
end;
$$;

revoke execute on function public.exchange_runner_pairing(text, text)
from public, anon, authenticated;
grant execute on function public.exchange_runner_pairing(text, text) to service_role;
