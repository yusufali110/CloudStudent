# Stage 1: Build & Dependencies
FROM node:20-alpine AS dependencies
WORKDIR /app

# Install build tools if any native modules are needed
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

# Stage 2: Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Security best practice: Run as unprivileged node user
USER node

# Copy dependencies and application code
COPY --chown=node:node package*.json ./
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node . .

EXPOSE 5000

# Docker healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/health || exit 1

CMD ["node", "server.js"]
