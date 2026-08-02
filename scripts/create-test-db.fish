#!/usr/bin/env fish
# One-time setup for an already-initialized postgres volume (init-test-db.sh only
# runs on a fresh volume). Creates madamgy_test if missing, then applies migrations.
# Safe to re-run.

set pg_container (docker compose ps -q postgres)
if test -z "$pg_container"
    echo "postgres service is not running — start it with: docker compose up -d postgres"
    exit 1
end

set exists (docker exec $pg_container psql -U madamgy -d madamgy -tAc "SELECT 1 FROM pg_database WHERE datname = 'madamgy_test'")
if test "$exists" != "1"
    echo "Creating madamgy_test database..."
    docker exec $pg_container psql -U madamgy -d madamgy -c "CREATE DATABASE madamgy_test OWNER madamgy"
else
    echo "madamgy_test already exists."
end

set script_dir (dirname (status --current-filename))
set test_db_url "postgresql://madamgy:madamgy@localhost:55432/madamgy_test"

echo "Applying migrations to madamgy_test..."
env DATABASE_URL=$test_db_url \
    npx prisma migrate deploy --schema $script_dir/../packages/server/src/prisma/schema.prisma

# seed.ts needs ADMIN_PHONE/ADMIN_PASSWORD/CONSULTATION_FEE -- pull them from the root .env
# rather than requiring the caller to export them, same values dev seeding uses.
for line in (grep -E '^(ADMIN_PHONE|ADMIN_PASSWORD|CONSULTATION_FEE)=' $script_dir/../.env)
    set -gx (string split -m1 = $line)
end

echo "Seeding madamgy_test (super admin + revenue config, required by call-completion tests)..."
env DATABASE_URL=$test_db_url \
    npx tsx $script_dir/../packages/server/src/prisma/seed.ts

echo "Done. TEST_DATABASE_URL=$test_db_url is set in .env"
