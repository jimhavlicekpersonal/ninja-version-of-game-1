# The PvP server (roadmap step 43): one image, promoted from staging to production.
#   docker build --build-arg RELEASE=<git sha> -t kagemura-server .
#   release step: node dist-server/migrate.js     (npm run server:migrate)
#   start:        node dist-server/main.js
# Settings come from the host's environment (server/main.ts, server/config.ts).
# Backend A26: the base image is pinned by version and digest (update both together, from
# https://hub.docker.com/_/node, e.g. `docker buildx imagetools inspect node:24-slim`), so a rebuild of the
# same commit gets the same Node and Debian; tini runs as PID 1 (signals reach node, so the graceful
# shutdown in server/shutdown.ts runs; zombies are reaped); HEALTHCHECK asks /healthz.
ARG NODE_IMAGE=node:24.22.3-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.server.config.ts ./
COPY server ./server
COPY src ./src
COPY locales ./locales
COPY tools/i18n ./tools/i18n
RUN npm run server:build

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Only what the bundle imports at run time (fastify, pg, unicode-segmenter). package.json is shared with the
# game, so its client packages (Phaser ~148 MB, Capacitor) are removed after the locked install (report section 5
# step 10, quality 32); tests/backend/release-config.test.ts keeps this list in step with package.json.
RUN npm ci --omit=dev --ignore-scripts \
  && rm -rf node_modules/phaser node_modules/@capacitor node_modules/@capacitor-community node_modules/eventemitter3 node_modules/tslib \
  && npm cache clean --force
COPY --from=build /app/dist-server ./dist-server
ARG RELEASE=dev
ENV RELEASE=kagemura-server@${RELEASE}
EXPOSE 8787
USER node
# Liveness only (no database): the same check the load balancer's /healthz uses. PORT may be set by the host.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist-server/main.js"]
