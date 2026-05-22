# INCIDENT-LAGEBILD — Docker-Log-Triage vs. Observability-Rauschen

**Incident-ID:** `INC-2026-04-09-dockerlog-obs-triage`  
**Bezug Auswertung:** 2026-04-09 (Monitoring-Profil `monitoring`, Loki/Alloy/Grafana/cAdvisor; Abgleich mit Codepfaden im Repo).  
**Git:** Branch **`auto-debugger/work`** (Soll-Branch; beim Orchestrator-Lauf verifiziert).  
**Verwandt:** [`INC-2026-04-09-docker-ist`](../INC-2026-04-09-docker-ist/INCIDENT-LAGEBILD.md) — Stichprobe „Kern-Stack grün“, keine strengen ERROR-Treffer in Server/Frontend/Postgres-Tails.

## 0. Symptom / Ausgangslage

- **Auslöser:** Auswertung von Docker-/Collector-Logs sollte **nicht** in einer flachen „ERROR“-Liste enden, sondern **drei Klassen** trennen (Gerät/MQTT vs. Observability-Stack vs. Schein-Treffer).
- **Kern-Stack (Baseline):** Parallelauftrag `docker-ist` — in der Stichprobe **keine** strengen ERROR/FATAL-Tails für zentrale App-Container (Server/Frontend/Postgres), dennoch relevante **Klasse-B/C**-Meldungen im Monitoring-Stack möglich.
- **Zeitfenster:** Auswertung und Dokumentation **2026-04-09** (UTC/lokal je nach Host; für Korrelation immer Container-Zeit und Log-Zeitstempel verwenden).

---

## 1. Kurzfassung

Aus einer **breiten** Docker-/Loki-Auswertung können drei **nicht vermischbare** Befundklassen entstehen: **(A)** echte Geräte-/MQTT-Produktspur inkl. Firmware-Fehlercode und `system/error` / `intent_outcome`, **(B)** Betriebs-/Collector-Lärm des Observability-Stacks, **(C)** Such-Artefakte (Substring `error`, Log-Labels, SQL-Text). Nur **(A)** rechtfertigt Firmware- oder MQTT-Vertrags-Arbeit; **(B/C)** brauchen Deploy-/Query-Disziplin.

**Hinweis Zahlencode:** In der Steuerdatei war „6016“ genannt — im Repo ist der passende Firmware-/Kommunikationscode **`ERROR_MQTT_PAYLOAD_INVALID` = 3016** (`El Trabajante/src/models/error_codes.h`). „6016“ ist hier als **Schreibvariante / Verwechslung** zu behandeln, bis eine andere Quelle denselben Vorfall eindeutig benennt.

---

## 2. Befundklassen (A / B / C) — Beispiellogik (paraphrasiert)

### (A) Produkt — MQTT-Gerät / Server-Pfad

- **Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/error` — Handler: `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py` (Registrierung `main.py`); WS-Broadcast `error_event` ohne NotificationRouter-Inbox (siehe IST-Observability-Dokument).
- **Broadcast Emergency / Parse:** Firmware: `El Trabajante/src/main.cpp` — bei JSON-Parse-Fehler auf Broadcast-Emergency-Topic: `publishIntentOutcome(..., "EMERGENCY_PARSE_ERROR", ...)`, `errorTracker.logCommunicationError(ERROR_MQTT_PAYLOAD_INVALID, ...)` (**3016**).
- **Korrelation:** `esp_id` + Zeitfenster + numerischer `error_code` / Topic-Suffix; **nicht** mit Alloy-Container-ID oder Grafana-Provisioning vermischen.

### (B) Operational — Observability-Stack

- **Grafana:** Image mountet `./docker/grafana/provisioning` → `/etc/grafana/provisioning` (`docker-compose.yml`). Unter `docker/grafana/provisioning/` existieren u. a. `alerting/`, `dashboards/`, `datasources/` — kein Unterordner `plugins/`. Typische Grafana-Startup-Meldungen zu fehlenden optionalen Provisioning-Pfaden sind **Betriebslärm**, solange Dashboards/Alerts laden.
- **Alloy:** Liest Docker-Socket (`docker-compose.yml`), tailt Container-Logs. Nach `docker compose up --force-recreate` oder entfernten Containern können **„No such container“** / Tailer-Fehler auf **alte Container-IDs** entstehen — **Deploy-Lifecycle**, kein ESP-Fehler.
- **cAdvisor (Windows):** Bekannte Hinweise zu DMI/machine-id — im Compose ist `/etc/machine-id` gemountet zur Reduktion von Warnungen; verbleibende Meldungen oft **erwartbar** auf Desktop-Hosts.

### (C) Schein-Fehler — Suche / Darstellung

- **Loki:** Query `|= "error"` trifft auf **beliebige** Zeichenketten (Feldnamen, JSON, Meldungstext).
- **Postgres-Logs:** `INSERT`/`UPDATE` mit Spalteninhalten oder Alert-Texten können das Wort „error“ enthalten — **kein** automatischer Anwendungsfehler.

---

## 3. Betroffene Container / Topics (Rahmen)

| Ebene | Beispiel / Ort |
|-------|------------------|
| Produkt-Server | `automationone-server` (Profil default) |
| MQTT | `automationone-mqtt` |
| Monitoring-Profil | `automationone-loki`, `automationone-alloy`, `automationone-grafana`, `automationone-cadvisor`, … (`profiles: ["monitoring"]`) |

---

## 4. Pattern-Scan (Pflicht, repo-verifiziert)

1. **Backend:** `error_handler.py` — nächster Analogfall für Gerätefehler: gleicher Handler-Pfad wie in `main.py` registriert; kritische Topics in `subscriber.py` (`_is_critical_topic` umfasst u. a. `system/error`).
2. **Firmware:** Emergency-Parse-Pfad und **3016** nur in `main.cpp` / `error_codes.h` nachvollziehbar — keine zweite parallele Error-Welt ohne neuen Topic-Namen.
3. **Schnittstellen:** Keine stillen REST/MQTT/WS-Schema-Änderungen aus diesem Lauf; nur Doku + Incident-Artefakte.
4. **Konsolidierung:** Ein Lauf — IST-Dokument als SSoT; optionale Compose-Anpassung nur als **Vorschlag** in TASK-PACKAGES / IST (nicht umgesetzt).

---

## 5. Risiko / Annahmen

- Roh-Logzeilen der ursprünglichen manuellen Stichprobe liegen **nicht** vollständig im Repo; Klassen A/B/C folgen **Scope der Steuerdatei** und Code-Referenzen.
- **3016 vs. 6016:** Bis zur Klärung alle Suchen nach **numerischem Code** mit Quelle (Firmware vs. Server-Mapping) abgleichen.

---

## 6. Eingebrachte Erkenntnisse

| Timestamp (UTC) | Inhalt |
|-----------------|--------|
| 2026-04-09 | Orchestrator-Lauf `auftrag_docker.md`: Incident-Ordner angelegt, IST-Dokument erstellt, Querverweis in `IST-observability-correlation-contracts-2026-04-09.md`; Branch `auto-debugger/work`. |
| 2026-04-10 | REF-02 (`STEUER-INC-dockerlog-triage-REF-02-observability-stack-ops-2026-04-10.md`): `DOCKER_REFERENCE.md` §5.6 (Klasse B vs. A, Runbook); optionales PKG `provisioning/plugins/.gitkeep` **nicht** umgesetzt — Doku-only bis wiederkehrende Grafana-Evidenz; Run `dockerlog-triage-ref02-ops-2026-04-10`. |
| 2026-04-10 | REF-03 (`STEUER-INC-dockerlog-triage-REF-03-produktpfad-tests-2026-04-10.md`): pytest-Subset zu `system/error` / kritischem Topic / `ErrorEventHandler` — **89 Tests, Exit 0** (`test_topic_validation.py`, `test_mqtt_subscriber.py`, `test_contract_ingress_matrix_t1_t6.py`); venv `.\.venv\Scripts\python.exe -m pytest` (Poetry nicht im PATH). Pfad im Repo verifiziert; keine Produktänderung. Run: `.claude/reports/current/auto-debugger-runs/dockerlog-triage-ref03-tests-2026-04-10/README.md`. |
