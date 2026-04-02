# syntax=docker/dockerfile:1
ARG SERVICE=home-service
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
RUN npm run build:home-service

# ─── Production ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ARG VERSION
ENV NODE_ENV=production
ENV APP_VERSION=${VERSION}

# Install Chromium for whatsapp-web.js / puppeteer
# Tell puppeteer to skip downloading its own Chrome and use the system one
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN apk add --no-cache \
      chromium \
      chromium-chromedriver \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      font-noto \
      font-noto-arabic

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist/apps/home-service ./dist

RUN chown -R appuser:appgroup /app

USER appuser
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "require('net').connect(3001,'localhost',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main"]
