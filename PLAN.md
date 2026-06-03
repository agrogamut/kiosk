# WhatsApp Clone — Build Plan

## Project Name: graveyard-chat

---

## Overview

A full-stack real-time messaging app with 1-on-1 and group chat, voice calls,
and video calls. Self-hostable. Uses LiveKit as the media server for all
audio/video routing. No paid services required.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Clients                          │
│   React Web App          React Native Mobile App        │
│   (Vite + TypeScript)    (Expo + TypeScript)            │
└───────────────────┬─────────────────┬───────────────────┘
                    │  REST + WS       │ REST + WS
┌───────────────────▼─────────────────▼───────────────────┐
│                   API Server (Node.js)                   │
│   Express + Socket.io                                    │
│   - Auth (JWT)                                           │
│   - Chat messages                                        │
│   - Presence / online status                             │
│   - Room management                                      │
│   - LiveKit token generation                             │
└──────────┬─────────────────────────┬────────────────────┘
           │ Prisma ORM              │ LiveKit SDK (server)
┌──────────▼──────┐        ┌─────────▼──────────────────┐
│   PostgreSQL DB  │        │   LiveKit Server (Docker)   │
│   (messages,     │        │   - SFU media routing       │
│    users, rooms) │        │   - WebRTC audio/video      │
└──────────────────┘        └────────────────────────────┘
```

---

## Phase Breakdown

### Phase 1 — Foundation (Week 1)
- [ ] Monorepo setup (pnpm workspaces)
- [ ] `packages/server` — Express + Socket.io + Prisma + PostgreSQL
- [ ] `packages/web` — Vite + React + TypeScript scaffold
- [ ] Docker compose for PostgreSQL + LiveKit
- [ ] User auth: register, login, JWT access + refresh tokens
- [ ] Basic user profile: username, avatar (stored as base64 or local path)
- [ ] Database schema: users, conversations, messages, participants, call_sessions

### Phase 2 — Chat (Week 2)
- [ ] REST endpoints: create conversation, list conversations, fetch messages
- [ ] Socket.io events: join room, send message, receive message
- [ ] Message types: text, image, file, system
- [ ] Message status: sent → delivered → read (double tick logic)
- [ ] Typing indicators via socket
- [ ] Online/offline presence tracking
- [ ] Group chats: create group, add/remove members, group name/avatar
- [ ] Message reactions (emoji on message)
- [ ] Web UI: conversation list sidebar, chat window, message bubbles

### Phase 3 — Voice & Video (Week 3)
- [ ] LiveKit server running via Docker
- [ ] Server generates LiveKit JWT tokens per user per room
- [ ] Call flow: caller sends invite → callee gets socket event → accept/reject
- [ ] 1-on-1 voice call UI (mute, end call, speaker toggle)
- [ ] 1-on-1 video call UI (camera on/off, mute, fullscreen)
- [ ] Group voice/video room (up to N participants via LiveKit SFU)
- [ ] Call history log stored in DB

### Phase 4 — Mobile App (Week 4)
- [ ] `packages/mobile` — Expo + React Native + TypeScript
- [ ] Shared API client package (`packages/api-client`)
- [ ] Auth screens: login, register
- [ ] Chat screens: conversation list, chat window
- [ ] Voice/video call screens using `@livekit/react-native`
- [ ] Push notifications via Expo Push (free)
- [ ] Dark mode support

### Phase 5 — Dashboards (Week 5, optional)
Four dashboards in the web app (route-gated by role):

| Dashboard     | Role    | Content                                              |
|---------------|---------|------------------------------------------------------|
| User          | user    | Profile, contacts, settings, call history            |
| Admin         | admin   | All users, ban/delete, usage stats                   |
| Analytics     | admin   | Message volume, call minutes, active users over time |
| Moderator     | mod     | Flagged messages, reported users, action log         |

### Phase 6 — Hosting (Week 6)
- [ ] Dockerize API server
- [ ] Docker compose: postgres + livekit + api + nginx reverse proxy
- [ ] Deploy to a VPS (Hetzner CX22 = ~$4/mo, or any Linux box)
- [ ] HTTPS via Caddy or Certbot (free Let's Encrypt certs)
- [ ] LiveKit needs a public IP and UDP port range open (40000-49999)
- [ ] Environment config: `.env` with secrets, no hardcoded values
- [ ] CI: GitHub Actions build + lint on push

---

## Folder Structure

```
graveyard-chat/
├── docker-compose.yml
├── package.json                  (pnpm workspace root)
├── packages/
│   ├── server/                   (Node.js API)
│   │   ├── src/
│   │   │   ├── routes/           (auth, users, conversations, calls)
│   │   │   ├── socket/           (socket.io event handlers)
│   │   │   ├── services/         (livekit, auth, message logic)
│   │   │   ├── prisma/           (schema.prisma + migrations)
│   │   │   └── index.ts
│   │   └── package.json
│   ├── web/                      (React web app)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── store/            (zustand)
│   │   │   └── main.tsx
│   │   └── package.json
│   ├── mobile/                   (Expo React Native)
│   │   ├── app/                  (expo-router file-based routing)
│   │   ├── components/
│   │   └── package.json
│   └── api-client/               (shared typed fetch client)
│       ├── src/
│       └── package.json
└── livekit/
    └── livekit.yaml              (livekit server config)
```

---

## Database Schema (Prisma)

```prisma
model User {
  id           String   @id @default(cuid())
  username     String   @unique
  email        String   @unique
  passwordHash String
  avatarUrl    String?
  status       String   @default("Hey there, I'm using GraveyardChat")
  online       Boolean  @default(false)
  lastSeen     DateTime @default(now())
  createdAt    DateTime @default(now())

  sentMessages     Message[]       @relation("sender")
  participants     Participant[]
  callsInitiated   CallSession[]   @relation("caller")
}

model Conversation {
  id        String   @id @default(cuid())
  isGroup   Boolean  @default(false)
  name      String?
  avatarUrl String?
  createdAt DateTime @default(now())

  participants Participant[]
  messages     Message[]
  calls        CallSession[]
}

model Participant {
  userId         String
  conversationId String
  joinedAt       DateTime @default(now())
  role           String   @default("member")  // member | admin

  user         User         @relation(fields: [userId], references: [id])
  conversation Conversation @relation(fields: [conversationId], references: [id])

  @@id([userId, conversationId])
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  senderId       String
  content        String
  type           String   @default("text")   // text | image | file | system
  status         String   @default("sent")   // sent | delivered | read
  replyToId      String?
  createdAt      DateTime @default(now())
  editedAt       DateTime?

  conversation Conversation @relation(fields: [conversationId], references: [id])
  sender       User         @relation("sender", fields: [senderId], references: [id])
  replyTo      Message?     @relation("replies", fields: [replyToId], references: [id])
  replies      Message[]    @relation("replies")
  reactions    Reaction[]
}

model Reaction {
  id        String @id @default(cuid())
  messageId String
  userId    String
  emoji     String

  message Message @relation(fields: [messageId], references: [id])

  @@unique([messageId, userId])
}

model CallSession {
  id             String    @id @default(cuid())
  conversationId String
  callerId       String
  type           String    // voice | video
  status         String    // ringing | active | ended | missed | rejected
  livekitRoom    String    @unique
  startedAt      DateTime?
  endedAt        DateTime?
  createdAt      DateTime  @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id])
  caller       User         @relation("caller", fields: [callerId], references: [id])
}
```

---

## Socket.io Events

### Client → Server
| Event                  | Payload                              |
|------------------------|--------------------------------------|
| `chat:send`            | `{ conversationId, content, type }`  |
| `chat:typing`          | `{ conversationId, isTyping }`       |
| `chat:read`            | `{ conversationId, messageId }`      |
| `call:invite`          | `{ conversationId, type }`           |
| `call:accept`          | `{ callSessionId }`                  |
| `call:reject`          | `{ callSessionId }`                  |
| `call:end`             | `{ callSessionId }`                  |
| `presence:ping`        | (heartbeat every 30s)                |

### Server → Client
| Event                  | Payload                              |
|------------------------|--------------------------------------|
| `chat:message`         | `Message` object                     |
| `chat:typing`          | `{ conversationId, userId, isTyping }`|
| `chat:status`          | `{ messageId, status }`              |
| `call:incoming`        | `{ callSession, caller }`            |
| `call:accepted`        | `{ callSession, livekitToken }`      |
| `call:rejected`        | `{ callSessionId }`                  |
| `call:ended`           | `{ callSessionId }`                  |
| `presence:update`      | `{ userId, online, lastSeen }`       |

---

## Call Flow

```
Caller                      Server                      Callee
  |                            |                            |
  |--- call:invite ----------->|                            |
  |                            |--- call:incoming -------->|
  |                            |                            |
  |                            |<-- call:accept ------------|
  |                            |                            |
  |                    generate LiveKit tokens              |
  |                    for both users in room               |
  |                            |                            |
  |<-- call:accepted ----------|--- call:accepted -------->|
  |    (with LK token)         |    (with LK token)         |
  |                            |                            |
  |-- join LiveKit room ------>|<-- join LiveKit room ------|
  |                            |                            |
  |<======= WebRTC audio/video via LiveKit SFU ============>|
```

---

## Hosting Setup (Self-hosted VPS)

```yaml
# docker-compose.yml (simplified)
services:
  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]

  livekit:
    image: livekit/livekit-server
    ports: ["7880:7880", "40000-49999:40000-49999/udp"]
    volumes: [./livekit/livekit.yaml:/etc/livekit.yaml]

  api:
    build: ./packages/server
    depends_on: [postgres, livekit]
    environment:
      DATABASE_URL: postgresql://...
      LIVEKIT_API_KEY: ...
      LIVEKIT_API_SECRET: ...

  web:
    build: ./packages/web
    # serves static files

  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile]
```

---

## Status Tracking

- [ ] Phase 1 — Foundation
- [ ] Phase 2 — Chat
- [ ] Phase 3 — Voice & Video
- [ ] Phase 4 — Mobile App
- [ ] Phase 5 — Dashboards
- [ ] Phase 6 — Hosting
