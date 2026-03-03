# F1 VibeTiming Backlog

Last updated: 2026-03-02

## Compact Session Snapshot

- Completed: MVP-001 to MVP-022, MVP-025
- Open MVP work: MVP-023, MVP-024
- Post-MVP scope remains Phase 2 (Live Weekend Mode) and Phase 3 (Analytics)
- Release baseline validated locally (lint + unit + e2e + build all passing)
- Repository is public at `https://github.com/wocampodev/f1-vibetiming`

## Week 1 - Data + API Foundation

- [x] MVP-001 Initialize monorepo and apps
- [x] MVP-002 Configure CI for lint/test/build
- [x] MVP-003 Add local Postgres/Redis compose setup
- [x] MVP-004 Add environment validation in NestJS
- [x] MVP-005 Design database schema and migrations
- [x] MVP-006 Create Option 1 provider client module
- [x] MVP-007 Implement calendar ingestion cron
- [x] MVP-008 Implement results and standings ingestion cron
- [x] MVP-009 Add ingestion health and freshness endpoint
- [x] MVP-010 Build `GET /api/calendar`
- [x] MVP-011 Build `GET /api/weekends/:eventId`
- [x] MVP-012 Build `GET /api/sessions/:sessionId/results`
- [x] MVP-013 Build standings endpoints
- [x] MVP-014 Standardize API errors, caching, and pagination

## Week 2 - UI + Integration + Deploy

- [x] MVP-015 Create frontend app shell and design tokens
- [x] MVP-016 Build home dashboard page
- [x] MVP-017 Build season calendar page
- [x] MVP-018 Build weekend detail page
- [x] MVP-019 Build session results page
- [x] MVP-020 Build standings page with chart
- [x] MVP-021 Add unit tests for provider mapping and ingestion
- [x] MVP-022 Add API integration tests for core endpoints
- [ ] MVP-023 Add frontend smoke tests for critical routes
- [ ] MVP-024 Set up deployment for web and API
- [x] MVP-025 Write README and runbook

## Immediate Next Steps

- [ ] Implement MVP-023 frontend smoke tests
- [ ] Implement MVP-024 deployment pipeline and environment docs

## Phase 2 - Live Weekend Mode (Post-MVP)

- [ ] Add live leaderboard with lap/interval updates
- [ ] Add session state timeline (green/yellow/red/checkered)
- [ ] Add tire strategy view (compound + stint length)
- [ ] Add sector comparison and mini pace chart
- [ ] Add ingestion adapter for live source (SignalR or equivalent)
- [ ] Add reconnect/backoff and fallback polling strategy
- [ ] Add WebSocket push API for live client updates

## Phase 3 - Analytics (Post-MVP)

- [ ] Qualifying delta analysis by phase and segment
- [ ] Race pace degradation analytics
- [ ] Overtake/incident event timeline
- [ ] Driver consistency index
- [ ] Team pit stop performance metrics
