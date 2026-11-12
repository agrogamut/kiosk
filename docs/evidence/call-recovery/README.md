# Call recovery evidence

Open the [current CI repair and end-to-end verification](../ci-repair/README.md) for final dependency/runtime results and inspected evidence. The [earlier combined verification](upstream/README.md) is historical.

These captures use the real doctor and patient pages with separate authenticated browser contexts, a running server and LiveKit. The upstream verifier is [scripts/verify-call-media.mjs](../../../scripts/verify-call-media.mjs).

To rerun, provision disposable local Postgres, Redis, MinIO and LiveKit services using the repository's development configuration. Separate browser resources from server tests, including database, Redis index and object storage. Run tests before browser verification. Apply the existing migrations, seed revenue configuration and generate the Prisma client:

```fish
npm ci
npm run build --workspace @madamgy/api-client
npm run db:generate --workspace @madamgy/server
node --env-file=.env node_modules/prisma/build/index.js migrate deploy --schema packages/server/src/prisma/schema.prisma
node --env-file=.env --import tsx packages/server/src/prisma/seed.ts
```

The local `.env` must set `NODE_ENV=development`, `DATABASE_URL`, `REDIS_URL`, JWT access/refresh secrets, `LIVEKIT_HOST`, matching LiveKit key/secret, MinIO connection/bucket credentials, admin seed credentials, `WEB_URL`, `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_LIVEKIT_URL` and `REQUIRE_PAYMENT_FOR_CALLS=false`. Keep secrets outside version control. The API defaults to port 3000. Configure LiveKit's webhook to reach `/api/webhooks/livekit` on the server, and expose its media TCP/UDP ports to Chromium.

Keep object storage writable: `XMinioStorageFull` prevents uploads and leaves PDF generation pending even when health checks pass. The current run uses separate disposable memory-backed MinIO instances for application and tests. The CI workflow pins a retrievable MinIO image and waits for readiness.

Install optional browser tooling in the ignored output directory. Node 22.12 or newer, npm, ffmpeg and Chromium are required:

```fish
npm install --prefix data/uploads/main-integration/tools playwright@1.63.0
env PLAYWRIGHT_BROWSERS_PATH=$PWD/data/uploads/main-integration/tools/browsers node data/uploads/main-integration/tools/node_modules/playwright/cli.js install chromium
```

Then follow the [current server, web and verifier commands](../ci-repair/README.md). The verifier creates synthetic accounts and leaves their records in the scratch database for inspection. A successful run records both peers' advancing media counters and received PCM, then verifies hangup and cleanup. Full raw captures stay in the selected output directory; the current reviewed evidence set lives under `../ci-repair/`.
