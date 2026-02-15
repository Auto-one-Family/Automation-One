# Technical Manager – Auftrags-Index

**Erstellt:** 2026-02-08  
**Zweck:** Übersicht aller TM-Einzelgespräche, Reihenfolge, Abhängigkeiten

---

## Nutzung

Jedes Dokument ist ein **einzelner Gesprächsauftrag** an den Technical Manager. Die Punkte können einzeln in beliebiger Reihenfolge abgearbeitet werden; wo Abhängigkeiten bestehen, sind sie vermerkt.

**Struktur pro Auftrag:** Sektion 0 „Referenzdokumente“ (ganz oben) – Robin liefert diese Dateien mit. TM liest sie zuerst. Danach: „Wo suchen / Was suchen“, „Agent-Befehle für gezielte Analyse“, „Randinformationen“. Ziel: TM kann zielgerichtete Befehle an VS-Code-Agents formulieren.

---

## Auftragsliste

| # | Dokument | Thema | Abhängigkeiten |
|---|----------|-------|-----------------|
| 1 | [TM_01_WOKWI_ANALYSE.md](./TM_01_WOKWI_ANALYSE.md) | Wokwi – Netzwerk, Docker, CI, ESP Pending Approval | — |
| 2 | [TM_02_DOCKER_STACK_CHECK.md](./TM_02_DOCKER_STACK_CHECK.md) | Docker Stack – Container, Netzwerk, Volumes | — |
| 3 | [TM_03_DATENBANK_KONSOLIDIERUNG.md](./TM_03_DATENBANK_KONSOLIDIERUNG.md) | Datenbank – Test/Dev/Prod, InfluxDB, Pending State | 2 (Docker für DB) |
| 4 | [TM_04_NETZWERK_ANALYSE.md](./TM_04_NETZWERK_ANALYSE.md) | Netzwerk – Modelle, Kontrolle, Segmentierung | 2 (Docker) |
| 5 | [TM_05_FRONTEND_KONSOLIDIERUNG.md](./TM_05_FRONTEND_KONSOLIDIERUNG.md) | Frontend – Codestruktur, Dashboard, Grafana, DB-Konsistenz | 3 (DB), 4 (Netzwerk) |
| 6 | [TM_06_TEST_ENGINE.md](./TM_06_TEST_ENGINE.md) | Test Engine – pytest, Vitest, Playwright, Wokwi | 1, 2 |
| 7 | [TM_07_REDIS_QUEUING.md](./TM_07_REDIS_QUEUING.md) | Redis – Queuing, Rate Limiting, lokale Integration | 2 (Docker) |

---

## Empfohlene Reihenfolge (bei sequentieller Abarbeitung)

1. **TM_02** Docker – Basis für alle weiteren
2. **TM_01** Wokwi – eigenständig, aber CI nutzt Docker
3. **TM_04** Netzwerk – auf Docker aufbauend
4. **TM_03** Datenbank – Docker-Volumes, InfluxDB
5. **TM_06** Test Engine – alle Bereiche
6. **TM_05** Frontend – DB-Konsistenz, Grafana
7. **TM_07** Redis – optional, kann parallel zu anderen

---

## Gemeinsame Referenzen

Diese Dateien sind für mehrere Aufträge relevant:

- `.claude/reference/testing/flow_reference.md` – F1–F4 Flows
- `.claude/reference/testing/agent_profiles.md` – Agent-SOLL
- `.claude/skills/system-control/SKILL.md` – Make-Targets
- `.claude/reference/patterns/COMMUNICATION_FLOWS.md` – Datenflüsse

---

## Agent-/Skill-Übersicht pro Auftrag

| Auftrag | Primäre Agents/Skills |
|--------|------------------------|
| 1 | esp32-dev, system-control, test-log-analyst |
| 2 | system-control, db-inspector |
| 3 | db-inspector, server-dev |
| 4 | mqtt-debug, system-control, mqtt-dev |
| 5 | frontend-dev, frontend-debug |
| 6 | test-log-analyst, server-dev, frontend-dev, esp32-dev |
| 7 | server-dev, system-control, mqtt-dev |
