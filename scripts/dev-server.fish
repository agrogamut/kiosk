#!/usr/bin/env fish

set -l script_path (status --current-filename)
set -l script_dir (dirname "$script_path")
set -l root_dir (realpath "$script_dir/..")
set -l run_web false
set -l start_docker true

function usage
  printf '%s\n' 'Usage: fish scripts/dev-server.fish [--web] [--no-docker]'
  printf '%s\n' '  --web        start API server and Vite web app after setup'
  printf '%s\n' '  --no-docker  skip docker compose startup and port waits'
end

for arg in $argv
  switch $arg
    case --web
      set run_web true
    case --no-docker
      set start_docker false
    case -h --help
      usage
      exit 0
    case '*'
      printf 'Unknown option: %s\n' "$arg" >&2
      usage >&2
      exit 1
  end
end

function load_env_file --argument-names file_path
  test -f "$file_path"; or return 0

  while read -l line
    set -l trimmed (string trim "$line")
    test -n "$trimmed"; or continue
    string match -qr '^#' "$trimmed"; and continue
    string match -q '*=*' "$trimmed"; or continue

    set -l parts (string split -m1 '=' "$trimmed")
    set -l key (string trim "$parts[1]")
    set -l value (string trim "$parts[2]")
    set value (string trim --chars='"' "$value")
    set value (string trim --chars="'" "$value")

    string match -qr '^[A-Za-z_][A-Za-z0-9_]*$' "$key"; or continue
    set -q $key; and continue
    set -gx $key "$value"
  end < "$file_path"
end

function set_default_env --argument-names key value
  set -q $key; or set -gx $key "$value"
end

function require_command --argument-names name
  if not command -q "$name"
    printf 'Missing required command: %s\n' "$name" >&2
    exit 1
  end
end

function wait_tcp --argument-names host port label
  printf 'Waiting for %s on %s:%s' "$label" "$host" "$port"
  for attempt in (seq 1 60)
    env WAIT_HOST="$host" WAIT_PORT="$port" node -e 'const net = require("net"); const socket = net.createConnection({ host: process.env.WAIT_HOST, port: Number(process.env.WAIT_PORT) }); socket.setTimeout(1000); socket.on("connect", () => { socket.end(); process.exit(0); }); socket.on("timeout", () => { socket.destroy(); process.exit(1); }); socket.on("error", () => process.exit(1));' >/dev/null 2>&1
    if test $status -eq 0
      printf ' ready\n'
      return 0
    end

    printf '.'
    sleep 1
  end

  printf '\n%s did not become ready in time.\n' "$label" >&2
  return 1
end

cd "$root_dir"; or exit 1

require_command node
require_command npm

if not test -f "$root_dir/.env"
  if not test -f "$root_dir/.env.example"
    printf '.env.example is missing. Cannot create .env.\n' >&2
    exit 1
  end

  cp "$root_dir/.env.example" "$root_dir/.env"
  printf 'Created .env from .env.example\n'
end

load_env_file "$root_dir/.env"
load_env_file "$root_dir/.env.example"

set_default_env DATABASE_URL 'postgresql://madamgy:madamgy@localhost:55432/madamgy'
set_default_env REDIS_URL 'redis://localhost:56379'
set_default_env JWT_ACCESS_SECRET 'replace-with-64-char-random-string-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
set_default_env JWT_REFRESH_SECRET 'replace-with-64-char-random-string-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
set_default_env LIVEKIT_API_KEY devkey
set_default_env LIVEKIT_API_SECRET devsecret
set_default_env MINIO_ENDPOINT localhost
set_default_env MINIO_PORT 19000
set_default_env MINIO_ACCESS_KEY madamgy
set_default_env MINIO_SECRET_KEY madamgy123
set_default_env MINIO_BUCKET madamgy
set_default_env MINIO_USE_SSL false
set_default_env MINIO_SKIP_BUCKET_CHECK false
set_default_env ADMIN_PHONE 9000000000
set_default_env ADMIN_PASSWORD admin123
set_default_env WEB_URL 'http://localhost:5173'

if test "$start_docker" = true
  require_command docker
  printf 'Starting Docker daemon\n'
  sudo systemctl start docker; or exit 1

  docker info >/dev/null 2>&1
  if test $status -ne 0
    printf 'Docker daemon is not running or not reachable. Start Docker, then rerun this script.\n' >&2
    exit 1
  end

  printf 'Starting local services: postgres, redis, minio, livekit\n'
  docker compose up -d postgres redis minio livekit; or exit 1

  wait_tcp localhost 55432 Postgres; or exit 1
  wait_tcp localhost 56379 Redis; or exit 1
  wait_tcp localhost 19000 MinIO; or exit 1
  wait_tcp localhost 7880 LiveKit; or exit 1
end

if not test -d "$root_dir/node_modules"
  printf 'Installing npm dependencies\n'
  npm install; or exit 1
end

printf 'Building shared API client\n'
npm run build --workspace @madamgy/api-client; or exit 1

printf 'Generating Prisma client\n'
npm run db:generate --workspace @madamgy/server; or exit 1

printf 'Applying database migrations\n'
npm run db:migrate:deploy --workspace @madamgy/server; or exit 1

printf 'Seeding admin user\n'
npm run db:seed --workspace @madamgy/server; or exit 1

printf '\nReady. Admin login: %s / %s\n' "$ADMIN_PHONE" "$ADMIN_PASSWORD"
printf 'Doctor dev OTP: 000000\n\n'

if test "$run_web" = true
  printf 'Starting API server and web app\n'
  npm run dev
else
  printf 'Starting API server\n'
  npm run dev --workspace @madamgy/server
end
