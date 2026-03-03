FROM node:24-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/prisma ./apps/api/prisma

RUN pnpm install --frozen-lockfile --filter api...

COPY apps/api ./apps/api

RUN pnpm --filter api build && pnpm --filter api prisma:generate

FROM node:24-alpine AS runtime

WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production

COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

EXPOSE 4000

CMD ["pnpm", "--filter", "api", "start:prod"]
