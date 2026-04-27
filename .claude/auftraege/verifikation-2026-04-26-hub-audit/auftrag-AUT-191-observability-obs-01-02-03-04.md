# Auftrag AUT-191 — Observability-Verifikation OBS-01 / OBS-02 / OBS-03 / OBS-04

**Auftragstyp:** Verifikations-Analyse (KEINE Implementierung)
**Empfaenger:** technical manager (Auto-one)
**Schicht:** Cross-Layer (Backend + Dokumentation/CI)
**Linear-Referenz:** AUT-191
**Datum:** 2026-04-26
**Prioritaet:** Niedrig (Hub-Hygiene — kein Normalbetrieb betroffen)
**Berichts-Ablage:** Dieser Ordner — Datei `bericht-AUT-191-observability-obs01-bis-obs04-2026-04-26.md`
**Anhang-Unterordner (falls noetig):** `bericht-AUT-191-anhang/` in diesem Ordner

---

## Problem

Beim Aufbau des Cluster-Hubs C6 (Observability / Logging / Monitoring) wurden in Abschnitt 5b
vier Folge-Auftraege identifiziert. Diese Auftraege wurden aus einer Bestandsaufnahme
(AUT-175 E9, 2026-04-26) abgeleitet und sind im Hub wie folgt konkretisiert:

- **OBS-01:** CentralScheduler hat keinen Health-Endpoint — Scheduler-Status nicht ueber
  Prometheus observierbar
- **OBS-02:** `audit_logs`-Tabelle hat Luecken bei ESP-Delete, Sensor-Config CRUD, Zone-Delete
- **OBS-03:** `CI_PIPELINE.md` sagt 173 Wokwi-Szenarien, `wokwi-tests.yml` sagt 191 —
  Inkonsistenz in CI-Dokumentation
- **OBS-04:** AutoOps-Service nutzt `claude-opus-4-7` hartkodiert in `ai_service.py` anstatt
  aus Env-Variable zu laden

Der TM prueft fuer jeden Punkt den aktuellen Code-Stand, liefert Evidenz und bewertet ob
der Fund noch relevant ist oder ob ein Fix zwischenzeitlich implementiert wurde.

---

## IST — Behauptungen, die zu pruefen sind

### OBS-01 — CentralScheduler ohne Health-Endpoint

**Behauptung:**
Der `CentralScheduler` (oder equivalentes Scheduler-Modul im Backend) hat keinen eigenen
Health-Endpoint — z. B. `GET /api/v1/scheduler/health` oder aehnlich. Der Scheduler-Status
(welche Jobs laufen, naechste Ausfuehrungszeit, Fehlerrate) ist damit NICHT ueber Prometheus
scrapen oder Health-API sichtbar.

Bekannte Background-Services (aus Bestandsaufnahme):
- `LogicEngine`
- `LogicScheduler`
- `MaintenanceService`
- `SensorScheduler`
- `SimulationScheduler`

Prometheus Scrape-Target ist `/api/v1/health/metrics` (NICHT Standard-`/metrics`).

**Kern-Frage OBS-01:**
- Existiert ein Health-Endpoint fuer den CentralScheduler oder die o. g. Background-Services?
  (Grep nach `scheduler/health` oder `scheduler` in Router-Dateien)
- Werden Scheduler-Metriken irgendwie an Prometheus exportiert? Falls ja: Pfad und Format?
- Falls nein: Wie ist der aktuelle Observability-Stand fuer die 5 Background-Services?

---

### OBS-02 — audit_logs Luecken bei Delete/CRUD-Operationen

**Behauptung:**
Die `audit_logs`-Tabelle (31 DB-Tabellen gesamt, verifiziert INV-1) erfasst bestimmte
Operationen NICHT:
- ESP-Delete-Operationen
- Sensor-Config CRUD (Create, Update, Delete)
- Zone-Delete-Operationen

Das bedeutet: Diese Aktionen koennen nach ihrer Durchfuehrung im Monitoring nicht
nachverfolgt werden — eine Luecke im Audit-Trail.

Bekanntes: `LWTHandler` schreibt `audit_logs` (verifiziert T17-V4). `audit_logs`-Tabelle
hat `request_id`-Spalte.

**Kern-Frage OBS-02:**
- Pruefe in `sensors.py`, `esp_devices.py` (oder aequivalente Router-Dateien) ob
  `audit_logs`-Eintraege bei Sensor-Config-Create, -Update, -Delete erzeugt werden.
- Pruefe in `esp_devices.py` (oder aequivalentem Modul) ob ESP-Delete `audit_logs` schreibt.
- Pruefe in `zones.py` (oder aequivalentem Modul) ob Zone-Delete `audit_logs` schreibt.
- Welche Operationen schreiben aktuell audit_logs? (kurze Liste aus Code-Grep)

---

### OBS-03 — Wokwi-Szenario-Zaehler Inkonsistenz in CI-Dokumentation

**Behauptung:**
Zwei CI-relevante Dateien widersprechen sich bei der Anzahl der Wokwi-Testszenarien:
- `CI_PIPELINE.md` (Dokumentation): 173 Szenarien
- `wokwi-tests.yml` (ausfuehrbarer CI-Workflow): 191 Szenarien

Der korrekte Wert ist 191 (die `.yml`-Datei ist kanonisch, weil ausfuehrbar).
`CI_PIPELINE.md` ist veraltet und muss korrigiert werden.

Bekannter CI-Stand: 52 Core-Tests (bei PR) + 191 Wokwi-Tests nightly (Mo+Do 02:00 UTC).

**Kern-Frage OBS-03:**
- Verifiziere: Steht in `CI_PIPELINE.md` tatsaechlich 173 (oder wurde bereits korrigiert)?
  (Datei:Zeile + Snippet)
- Verifiziere: Steht in `wokwi-tests.yml` (oder `wokwi-tests.yaml`) tatsaechlich 191?
  (Datei:Zeile + Snippet)
- Falls noch inkonsistent: minimale Korrektur-Empfehlung (1-Zeilen-Edit in `CI_PIPELINE.md`).
  TM kann diesen Fix direkt ausfuehren (pure Dokumentations-Korrektur, kein Code-Eingriff).

---

### OBS-04 — AutoOps LLM-Modell hartkodiert

**Behauptung:**
Der AutoOps-Service nutzt in `ai_service.py` (oder aequivalentem Modul) das LLM-Modell
`claude-opus-4-7` als Hardcoded-String. Das bedeutet:
- Modell-Wechsel erfordern Code-Aenderungen statt Konfigurationsaenderungen
- Modell-Kosten und Rate-Limits koennen nicht ueber Prometheus oder Config-Management
  beobachtet oder gesteuert werden
- In CI/CD-Umgebungen kann das Modell nicht per Env-Variable ueberschrieben werden

**Kern-Frage OBS-04:**
- In welcher Datei und Zeile steht `claude-opus-4-7` hartkodiert?
- Gibt es eine Env-Variable oder Config-Klasse, aus der das Modell gelesen werden koennte?
- Falls kein Config-System vorhanden: minimale Empfehlung (Env-Variable `AUTOOPS_MODEL`,
  Fallback `claude-opus-4-7`).
- Klaerungspunkt: Falls "AutoOps" kein aktives Feature ist (nur Experimental/Stub),
  explizit als "Feature-Status: Experimental / nicht produktiv" markieren — dann Prio weiter
  absenken.

---

## SOLL — Was der TM liefern soll

TM verteilt an Backend-Spezialisten (OBS-01, OBS-02, OBS-04) und DevOps/Dokumentations-
Spezialisten (OBS-03). Pro Unterpunkt:

1. **Status-Pruefung:** Ist die Luecke noch offen oder zwischenzeitlich behoben?
2. **Code-Evidenz (Pflicht):** Datei-Pfad, Zeilennummer, Snippet, Commit-Hash.
3. **Erklaerung:** 1-3 Saetze Kontext.
4. **Falls offen:** Lueckenbeschreibung + Implementierungsempfehlung.
5. **OBS-03:** Falls noch inkonsistent, kann TM direkt korrigieren (reine Doku-Korrektur).

**Code-Beweis-Anforderung — JEDER Unterpunkt MUSS enthalten:**
- **Datei-Pfad** (Auto-one-relativ)
- **Zeilennummer(n)**
- **Code-Snippet** (3-15 Zeilen in Markdown-Codeblock)
- **Commit-Hash oder -Datum** (via `git log -1 --pretty="%H %ad" -- <datei>`)
- **Begruendung** in 1-3 Saetzen

---

## Eingebetteter Fachkontext

### Observability-Stack AutomationOne

**Grafana-Stack (verifiziert AUT-175 E9):**
- Prometheus v3.2.1, Grafana 11.5.2
- Grafana Alloy (River-Config, Migration von Promtail abgeschlossen 2026-02-24)
- Loki Version 3.4 — Labels: `compose_service`, `container`, `level`, `service`,
  `compose_project`, `stream`. Structured Metadata: `logger`, `request_id`, `component`,
  `device`, `error_code`, `query_duration_ms`
- Log-Volumen: ~24 MB/day (nach Drop-Filter-Optimierung)
- 37 Grafana Alert-Regeln in 8 Gruppen. Gruppe `automationone-critical` Intervall 10s,
  alle anderen 30s-1min
- Prometheus Scrape-Target: `/api/v1/health/metrics` (NICHT `/metrics`)

**Background-Services (5 gesamt, verifiziert INV-1):**
`LogicEngine`, `LogicScheduler`, `MaintenanceService`, `SensorScheduler`, `SimulationScheduler`.

**DB-Schema (relevant fuer OBS-02):**
31 Tabellen gesamt (verifiziert INV-1). Tabellen-Namenskorrekturen:
- `users` heisst tatsaechlich `user_accounts`
- `heartbeat_logs` heisst `esp_heartbeat_logs`
- `logic_rules` heisst `cross_esp_logic`
`audit_logs`-Tabelle existiert, hat `request_id`-Spalte.
`LWTHandler` schreibt audit_logs (verifiziert T17-V4).
`TimestampMixin` (`created_at` + `updated_at`) auf den meisten Tabellen; Ausnahmen:
`actuator_states`, `diagnostic_reports`, `esp_heartbeat_logs`, `plugin_executions`.

**Soft-Delete (relevant fuer OBS-02):**
Nur 2 Tabellen haben Soft-Delete: `esp_devices` (`deleted_at` + `deleted_by`) und `zones`
(`deleted_at` + `deleted_by` + `status='deleted'`). `sensor_configs` werden cascade-deleted.
`sensor_data` bleibt erhalten (FK `SET NULL`).

**Debug-Endpoints:** 58 Debug-Endpoints (22% aller 263 REST-Endpoints), alle `AdminUser`-geschuetzt.

**Wokwi-CI (verifiziert E9):**
- 191 Szenarien (wokwi-tests.yml ist kanonisch)
- CI: 52 Core bei PR + 191 nightly (Mo+Do 02:00 UTC)
- `CI_PIPELINE.md` behauptete 173 — war veraltet

**Neue Loki event_class Labels (seit 2026-04-20):**
`rule_arbitration`, `CONFIG_GUARD` — ermoeglicht gezielte Alert-Rules auf Architektur-
Entscheidungen.

### Korrelations-Kette (Schicht-uebergreifend)

```
ESP32 (Firmware)         Server (FastAPI)        Frontend (Vue)
   |                        |                        |
   v                        v                        v
 MQTT-Payload          structlog          structured browser logs
 + correlation_id      + request_id       + correlation_id (header)
   |                        |                        |
   v                        v                        v
   +------ Alloy -----+ -----> Loki ----> Grafana
```

`request_id` (HTTP-UUID) und MQTT-CID duerfen NICHT blind gejoined werden (verschiedene
Namespaces). `correlation_id` fliesst durch alle drei Schichten.

---

## Akzeptanzkriterien

Der Bericht ist nur akzeptiert, wenn JEDER der folgenden Punkte drei Felder hat:
`STATUS` (IMPLEMENTIERT | TEILWEISE | OFFEN) + `Code-Evidenz` (Datei:Zeile+Snippet) + `Begruendung`.

| Punkt | Pruef-Frage | Erwartetes Feld |
|-------|-------------|-----------------|
| OBS-01 | Health-Endpoint fuer CentralScheduler / Background-Services vorhanden? | STATUS + Evidenz + aktueller Observability-Stand |
| OBS-02-Sensor | audit_logs Eintraege bei Sensor-Config CRUD vorhanden? | STATUS + Evidenz |
| OBS-02-ESP | audit_logs Eintrag bei ESP-Delete vorhanden? | STATUS + Evidenz |
| OBS-02-Zone | audit_logs Eintrag bei Zone-Delete vorhanden? | STATUS + Evidenz |
| OBS-03 | CI_PIPELINE.md korrigiert (173 → 191) oder immer noch falsch? | STATUS + Evidenz + Korrektur (falls noetig) |
| OBS-04 | claude-opus-4-7 hartkodiert? Env-Variable vorhanden? Feature-Status? | STATUS + Evidenz |

---

## Berichts-Struktur (verbindlich fuer den TM)

Datei: `bericht-AUT-191-observability-obs01-bis-obs04-2026-04-26.md` (in diesem Ordner)

```
# Bericht AUT-191 — Observability-Verifikation OBS-01/02/03/04

**Datum:** 2026-04-26
**Erstellt von:** [TM + Backend-Spezialist + DevOps-Spezialist]
**Commit-Stand:** [git log HEAD --format="%H %ad" -1]

## Executive Summary

- OBS-01: [STATUS] — [Scheduler Health-Endpoint: ja/nein; Alternative Observability: ...]
- OBS-02: [STATUS] — [Sensor-CRUD: ja/nein; ESP-Delete: ja/nein; Zone-Delete: ja/nein]
- OBS-03: [STATUS] — [173/191 Inkonsistenz: noch offen / bereits korrigiert]
- OBS-04: [STATUS] — [Hardcoded: ja/nein; Env-Variable: ja/nein; Feature-Status: produktiv/experimental]

## OBS-01 — CentralScheduler Health-Endpoint

### Status
[IMPLEMENTIERT | TEILWEISE | OFFEN]

### Code-Evidenz
Datei: `src/...` (oder: KEIN ENDPOINT GEFUNDEN)
Zeile: X
Commit: [hash] ([datum])
```python
[snippet oder Fehlanzeige]
```
Erklaerung: [1-3 Saetze]

### Aktueller Scheduler-Observability-Stand
[Was ist stattdessen observierbar? Loki-Logs? Prometheus-Metriken? Nichts?]

### Empfehlung
[Falls OFFEN: Empfehlung fuer minimalen Health-Endpoint]

## OBS-02 — audit_logs Luecken
### Sensor-Config CRUD [IMPLEMENTIERT|TEILWEISE|OFFEN]
[Evidenz fuer Create, Update, Delete]
### ESP-Delete [IMPLEMENTIERT|OFFEN]
[Evidenz]
### Zone-Delete [IMPLEMENTIERT|OFFEN]
[Evidenz]

## OBS-03 — Wokwi-Szenario-Zaehler
[Snippet CI_PIPELINE.md + Snippet wokwi-tests.yml; Korrektur falls noetig]

## OBS-04 — AutoOps LLM hartkodiert
[Datei:Zeile, Snippet, Feature-Status, Empfehlung]

## Anhang: Konsultierte Spezialisten-Agenten
- [Agent-Name]: [Teilaufgabe] — [Sub-Befund in 1 Satz]

## Folge-Empfehlungen
[Was muesste als naechstes als Implementierungs-Issue raus?
 Format: "OBS-0X: [Empfehlung] — Prio [HIGH/MEDIUM/LOW] — Schicht [Backend|DevOps|Doku]"]
```

---

## Hinweise fuer den TM

- **Kein Lesen von Life-Repo-Pfaden** — alle Evidenz aus dem Auto-one-Checkout.
- **OBS-03 direkte Korrektur erlaubt:** Falls `CI_PIPELINE.md` noch 173 sagt, darf TM
  die Zahl direkt auf 191 korrigieren — das ist ein reiner Doku-Edit ohne Code-Impact.
  Korrektur trotzdem im Bericht dokumentieren (Datei:Zeile, vor/nach).
- **Klaerungspunkte:** Falls ein Unterpunkt nicht auffindbar ist, explizit als
  "Quelle nicht auffindbar — Konkretisierung durch Robin noetig" markieren.
- **OBS-04 Feature-Status zuerst:** Falls AutoOps kein produktives Feature ist, reicht
  ein kurzer Hinweis — Prio-Absenkung im Bericht vermerken.
- **Git-Befehl:** `git log -1 --pretty="%H %ad" -- <datei>`
