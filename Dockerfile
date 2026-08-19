# =============================================================================
# Dockerfile — Node.js-Chat-App
# Mehrstufiger Build: schlankes Runtime-Image, nicht als root.
# bcrypt benötigt Compilierungs-Tools; die werden nach npm install wieder entfernt.
# =============================================================================

FROM node:22-bookworm-slim AS deps

WORKDIR /usr/src/app

# Native Module (bcrypt) brauchen Build-Toolchain; danach wieder entfernen.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./

# Nur Produktionsabhängigkeiten — kein Dev-Tooling im Image.
RUN npm install --omit=dev \
    && apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Runtime: Abhängigkeiten kopieren, App-Code hinzufügen, als User "node" starten.
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim

WORKDIR /usr/src/app

# Healthcheck nutzt Node's eingebaute fetch-API (Node 18+).
ENV NODE_ENV=production
ENV APP_PORT=3355

# Verknüpft das GHCR-Paket mit dem GitHub-Repository.
LABEL org.opencontainers.image.source="https://github.com/rolfwalker71-commits/chat"
LABEL org.opencontainers.image.title="chat"
LABEL org.opencontainers.image.description="Echtzeit-Chat mit Express, Socket.io und PostgreSQL"

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node server.js ./
COPY --chown=node:node public ./public

# Upload-Verzeichnis: Named Volume übernimmt Besitz beim ersten Mount aus dem Image.
RUN mkdir -p /usr/src/app/uploads && chown node:node /usr/src/app/uploads

USER node

EXPOSE 3355

# Docker erkennt so, ob der Prozess noch HTTP beantwortet.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3355/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
