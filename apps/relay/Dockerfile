FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS install
COPY bun.lock package.json ./
COPY apps/relay/package.json apps/relay/
COPY packages/shared/package.json packages/shared/
COPY packages/trpc/package.json packages/trpc/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY tooling/typescript/package.json tooling/typescript/
COPY patches/ patches/
RUN bun install --frozen-lockfile --production --ignore-scripts

# Final
FROM base
RUN addgroup --system --gid 1001 relay && \
    adduser --system --uid 1001 --ingroup relay relay

COPY --from=install --chown=relay:relay /app/node_modules ./node_modules
COPY --chown=relay:relay apps/relay/ apps/relay/
COPY --chown=relay:relay packages/shared/ packages/shared/
COPY --chown=relay:relay packages/trpc/ packages/trpc/
COPY --chown=relay:relay packages/auth/ packages/auth/
COPY --chown=relay:relay packages/db/ packages/db/
COPY --chown=relay:relay tooling/typescript/ tooling/typescript/

USER relay
EXPOSE 8080
CMD ["bun", "run", "apps/relay/src/index.ts"]
