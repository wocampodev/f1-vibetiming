# Next Session Checklist

Use this as the quick-start checklist for the next coding block.

## 1) Context Sync

- [ ] Read `BACKLOG.md`
- [ ] Read `AGENTS.md`
- [ ] Read `.opencode/session.yml`

## 2) Environment Boot

- [ ] `pnpm install`
- [ ] `docker compose up -d`
- [ ] `pnpm --filter api prisma:push`

## 3) Current Priorities

- [ ] Improve live SignalR decoding coverage and normalization tests
- [ ] Harden web stream resilience and diagnostics behavior
- [ ] Extend standings toward round-history and movement deltas

## 4) Validation Gates

- [ ] `pnpm --filter api test`
- [ ] `pnpm --filter web lint`
- [ ] `pnpm --filter web test:smoke`
- [ ] `pnpm build`

## 5) Before Handoff

- [ ] Update `BACKLOG.md` checkboxes
- [ ] Keep `AGENTS.md` aligned with runtime behavior
