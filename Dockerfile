FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

ENV VITE_BUILD_SOURCEMAP=false

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend-deps

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=5000
ENV TRUST_PROXY=true
ENV SERVE_STATIC_FRONTEND=true
ENV CORS_ENABLED=false
ENV FRONTEND_DIST_PATH=../frontend/dist

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY --chown=nodejs:nodejs backend/ ./
COPY --from=frontend-builder --chown=nodejs:nodejs /app/frontend/dist /app/frontend/dist

USER nodejs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
