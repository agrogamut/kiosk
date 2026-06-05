FROM node:20-alpine AS builder
WORKDIR /app
RUN npm i -g pnpm@9
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/api-client/package.json packages/api-client/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/api-client/ packages/api-client/
COPY packages/server/ packages/server/
RUN pnpm --filter @madamgy/api-client build
RUN pnpm --filter @madamgy/server db:generate
RUN pnpm --filter @madamgy/server build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN npm i -g pnpm@9
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/api-client/package.json packages/api-client/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/packages/api-client/dist packages/api-client/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/src/prisma packages/server/src/prisma
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
