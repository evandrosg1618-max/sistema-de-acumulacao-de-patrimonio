-- Migration: Grant table permissions to authenticated and anon roles,
-- ensuring authenticated users can INSERT/SELECT/UPDATE/DELETE according to RLS policies.
-- Fixes: "permission denied for table workspaces" and workspace loading failures.

DO $$
BEGIN
  -- Grant usage on public schema
  GRANT USAGE ON SCHEMA public TO anon, authenticated;

  -- Grant all privileges on all existing tables in public schema
  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

  -- Grant all privileges on all existing sequences in public schema
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

  -- Grant execute on all functions in public schema
  GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;

  -- Ensure future tables/sequences/functions also receive default grants
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON ROUTINES TO anon, authenticated;
END $$;
