# Next Session Checklist

Use this as a fast start checklist for the next coding block.

## 1) Context Sync

- [ ] Read `BACKLOG.md`
- [ ] Read `AGENTS.md`
- [ ] Read `SESSION_NOTES.md`
- [ ] Read `.opencode/session.yml`

## 2) Environment Boot

- [ ] `pnpm install`
- [ ] `pnpm db:up`
- [ ] `pnpm --filter api prisma:push`

## 3) Current Priorities

- [ ] MVP-021: add ingestion/provider mapping and upsert unit tests (`apps/api/src/ingestion`)
- [ ] MVP-023: add frontend smoke tests for critical routes
- [ ] MVP-024: add deployment setup + environment docs

## 4) Validation Gates

- [ ] `pnpm lint`
- [ ] `pnpm --filter api test`
- [ ] `pnpm --filter api test:e2e`
- [ ] `pnpm build`

## 5) Before Handoff

- [ ] Update `BACKLOG.md` checkboxes
- [ ] Append `SESSION_NOTES.md` with done/in-progress/next
- [ ] Keep `AGENTS.md` aligned with roadmap and locked decisions
