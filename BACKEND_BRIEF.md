# BOUNCE — Backend Brief

**For: Antigravity. Stack: Supabase (Postgres + Auth + Edge Functions).**

BOUNCE is a Three.js endless runner. Everything it knows about a player currently
lives in `localStorage`, and the leaderboard is twelve hard-coded names in
`src/ui/Menus.ts`. Your job is to put a real backend behind both without changing
how the game plays.

Read this whole brief before writing code. The schema is small; the part that
takes judgment is run validation, and it is specified in §5.

---

## 1. What exists today

All persisted state, with its exact `localStorage` key:

| Key | Type | Meaning |
|---|---|---|
| `bounce.coins.lifetime` | int | **The progression currency.** Gates every ability and skin unlock. |
| `bounce.ability.equipped` | string | One of `featherfall｜tempo｜comet｜echo｜aegis` |
| `bounce.stat.bestDistance` | float | metres |
| `bounce.stat.bestCombo` | int | |
| `bounce.stat.runs` | int | lifetime run count |
| `bounce.stat.perfects` | int | lifetime perfect landings |
| `bounce.stat.bestTime` | float | seconds, time-attack |

Derived, not stored — recompute these server-side, never trust a client claim:

- **Ability unlocks** — thresholds in `src/game/Abilities.ts`: featherfall 0,
  tempo 150, comet 400, echo 800, aegis 1400 lifetime coins.
- **Skin unlocks** — `SKIN_UNLOCK` in `src/config/palettes.ts`: eight skins free,
  then porcelain 60 → aurora 1700.
- **Achievements** — 21 of them, `ACHIEVEMENTS` in `src/ui/Menus.ts`, each a
  `(stat, goal)` pair. Ids: `first far farther combo perfect coins score devoted
  steps mile combo30 perf10 perf500 coin50 coin2k score10k score200k runs10
  runs200 abil skins`.

A run produces a `ScoreManager` (`src/core/ScoreManager.ts`) carrying: `score`,
`distance`, `coins`, `maxCombo`, `runTime`, `perfectLandings`, `goodLandings`,
`poorLandings`, `nearMisses`, `speedBreaks`, `totalTricks`, `topSpeedKmh`,
`currentMode`.

Six modes exist (`src/config/modes.ts`): `arcade`, `time_attack`, `score_attack`,
`endless`, `daily`, `master`. Leaderboards are **per mode**. `time_attack` ranks
ascending by time; the rest rank descending by score.

---

## 2. Why Supabase, and the one thing to watch

Chosen over Firebase for one reason that matters here: **Edge Functions are on the
free plan**. Firebase Cloud Functions require the Blaze plan, which would mean the
only server-side validation available for free is security rules — and rules can
enforce shape and ownership but cannot tell whether a score was actually earned.
A leaderboard nobody can validate is a leaderboard nobody should trust. Postgres
window functions also give exact ranking in one query, which Firestore cannot.

**Watch this:** the free plan caps active projects per organization and pauses
projects after a period of inactivity — check the current numbers before you start,
because the project owner is already near their limit. Capacity is not the concern;
this backend is a few hundred bytes per player and will not approach the storage or
bandwidth ceilings. The *project count* is the constraint. If a new project cannot
be created under the existing org, create a new organization rather than
reorganising the owner's existing work.

---

## 3. Auth

**Anonymous sign-in, always.** Nobody types an email to play a browser game. Call
`signInAnonymously()` on first load, persist the session, and let the player start
immediately. Offer "link your account" only from the settings page — email OTP or
one OAuth provider — and use `updateUser()` so the anonymous uid is *upgraded*, not
replaced. Losing progress at the moment someone finally signs up is the worst
possible outcome.

Display names: generated on first run (`Wanderer 4821` style), editable once from
settings. Uniqueness is not required; show a short uid suffix on the leaderboard to
disambiguate.

---

## 4. Schema

```sql
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 20),
  equipped_skin text not null default 'porcelain',
  equipped_ability text not null default 'featherfall',
  created_at    timestamptz not null default now()
);

-- One row per player. The server owns every number in it: clients read it,
-- clients never write it.
create table progression (
  user_id        uuid primary key references auth.users on delete cascade,
  lifetime_coins bigint not null default 0,
  total_runs     bigint not null default 0,
  total_perfects bigint not null default 0,
  best_distance  real   not null default 0,
  best_combo     int    not null default 1,
  best_time      real,
  updated_at     timestamptz not null default now()
);

-- Every accepted run. Append-only; nothing ever updates or deletes a row here.
create table runs (
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
  -- Kept for offline analysis of what validation is catching.
  flags       text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index runs_board on runs (mode, score desc, created_at);
create index runs_time_board on runs (mode, run_time asc) where mode = 'time_attack';
create index runs_recent on runs (user_id, created_at desc);

-- Seeded from a config table so the client and server agree without a redeploy.
create table achievements_unlocked (
  user_id  uuid not null references auth.users on delete cascade,
  slug     text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, slug)
);
```

**RLS on every table, without exception.**

- `profiles` — a player selects any row (leaderboards need display names) but
  updates only `id = auth.uid()`, and only `display_name`, `equipped_skin`,
  `equipped_ability`.
- `progression` — select own row only. **No client insert, update, or delete
  policy at all.** Only the Edge Function's service role writes here. This is the
  whole anti-cheat story: if a client can write `lifetime_coins`, every unlock in
  the game is free.
- `runs` — select is public (that is the leaderboard). **No client insert policy.**
  Runs arrive only through `submit-run`.
- `achievements_unlocked` — select own; no client writes.

---

## 5. Run submission — the part that matters

One Edge Function, `submit-run`. It is the only write path into `runs` and
`progression`.

```
POST /functions/v1/submit-run
{ mode, score, distance, coins, maxCombo, runTime,
  perfects, nearMisses, topSpeed, clientVersion }
```

The client computes score locally, so the server cannot recompute it. What it
*can* do is reject the physically impossible. Import the real constants from
`src/config/constants.ts` rather than copying numbers — they change.

**Hard rejects** (400, nothing written):

1. `runTime <= 0`, or `runTime` greater than 2 hours.
2. `distance > MAX_SPEED * runTime`. `MAX_SPEED` is 78 u/s and the ball never
   exceeds it, so this is a true ceiling with no false positives.
3. `topSpeed > MAX_SPEED * 1.05`.
4. `maxCombo > COMBO_COUNT_MAX` (99).
5. `score > 480 * coins + 900 * perfects + 40 * distance + 5000`. Coins pay
   `COIN_SCORE` 60 at up to `COMBO_MAX_MULTIPLIER` 8×; the rest is slack for
   tricks and near misses. **Calibrate this from real telemetry before you rely
   on it** — start permissive, log what it would have caught, tighten later.
6. Rate limit: more than 1 run per 20 seconds from one uid, or more than 200 runs
   per day. Real play cannot hit either.

**Soft flags** (accepted, `flags[]` populated, excluded from public boards until
reviewed): coin count above a plausible density for the distance, `perfects`
exceeding `runTime / MIN_AIRTIME`, or a score in the top 0.1% from an account
younger than an hour.

On accept, in **one transaction**:

```
insert into runs …
update progression set
  lifetime_coins = lifetime_coins + $coins,
  total_runs     = total_runs + 1,
  total_perfects = total_perfects + $perfects,
  best_distance  = greatest(best_distance, $distance),
  best_combo     = greatest(best_combo, $maxCombo),
  best_time      = least(coalesce(best_time, 'Infinity'), $runTime)  -- time_attack only
where user_id = $uid
```

Then re-evaluate the 21 achievement thresholds against the updated row and insert
any newly met slugs. Return the updated progression plus `newlyUnlocked: string[]`
so the client can show the callout without a second round trip.

**Idempotency:** the client sends a uuid per run and the function upserts on it.
A retried request after a flaky connection must not double-credit coins.

---

## 6. Leaderboards

Replace `RIVALS` in `src/ui/Menus.ts`. Three scopes, matching the existing tabs:

- **Global** — top 100 for the mode.
- **Friends** — the FRIENDS tab is currently presentational. Either implement a
  `follows` table (`follower_id`, `followee_id`) and filter by it, or hide the tab
  until it is real. Do not leave a tab that shows global results under a friends
  label.
- **Me** — the player's own row *with its true rank*, even at position 4,000.

Windows: all-time, this week, today. `created_at` filters plus the indexes above.

Best run per player, not every run — otherwise one strong player fills the board:

```sql
select distinct on (r.user_id)
       r.user_id, p.display_name, r.score, r.distance, r.created_at,
       rank() over (order by r.score desc) as rank
from runs r join profiles p on p.id = r.user_id
where r.mode = $1 and r.created_at > $2 and r.flags = '{}'
order by r.user_id, r.score desc
```

Wrap it in a `leaderboard(mode, window, limit)` Postgres function and call it
through `rpc()`, so ranking logic lives in one place.

Cache client-side for 60 seconds. The board is opened often and changes slowly.

---

## 7. Client integration

Keep the game playable with no network. That is non-negotiable — it is a browser
game and people will open it on bad connections.

- **`localStorage` stays** as the write-through cache and the offline source of
  truth. Do not rip it out.
- On sign-in, reconcile: server progression wins for `lifetime_coins` (the server
  owns it), local wins for anything the server has never seen. First-ever sign-in
  migrates existing local values up as a one-time seed, clamped by the §5 bounds.
- Queue failed `submit-run` calls in `localStorage` and flush on reconnect.
- `AbilityState` in `src/game/Abilities.ts` reads `lifetime_coins` — point it at
  the synced value and it needs no other change. `nextLocked()` and
  `unlockProgress()` already drive the unlock UI off that one number.
- Put every call behind `src/net/Api.ts`. No `supabase` import anywhere else.

---

## 8. Out of scope

Do not add: realtime presence, chat, friend requests beyond a follow table,
purchases, or ads. Do not touch anything under `src/rendering/`, `src/world/`, or
`src/entities/` — the backend has no business in the simulation.

## 9. Definition of done

- A fresh anonymous player can play, and their coins survive a hard refresh.
- Linking an email keeps every coin.
- A tampered `score` in devtools is rejected by `submit-run` and never reaches the
  board.
- The leaderboard shows real players, with the local player's true rank.
- Airplane mode: the game plays, progress banks locally, and syncs on reconnect.
- No table is missing an RLS policy. Verify with the Supabase linter, not by eye.
