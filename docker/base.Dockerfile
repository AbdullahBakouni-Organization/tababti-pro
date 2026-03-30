# ─── Base image shared by all services ───────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

# ─── Dependencies stage ───────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline

# ─── Builder stage ────────────────────────────────────────────────────────────
FROM base AS builder
COPY package*.json ./
RUN npm ci --prefer-offline
COPY . .

ARG SERVICE
RUN npm run build:${SERVICE}

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ARG SERVICE
ARG VERSION=unknown
ENV NODE_ENV=production
ENV SERVICE_NAME=${SERVICE}
ENV APP_VERSION=${VERSION}

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist/apps/${SERVICE} ./dist

USER appuser

EXPOSE 3000

CMD ["node", "dist/main"]
