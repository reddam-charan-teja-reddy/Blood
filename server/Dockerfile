# Stage 1: Build and dependency installation
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN npm install --production

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install curl for docker healthcheck and setup directories
RUN apk add --no-cache curl && mkdir -p /app/uploads && chown -R node:node /app

# Copy dependencies and application source with ownership
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/v1/health || exit 1

CMD ["node", "src/app.js"]
