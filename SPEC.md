# Language & Technology Spec Sheet

## Project: graveyard-chat

---

## Language Choices

| Layer          | Language      | Reason                                                      |
|----------------|---------------|-------------------------------------------------------------|
| Backend        | TypeScript    | Type safety, matches frontend, large ecosystem              |
| Web frontend   | TypeScript    | Catches prop/API mismatches at compile time                 |
| Mobile         | TypeScript    | Shared types with server via `api-client` package           |
| Config/Infra   | YAML / Shell  | Docker compose, LiveKit config, CI scripts                  |
| Database DSL   | Prisma Schema | Co-located with migrations, auto-generates TS types         |

Runtime: **Node.js 20 LTS** (server), **Bun** optional as drop-in  
Package manager: **pnpm 9** with workspaces

---

## Backend — `packages/server`

### Core

| Library              | Version  | Purpose                                    | License  |
|----------------------|----------|--------------------------------------------|----------|
| `express`            | ^4.19    | HTTP server, routing                       | MIT      |
| `socket.io`          | ^4.7     | Real-time bidirectional events             | MIT      |
| `prisma`             | ^5.14    | ORM + migrations                           | Apache-2 |
| `@prisma/client`     | ^5.14    | Generated DB client                        | Apache-2 |
| `typescript`         | ^5.4     | Type checking                              | Apache-2 |
| `tsx`                | ^4.11    | TS execution in dev (no build step needed) | MIT      |

### Auth

| Library              | Version  | Purpose                                    | License  |
|----------------------|----------|--------------------------------------------|----------|
| `jsonwebtoken`       | ^9.0     | JWT access + refresh token signing         | MIT      |
| `bcryptjs`           | ^2.4     | Password hashing (pure JS, no native dep)  | MIT      |
| `zod`                | ^3.23    | Request body validation                    | MIT      |

### LiveKit Integration

| Library                    | Version  | Purpose                              | License  |
|----------------------------|----------|--------------------------------------|----------|
| `livekit-server-sdk`       | ^2.4     | Token generation, room management    | Apache-2 |

### Dev Tools

| Library              | Version  | Purpose                                    |
|----------------------|----------|--------------------------------------------|
| `vitest`             | ^1.6     | Unit + integration tests                   |
| `supertest`          | ^7.0     | HTTP endpoint testing                      |
| `eslint`             | ^9.0     | Linting                                    |
| `prettier`           | ^3.2     | Formatting                                 |

---

## Web Frontend — `packages/web`

### Core

| Library                  | Version  | Purpose                                       | License  |
|--------------------------|----------|-----------------------------------------------|----------|
| `react`                  | ^18.3    | UI rendering                                  | MIT      |
| `react-dom`              | ^18.3    | DOM mounting                                  | MIT      |
| `vite`                   | ^5.2     | Build tool / dev server                       | MIT      |
| `typescript`             | ^5.4     | Type checking                                 | Apache-2 |

### Routing & State

| Library                  | Version  | Purpose                                       | License  |
|--------------------------|----------|-----------------------------------------------|----------|
| `react-router-dom`       | ^6.23    | Client-side routing, protected routes         | MIT      |
| `zustand`                | ^4.5     | Global state (auth, active conversation)      | MIT      |
| `@tanstack/react-query`  | ^5.40    | Server state, caching, mutation handling      | MIT      |

### Real-time & Calls

| Library                    | Version  | Purpose                                     | License  |
|----------------------------|----------|---------------------------------------------|----------|
| `socket.io-client`         | ^4.7     | WebSocket connection to server              | MIT      |
| `@livekit/components-react`| ^2.3     | Pre-built video/audio call UI components    | Apache-2 |
| `livekit-client`           | ^2.3     | LiveKit WebRTC SDK for browser              | Apache-2 |

### UI

| Library                    | Version  | Purpose                                     | License  |
|----------------------------|----------|---------------------------------------------|----------|
| `tailwindcss`              | ^3.4     | Utility-first CSS                           | MIT      |
| `clsx`                     | ^2.1     | Conditional classnames                      | MIT      |
| `lucide-react`             | ^0.383   | Icon set (MIT, no attribution required)     | ISC      |
| `react-hot-toast`          | ^2.4     | Notification toasts                         | MIT      |
| `date-fns`                 | ^3.6     | Message timestamp formatting                | MIT      |
| `react-intersection-observer` | ^9.10 | Infinite scroll / read receipt trigger      | MIT      |

---

## Mobile App — `packages/mobile`

### Core

| Library                    | Version  | Purpose                                     | License  |
|----------------------------|----------|---------------------------------------------|----------|
| `expo`                     | ~51.0    | React Native platform + build tooling       | MIT      |
| `expo-router`              | ~3.5     | File-based navigation (like Next.js)        | MIT      |
| `react-native`             | 0.74     | Native mobile rendering                     | MIT      |
| `typescript`               | ^5.4     | Type checking                               | Apache-2 |

### Real-time & Calls

| Library                       | Version  | Purpose                                  | License  |
|-------------------------------|----------|------------------------------------------|----------|
| `socket.io-client`            | ^4.7     | Same socket client as web               | MIT      |
| `@livekit/react-native`       | ^2.1     | LiveKit voice/video for React Native    | Apache-2 |
| `@livekit/react-native-webrtc`| ^118.0   | WebRTC native module required by above  | BSD-2    |

### UI & UX

| Library                    | Version  | Purpose                                     | License  |
|----------------------------|----------|---------------------------------------------|----------|
| `nativewind`               | ^4.0     | Tailwind-style classes in React Native      | MIT      |
| `expo-notifications`       | ~0.28    | Push notifications (Expo infra, free)       | MIT      |
| `expo-image-picker`        | ~15.0    | Camera roll / photo sending                 | MIT      |
| `expo-av`                  | ~14.0    | Audio playback for voice messages           | MIT      |
| `@shopify/flash-list`      | ^1.6     | Performant list for chat messages           | MIT      |
| `react-native-mmkv`        | ^2.12    | Fast local storage (token persistence)      | MIT      |

---

## Shared Package — `packages/api-client`

| Library      | Version  | Purpose                                              |
|--------------|----------|------------------------------------------------------|
| `zod`        | ^3.23    | Schema definitions shared between server + clients   |
| `typescript` | ^5.4     | Generates `.d.ts` consumed by web and mobile         |

All API response shapes and socket event payloads are defined here once,
then imported in both `web` and `mobile`. No code duplication.

---

## Infrastructure

### Self-hosted Services

| Service           | Image / Version         | Purpose                               | Cost     |
|-------------------|-------------------------|---------------------------------------|----------|
| PostgreSQL        | `postgres:16`           | Primary database                      | Free     |
| LiveKit Server    | `livekit/livekit-server:latest` | WebRTC SFU for calls          | Free     |
| Caddy             | `caddy:2`               | Reverse proxy + HTTPS (Let's Encrypt) | Free     |

### VPS Requirements (minimum)

| Resource  | Minimum   | Recommended           |
|-----------|-----------|-----------------------|
| CPU       | 2 vCPU    | 4 vCPU                |
| RAM       | 2 GB      | 4 GB                  |
| Disk      | 20 GB SSD | 40 GB SSD             |
| Network   | 100 Mbps  | 1 Gbps (for calls)    |
| Provider  | Any Linux VPS | Hetzner CX22 = ~$4/mo |

### Ports Required

| Port Range       | Protocol | Service                         |
|------------------|----------|---------------------------------|
| 80, 443          | TCP      | Caddy (HTTP + HTTPS)            |
| 7880             | TCP      | LiveKit HTTP/gRPC               |
| 7881             | TCP      | LiveKit RTC (TCP fallback)      |
| 40000–49999      | UDP      | LiveKit WebRTC media streams    |

---

## API Design

### Auth
```
POST /api/auth/register     { username, email, password }
POST /api/auth/login        { email, password }
POST /api/auth/refresh      { refreshToken }
POST /api/auth/logout
```

### Users
```
GET  /api/users/me
PUT  /api/users/me          { username?, avatarUrl?, status? }
GET  /api/users/search?q=   (search by username)
GET  /api/users/:id
```

### Conversations
```
GET  /api/conversations              (list mine)
POST /api/conversations              { participantIds, isGroup, name? }
GET  /api/conversations/:id
GET  /api/conversations/:id/messages (paginated, cursor-based)
```

### Calls
```
POST /api/calls/token        { callSessionId }  → { token, livekitUrl }
GET  /api/calls/history      (paginated)
```

---

## Environment Variables

```env
# Server
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/graveyard

JWT_ACCESS_SECRET=<64-char random>
JWT_REFRESH_SECRET=<64-char random>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d

LIVEKIT_HOST=wss://your-domain.com
LIVEKIT_API_KEY=<from livekit.yaml>
LIVEKIT_API_SECRET=<from livekit.yaml>

# Web (Vite — must prefix VITE_)
VITE_API_URL=https://your-domain.com/api
VITE_SOCKET_URL=https://your-domain.com
VITE_LIVEKIT_URL=wss://your-domain.com

# Mobile (Expo)
EXPO_PUBLIC_API_URL=https://your-domain.com/api
EXPO_PUBLIC_SOCKET_URL=https://your-domain.com
EXPO_PUBLIC_LIVEKIT_URL=wss://your-domain.com
```

---

## LiveKit Configuration

```yaml
# livekit/livekit.yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 40000
  port_range_end: 49999
  use_external_ip: true   # required on VPS with NAT

keys:
  YOUR_API_KEY: YOUR_API_SECRET

logging:
  level: info
```

---

## Coding Conventions

- All async functions use `async/await`, no `.then()` chains
- Errors thrown from route handlers are caught by a single Express error middleware
- Socket handlers mirror REST — same service layer called by both
- All DB queries go through service functions, never direct Prisma calls in routes
- Zod validates all inputs at the boundary (routes + socket events)
- No `any` in TypeScript — use `unknown` + narrowing if needed
- File naming: `kebab-case.ts` everywhere
- Component naming: `PascalCase.tsx`
- Constants: `UPPER_SNAKE_CASE`

---

## What Is Not Included (Scope Boundaries)

- End-to-end encryption (adds significant complexity — can layer on later with `libsodium`)
- iOS App Store build (Expo supports it; just needs a Mac + Apple dev account)
- SMS verification / OTP (would need Twilio or similar — not free)
- S3-compatible file uploads (can add MinIO self-hosted later)
- Message search (can add PostgreSQL full-text search later)
- Disappearing messages
- Stories / Status feature
