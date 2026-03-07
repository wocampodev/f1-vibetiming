.DEFAULT_GOAL := help

POSTGRES_CONTAINER ?= f1-vibetiming-postgres
POSTGRES_USER ?= postgres
POSTGRES_DB ?= f1_vibetiming
TOPIC ?= TimingData
BACKUP_FILE ?=
WEB_SMOKE_PORT ?=
PROVIDER_LOG_FRAMES ?= true
PROVIDER_LOG_MESSAGES ?= true
PROVIDER_LOG_MAX_CHARS ?= 1200

.PHONY: \
	help \
	install env-copy bootstrap resume \
	infra-up infra-down \
	db-generate db-push db-migrate \
	dev dev-api dev-web \
	lint build test test-api test-api-e2e test-web-smoke test-all \
	stack-up stack-up-provider stack-up-provider-capture stack-up-provider-verbose stack-down \
	logs-api health \
	backup-now backup-restore provider-inspect provider-inspect-topic provider-export provider-psql

help: ## Show available project commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_.-]+:.*## / {printf "%-28s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install workspace dependencies with pnpm
	pnpm install

env-copy: ## Create .env from .env.example if it does not exist
	@test -f .env || cp .env.example .env

infra-up: ## Start local PostgreSQL and backup infrastructure
	docker compose up -d

infra-down: ## Stop local PostgreSQL and backup infrastructure
	docker compose down

db-generate: ## Generate Prisma client for the API app
	pnpm --filter api prisma:generate

db-push: ## Push Prisma schema to the local database
	pnpm --filter api prisma:push

db-migrate: ## Run Prisma dev migration workflow for the API app
	pnpm --filter api prisma:migrate

bootstrap: ## Install deps, copy env if needed, start infra, and push schema
	$(MAKE) install
	$(MAKE) env-copy
	$(MAKE) infra-up
	$(MAKE) db-push

resume: ## Resume the recommended local workflow for this repo
	$(MAKE) install
	$(MAKE) infra-up
	$(MAKE) db-push
	$(MAKE) test-web-smoke
	$(MAKE) test-api-e2e
	$(MAKE) dev

dev: ## Start API and web dev servers together
	pnpm dev

dev-api: ## Start only the API dev server
	pnpm --filter api start:dev

dev-web: ## Start only the web dev server
	pnpm --filter web dev

lint: ## Run API and web lint checks
	pnpm lint

build: ## Build API and web apps
	pnpm build

test: ## Run default repository tests (API unit tests)
	pnpm test

test-api: ## Run API unit tests
	pnpm --filter api test

test-api-e2e: ## Run API end-to-end tests
	pnpm --filter api test:e2e

test-web-smoke: ## Run web route smoke tests
	@if [ -n "$(WEB_SMOKE_PORT)" ]; then \
		WEB_SMOKE_PORT=$(WEB_SMOKE_PORT) pnpm --filter web test:smoke; \
	else \
		pnpm --filter web test:smoke; \
	fi

test-all: ## Run the main local verification suite
	$(MAKE) lint
	$(MAKE) test-api
	$(MAKE) test-web-smoke
	$(MAKE) build

stack-up: ## Build and start the app profile with simulator defaults
	docker compose --profile app up -d --build

stack-up-provider: ## Build and start the app profile against the real provider
	LIVE_SOURCE=provider docker compose --profile app up -d --build

stack-up-provider-capture: ## Build and start provider mode with raw capture enabled
	LIVE_SOURCE=provider LIVE_PROVIDER_CAPTURE_ENABLED=true docker compose --profile app up -d --build

stack-up-provider-verbose: ## Build and start provider mode with capture and verbose logs enabled
	LIVE_SOURCE=provider LIVE_PROVIDER_CAPTURE_ENABLED=true LIVE_PROVIDER_LOG_FRAMES=$(PROVIDER_LOG_FRAMES) LIVE_PROVIDER_LOG_MESSAGES=$(PROVIDER_LOG_MESSAGES) LIVE_PROVIDER_LOG_MAX_CHARS=$(PROVIDER_LOG_MAX_CHARS) docker compose --profile app up -d --build

stack-down: ## Stop and remove the app profile containers
	docker compose --profile app down

logs-api: ## Follow API container logs
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

backup-now: ## Run an immediate PostgreSQL backup through the backup sidecar
	docker exec f1-vibetiming-postgres-backup sh /usr/local/bin/postgres-backup.sh

backup-restore: ## Restore a SQL backup file into local Postgres (set BACKUP_FILE=...)
	@test -n "$(BACKUP_FILE)" || (printf "BACKUP_FILE is required\n" >&2; exit 1)
	gunzip -c "$(BACKUP_FILE)" | docker exec -i $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

provider-inspect: ## Show provider capture summary from PostgreSQL
	sh scripts/live-provider-inspect.sh

provider-inspect-topic: ## Show latest captured payloads for TOPIC=<topic>
	sh scripts/live-provider-inspect.sh "$(TOPIC)"

provider-export: ## Export provider capture summary reports into docs/live-provider/reports
	node scripts/live-provider-export.mjs

provider-psql: ## Open an interactive PostgreSQL shell inside the local container
	docker exec -it $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)
