# MadamGy

Android kiosk telemedicine platform — patient kiosk, doctor, and admin panels backed by a shared Node.js/Postgres/LiveKit stack.

See `SPEC.md` for the tech spec and `PLAN.md` for build status and known gaps.

## Quick start

```bash
npm install
npm run build --workspace @madamgy/api-client
docker compose up -d postgres redis minio livekit
cd packages/server && npx prisma generate --schema src/prisma/schema.prisma
npx prisma migrate deploy --schema src/prisma/schema.prisma
cd ../.. && npm run dev
```
