
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    WEB_DIST_DIR=/app/dist/web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

CMD ["sh", "-c", "node dist/api/migrate.js && node dist/api/seed.js && node dist/api/server.js"]
