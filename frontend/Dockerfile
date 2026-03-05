# ==============================================================================
# DOCKERFILE - FRONTEND (React/Vite)
# ==============================================================================
#
# FRONTEND DEPLOYMENT STRATEGY:
# React apps are "static" after building - just HTML, CSS, and JavaScript.
# We don't need Node.js to serve them in production!
#
# TWO-STAGE BUILD:
# 1. Build stage: Use Node.js to compile React → static files
# 2. Production stage: Use Nginx to serve the static files
#
# WHY NGINX?
# - Extremely fast at serving static files
# - Handles routing for single-page apps
# - Built-in caching and compression
# - Much lighter than Node.js (just need the built files)
#
# Final image is ~25MB instead of ~300MB with Node.js!
#
# ==============================================================================

# ==============================================================================
# STAGE 1: BUILD
# ==============================================================================
# Use Node.js to install dependencies and build the React app.

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency caching
COPY package*.json ./

# INSTALL ALL DEPENDENCIES (including devDependencies)
#
# Unlike backend, we need devDependencies here because:
# - Vite is a dev dependency
# - TypeScript compiler (if used) is a dev dependency
# - Build tools are dev dependencies
#
# These won't be in the final image anyway.
RUN npm ci

# Copy all source files
COPY . .

# BUILD THE APPLICATION
#
# npm run build runs the "build" script from package.json:
#   "build": "vite build"
#
# This:
# 1. Bundles all JavaScript/TypeScript
# 2. Processes CSS (including CSS Modules)
# 3. Optimizes images and assets
# 4. Creates minified production files
# 5. Outputs to /dist folder
#
# The /dist folder contains:
# - index.html
# - assets/index-[hash].js (bundled JavaScript)
# - assets/index-[hash].css (bundled CSS)
# - Static assets (images, fonts)
RUN npm run build

# ==============================================================================
# STAGE 2: PRODUCTION (Nginx)
# ==============================================================================
# Nginx is a high-performance web server.
# We use it to serve our static React files.

# nginx:alpine is tiny (~7MB) - perfect for serving static files
FROM nginx:alpine

# COPY NGINX CONFIGURATION
#
# Our custom config (nginx.conf) handles:
# - SPA routing (all routes → index.html)
# - API proxying (/api → backend)
# - Caching headers for assets
# - Gzip compression
# - Security headers
#
# /etc/nginx/conf.d/default.conf is Nginx's default site config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# COPY BUILT FILES FROM BUILDER
#
# --from=builder: Copy from the build stage
# /app/dist: Where Vite outputs the build
# /usr/share/nginx/html: Nginx's default document root
#
# Only the built files are copied - no node_modules, no source code!
COPY --from=builder /app/dist /usr/share/nginx/html

# Document the port (Nginx listens on 80 by default)
EXPOSE 80

# START NGINX
#
# nginx -g "daemon off;": Run in foreground (required for Docker)
# By default, Nginx runs as a background daemon, but Docker needs
# a foreground process to keep the container running.
CMD ["nginx", "-g", "daemon off;"]
