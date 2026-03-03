# F1 VibeTiming Backlog

Last updated: 2026-03-02

## Compact Session Snapshot

- Completed: MVP-001 to MVP-025
- Open MVP work: none
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
- [x] MVP-023 Add frontend smoke tests for critical routes
- [x] MVP-024 Set up deployment for web and API
- [x] MVP-025 Write README and runbook

## Immediate Next Steps

- [ ] LEGAL-001 Complete provider terms and licensing review for live data sources
- [x] LEGAL-002 Publish a data-usage policy (allowed usage, attribution, retention, caching)
- [ ] LEGAL-003 Add compliance checklist gate to release process for real-provider rollout
- [x] PH2-001 Define simulator-first live adapter contract + normalized event schema
- [x] PH2-002 Define stream envelope (`initial_state`, `delta_update`, `heartbeat`, `status`)
- [x] PH2-003 Implement local replay/simulator source for deterministic development
- [ ] PH2-004 Decide deployment target (single-host Docker vs cloud split for web/api)

## Phase 2 - Live Weekend Mode (Post-MVP)

### Track A - Build First (Simulator)

- [ ] PH2-101 Implement ingest orchestrator (adapter + normalizer + publisher)
- [ ] PH2-102 Implement API stream gateway for live updates
- [ ] PH2-103 Add reconnect/backoff strategy + REST fallback polling
- [ ] PH2-104 Add live leaderboard with lap/interval updates
- [ ] PH2-105 Add session state timeline (green/yellow/red/checkered)
- [ ] PH2-106 Add tire strategy view (compound + stint length)
- [ ] PH2-107 Add sector comparison and mini pace chart
- [ ] PH2-108 Add race control + team radio live feed panels
- [ ] PH2-109 Add track map v1 with car position updates
- [ ] PH2-110 Add simulator fixtures/replay tests for live flows

### Track B - Compliance Gate (Required Before Real Provider)

- [ ] PH2-901 Verify provider terms allow intended app usage
- [ ] PH2-902 Verify legal attribution/disclaimer requirements in UI/docs
- [ ] PH2-903 Verify retention/rate-limit rules and enforce in code/config
- [ ] PH2-904 Get explicit sign-off before enabling non-simulator provider in production

## Phase 3 - Analytics (Post-MVP)

- [ ] Qualifying delta analysis by phase and segment
- [ ] Race pace degradation analytics
- [ ] Overtake/incident event timeline
- [ ] Driver consistency index
- [ ] Team pit stop performance metrics
