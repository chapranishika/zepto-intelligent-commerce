-- Minimal stand-in for the parts of Supabase's `auth` schema this project's
-- migrations/RLS/RPC depend on — used only for integration testing against
-- a bare Postgres (CI, or a local one), never against real Supabase, which
-- already provides the real thing.
--
-- Real Supabase's auth.uid() reads the JWT claims GUC PostgREST sets per
-- request. This stub reads a plain session variable instead, so tests can
-- simulate "signed in as user X" with:
--   SELECT set_config('app.current_user_id', '<uuid>', true);  -- (is_local=true)
-- and "anonymous" by leaving it unset (auth.uid() then returns NULL, same
-- as real Supabase for an unauthenticated request).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

-- A non-owner role to run RLS-scoped queries as (Postgres RLS never
-- applies to the table owner or a superuser, so tests must run as
-- something else to mean anything) — mirrors Supabase's `authenticated`
-- role, which the app's RLS policies are written against implicitly (they
-- don't restrict by role, but production traffic through supabase-js only
-- ever arrives as `anon`/`authenticated`, never as the table owner).
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

-- This runs BEFORE the Alembic migrations create any application tables
-- (public schema is dropped and recreated empty right before this file
-- runs), so a plain `GRANT ... ON ALL TABLES IN SCHEMA public` here would
-- silently apply to nothing — Postgres grants aren't retroactive. Default
-- privileges are: anything the current role (whoever's DATABASE_URL this
-- is — the same role that runs the migrations right after this file)
-- creates in `public` from this point on is automatically granted to
-- `authenticated`. `place_order` itself is SECURITY DEFINER and
-- self-grants EXECUTE in its own migration, so it doesn't depend on this —
-- this is for the tables direct RLS-scoped queries need base access to.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO authenticated;
