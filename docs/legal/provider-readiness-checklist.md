# Provider Readiness Checklist

This checklist defines the minimum legal/compliance gate before enabling a non-simulator live provider in production.

Status: draft working checklist for Phase 2.

## Scope

- Applies to any live timing source connected through `LIVE_SOURCE=provider`.
- Applies to API ingestion, web display, and retained historical event data.

## Required Gate Items

- `LEGAL-001` Terms and licensing review is completed and recorded.
- `LEGAL-002` Data usage policy is documented (allowed usage, attribution, retention, caching).
- `LEGAL-003` Compliance checklist is included in release sign-off and approved.

## Review Record Template

Complete this section before production provider rollout:

- Provider name:
- Terms URL:
- Licensing model:
- Commercial use allowed: yes/no
- Public redistribution allowed: yes/no
- Required attribution text:
- Rate-limit constraints:
- Data retention constraints:
- Legal reviewer:
- Review date:
- Approval status:

## Engineering Controls

- Keep `LIVE_SOURCE=simulator` by default.
- Keep `LIVE_PROVIDER_LEGAL_APPROVED=false` until legal sign-off is explicit.
- If provider mode is requested without legal approval, API must fall back to simulator and expose degraded status in `/api/live/health`.

## Go/No-Go

- Go only when all required gate items are complete and signed.
- No-go if any single item is incomplete.

---

This document is an engineering checklist, not legal advice.
