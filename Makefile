# AutomationOne - Docker Makefile
COMPOSE := docker compose
COMPOSE_DEV := -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_TEST := -f docker-compose.yml -f docker-compose.test.yml
COMPOSE_E2E := -f docker-compose.yml -f docker-compose.e2e.yml

.PHONY: help up down dev dev-down test test-down build clean e2e-up e2e-down e2e-test e2e-test-ui logs logs-server logs-mqtt logs-frontend logs-db shell-server shell-db db-migrate db-rollback db-status db-backup db-restore mqtt-sub status health monitor-up monitor-down monitor-logs monitor-status

help:
	@echo "AutomationOne Docker Commands:"
	@echo ""
	@echo "Stack Lifecycle:"
	@echo "  make up            - Start production stack"
	@echo "  make down          - Stop all containers"
	@echo "  make dev           - Start with hot-reload"
	@echo "  make dev-down      - Stop dev stack"
	@echo "  make test          - Start test environment"
	@echo "  make test-down     - Stop test stack + remove volumes"
	@echo "  make build         - Rebuild all images"
	@echo "  make clean         - Stop + remove all volumes (DESTRUCTIVE)"
	@echo ""
	@echo "E2E Testing:"
	@echo "  make e2e-up        - Start E2E stack (Playwright)"
	@echo "  make e2e-down      - Stop E2E stack"
	@echo "  make e2e-test      - Run Playwright E2E tests"
	@echo "  make e2e-test-ui   - Run Playwright with UI"
	@echo ""
	@echo "Logs & Monitoring:"
	@echo "  make logs          - Follow all logs"
	@echo "  make logs-server   - Follow server logs"
	@echo "  make logs-mqtt     - Follow MQTT broker logs"
	@echo "  make logs-frontend - Follow frontend logs"
	@echo "  make logs-db       - Follow PostgreSQL logs"
	@echo "  make mqtt-sub      - Subscribe kaiser/# topics"
	@echo "  make status        - Container status"
	@echo "  make health        - Server health check"
	@echo ""
	@echo "Shell & Database:"
	@echo "  make shell-server  - Shell into server container"
	@echo "  make shell-db      - PostgreSQL CLI"
	@echo "  make db-migrate    - Run Alembic migrations"
	@echo "  make db-rollback   - Rollback last migration"
	@echo "  make db-status     - Show migration status"
	@echo "  make db-backup     - Backup database"
	@echo "  make db-restore    - Restore database (FILE=path)"
	@echo ""
	@echo "Monitoring Stack:"
	@echo "  make monitor-up     - Start monitoring (Loki, Promtail, Prometheus, Grafana)"
	@echo "  make monitor-down   - Stop monitoring stack"
	@echo "  make monitor-logs   - Follow monitoring logs"
	@echo "  make monitor-status - Monitoring container status"

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

dev:
	$(COMPOSE) $(COMPOSE_DEV) up -d

dev-down:
	$(COMPOSE) $(COMPOSE_DEV) down

test:
	$(COMPOSE) $(COMPOSE_TEST) up -d

test-down:
	$(COMPOSE) $(COMPOSE_TEST) down -v

e2e-up:
	$(COMPOSE) $(COMPOSE_E2E) up -d --wait

e2e-down:
	$(COMPOSE) $(COMPOSE_E2E) down

e2e-test:
	cd "El Frontend" && npx playwright test

e2e-test-ui:
	cd "El Frontend" && npx playwright test --ui

logs:
	$(COMPOSE) logs -f --tail=100

logs-server:
	$(COMPOSE) logs -f --tail=100 el-servador

logs-mqtt:
	$(COMPOSE) logs -f --tail=100 mqtt-broker

logs-frontend:
	$(COMPOSE) logs -f --tail=100 el-frontend

logs-db:
	$(COMPOSE) logs -f --tail=100 postgres

shell-server:
	docker exec -it automationone-server /bin/bash

shell-db:
	docker exec -it automationone-postgres psql -U god_kaiser -d god_kaiser_db

db-migrate:
	docker exec -it automationone-server python -m alembic upgrade head

db-rollback:
	docker exec -it automationone-server python -m alembic downgrade -1

db-status:
	docker exec -it automationone-server python -m alembic current
	docker exec -it automationone-server python -m alembic history --verbose -l 5

db-backup:
	@mkdir -p backups
	./scripts/docker/backup.sh

db-restore:
	./scripts/docker/restore.sh $(FILE)

mqtt-sub:
	docker exec -it automationone-mqtt mosquitto_sub -h localhost -t "kaiser/#" -v

status:
	$(COMPOSE) ps

health:
	@docker exec automationone-server curl -s http://localhost:8000/api/v1/health/live || echo "Server not responding"

build:
	$(COMPOSE) build

clean:
	$(COMPOSE) down -v --remove-orphans

# ============================================
# Monitoring Stack (Profile: monitoring)
# ============================================
monitor-up:
	$(COMPOSE) --profile monitoring up -d

monitor-down:
	$(COMPOSE) --profile monitoring down

monitor-logs:
	$(COMPOSE) --profile monitoring logs -f --tail=100

monitor-status:
	$(COMPOSE) --profile monitoring ps
