# ============================================
# Stage 1: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json* ./
COPY tsconfig.json ./
COPY tsconfig.*.json ./

# Install ALL dependencies (including devDeps for build)
RUN npm ci

# Copy the entire monorepo source
COPY . .

# Build only the api-gateway app
RUN npm run build:api-gateway
# If your nest-cli.json uses projects, you can also use:
# RUN npx nest build api-gateway

# ============================================
# Stage 2: Production Runner
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy root package files and install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Use non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget --spider -q http://localhost:3000/health || exit 1

CMD ["node", "dist/apps/api-gateway/main"]
