# ============================================
# Stage 1: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.json ./
COPY tsconfig.*.json ./

RUN npm ci

COPY . .

RUN npm run build:notification-service
# or: RUN npx nest build notification-service

# ============================================
# Stage 2: Production Runner
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget --spider -q http://localhost:3006/health || exit 1

CMD ["node", "dist/apps/notification-service/main"]
