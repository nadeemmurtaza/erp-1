-- Gives the mail server its own database inside the Postgres that is already
-- running. One engine, one container, two databases.
--
--   docker exec -i yaseen-postgres-prod psql -U yaseen -d postgres \
--     -v mail_password="'CHANGE_ME'" < deploy/mail/init-postgres.sql
--
-- A SEPARATE DATABASE, not separate tables in the store's own, for two
-- reasons that both bite hard:
--
--   1. `pnpm db:reset` drops and re-creates the store's database. Sharing one
--      would mean a routine reset during development silently destroys every
--      mailbox on the server.
--   2. Prisma owns the store's schema. Mail tables sitting beside it turn
--      every future migration into a question of whose tables those are.
--
-- The role is deliberately not a superuser and owns only its own database, so
-- a compromised mail server cannot read orders or customers.

\set ON_ERROR_STOP on

-- Idempotent: re-running after a partial setup is safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stalwart') THEN
    EXECUTE format('CREATE ROLE stalwart LOGIN PASSWORD %L', :'mail_password');
  ELSE
    EXECUTE format('ALTER ROLE stalwart PASSWORD %L', :'mail_password');
  END IF;
END
$$;

-- CREATE DATABASE cannot run inside a transaction block, hence the \gexec
-- rather than wrapping it in the DO above.
SELECT 'CREATE DATABASE stalwart OWNER stalwart'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'stalwart')
\gexec

-- Stalwart creates its own tables on first start; it only needs the schema.
\connect stalwart
GRANT ALL ON SCHEMA public TO stalwart;

-- Nobody else gets in by default.
REVOKE ALL ON DATABASE stalwart FROM PUBLIC;
