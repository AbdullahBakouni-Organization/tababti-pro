# syntax=docker/dockerfile:1
ARG SERVICE=social-service
ARG VERSION=unknown

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline

# ─── Builder ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline
COPY . .
RUN npm run build:social-service

# ─── Production ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ARG VERSION
ENV NODE_ENV=production
ENV APP_VERSION=${VERSION}

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist/apps/social-service ./dist

USER appuser
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "require('net').connect(3002,'localhost',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main"]
