-- GigaLAN Manager — Supabase / Postgres schema
--
-- Run once against a new project:
--   supabase db execute --file supabase/schema.sql
-- or paste into the SQL editor.
--
-- Shape: the queryable identity of a tournament lives in real columns; the
-- match graph lives in one jsonb document. The engine loads a whole tournament,
-- mutates an object graph and writes it back, so splitting that graph across
-- tables would buy nothing today and cost a rewrite of TournamentManager.
-- Everything the lobby, the join lookup and the access checks need is indexed,
-- so those never deserialise the document.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- tournaments
-- ---------------------------------------------------------------------------
create table if not exists tournaments (
    id              uuid        primary key,

    -- Identity and access. admin_key_hash is SHA-256 of a 128-bit key that is
    -- shown to its creator exactly once and never stored in the clear.
    name            text        not null,
    join_code       text        not null unique,
    admin_key_hash  text        not null,

    -- Summary fields, duplicated out of the document so the lobby and the join
    -- lookup are index reads rather than a scan of every jsonb blob.
    game_type       text        not null,
    state           text        not null default 'registration'
                                check (state in ('registration','group','playoffs','completed')),
    is_team_based   boolean     not null default false,
    player_count    integer     not null default 0,

    created_at      timestamptz not null default now(),
    started_at      timestamptz,
    updated_at      timestamptz not null default now(),

    -- The full TournamentManager: players, pods, matches, brackets, teams.
    document        jsonb       not null,

    -- Optimistic locking. Every write asserts the version it read; a losing
    -- writer retries against fresh state instead of clobbering the winner.
    -- Two admins entering results at once is the ordinary case here, and
    -- whole-document writes make lost updates silent without this.
    version         bigint      not null default 1
);

-- Case-insensitive name uniqueness, matching the API's own check.
create unique index if not exists tournaments_name_lower_idx
    on tournaments (lower(name));

-- The lobby lists newest first.
create index if not exists tournaments_created_at_idx
    on tournaments (created_at desc);

-- ---------------------------------------------------------------------------
-- retired_join_codes
--
-- Every code ever issued, kept after the tournament it belonged to is deleted.
-- A code is never reused, so an old /t/<code> bookmark goes stale rather than
-- quietly resolving to somebody else's tournament months later.
-- ---------------------------------------------------------------------------
create table if not exists retired_join_codes (
    code       text        primary key,
    retired_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Atomic version-checked update.
--
-- Returns the new version, or null when the row has moved on since it was read.
-- Doing this in one statement means the check and the write cannot be
-- interleaved by a concurrent writer.
-- ---------------------------------------------------------------------------
create or replace function update_tournament(
    p_id            uuid,
    p_expected      bigint,
    p_name          text,
    p_state         text,
    p_is_team_based boolean,
    p_player_count  integer,
    p_started_at    timestamptz,
    p_document      jsonb
) returns bigint
language plpgsql
as $$
declare
    v_new_version bigint;
begin
    update tournaments
       set name          = p_name,
           state         = p_state,
           is_team_based  = p_is_team_based,
           player_count  = p_player_count,
           started_at    = p_started_at,
           document      = p_document,
           updated_at    = now(),
           version       = version + 1
     where id = p_id
       and version = p_expected
    returning version into v_new_version;

    return v_new_version; -- null when the WHERE matched nothing
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- The API talks to Postgres with the service role and enforces access itself:
-- reading needs the tournament id (which a join code resolves to), writing
-- needs that tournament's admin key, creating needs the instance admin token.
-- None of that is expressible as RLS, because there are no Postgres users here
-- -- every caller is the same service role.
--
-- RLS is enabled with no permissive policy so that the anon and authenticated
-- keys, which are safe to expose in a browser, can read nothing at all. Without
-- this, publishing the anon key would publish every admin_key_hash.
-- ---------------------------------------------------------------------------
alter table tournaments        enable row level security;
alter table retired_join_codes enable row level security;

revoke all on tournaments        from anon, authenticated;
revoke all on retired_join_codes from anon, authenticated;
