FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api-client/package.json packages/api-client/
COPY packages/server/package.json packages/server/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/api-client/ packages/api-client/
COPY packages/server/ packages/server/
RUN npm run build --workspace @madamgy/api-client
RUN npm run db:generate --workspace @madamgy/server
RUN npm run build --workspace @madamgy/server

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/api-client/package.json packages/api-client/
COPY packages/server/package.json packages/server/
RUN npm ci --omit=dev
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/packages/api-client/dist packages/api-client/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/src/prisma packages/server/src/prisma
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
