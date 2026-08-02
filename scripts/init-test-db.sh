#!/bin/sh
# Runs automatically on first Postgres container init (docker-entrypoint-initdb.d).
# Creates a separate database for the test suite so vitest never touches dev data
# in "$POSTGRES_DB". For an already-initialized volume where this never ran, use
# scripts/create-test-db.fish instead.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE madamgy_test OWNER $POSTGRES_USER;
EOSQL
