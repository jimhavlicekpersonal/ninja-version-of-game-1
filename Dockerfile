# The PvP server (roadmap step 43): one image, promoted from staging to production.
#   docker build --build-arg RELEASE=<git sha> -t kagemura-server .
#   release step: node dist-server/migrate.js     (npm run server:migrate)
#   start:        node dist-server/main.js
# Settings come from the host's environment (server/main.ts, server/config.ts).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.server.config.ts ./
COPY server ./server
COPY src ./src
RUN npm run server:build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# Only what the bundle imports at run time (fastify, pg, unicode-segmenter). package.json is shared with the
# game, so its client packages (Phaser ~148 MB, Capacitor) are removed after the locked install (report section 5
# step 10, quality 32); tests/backend/release-config.test.ts keeps this list in step with package.json.
RUN npm ci --omit=dev --ignore-scripts \
  && rm -rf node_modules/phaser node_modules/@capacitor node_modules/eventemitter3 node_modules/tslib \
  && npm cache clean --force
COPY --from=build /app/dist-server ./dist-server
ARG RELEASE=dev
ENV RELEASE=kagemura-server@${RELEASE}
EXPOSE 8787
USER node
CMD ["node", "dist-server/main.js"]
