FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api-client/package.json packages/api-client/
COPY packages/web/package.json packages/web/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/api-client/ packages/api-client/
COPY packages/web/ packages/web/
RUN npm run build --workspace @madamgy/api-client
RUN npm run build --workspace @madamgy/web

FROM nginx:alpine
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
