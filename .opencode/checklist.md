# Next Session Checklist

Use this as a fast start checklist for the next coding block.

## 1) Context Sync

- [ ] Read `BACKLOG.md`
- [ ] Read `AGENTS.md`
- [ ] Read `.opencode/session.yml`

## 2) Environment Boot

- [ ] `pnpm install`
- [ ] `docker compose up -d`
- [ ] `pnpm --filter api prisma:push`

## 3) Current Priorities

- [ ] Phase 2 spike: define live adapter and websocket event contract
- [ ] Validate deployment flow in a Docker-enabled environment
- [ ] Keep MVP contracts stable while starting Phase 2 work

## 4) Validation Gates

- [ ] `pnpm lint`
- [ ] `pnpm --filter api test`
- [ ] `pnpm --filter api test:e2e`
- [ ] `pnpm build`

## 5) Before Handoff

- [ ] Update `BACKLOG.md` checkboxes
- [ ] Keep `AGENTS.md` aligned with roadmap and locked decisions
