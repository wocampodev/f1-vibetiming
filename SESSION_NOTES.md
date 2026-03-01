# Session Notes

Use this file as a quick pause/resume log between coding sessions.

## Template

```md
## YYYY-MM-DD

### Done
- 

### In Progress
- 

### Next
1. 
2. 

### Commands
- 

### Notes / Risks
- 
```

## 2026-03-01

### Done
- Bootstrapped F1 VibeTiming MVP architecture (`apps/api` + `apps/web`)
- Migrated workspace from npm to `pnpm` and aligned CI
- Added API e2e integration tests and CI DB service flow
- Implemented MVP-014 (pagination meta + cache headers + error envelope)
- Synced handoff docs (`BACKLOG.md`, `AGENTS.md`) for pause/resume

### In Progress
- MVP-021 unit tests for provider mapping and ingestion upserts
- MVP-023 frontend smoke tests
- MVP-024 deployment setup

### Next
1. Implement MVP-021 unit tests in `apps/api/src/ingestion`
2. Add MVP-023 smoke tests for `/`, `/calendar`, `/standings`, `/weekend/[eventId]`, `/session/[sessionId]`
3. Implement MVP-024 deployment docs + environment mapping

### Commands
- `pnpm install`
- `pnpm db:up`
- `pnpm --filter api prisma:push`
- `pnpm dev`
- `pnpm --filter api test:e2e`

### Notes / Risks
- Current MVP uses REST provider only (no live SignalR yet)
- Keep response contracts stable while adding post-MVP live features
- Verify data-source terms before implementing live feed adapters

### Compact Handoff
- Status: MVP mostly complete; only MVP-021, MVP-023, and MVP-024 remain
- Resume order: tests (`MVP-021`) -> web smoke (`MVP-023`) -> deploy docs/pipeline (`MVP-024`)
- Canonical state files: `BACKLOG.md` for checkboxes, `AGENTS.md` for roadmap/decisions
