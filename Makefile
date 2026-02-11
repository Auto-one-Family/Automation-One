# AutomationOne - Docker Makefile
COMPOSE := docker compose
COMPOSE_DEV := -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_TEST := -f docker-compose.yml -f docker-compose.test.yml
COMPOSE_E2E := -f docker-compose.yml -f docker-compose.e2e.yml

.PHONY: help up down dev dev-down test test-down build clean e2e-up e2e-down e2e-test e2e-test-ui logs logs-server logs-mqtt logs-frontend logs-db shell-server shell-db db-migrate db-rollback db-status db-backup db-restore mqtt-sub status health monitor-up monitor-down monitor-logs monitor-status devtools-up devtools-down devtools-logs devtools-status wokwi-build wokwi-seed wokwi-list wokwi-test-quick wokwi-test-full wokwi-test-scenario wokwi-test-category wokwi-run

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
	@echo ""
	@echo "DevTools Stack:"
	@echo "  make devtools-up     - Start devtools (pgAdmin)"
	@echo "  make devtools-down   - Stop devtools stack"
	@echo "  make devtools-logs   - Follow devtools logs"
	@echo "  make devtools-status - DevTools container status"
	@echo ""
	@echo "Wokwi ESP32 Simulation Testing:"
	@echo "  make wokwi-build         - Build firmware for all 3 Wokwi ESPs (parallel)"
	@echo "  make wokwi-build-esp01/02/03 - Build specific ESP firmware"
	@echo "  make wokwi-seed          - Seed database with 3 Wokwi test devices"
	@echo "  make wokwi-list          - List all available test scenarios"
	@echo "  make wokwi-test-quick    - Run quick tests (boot + heartbeat)"
	@echo "  make wokwi-test-full     - Run all CI scenarios (23 tests)"
	@echo "  make wokwi-test-scenario SCENARIO=path - Run specific scenario"
	@echo "  make wokwi-test-category CAT=01-boot   - Run category tests"
	@echo "  make wokwi-run           - Start Wokwi interactively (ESP_00000001)"
	@echo "  make wokwi-run-esp01/02/03 - Start specific ESP interactively"

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

# ============================================
# DevTools Stack (Profile: devtools)
# ============================================
devtools-up:
	$(COMPOSE) --profile devtools up -d

devtools-down:
	$(COMPOSE) --profile devtools down

devtools-logs:
	$(COMPOSE) --profile devtools logs -f --tail=100

devtools-status:
	$(COMPOSE) --profile devtools ps

# ============================================
# Wokwi ESP32 Simulation Testing
# ============================================
# Multi-Device Support: Build different ESP IDs for parallel testing
wokwi-build-esp01:
	@echo "Building firmware for ESP_00000001 (wokwi_esp01)..."
	cd "El Trabajante" && pio run -e wokwi_esp01

wokwi-build-esp02:
	@echo "Building firmware for ESP_00000002 (wokwi_esp02)..."
	cd "El Trabajante" && pio run -e wokwi_esp02

wokwi-build-esp03:
	@echo "Building firmware for ESP_00000003 (wokwi_esp03)..."
	cd "El Trabajante" && pio run -e wokwi_esp03

wokwi-build:
	@echo "Building firmware for all Wokwi ESPs (parallel)..."
	@$(MAKE) -j3 wokwi-build-esp01 wokwi-build-esp02 wokwi-build-esp03
	@echo "✅ All Wokwi firmware builds complete!"

wokwi-seed:
	@echo "Seeding database with Wokwi test devices (ESP_00000001-003)..."
	docker exec -it automationone-server python scripts/seed_wokwi_esp.py

wokwi-list:
	@echo "Available Wokwi Test Scenarios:"
	@echo ""
	@find "El Trabajante/tests/wokwi/scenarios" -name "*.yaml" -type f | \
		sed 's|El Trabajante/tests/wokwi/scenarios/||' | \
		sed 's|/| - |' | \
		sort

wokwi-test-quick:
	@echo "Running quick Wokwi tests (boot + heartbeat)..."
	@cd "El Trabajante" && \
		wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml && \
		wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_safe_mode.yaml && \
		wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/02-sensor/sensor_heartbeat.yaml && \
		echo "✅ Quick tests passed!"

wokwi-test-full:
	@echo "Running all CI scenarios (22 tests)..."
	@echo "This will take several minutes..."
	@cd "El Trabajante" && \
		for scenario in \
			tests/wokwi/scenarios/01-boot/boot_full.yaml \
			tests/wokwi/scenarios/01-boot/boot_safe_mode.yaml \
			tests/wokwi/scenarios/02-sensor/sensor_heartbeat.yaml \
			tests/wokwi/scenarios/02-sensor/sensor_ds18b20_read.yaml \
			tests/wokwi/scenarios/02-sensor/sensor_analog_flow.yaml \
			tests/wokwi/scenarios/02-sensor/sensor_dht22_full_flow.yaml \
			tests/wokwi/scenarios/02-sensor/sensor_ds18b20_full_flow.yaml \
			tests/wokwi/scenarios/03-actuator/actuator_led_on.yaml \
			tests/wokwi/scenarios/03-actuator/actuator_binary_full_flow.yaml \
			tests/wokwi/scenarios/03-actuator/actuator_pwm_full_flow.yaml \
			tests/wokwi/scenarios/03-actuator/actuator_status_publish.yaml \
			tests/wokwi/scenarios/03-actuator/actuator_emergency_clear.yaml \
			tests/wokwi/scenarios/03-actuator/actuator_timeout_e2e.yaml \
			tests/wokwi/scenarios/04-zone/zone_assignment.yaml \
			tests/wokwi/scenarios/04-zone/subzone_assignment.yaml \
			tests/wokwi/scenarios/05-emergency/emergency_broadcast.yaml \
			tests/wokwi/scenarios/05-emergency/emergency_esp_stop.yaml \
			tests/wokwi/scenarios/05-emergency/emergency_stop_full_flow.yaml \
			tests/wokwi/scenarios/06-config/config_sensor_add.yaml \
			tests/wokwi/scenarios/06-config/config_actuator_add.yaml \
			tests/wokwi/scenarios/07-combined/combined_sensor_actuator.yaml \
			tests/wokwi/scenarios/07-combined/multi_device_parallel.yaml; \
		do \
			echo "Running $$scenario..."; \
			wokwi-cli . --timeout 90000 --scenario $$scenario || exit 1; \
		done && \
		echo "✅ All CI tests passed!"

wokwi-test-scenario:
ifndef SCENARIO
	$(error SCENARIO is required. Usage: make wokwi-test-scenario SCENARIO=tests/wokwi/scenarios/01-boot/boot_full.yaml)
endif
	@echo "Running scenario: $(SCENARIO)"
	@cd "El Trabajante" && wokwi-cli . --timeout 90000 --scenario $(SCENARIO)

wokwi-test-category:
ifndef CAT
	$(error CAT is required. Usage: make wokwi-test-category CAT=01-boot)
endif
	@echo "Running all scenarios in category: $(CAT)"
	@cd "El Trabajante" && \
		for scenario in tests/wokwi/scenarios/$(CAT)/*.yaml; do \
			echo "Running $$scenario..."; \
			wokwi-cli . --timeout 90000 --scenario $$scenario || exit 1; \
		done && \
		echo "✅ Category $(CAT) tests passed!"

wokwi-run:
	@echo "Starting Wokwi simulation interactively (ESP_00000001)..."
	@echo "Press Ctrl+C to stop."
	@cd "El Trabajante" && wokwi-cli . --timeout 0 --firmware .pio/build/wokwi_esp01/firmware.bin

wokwi-run-esp01:
	@echo "Starting Wokwi ESP_00000001 interactively..."
	@echo "Press Ctrl+C to stop."
	@cd "El Trabajante" && wokwi-cli . --timeout 0 --firmware .pio/build/wokwi_esp01/firmware.bin

wokwi-run-esp02:
	@echo "Starting Wokwi ESP_00000002 interactively..."
	@echo "Press Ctrl+C to stop."
	@cd "El Trabajante" && wokwi-cli . --timeout 0 --firmware .pio/build/wokwi_esp02/firmware.bin

wokwi-run-esp03:
	@echo "Starting Wokwi ESP_00000003 interactively..."
	@echo "Press Ctrl+C to stop."
	@cd "El Trabajante" && wokwi-cli . --timeout 0 --firmware .pio/build/wokwi_esp03/firmware.bin
