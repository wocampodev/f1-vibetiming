.DEFAULT_GOAL := help

POSTGRES_CONTAINER ?= f1-vibetiming-postgres
POSTGRES_USER ?= postgres
POSTGRES_DB ?= f1_vibetiming
TOPIC ?= TimingData
BACKUP_FILE ?=
WEB_SMOKE_PORT ?=
SESSION_KEY ?=
MAX_AGE_SEC ?=
PROVIDER_LOG ?= off
PROVIDER_LOG_MAX_CHARS ?= 600

.PHONY: \
	help \
	install env-copy bootstrap \
	infra-up infra-down \
	db-generate db-push db-migrate \
	dev dev-api dev-web \
	format-check lint build test test-api test-api-e2e test-web-smoke validate test-all \
	run run-sim down \
	stack-up stack-up-provider stack-up-provider-capture stack-up-provider-verbose stack-down \
	logs-api health \
	backup backup-now restore backup-restore provider-inspect provider-inspect-topic provider-audit provider-export sql provider-psql

help: ## Show the simplified command surface
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_.-]+:.*## / {printf "%-28s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install:
	pnpm install

env-copy:
	@test -f .env || cp .env.example .env

infra-up:
	docker compose up -d

infra-down:
	docker compose down

db-generate:
	pnpm --filter api prisma:generate

db-push:
	pnpm --filter api prisma:push

db-migrate:
	pnpm --filter api prisma:migrate

bootstrap: ## Install deps, prepare env, and prime the local database
	$(MAKE) install
	$(MAKE) env-copy
	$(MAKE) infra-up
	$(MAKE) db-push

dev:
	pnpm dev

dev-api:
	pnpm --filter api start:dev

dev-web:
	pnpm --filter web dev

format-check:
	pnpm --filter api exec prettier --check "src/**/*.ts" "test/**/*.ts"

lint:
	pnpm lint

build:
	pnpm build

test:
	pnpm test

test-api:
	pnpm --filter api test

test-api-e2e:
	pnpm --filter api test:e2e

test-web-smoke:
	@if [ -n "$(WEB_SMOKE_PORT)" ]; then \
		WEB_SMOKE_PORT=$(WEB_SMOKE_PORT) pnpm --filter web test:smoke; \
	else \
		pnpm --filter web test:smoke; \
	fi

validate: ## Run format checks, lint, tests, and build
	$(MAKE) format-check
	$(MAKE) lint
	$(MAKE) test-api
	$(MAKE) test-web-smoke
	$(MAKE) build

test-all:
	$(MAKE) validate

run: ## Run Docker in provider mode with attached logs
	$(MAKE) env-copy
	LIVE_SOURCE=provider LIVE_PROVIDER_CAPTURE_ENABLED=true LIVE_PROVIDER_LOG=$(PROVIDER_LOG) LIVE_PROVIDER_LOG_MAX_CHARS=$(PROVIDER_LOG_MAX_CHARS) docker compose --profile app up --build

run-sim: ## Run Docker in simulator mode with attached logs
	$(MAKE) env-copy
	LIVE_SOURCE=simulator docker compose --profile app up --build

down: ## Stop the local Docker stack
	docker compose down

stack-up:
	docker compose --profile app up -d --build

stack-up-provider:
	LIVE_SOURCE=provider docker compose --profile app up -d --build

stack-up-provider-capture:
	LIVE_SOURCE=provider LIVE_PROVIDER_CAPTURE_ENABLED=true docker compose --profile app up -d --build

stack-up-provider-verbose: PROVIDER_LOG = all
stack-up-provider-verbose:
	LIVE_SOURCE=provider LIVE_PROVIDER_CAPTURE_ENABLED=true LIVE_PROVIDER_LOG=$(PROVIDER_LOG) LIVE_PROVIDER_LOG_MAX_CHARS=$(PROVIDER_LOG_MAX_CHARS) docker compose --profile app up -d --build

stack-down:
	docker compose --profile app down

logs-api:
	docker logs -f f1-vibetiming-api

health: ## Query the main local health endpoints
	@printf "API health\n"
	@curl -fsS http://localhost:4000/api/health/data && printf "\n\n"
	@printf "Live health\n"
	@curl -fsS http://localhost:4000/api/live/health && printf "\n\n"
	@printf "Web home status\n"
	@curl -I -fsS http://localhost:3000/ | sed -n '1p'
	@printf "Standings status\n"
	@curl -I -fsS http://localhost:3000/standings | sed -n '1p'

backup: ## Run an immediate PostgreSQL backup
	docker exec f1-vibetiming-postgres-backup sh /usr/local/bin/postgres-backup.sh

backup-now:
	$(MAKE) backup

restore: ## Restore a SQL backup file into local Postgres (set BACKUP_FILE=...)
	@test -n "$(BACKUP_FILE)" || (printf "BACKUP_FILE is required\n" >&2; exit 1)
	gunzip -c "$(BACKUP_FILE)" | docker exec -i $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

backup-restore:
	$(MAKE) restore BACKUP_FILE="$(BACKUP_FILE)"

provider-inspect: ## Show provider capture summary (set TOPIC=TimingData for recent payloads)
	sh scripts/live-provider-inspect.sh "$(TOPIC)"

provider-inspect-topic:
	sh scripts/live-provider-inspect.sh "$(TOPIC)"

provider-audit: ## Audit latest provider ranking session (set SESSION_KEY=... or MAX_AGE_SEC=...)
	@if [ -n "$(SESSION_KEY)" ]; then \
		MAX_AGE_SEC=$(MAX_AGE_SEC) pnpm --filter api live:audit "$(SESSION_KEY)"; \
	else \
		MAX_AGE_SEC=$(MAX_AGE_SEC) pnpm --filter api live:audit; \
	fi

provider-export: ## Export provider capture reports into docs/live-provider/reports
	node scripts/live-provider-export.mjs

sql: ## Open an interactive PostgreSQL shell inside the local container
	docker exec -it $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

provider-psql:
	docker exec -it $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)
