-- ==============================================================================
-- BOUNCE: Database Schema, RLS, Indexes, Triggers, and Stored Procedures
-- ==============================================================================

-- 1. PROFILES
create table if not exists profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 20),
  equipped_skin text not null default 'porcelain',
  equipped_ability text not null default 'featherfall',
  created_at    timestamptz not null default now()
);

-- 2. PROGRESSION (Server-owned progression currency & lifetime records)
create table if not exists progression (
  user_id        uuid primary key references auth.users on delete cascade,
  lifetime_coins bigint not null default 0,
  total_runs     bigint not null default 0,
  total_perfects bigint not null default 0,
  best_distance  real   not null default 0,
  best_combo     int    not null default 1,
  best_time      real,
  updated_at     timestamptz not null default now()
);

-- 3. RUNS (Append-only record of accepted runs)
create table if not exists runs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users on delete cascade,
  mode        text not null check (mode in
                ('arcade','time_attack','score_attack','endless','daily','master')),
  score       int  not null check (score >= 0),
  distance    real not null check (distance >= 0),
  coins       int  not null check (coins >= 0),
  max_combo   int  not null check (max_combo >= 1),
  run_time    real not null check (run_time > 0),
  perfects    int  not null default 0,
  near_misses int  not null default 0,
  top_speed   real not null default 0,
  flags       text[] not null default '{}',
  created_at  timestamptz not null default now(),
  run_uuid    uuid unique
);

-- Indexes for lightning fast leaderboard queries
create index if not exists runs_board on runs (mode, score desc, created_at);
create index if not exists runs_time_board on runs (mode, run_time asc) where mode = 'time_attack';
create index if not exists runs_recent on runs (user_id, created_at desc);
create index if not exists runs_uuid_idx on runs (run_uuid);

-- 4. ACHIEVEMENTS UNLOCKED
create table if not exists achievements_unlocked (
  user_id  uuid not null references auth.users on delete cascade,
  slug     text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, slug)
);

-- 5. FOLLOWS (for Friends leaderboard)
create table if not exists follows (
  follower_id uuid not null references auth.users on delete cascade,
  followee_id uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id)
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

alter table profiles enable row level security;
alter table progression enable row level security;
alter table runs enable row level security;
alter table achievements_unlocked enable row level security;
alter table follows enable row level security;

-- Profiles: Select is public; update own profile only; insert own profile
drop policy if exists "Profiles are viewable by everyone" on profiles;
create policy "Profiles are viewable by everyone" on profiles
  for select using (true);

drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Progression: Select own row only. NO client insert, update, or delete.
drop policy if exists "Users can view own progression" on progression;
create policy "Users can view own progression" on progression
  for select using (auth.uid() = user_id);

-- Runs: Select is public for leaderboards. NO client insert, update, or delete.
drop policy if exists "Runs are viewable by everyone" on runs;
create policy "Runs are viewable by everyone" on runs
  for select using (true);

-- Achievements: Select own achievements. NO client insert, update, or delete.
drop policy if exists "Users can view own achievements" on achievements_unlocked;
create policy "Users can view own achievements" on achievements_unlocked
  for select using (auth.uid() = user_id);

-- Follows: Users can view their follows/followers, follow, and unfollow
drop policy if exists "Follows are viewable by involved users" on follows;
create policy "Follows are viewable by involved users" on follows
  for select using (auth.uid() = follower_id or auth.uid() = followee_id);

drop policy if exists "Users can follow others" on follows;
create policy "Users can follow others" on follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow others" on follows;
create policy "Users can unfollow others" on follows
  for delete using (auth.uid() = follower_id);

-- ==============================================================================
-- TRIGGERS: AUTOMATIC PROFILE & PROGRESSION INITIALIZATION
-- ==============================================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  rand_suffix text;
begin
  rand_suffix := lpad(floor(random() * 9000 + 1000)::text, 4, '0');
  
  insert into public.profiles (id, display_name, equipped_skin, equipped_ability)
  values (new.id, 'Wanderer ' || rand_suffix, 'porcelain', 'featherfall')
  on conflict (id) do nothing;

  insert into public.progression (user_id, lifetime_coins, total_runs, total_perfects, best_distance, best_combo, best_time)
  values (new.id, 0, 0, 0, 0, 1, null)
  on conflict (user_id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- Trigger on auth.users creation
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==============================================================================
-- STORED PROCEDURES & RPCs
-- ==============================================================================

-- Seed initial progression for existing local players (runs once on first sync)
create or replace function public.seed_initial_progression(
  p_coins bigint,
  p_runs bigint,
  p_perfects bigint,
  p_best_dist real,
  p_best_combo int,
  p_best_time real
)
returns public.progression as $$
declare
  v_uid uuid;
  v_prog public.progression;
  c_coins bigint;
  c_runs bigint;
  c_perfects bigint;
  c_best_dist real;
  c_best_combo int;
  c_best_time real;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Ensure rows exist
  insert into public.progression (user_id, lifetime_coins, total_runs, total_perfects, best_distance, best_combo, best_time)
  values (v_uid, 0, 0, 0, 0, 1, null)
  on conflict (user_id) do nothing;

  select * into v_prog from public.progression where user_id = v_uid;

  -- Only seed if server has 0 runs recorded
  if v_prog.total_runs = 0 then
    c_coins := greatest(0, least(coalesce(p_coins, 0), 500000));
    c_runs := greatest(0, least(coalesce(p_runs, 0), 20000));
    c_perfects := greatest(0, least(coalesce(p_perfects, 0), 100000));
    c_best_dist := greatest(0::real, least(coalesce(p_best_dist, 0::real), 50000::real));
    c_best_combo := greatest(1, least(coalesce(p_best_combo, 1), 99));
    c_best_time := case when p_best_time is not null and p_best_time > 10 and p_best_time < 3600 then p_best_time else null end;

    update public.progression
    set lifetime_coins = c_coins,
        total_runs     = c_runs,
        total_perfects = c_perfects,
        best_distance  = c_best_dist,
        best_combo     = c_best_combo,
        best_time      = c_best_time,
        updated_at     = now()
    where user_id = v_uid
    returning * into v_prog;
  end if;

  return v_prog;
end;
$$ language plpgsql security definer;


-- Leaderboard RPC with mode, window, and scope filtering
create or replace function public.leaderboard(
  p_mode text,
  p_window text default 'all',
  p_scope text default 'global',
  p_limit int default 100
)
returns table (
  user_id uuid,
  display_name text,
  score int,
  distance real,
  run_time real,
  created_at timestamptz,
  rank bigint,
  is_you boolean
) as $$
declare
  v_cutoff timestamptz;
  v_uid uuid;
begin
  v_uid := auth.uid();
  
  if p_window = 'today' then
    v_cutoff := now() - interval '24 hours';
  elsif p_window = 'week' then
    v_cutoff := now() - interval '7 days';
  else
    v_cutoff := '1970-01-01 00:00:00+00'::timestamptz;
  end if;

  if p_mode = 'time_attack' then
    return query
    with best_runs as (
      select distinct on (r.user_id)
        r.user_id,
        p.display_name,
        r.score,
        r.distance,
        r.run_time,
        r.created_at
      from runs r
      join profiles p on p.id = r.user_id
      where r.mode = p_mode
        and r.created_at >= v_cutoff
        and r.flags = '{}'
      order by r.user_id, r.run_time asc, r.created_at asc
    ),
    ranked as (
      select
        b.user_id,
        b.display_name,
        b.score,
        b.distance,
        b.run_time,
        b.created_at,
        rank() over (order by b.run_time asc, b.created_at asc) as rank,
        (b.user_id = v_uid) as is_you
      from best_runs b
    )
    select * from ranked
    where (
      (p_scope = 'global')
      or (p_scope = 'friends' and (
        ranked.user_id in (select followee_id from follows where follower_id = v_uid)
        or ranked.user_id = v_uid
      ))
      or (p_scope = 'me' and ranked.user_id = v_uid)
    )
    order by ranked.rank asc
    limit p_limit;
  else
    return query
    with best_runs as (
      select distinct on (r.user_id)
        r.user_id,
        p.display_name,
        r.score,
        r.distance,
        r.run_time,
        r.created_at
      from runs r
      join profiles p on p.id = r.user_id
      where r.mode = p_mode
        and r.created_at >= v_cutoff
        and r.flags = '{}'
      order by r.user_id, r.score desc, r.created_at asc
    ),
    ranked as (
      select
        b.user_id,
        b.display_name,
        b.score,
        b.distance,
        b.run_time,
        b.created_at,
        rank() over (order by b.score desc, b.created_at asc) as rank,
        (b.user_id = v_uid) as is_you
      from best_runs b
    )
    select * from ranked
    where (
      (p_scope = 'global')
      or (p_scope = 'friends' and (
        ranked.user_id in (select followee_id from follows where follower_id = v_uid)
        or ranked.user_id = v_uid
      ))
      or (p_scope = 'me' and ranked.user_id = v_uid)
    )
    order by ranked.rank asc
    limit p_limit;
  end if;
end;
$$ language plpgsql security definer;


-- Atomic Transaction for Run Submission + Progression Update + Achievement Checks
create or replace function public.submit_run_record(
  p_run_uuid uuid,
  p_user_id uuid,
  p_mode text,
  p_score int,
  p_distance real,
  p_coins int,
  p_max_combo int,
  p_run_time real,
  p_perfects int,
  p_near_misses int,
  p_top_speed real,
  p_flags text[] default '{}'
)
returns jsonb as $$
declare
  v_prog public.progression;
  v_existing_run public.runs;
  v_max_score int;
  v_new_slugs text[] := array[]::text[];
  v_slug text;
begin
  -- Idempotency check: if run was already recorded, return current state immediately
  if p_run_uuid is not null then
    select * into v_existing_run from public.runs where run_uuid = p_run_uuid;
    if found then
      select * into v_prog from public.progression where user_id = p_user_id;
      return jsonb_build_object(
        'progression', to_jsonb(v_prog),
        'newlyUnlocked', '[]'::jsonb,
        'duplicate', true
      );
    end if;
  end if;

  -- 1. Insert Run
  insert into public.runs (
    user_id, mode, score, distance, coins, max_combo, run_time,
    perfects, near_misses, top_speed, flags, run_uuid, created_at
  )
  values (
    p_user_id, p_mode, p_score, p_distance, p_coins, p_max_combo, p_run_time,
    p_perfects, p_near_misses, p_top_speed, coalesce(p_flags, '{}'::text[]), p_run_uuid, now()
  );

  -- 2. Upsert Progression
  insert into public.progression (
    user_id, lifetime_coins, total_runs, total_perfects, best_distance, best_combo, best_time, updated_at
  )
  values (
    p_user_id, p_coins, 1, p_perfects, p_distance, p_max_combo,
    case when p_mode = 'time_attack' and p_run_time > 0 then p_run_time else null end,
    now()
  )
  on conflict (user_id) do update
  set lifetime_coins = public.progression.lifetime_coins + excluded.lifetime_coins,
      total_runs     = public.progression.total_runs + 1,
      total_perfects = public.progression.total_perfects + excluded.total_perfects,
      best_distance  = greatest(public.progression.best_distance, excluded.best_distance),
      best_combo     = greatest(public.progression.best_combo, excluded.best_combo),
      best_time      = case
                         when p_mode = 'time_attack' and p_run_time > 0
                         then least(coalesce(public.progression.best_time, 'Infinity'::real), p_run_time)
                         else public.progression.best_time
                       end,
      updated_at     = now()
  where public.progression.user_id = p_user_id
  returning * into v_prog;

  -- 3. Calculate max score across runs for score achievements
  select coalesce(max(score), 0) into v_max_score from public.runs where user_id = p_user_id;

  -- 4. Evaluate 21 Achievements
  -- first: finish a run (totalRuns >= 1)
  if v_prog.total_runs >= 1 then
    v_slug := 'first';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- far: 500m (bestDistance >= 500)
  if v_prog.best_distance >= 500 then
    v_slug := 'far';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- farther: 1500m (bestDistance >= 1500)
  if v_prog.best_distance >= 1500 then
    v_slug := 'farther';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- combo: x15 combo (bestCombo >= 15)
  if v_prog.best_combo >= 15 then
    v_slug := 'combo';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- perfect: 100 perfects (total_perfects >= 100)
  if v_prog.total_perfects >= 100 then
    v_slug := 'perfect';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- coins: 500 coins (lifetime_coins >= 500)
  if v_prog.lifetime_coins >= 500 then
    v_slug := 'coins';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- score: 50,000 score
  if v_max_score >= 50000 then
    v_slug := 'score';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- devoted: 50 runs (total_runs >= 50)
  if v_prog.total_runs >= 50 then
    v_slug := 'devoted';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- steps: 100m (best_distance >= 100)
  if v_prog.best_distance >= 100 then
    v_slug := 'steps';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- mile: 3000m (best_distance >= 3000)
  if v_prog.best_distance >= 3000 then
    v_slug := 'mile';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- combo30: x30 combo (best_combo >= 30)
  if v_prog.best_combo >= 30 then
    v_slug := 'combo30';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- perf10: 10 perfects (total_perfects >= 10)
  if v_prog.total_perfects >= 10 then
    v_slug := 'perf10';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- perf500: 500 perfects (total_perfects >= 500)
  if v_prog.total_perfects >= 500 then
    v_slug := 'perf500';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- coin50: 50 coins (lifetime_coins >= 50)
  if v_prog.lifetime_coins >= 50 then
    v_slug := 'coin50';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- coin2k: 2000 coins (lifetime_coins >= 2000)
  if v_prog.lifetime_coins >= 2000 then
    v_slug := 'coin2k';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- score10k: 10,000 score
  if v_max_score >= 10000 then
    v_slug := 'score10k';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- score200k: 200,000 score
  if v_max_score >= 200000 then
    v_slug := 'score200k';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- runs10: 10 runs (total_runs >= 10)
  if v_prog.total_runs >= 10 then
    v_slug := 'runs10';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- runs200: 200 runs (total_runs >= 200)
  if v_prog.total_runs >= 200 then
    v_slug := 'runs200';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- abil: all abilities unlocked (lifetime_coins >= 1400)
  if v_prog.lifetime_coins >= 1400 then
    v_slug := 'abil';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  -- skins: 16 skins unlocked (lifetime_coins >= 1700)
  if v_prog.lifetime_coins >= 1700 then
    v_slug := 'skins';
    insert into public.achievements_unlocked (user_id, slug, earned_at)
    values (p_user_id, v_slug, now()) on conflict do nothing;
    if found then v_new_slugs := array_append(v_new_slugs, v_slug); end if;
  end if;

  return jsonb_build_object(
    'progression', to_jsonb(v_prog),
    'newlyUnlocked', to_jsonb(v_new_slugs)
  );
end;
$$ language plpgsql security definer;
