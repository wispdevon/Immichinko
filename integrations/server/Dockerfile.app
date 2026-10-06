# Compile build-integrated locally before building on the Pi, to avoid
# competing with Immich for memory. Runtime dependencies install for ARM64.
FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY --chown=node:node build-integrated ./build
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 DATABASE_PATH=/data/immichinko.sqlite
VOLUME /data
CMD ["node", "build"]
