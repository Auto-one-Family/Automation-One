# AutomationOne - Docker Makefile
COMPOSE := docker compose
COMPOSE_DEV := -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_TEST := -f docker-compose.yml -f docker-compose.test.yml

.PHONY: help up down dev test logs logs-server shell-server db-migrate db-backup db-restore mqtt-sub status health

help:
	@echo "AutomationOne Docker Commands:"
	@echo "  make up          - Start production stack"
	@echo "  make dev         - Start with hot-reload"
	@echo "  make test        - Start test environment"
	@echo "  make down        - Stop all containers"
	@echo "  make logs        - Follow all logs"
	@echo "  make logs-server - Follow server logs"
	@echo "  make shell-server- Shell into server"
	@echo "  make db-migrate  - Run migrations"
	@echo "  make db-backup   - Backup database"
	@echo "  make db-restore  - Restore (FILE=path)"
	@echo "  make mqtt-sub    - Subscribe all topics"
	@echo "  make status      - Container status"
	@echo "  make health      - Health check"

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

logs:
	$(COMPOSE) logs -f --tail=100

logs-server:
	$(COMPOSE) logs -f --tail=100 el-servador

logs-mqtt:
	$(COMPOSE) logs -f --tail=100 mqtt-broker

shell-server:
	docker exec -it automationone-server /bin/bash

shell-db:
	docker exec -it automationone-postgres psql -U god_kaiser -d god_kaiser_db

db-migrate:
	docker exec -it automationone-server python -m alembic upgrade head

db-rollback:
	docker exec -it automationone-server python -m alembic downgrade -1

db-backup:
	@mkdir -p backups
	./scripts/docker/backup.sh

db-restore:
	./scripts/docker/restore.sh $(FILE)

mqtt-sub:
	docker exec -it automationone-mqtt mosquitto_sub -h localhost -t "#" -v

status:
	$(COMPOSE) ps

health:
	@docker exec automationone-server curl -s http://localhost:8000/api/v1/health/live || echo "Server not responding"

build:
	$(COMPOSE) build

clean:
	$(COMPOSE) down -v --remove-orphans
