-- Bops Web (personal, non-commercial prototype).
-- Derivative of OrgoAI/bops, Copyright 2026 Nick Vasilescu and Organic Intelligence, Inc.
-- Licensed under FSL-1.1-ALv2. See LICENSE and NOTICE.
--
-- One owner: the GitHub login dynknight. Provider keys never live in this database.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

create table public.owner_allowlist (
  github_login text primary key check (github_login = 'dynknight')
);

insert into public.owner_allowlist (github_login) values ('dynknight');

create table public.profiles (
  id uuid primary key,
  github_login text not null unique check (github_login = 'dynknight'),
  display_name text,
  created_at timestamptz not null default now()
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null,
  name text not null,
  role text not null,
  persona text not null default '',
  color text not null default '#2F6BFF',
  is_chief boolean not null default false,
  reports_to uuid references public.agents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table public.agent_models (
  agent_id uuid not null references public.agents (id) on delete cascade,
  use_case text not null check (use_case in ('chat', 'tools', 'routine')),
  provider text not null check (provider in ('google', 'openai', 'anthropic', 'xai', 'openrouter')),
  model_id text not null,
  primary key (agent_id, use_case)
);

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  thread_id uuid references public.threads (id) on delete cascade,
  agent_id uuid not null references public.agents (id),
  routine_id uuid,
  parent_run_id uuid references public.runs (id) on delete cascade,
  child_run_id uuid,
  status text not null check (status in ('queued', 'running', 'waiting_approval', 'waiting_child', 'succeeded', 'failed', 'cancelled')),
  use_case text not null check (use_case in ('chat', 'tools', 'routine')),
  goal text not null default '',
  progress text,
  error text,
  step_count int not null default 0,
  token_count int not null default 0,
  delegation_count int not null default 0,
  retry_count int not null default 0,
  cancel_requested boolean not null default false,
  workflow_run_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  thread_id uuid not null references public.threads (id) on delete cascade,
  run_id uuid references public.runs (id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content text not null,
  tool_call_id text,
  tool_name text,
  tool_args jsonb,
  created_at timestamptz not null default now()
);

create table public.run_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  run_id uuid not null references public.runs (id) on delete cascade,
  idx int not null,
  kind text not null,
  name text not null,
  status text not null,
  input jsonb,
  output jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, idx)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  run_id uuid not null references public.runs (id) on delete cascade,
  agent_id uuid not null references public.agents (id),
  tool_call_id text not null,
  tool_name text not null,
  action text not null,
  exact_content text,
  args jsonb not null,
  content_hash text not null,
  status text not null check (status in ('pending', 'approved', 'denied', 'expired', 'executing', 'consumed')),
  decision text check (decision is null or decision in ('approved', 'denied')),
  decision_key text,
  decision_note text,
  hook_token text,
  hook_ready boolean not null default false,
  output jsonb,
  expires_at timestamptz not null,
  decided_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  agent_id uuid not null references public.agents (id),
  name text not null,
  prompt text not null,
  cadence jsonb not null,
  timezone text not null default 'America/Los_Angeles',
  next_run_at timestamptz not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.runs
  add constraint runs_routine_fk foreign key (routine_id) references public.routines (id) on delete set null;

create table public.routine_dispatches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  slot_at timestamptz not null,
  run_id uuid references public.runs (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (routine_id, slot_at)
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  run_id uuid references public.runs (id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('composio', 'zernio')),
  event_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (source, event_id)
);

create index agents_owner_idx on public.agents (owner_id);
create index threads_owner_idx on public.threads (owner_id, updated_at desc);
create index messages_thread_idx on public.messages (thread_id, created_at);
create index runs_owner_idx on public.runs (owner_id, created_at desc);
create index approvals_run_idx on public.approvals (run_id);
create index routines_due_idx on public.routines (next_run_at) where enabled;
create index usage_owner_idx on public.usage_events (owner_id, created_at desc);

create or replace function public.protect_profile()
returns trigger
language plpgsql
as $$
begin
  if new.github_login is distinct from old.github_login or new.id is distinct from old.id then
    raise exception 'profile identity is fixed';
  end if;
  return new;
end;
$$;

create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile();

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.owner_allowlist a on a.github_login = p.github_login
    where p.id = auth.uid()
  );
$$;

create or replace function public.seed_agents(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $seed$
declare
  chief uuid;
  research uuid;
  inbox uuid;
  social uuid;
  agent uuid;
begin
  if exists (select 1 from public.agents where owner_id = p_owner) then
    return;
  end if;
  insert into public.agents (owner_id, slug, name, role, persona, color, is_chief)
  values (
    p_owner,
    'chief',
    'Chief',
    'Chief of staff',
    'You plan the day, keep the owner posted, and hand specialist work to Research, Inbox, and Social. You never approve your own actions.',
    '#0A0A0A',
    true
  )
  returning id into chief;

  insert into public.agents (owner_id, slug, name, role, persona, color, is_chief, reports_to)
  values (
    p_owner,
    'research',
    'Research',
    'Research',
    'You look things up and summarize. You do not send messages or change external systems.',
    '#2F6BFF',
    false,
    chief
  )
  returning id into research;

  insert into public.agents (owner_id, slug, name, role, persona, color, is_chief, reports_to)
  values (
    p_owner,
    'inbox',
    'Inbox',
    'Inbox',
    'You read connected apps with read-only tools. Anything that sends or changes waits for the owner.',
    '#1F9D55',
    false,
    chief
  )
  returning id into inbox;

  insert into public.agents (owner_id, slug, name, role, persona, color, is_chief, reports_to)
  values (
    p_owner,
    'social',
    'Social',
    'Social',
    'You draft posts and replies. You never publish. Every post or reply waits for the owner to approve the exact text.',
    '#7C3AED',
    false,
    chief
  )
  returning id into social;

  foreach agent in array array[chief, research, inbox, social] loop
    insert into public.agent_models (agent_id, use_case, provider, model_id)
    values
      (agent, 'chat', 'google', 'gemini-2.5-flash'),
      (agent, 'tools', 'google', 'gemini-2.5-flash'),
      (agent, 'routine', 'google', 'gemini-2.5-flash');
  end loop;
end;
$seed$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  login text;
begin
  login := lower(coalesce(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'preferred_username', ''));
  if login <> 'dynknight' then
    return new;
  end if;
  insert into public.profiles (id, github_login, display_name)
  values (new.id, login, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', login))
  on conflict (id) do nothing;
  perform public.seed_agents(new.id);
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    execute 'drop trigger if exists bops_web_on_auth_user on auth.users';
    execute 'create trigger bops_web_on_auth_user after insert on auth.users for each row execute function public.handle_new_user()';
  end if;
end $$;

-- Owner decisions. The model has no JWT, and the service role is refused here on purpose.
create or replace function public.decide_approval(
  p_id uuid,
  p_decision text,
  p_hash text,
  p_idempotency_key text,
  p_note text default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.approvals%rowtype;
begin
  if auth.uid() is null or coalesce(auth.role(), '') <> 'authenticated' or not public.is_owner() then
    raise exception 'not allowed';
  end if;
  if p_decision not in ('approved', 'denied') then
    raise exception 'bad decision';
  end if;
  select * into rec from public.approvals where id = p_id for update;
  if not found then
    raise exception 'not found';
  end if;
  if rec.owner_id <> auth.uid() then
    raise exception 'not allowed';
  end if;
  if rec.content_hash <> p_hash then
    raise exception 'hash mismatch';
  end if;
  if rec.status = 'pending' and rec.expires_at <= p_now then
    update public.approvals set status = 'expired', updated_at = p_now where id = p_id;
    return jsonb_build_object('error', 'expired', 'status', 'expired', 'replay', false);
  end if;
  if rec.status = 'expired' then
    return jsonb_build_object('error', 'expired', 'status', 'expired', 'replay', true);
  end if;
  if rec.status <> 'pending' then
    if rec.decision = p_decision then
      return jsonb_build_object('replay', true, 'status', rec.status, 'decision', rec.decision, 'note', rec.decision_note);
    end if;
    raise exception 'conflict';
  end if;
  update public.approvals
    set status = p_decision,
        decision = p_decision,
        decision_key = p_idempotency_key,
        decision_note = nullif(btrim(coalesce(p_note, '')), ''),
        decided_at = p_now,
        updated_at = p_now
    where id = p_id;
  return jsonb_build_object('replay', false, 'status', p_decision, 'decision', p_decision);
end;
$$;

-- At most once. A second call returns the stored output and does not ask to perform the action again.
create or replace function public.begin_consume(p_id uuid, p_hash text, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.approvals%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  select * into rec from public.approvals where id = p_id for update;
  if not found then
    raise exception 'not found';
  end if;
  if rec.status in ('executing', 'consumed') then
    return jsonb_build_object(
      'action', 'replay',
      'output', rec.output,
      'inFlight', rec.status = 'executing'
    );
  end if;
  if rec.content_hash <> p_hash then
    raise exception 'hash mismatch';
  end if;
  if rec.status in ('pending', 'approved') and rec.expires_at <= p_now then
    update public.approvals set status = 'expired', updated_at = p_now where id = p_id;
    return jsonb_build_object('action', 'reject', 'error', 'expired');
  end if;
  if rec.status <> 'approved' then
    raise exception 'not approved';
  end if;
  update public.approvals set status = 'executing', updated_at = p_now where id = p_id;
  return jsonb_build_object('action', 'execute');
end;
$$;

create or replace function public.finish_consume(p_id uuid, p_output jsonb, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.approvals%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  select * into rec from public.approvals where id = p_id for update;
  if not found then
    raise exception 'not found';
  end if;
  if rec.status = 'consumed' then
    return jsonb_build_object('replay', true, 'output', rec.output);
  end if;
  if rec.status <> 'executing' then
    raise exception 'not executing';
  end if;
  update public.approvals
    set status = 'consumed',
        output = p_output,
        consumed_at = p_now,
        updated_at = p_now
    where id = p_id;
  return jsonb_build_object('replay', false, 'output', p_output);
end;
$$;

create or replace function public.claim_due_routines(p_now timestamptz)
returns table (
  dispatch_id uuid,
  routine_id uuid,
  owner_id uuid,
  slot_at timestamptz,
  agent_id uuid,
  prompt text,
  name text,
  cadence jsonb,
  timezone text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  return query
  with due as (
    select r.*
    from public.routines r
    where r.enabled and r.next_run_at <= p_now
    order by r.next_run_at
    for update skip locked
  ),
  inserted as (
    insert into public.routine_dispatches (owner_id, routine_id, slot_at)
    select d.owner_id, d.id, d.next_run_at from due d
    on conflict (routine_id, slot_at) do nothing
    returning id, owner_id, routine_id, slot_at
  )
  select i.id, i.routine_id, i.owner_id, i.slot_at, r.agent_id, r.prompt, r.name, r.cadence, r.timezone
  from inserted i
  join public.routines r on r.id = i.routine_id;
end;
$$;

create or replace function public.list_stuck_routines(p_now timestamptz)
returns table (
  routine_id uuid,
  owner_id uuid,
  slot_at timestamptz,
  cadence jsonb,
  timezone text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  return query
  select r.id, r.owner_id, r.next_run_at, r.cadence, r.timezone
  from public.routines r
  join public.routine_dispatches d on d.routine_id = r.id and d.slot_at = r.next_run_at
  where r.enabled and r.next_run_at <= p_now;
end;
$$;

revoke all on function public.is_owner() from public;
revoke all on function public.seed_agents(uuid) from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.decide_approval(uuid, text, text, text, text, timestamptz) from public;
revoke all on function public.begin_consume(uuid, text, timestamptz) from public;
revoke all on function public.finish_consume(uuid, jsonb, timestamptz) from public;
revoke all on function public.claim_due_routines(timestamptz) from public;
revoke all on function public.list_stuck_routines(timestamptz) from public;
revoke all on function public.protect_profile() from public;

grant execute on function public.is_owner() to authenticated, service_role;
grant execute on function public.decide_approval(uuid, text, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.begin_consume(uuid, text, timestamptz) to service_role;
grant execute on function public.finish_consume(uuid, jsonb, timestamptz) to service_role;
grant execute on function public.claim_due_routines(timestamptz) to service_role;
grant execute on function public.list_stuck_routines(timestamptz) to service_role;
grant execute on function public.seed_agents(uuid) to service_role;

alter table public.owner_allowlist enable row level security;
alter table public.owner_allowlist force row level security;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.agents enable row level security;
alter table public.agents force row level security;
alter table public.agent_models enable row level security;
alter table public.agent_models force row level security;
alter table public.threads enable row level security;
alter table public.threads force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
alter table public.runs enable row level security;
alter table public.runs force row level security;
alter table public.run_steps enable row level security;
alter table public.run_steps force row level security;
alter table public.approvals enable row level security;
alter table public.approvals force row level security;
alter table public.routines enable row level security;
alter table public.routines force row level security;
alter table public.routine_dispatches enable row level security;
alter table public.routine_dispatches force row level security;
alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;
alter table public.webhook_events enable row level security;
alter table public.webhook_events force row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (public.is_owner() and id = auth.uid());

create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_owner() and id = auth.uid())
  with check (public.is_owner() and id = auth.uid());

create policy agents_all on public.agents
  for all to authenticated
  using (public.is_owner() and owner_id = auth.uid())
  with check (public.is_owner() and owner_id = auth.uid());

create policy agent_models_all on public.agent_models
  for all to authenticated
  using (
    public.is_owner()
    and exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
  )
  with check (
    public.is_owner()
    and exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
  );

create policy threads_all on public.threads
  for all to authenticated
  using (public.is_owner() and owner_id = auth.uid())
  with check (public.is_owner() and owner_id = auth.uid());

create policy messages_select on public.messages
  for select to authenticated
  using (public.is_owner() and owner_id = auth.uid());

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    public.is_owner()
    and owner_id = auth.uid()
    and exists (select 1 from public.threads t where t.id = thread_id and t.owner_id = auth.uid())
  );

create policy runs_select on public.runs
  for select to authenticated
  using (public.is_owner() and owner_id = auth.uid());

create policy steps_select on public.run_steps
  for select to authenticated
  using (public.is_owner() and owner_id = auth.uid());

create policy approvals_select on public.approvals
  for select to authenticated
  using (public.is_owner() and owner_id = auth.uid());

create policy routines_all on public.routines
  for all to authenticated
  using (public.is_owner() and owner_id = auth.uid())
  with check (public.is_owner() and owner_id = auth.uid());

create policy dispatches_select on public.routine_dispatches
  for select to authenticated
  using (public.is_owner() and owner_id = auth.uid());

create policy usage_select on public.usage_events
  for select to authenticated
  using (public.is_owner() and owner_id = auth.uid());

create policy webhooks_select on public.webhook_events
  for select to authenticated
  using (public.is_owner());

revoke all on all tables in schema public from public, anon, authenticated, service_role;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.agents to authenticated;
grant select, insert, update, delete on public.agent_models to authenticated;
grant select, insert, update, delete on public.threads to authenticated;
grant select, insert on public.messages to authenticated;
grant select on public.runs to authenticated;
grant select on public.run_steps to authenticated;
grant select on public.approvals to authenticated;
grant select, insert, update, delete on public.routines to authenticated;
grant select on public.routine_dispatches to authenticated;
grant select on public.usage_events to authenticated;
grant select on public.webhook_events to authenticated;

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.agents to service_role;
grant select, insert, update, delete on public.agent_models to service_role;
grant select, insert, update, delete on public.threads to service_role;
grant select, insert, update, delete on public.messages to service_role;
grant select, insert, update, delete on public.runs to service_role;
grant select, insert, update, delete on public.run_steps to service_role;
grant select, insert on public.approvals to service_role;
grant select, insert, update, delete on public.routines to service_role;
grant select, insert, update, delete on public.routine_dispatches to service_role;
grant select, insert on public.usage_events to service_role;
grant select, insert on public.webhook_events to service_role;

-- Service role may mark a pending approval ready or expired. It cannot approve.
create or replace function public.touch_approval(
  p_id uuid,
  p_status text,
  p_hook_token text,
  p_hook_ready boolean,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.approvals%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  if p_status not in ('pending', 'expired') then
    raise exception 'bad status';
  end if;
  select * into rec from public.approvals where id = p_id for update;
  if not found then
    raise exception 'not found';
  end if;
  if rec.status <> 'pending' then
    return;
  end if;
  update public.approvals
    set status = p_status,
        hook_token = coalesce(p_hook_token, hook_token),
        hook_ready = p_hook_ready,
        updated_at = p_now
    where id = p_id;
end;
$$;

revoke all on function public.touch_approval(uuid, text, text, boolean, timestamptz) from public;
grant execute on function public.touch_approval(uuid, text, text, boolean, timestamptz) to service_role;
