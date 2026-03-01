# API App

This is the NestJS backend for the F1 dashboard MVP.

Run from repository root:

```bash
pnpm dev
```

Or run only the API app:

```bash
pnpm --filter api start:dev
```

Common commands:

```bash
pnpm --filter api prisma:push
pnpm --filter api prisma:generate
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api build
```
