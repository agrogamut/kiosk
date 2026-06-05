FROM node:20-alpine AS builder
WORKDIR /app
RUN npm i -g pnpm@9
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/api-client/package.json packages/api-client/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/api-client/ packages/api-client/
COPY packages/web/ packages/web/
RUN pnpm --filter @madamgy/api-client build
RUN pnpm --filter @madamgy/web build

FROM nginx:alpine
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
