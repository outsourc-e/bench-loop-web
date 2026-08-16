-- BenchLoop social lab foundation.
-- Public records remain readable without an account; every write is ownership
-- checked with RLS. Sensitive runner credentials never enter an exposed view.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  github_url text,
  x_url text,
  website_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9][a-z0-9_-]{1,29}$'),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 80),
  constraint profiles_bio_length check (char_length(bio) <= 500)
);

create unique index profiles_handle_lower_uidx on public.profiles (lower(handle));

create table public.rigs (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  hardware_label text not null,
  cpu text,
  gpu text,
  soc text,
  system_memory_gb numeric(8, 2),
  gpu_memory_gb numeric(8, 2),
  operating_system text,
  fingerprint_hash text,
  visibility text not null default 'public',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rigs_name_length check (char_length(name) between 1 and 80),
  constraint rigs_visibility check (visibility in ('public', 'unlisted', 'private')),
  constraint rigs_system_memory_nonnegative check (system_memory_gb is null or system_memory_gb >= 0),
  constraint rigs_gpu_memory_nonnegative check (gpu_memory_gb is null or gpu_memory_gb >= 0),
  constraint rigs_owner_name_unique unique (owner_id, name)
);

create index rigs_owner_id_idx on public.rigs (owner_id);
create index rigs_visibility_created_idx on public.rigs (visibility, created_at desc, id desc);

create table public.artifacts (
  id bigint generated always as identity primary key,
  owner_id uuid references public.profiles (id) on delete set null,
  repository text not null,
  filename text,
  sha256 text,
  model_family text not null,
  parameter_count text,
  quantization text,
  modalities text[] not null default array['text']::text[],
  has_mtp_head boolean,
  has_vision_projector boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint artifacts_repository_length check (char_length(repository) between 1 and 240),
  constraint artifacts_sha256_format check (sha256 is null or sha256 ~ '^[a-fA-F0-9]{64}$')
);

create index artifacts_owner_id_idx on public.artifacts (owner_id) where owner_id is not null;
create index artifacts_model_family_created_idx on public.artifacts (model_family, created_at desc, id desc);
create unique index artifacts_sha256_uidx on public.artifacts (lower(sha256)) where sha256 is not null;

create table public.runtimes (
  id bigint generated always as identity primary key,
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null,
  version text,
  commit_sha text,
  backend text,
  capabilities text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint runtimes_name_length check (char_length(name) between 1 and 120),
  constraint runtimes_commit_sha_format check (commit_sha is null or commit_sha ~ '^[a-fA-F0-9]{7,64}$')
);

create index runtimes_owner_id_idx on public.runtimes (owner_id) where owner_id is not null;
create index runtimes_name_version_idx on public.runtimes (name, version);

create table public.recipes (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  artifact_id bigint references public.artifacts (id) on delete restrict,
  runtime_id bigint references public.runtimes (id) on delete restrict,
  slug text not null,
  title text not null,
  summary text not null default '',
  launch_command text not null,
  sampling jsonb not null default '{}'::jsonb,
  context_length bigint,
  kv_cache text,
  speculative_method text,
  draft_depth smallint,
  verification_level text not null default 'claimed',
  visibility text not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_owner_slug_unique unique (owner_id, slug),
  constraint recipes_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  constraint recipes_title_length check (char_length(title) between 1 and 160),
  constraint recipes_summary_length check (char_length(summary) <= 1200),
  constraint recipes_launch_command_length check (char_length(launch_command) between 1 and 20000),
  constraint recipes_context_length_positive check (context_length is null or context_length > 0),
  constraint recipes_draft_depth_nonnegative check (draft_depth is null or draft_depth >= 0),
  constraint recipes_verification_level check (verification_level in ('claimed', 'captured', 'signed', 'reproduced')),
  constraint recipes_visibility check (visibility in ('public', 'unlisted', 'private'))
);

create index recipes_owner_created_idx on public.recipes (owner_id, created_at desc, id desc);
create index recipes_artifact_id_idx on public.recipes (artifact_id) where artifact_id is not null;
create index recipes_runtime_id_idx on public.recipes (runtime_id) where runtime_id is not null;
create index recipes_visibility_created_idx on public.recipes (visibility, created_at desc, id desc);

create table public.runs (
  id bigint generated always as identity primary key,
  submission_id uuid not null default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  rig_id bigint references public.rigs (id) on delete set null,
  recipe_id bigint references public.recipes (id) on delete set null,
  artifact_id bigint references public.artifacts (id) on delete restrict,
  runtime_id bigint references public.runtimes (id) on delete restrict,
  source_run_id text,
  benchmark_id text not null,
  benchmark_version text not null,
  benchmark_profile text not null,
  score_schema_version text not null,
  manifest_hash text not null,
  status text not null default 'completed',
  verification_level text not null default 'captured',
  metrics jsonb not null default '{}'::jsonb,
  suites jsonb not null default '{}'::jsonb,
  environment jsonb not null default '{}'::jsonb,
  signature text,
  visibility text not null default 'public',
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint runs_submission_id_unique unique (submission_id),
  constraint runs_manifest_hash_format check (manifest_hash ~ '^sha256:[a-fA-F0-9]{64}$'),
  constraint runs_status check (status in ('completed', 'failed', 'cancelled')),
  constraint runs_verification_level check (verification_level in ('claimed', 'captured', 'signed', 'reproduced')),
  constraint runs_visibility check (visibility in ('public', 'unlisted', 'private'))
);

create index runs_owner_captured_idx on public.runs (owner_id, captured_at desc, id desc);
create index runs_rig_id_idx on public.runs (rig_id) where rig_id is not null;
create index runs_recipe_id_idx on public.runs (recipe_id) where recipe_id is not null;
create index runs_artifact_id_idx on public.runs (artifact_id) where artifact_id is not null;
create index runs_runtime_id_idx on public.runs (runtime_id) where runtime_id is not null;
create index runs_visibility_captured_idx on public.runs (visibility, captured_at desc, id desc);
create index runs_benchmark_comparison_idx on public.runs (
  benchmark_id,
  benchmark_version,
  benchmark_profile,
  score_schema_version,
  manifest_hash,
  captured_at desc,
  id desc
) where status = 'completed';

create table public.posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles (id) on delete cascade,
  run_id bigint references public.runs (id) on delete set null,
  recipe_id bigint references public.recipes (id) on delete set null,
  title text,
  body text not null,
  visibility text not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_title_length check (title is null or char_length(title) <= 180),
  constraint posts_body_length check (char_length(body) between 1 and 10000),
  constraint posts_visibility check (visibility in ('public', 'unlisted', 'private'))
);

create index posts_author_created_idx on public.posts (author_id, created_at desc, id desc);
create index posts_run_id_idx on public.posts (run_id) where run_id is not null;
create index posts_recipe_id_idx on public.posts (recipe_id) where recipe_id is not null;
create index posts_visibility_created_idx on public.posts (visibility, created_at desc, id desc);

create table public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id bigint references public.comments (id) on delete cascade,
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_length check (char_length(body) between 1 and 4000)
);

create index comments_post_created_idx on public.comments (post_id, created_at, id) where deleted_at is null;
create index comments_author_id_idx on public.comments (author_id);
create index comments_parent_id_idx on public.comments (parent_id) where parent_id is not null;

create table public.reactions (
  post_id bigint not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'upvote',
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind),
  constraint reactions_kind check (kind in ('upvote', 'insightful', 'reproduced'))
);

create index reactions_user_id_idx on public.reactions (user_id);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create index follows_following_id_idx on public.follows (following_id, created_at desc);

create table public.saves (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id bigint references public.posts (id) on delete cascade,
  run_id bigint references public.runs (id) on delete cascade,
  recipe_id bigint references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saves_one_target check (num_nonnulls(post_id, run_id, recipe_id) = 1)
);

create index saves_user_created_idx on public.saves (user_id, created_at desc, id desc);
create index saves_post_id_idx on public.saves (post_id) where post_id is not null;
create index saves_run_id_idx on public.saves (run_id) where run_id is not null;
create index saves_recipe_id_idx on public.saves (recipe_id) where recipe_id is not null;
create unique index saves_user_post_uidx on public.saves (user_id, post_id) where post_id is not null;
create unique index saves_user_run_uidx on public.saves (user_id, run_id) where run_id is not null;
create unique index saves_user_recipe_uidx on public.saves (user_id, recipe_id) where recipe_id is not null;

create table public.runner_devices (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  token_hash text not null,
  public_key text,
  capabilities jsonb not null default '{}'::jsonb,
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  constraint runner_devices_name_length check (char_length(name) between 1 and 100),
  constraint runner_devices_token_hash_unique unique (token_hash)
);

create index runner_devices_owner_id_idx on public.runner_devices (owner_id);
create index runner_devices_active_owner_idx on public.runner_devices (owner_id, last_seen_at desc) where revoked_at is null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger rigs_set_updated_at before update on public.rigs
for each row execute function private.set_updated_at();
create trigger recipes_set_updated_at before update on public.recipes
for each row execute function private.set_updated_at();
create trigger posts_set_updated_at before update on public.posts
for each row execute function private.set_updated_at();
create trigger comments_set_updated_at before update on public.comments
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_handle text;
  candidate_handle text;
begin
  base_handle := lower(regexp_replace(
    coalesce(
      new.raw_user_meta_data ->> 'user_name',
      new.raw_user_meta_data ->> 'preferred_username',
      split_part(coalesce(new.email, ''), '@', 1),
      'builder'
    ),
    '[^a-zA-Z0-9_-]+',
    '-',
    'g'
  ));
  base_handle := trim(both '-' from base_handle);
  if char_length(base_handle) < 2 then
    base_handle := 'builder';
  end if;

  candidate_handle := left(base_handle, 30);
  if exists (select 1 from public.profiles where lower(handle) = candidate_handle) then
    candidate_handle := left(base_handle, 21) || '-' || left(replace(new.id::text, '-', ''), 8);
  end if;

  insert into public.profiles (id, handle, display_name, avatar_url, github_url)
  values (
    new.id,
    candidate_handle,
    left(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      candidate_handle
    ), 80),
    new.raw_user_meta_data ->> 'avatar_url',
    case
      when new.raw_user_meta_data ->> 'user_name' is not null
      then 'https://github.com/' || (new.raw_user_meta_data ->> 'user_name')
      else null
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated, service_role;
revoke execute on function private.set_updated_at() from public, anon, authenticated, service_role;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.rigs enable row level security;
alter table public.artifacts enable row level security;
alter table public.runtimes enable row level security;
alter table public.recipes enable row level security;
alter table public.runs enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.follows enable row level security;
alter table public.saves enable row level security;
alter table public.runner_devices enable row level security;

create policy profiles_public_read on public.profiles
for select to anon, authenticated
using (is_public or id = (select auth.uid()));
create policy profiles_self_insert on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));
create policy profiles_self_update on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy rigs_visible_read on public.rigs
for select to anon, authenticated
using (visibility in ('public', 'unlisted') or owner_id = (select auth.uid()));
create policy rigs_self_insert on public.rigs
for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy rigs_self_update on public.rigs
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy rigs_self_delete on public.rigs
for delete to authenticated
using (owner_id = (select auth.uid()));

create policy artifacts_public_read on public.artifacts
for select to anon, authenticated using (true);
create policy artifacts_owner_insert on public.artifacts
for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy artifacts_owner_update on public.artifacts
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy artifacts_owner_delete on public.artifacts
for delete to authenticated
using (owner_id = (select auth.uid()));

create policy runtimes_public_read on public.runtimes
for select to anon, authenticated using (true);
create policy runtimes_owner_insert on public.runtimes
for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy runtimes_owner_update on public.runtimes
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy runtimes_owner_delete on public.runtimes
for delete to authenticated
using (owner_id = (select auth.uid()));

create policy recipes_visible_read on public.recipes
for select to anon, authenticated
using (visibility in ('public', 'unlisted') or owner_id = (select auth.uid()));
create policy recipes_self_insert on public.recipes
for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy recipes_self_update on public.recipes
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy recipes_self_delete on public.recipes
for delete to authenticated
using (owner_id = (select auth.uid()));

create policy runs_visible_read on public.runs
for select to anon, authenticated
using (visibility in ('public', 'unlisted') or owner_id = (select auth.uid()));
create policy runs_self_insert on public.runs
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and (
    rig_id is null
    or exists (
      select 1 from public.rigs
      where rigs.id = runs.rig_id and rigs.owner_id = (select auth.uid())
    )
  )
  and (
    recipe_id is null
    or exists (
      select 1 from public.recipes
      where recipes.id = runs.recipe_id
        and (recipes.visibility in ('public', 'unlisted') or recipes.owner_id = (select auth.uid()))
    )
  )
);
create policy runs_self_update on public.runs
for update to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and (
    rig_id is null
    or exists (
      select 1 from public.rigs
      where rigs.id = runs.rig_id and rigs.owner_id = (select auth.uid())
    )
  )
  and (
    recipe_id is null
    or exists (
      select 1 from public.recipes
      where recipes.id = runs.recipe_id
        and (recipes.visibility in ('public', 'unlisted') or recipes.owner_id = (select auth.uid()))
    )
  )
);
create policy runs_self_delete on public.runs
for delete to authenticated
using (owner_id = (select auth.uid()));

create policy posts_visible_read on public.posts
for select to anon, authenticated
using (visibility in ('public', 'unlisted') or author_id = (select auth.uid()));
create policy posts_self_insert on public.posts
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (
    run_id is null
    or exists (
      select 1 from public.runs
      where runs.id = posts.run_id
        and (runs.visibility in ('public', 'unlisted') or runs.owner_id = (select auth.uid()))
    )
  )
  and (
    recipe_id is null
    or exists (
      select 1 from public.recipes
      where recipes.id = posts.recipe_id
        and (recipes.visibility in ('public', 'unlisted') or recipes.owner_id = (select auth.uid()))
    )
  )
);
create policy posts_self_update on public.posts
for update to authenticated
using (author_id = (select auth.uid()))
with check (
  author_id = (select auth.uid())
  and (
    run_id is null
    or exists (
      select 1 from public.runs
      where runs.id = posts.run_id
        and (runs.visibility in ('public', 'unlisted') or runs.owner_id = (select auth.uid()))
    )
  )
  and (
    recipe_id is null
    or exists (
      select 1 from public.recipes
      where recipes.id = posts.recipe_id
        and (recipes.visibility in ('public', 'unlisted') or recipes.owner_id = (select auth.uid()))
    )
  )
);
create policy posts_self_delete on public.posts
for delete to authenticated
using (author_id = (select auth.uid()));

create policy comments_visible_read on public.comments
for select to anon, authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.posts
    where posts.id = comments.post_id
      and (posts.visibility in ('public', 'unlisted') or posts.author_id = (select auth.uid()))
  )
  and (
    parent_id is null
    or exists (
      select 1 from public.comments as parent_comment
      where parent_comment.id = comments.parent_id
        and parent_comment.post_id = comments.post_id
        and parent_comment.deleted_at is null
    )
  )
);
create policy comments_self_insert on public.comments
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and deleted_at is null
  and exists (
    select 1 from public.posts
    where posts.id = comments.post_id
      and (posts.visibility in ('public', 'unlisted') or posts.author_id = (select auth.uid()))
  )
  and (
    parent_id is null
    or exists (
      select 1 from public.comments as parent_comment
      where parent_comment.id = comments.parent_id
        and parent_comment.post_id = comments.post_id
        and parent_comment.deleted_at is null
    )
  )
);
create policy comments_self_update on public.comments
for update to authenticated
using (author_id = (select auth.uid()))
with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.posts
    where posts.id = comments.post_id
      and (posts.visibility in ('public', 'unlisted') or posts.author_id = (select auth.uid()))
  )
);
create policy comments_self_delete on public.comments
for delete to authenticated
using (author_id = (select auth.uid()));

create policy reactions_visible_read on public.reactions
for select to anon, authenticated
using (
  exists (
    select 1 from public.posts
    where posts.id = reactions.post_id
      and (posts.visibility in ('public', 'unlisted') or posts.author_id = (select auth.uid()))
  )
);
create policy reactions_self_insert on public.reactions
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.posts
    where posts.id = reactions.post_id
      and (posts.visibility in ('public', 'unlisted') or posts.author_id = (select auth.uid()))
  )
);
create policy reactions_self_delete on public.reactions
for delete to authenticated
using (user_id = (select auth.uid()));

create policy follows_visible_read on public.follows
for select to anon, authenticated
using (
  follower_id = (select auth.uid())
  or following_id = (select auth.uid())
  or (
    exists (
      select 1 from public.profiles as follower
      where follower.id = follows.follower_id and follower.is_public
    )
    and exists (
      select 1 from public.profiles as following
      where following.id = follows.following_id and following.is_public
    )
  )
);
create policy follows_self_insert on public.follows
for insert to authenticated
with check (follower_id = (select auth.uid()));
create policy follows_self_delete on public.follows
for delete to authenticated
using (follower_id = (select auth.uid()));

create policy saves_self_read on public.saves
for select to authenticated
using (user_id = (select auth.uid()));
create policy saves_self_insert on public.saves
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    (
      post_id is not null
      and exists (
        select 1 from public.posts
        where posts.id = saves.post_id
          and (posts.visibility in ('public', 'unlisted') or posts.author_id = (select auth.uid()))
      )
    )
    or (
      run_id is not null
      and exists (
        select 1 from public.runs
        where runs.id = saves.run_id
          and (runs.visibility in ('public', 'unlisted') or runs.owner_id = (select auth.uid()))
      )
    )
    or (
      recipe_id is not null
      and exists (
        select 1 from public.recipes
        where recipes.id = saves.recipe_id
          and (recipes.visibility in ('public', 'unlisted') or recipes.owner_id = (select auth.uid()))
      )
    )
  )
);
create policy saves_self_delete on public.saves
for delete to authenticated
using (user_id = (select auth.uid()));

create policy runner_devices_self_read on public.runner_devices
for select to authenticated
using (owner_id = (select auth.uid()));
create policy runner_devices_self_insert on public.runner_devices
for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy runner_devices_self_update on public.runner_devices
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy runner_devices_self_delete on public.runner_devices
for delete to authenticated
using (owner_id = (select auth.uid()));

revoke all on public.profiles, public.rigs, public.artifacts, public.runtimes,
  public.recipes, public.runs, public.posts, public.comments, public.reactions,
  public.follows, public.saves, public.runner_devices from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.rigs, public.artifacts, public.runtimes,
  public.recipes, public.runs, public.posts, public.comments, public.reactions,
  public.follows to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.rigs, public.artifacts, public.runtimes,
  public.recipes, public.runs, public.posts, public.comments to authenticated;
grant insert, delete on public.reactions, public.follows, public.saves to authenticated;
grant select on public.saves, public.runner_devices to authenticated;
grant insert, update, delete on public.runner_devices to authenticated;
grant usage, select on sequence public.rigs_id_seq, public.artifacts_id_seq,
  public.runtimes_id_seq, public.recipes_id_seq, public.runs_id_seq,
  public.posts_id_seq, public.comments_id_seq, public.saves_id_seq,
  public.runner_devices_id_seq to authenticated;

alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.reactions;
