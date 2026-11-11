FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3001 DATA_DIR=/var/lib/hepai/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force \
    && mkdir -p /var/lib/hepai/data && chown -R node:node /var/lib/hepai
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"
CMD ["node", "build/server/index.js", "--production"]
