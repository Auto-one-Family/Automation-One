# Auftrag 4.1: pgAdmin DevTools-Profil – Erstanalyse
Datum: 2026-02-09
Typ: Analyse (kein Code)

## Context

pgAdmin ist ein Phantom-Service: Dokumentation beschrieb ihn, aber er existiert nicht in `docker-compose.yml`. DOCKER_VOLLAUDIT wurde bereits korrigiert (v1.5, 8 statt 9 Services).

Vorhandene Artefakte:
- `docker/pgadmin/servers.json` – Pre-Provisioning Config (syntaktisch korrekt, referenziert `god_kaiser_db` auf Host `postgres`)
- `.env.example` – `PGADMIN_EMAIL` und `PGADMIN_PASSWORD` definiert (aber verwaist, und **falsche Variablennamen**: pgAdmin erwartet `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD`)

Robin hat entschieden: **Implementieren** (Option A). Ziel ist ein neues Docker-Profil `devtools`, konsistent mit dem bestehenden `monitoring`-Profil.

## Focus

1. **Bestehende Artefakte prüfen:** Ist `servers.json` noch korrekt? Stimmen DB-Name, Host, Port, Username mit aktuellem `docker-compose.yml` überein?
2. **Docker-Integration skizzieren:** Service-Definition, Image-Version (gepinnt!), Profile `devtools`, Healthcheck, Resource-Limits, Restart-Policy, Logging – alles konsistent mit bestehenden Services.
3. **Makefile-Targets:** Welche Targets braucht es? (`make pgadmin`, `make devtools-up`, `make devtools-down`?) Prüfe bestehende Makefile-Patterns.
4. **Env-Variablen korrigieren:** `PGADMIN_EMAIL` → `PGADMIN_DEFAULT_EMAIL` etc. in `.env.example`.
5. **Abhängigkeiten:** `depends_on: postgres` mit `service_healthy`. Netzwerk `automationone-net`.

## Agents

**Schritt 1:** `/agent system-control` – Modus Analyse. Prüfe `docker-compose.yml` auf bestehende Patterns (wie sind andere Services definiert: Image-Pinning, Healthchecks, Logging, Resource-Limits). Prüfe `servers.json` gegen aktuelle DB-Config. Prüfe `Makefile` auf bestehende Targets und Namenskonventionen. Skizziere vollständige Service-Definition als Textbeschreibung (KEIN Code, nur Spezifikation).

## Goal

Eine vollständige Spezifikation für die pgAdmin-Integration die alle Konfigurationsdetails enthält, sodass ein Dev-Agent sie 1:1 umsetzen kann.

## Success Criterion

Report enthält: Verifizierte `servers.json`, vollständige Service-Spezifikation (Image, Ports, Volumes, HC, Limits, Profile), korrigierte Env-Variablen, Makefile-Target-Liste. Keine offenen Fragen mehr.

## Report zurück an
.technical-manager/inbox/agent-reports/pgadmin-integration-analysis.md
