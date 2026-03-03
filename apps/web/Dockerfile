FROM node:24-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile --filter web...

COPY apps/web ./apps/web

RUN pnpm --filter web build

FROM node:24-alpine AS runtime

WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production

COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next

EXPOSE 3000

CMD ["pnpm", "--filter", "web", "start", "--", "-p", "3000"]
