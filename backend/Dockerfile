# ==============================================================================
# DOCKERFILE - BACKEND (Node.js/Express)
# ==============================================================================
#
# A Dockerfile contains instructions to build a Docker image.
# Each instruction creates a "layer" in the final image.
#
# DOCKERFILE COMMANDS:
# - FROM: Base image to start from
# - WORKDIR: Set working directory
# - COPY: Copy files from host to container
# - RUN: Execute command (during build)
# - CMD: Default command to run (when container starts)
# - EXPOSE: Document which port the app uses
# - USER: Switch to a different user
#
# MULTI-STAGE BUILD:
# We use two stages to create a smaller, more secure image:
# 1. Builder stage: Install dependencies
# 2. Production stage: Copy only what's needed
#
# WHY MULTI-STAGE?
# - Dev dependencies aren't included in final image
# - Smaller image size (faster deployment)
# - Build tools aren't in production (more secure)
#
# ==============================================================================

# ==============================================================================
# STAGE 1: BUILDER
# ==============================================================================
# This stage installs dependencies. It won't be in the final image.

# FROM <image>:<tag> AS <name>
# - node:20-alpine: Node.js 20 on Alpine Linux (small ~5MB base)
# - AS builder: Name this stage so we can reference it later
#
# ALPINE LINUX:
# A minimal Linux distribution. Much smaller than Ubuntu/Debian.
# node:20 = ~350MB, node:20-alpine = ~45MB
FROM node:20-alpine AS builder

# WORKDIR sets the working directory for subsequent commands
# Like running: mkdir -p /app && cd /app
WORKDIR /app

# COPY package files first (for caching)
#
# DOCKER LAYER CACHING:
# Docker caches each layer. If a layer hasn't changed, it uses the cache.
#
# By copying package*.json separately:
# - If only source code changes, npm install layer is cached
# - Much faster builds when dependencies don't change
#
# package*.json matches: package.json, package-lock.json
COPY package*.json ./

# INSTALL DEPENDENCIES
#
# npm ci vs npm install:
# - npm ci: Clean install from lock file (faster, reproducible)
# - npm install: Might update lock file
#
# --only=production: Skip devDependencies (we don't need them)
# In production, we don't need: nodemon, jest, eslint, etc.
RUN npm ci --only=production

# ==============================================================================
# STAGE 2: PRODUCTION
# ==============================================================================
# This is the actual image that will be deployed.
# We only copy what we need from the builder stage.

FROM node:20-alpine

WORKDIR /app

# CREATE NON-ROOT USER
#
# SECURITY BEST PRACTICE:
# Never run applications as root in containers.
# If the app is compromised, attacker has limited permissions.
#
# addgroup: Create a group named "nodejs" with GID 1001
# adduser: Create a user named "nodejs" with UID 1001
#
# -S flag creates a "system" user (no password, no home directory)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# COPY FROM BUILDER STAGE
#
# --from=builder: Copy from the "builder" stage (not the host)
# We only copy node_modules, avoiding all the npm cache and build artifacts
COPY --from=builder /app/node_modules ./node_modules

# COPY APPLICATION CODE
#
# --chown=nodejs:nodejs: Set ownership to our non-root user
# This ensures the user can read/write these files
COPY --chown=nodejs:nodejs . .

# SWITCH TO NON-ROOT USER
#
# All subsequent commands and the final CMD run as this user
USER nodejs

# EXPOSE PORT
#
# Documentation: This container listens on port 5000
# Doesn't actually publish the port (that's in docker-compose)
# But it's good practice to document it
EXPOSE 5000

# HEALTH CHECK
#
# Docker periodically runs this to check if container is healthy.
# Used by orchestration tools (Docker Compose, Kubernetes).
#
# Options:
# - --interval: How often to check (30 seconds)
# - --timeout: Max time for check to complete (3 seconds)
# - --start-period: Grace period on startup (5 seconds)
# - --retries: Failures before marking unhealthy (3)
#
# CMD: Run a simple HTTP check using Node.js
# Exit code 0 = healthy, anything else = unhealthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# START THE APPLICATION
#
# CMD specifies the command to run when container starts.
# Array syntax ["command", "arg1", "arg2"] is preferred.
#
# This is equivalent to running: node src/server.js
CMD ["node", "src/server.js"]
