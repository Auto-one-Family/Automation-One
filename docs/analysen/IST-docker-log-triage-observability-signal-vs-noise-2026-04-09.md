# IST: Docker-Log-Triage — Observability-Signal vs. Rauschen

**Datum:** 2026-04-09  
**Repo:** AutomationOne (`Auto-one`)  
**Incident:** `.claude/reports/current/incidents/INC-2026-04-09-dockerlog-obs-triage/`  
**Baseline Kern-Stack:** `.claude/reports/current/incidents/INC-2026-04-09-docker-ist/` (Stichprobe ohne ERROR/FATAL in ausgewählten Tails)

**Single Source of Truth:** Diese Datei ist die kanonische IST-Auswertung zur Docker-/Loki-Triage (Stand 2026-04-09). Inhaltlich konsistent mit **STEUER-01** — Klassen **A/B/C** werden nicht vermischt (siehe Incident-`README.md` und `INCIDENT-LAGEBILD.md`).

### Evidenz im Incident-Ordner (keine Rohlog-Dumps)

| Artefakt | Nutzen für diese Auswertung |
|----------|------------------------------|
| `README.md` | Index, Kurzdefinition A/B/C, Verweis auf dieses IST-Dokument |
| `INCIDENT-LAGEBILD.md` | Symptomkontext, Pattern-Scan, Pfade `error_handler` / Firmware **3016** |
| `CORRELATION-MAP.md` | Trennung Kette (A) Gerät/MQTT vs. (B) Observability vs. (C) Query-Artefakte |

---

## 1. Zweck

Aus Docker-, Loki- und Container-Logs eine **belastbare Trennung** dreier Klassen ableiten, damit Incident-Analysen nicht durch Breitensuche oder Observability-Nebenlärm verzerrt werden:

| Klasse | Kurzname | Bedeutung |
|--------|----------|-----------|
| **A** | Produkt / Gerät | Echte MQTT-/Firmware-/Server-Signale (z. B. `…/system/error`, numerische Codes, `intent_outcome`) |
| **B** | Operational | Grafana-, Alloy-, cAdvisor-bezogene Meldungen (Provisioning, toter Container-Tailer, Host-DMI) |
| **C** | Schein-Fehler | Treffer durch Substring „error“, JSON-Labels, SQL-Text — ohne Anwendungsfehler |

---

## 2. Methodik

### 2.0 Kurzmethodik (messbar)

1. **Zuerst strenge Muster (A):** voller Topic-Pfad `…/system/error` oder nachweisbarer Firmware-Pfad mit numerischem Kommunikationscode **3016** und Kontext `EMERGENCY_PARSE_ERROR` / ArduinoJson-Fehlertext (z. B. leerer Payload → Meldung enthält oft den Json-Fehler-String).
2. **Dann Kontext (B):** gleiche Zeitscheibe prüfen — passt die Zeile zu **Grafana-Provisioning**, **Alloy-Docker-Tailer** oder **cAdvisor-Host**? Wenn ja, nicht als ESP-Root-Cause werten.
3. **Breitensuche nur als Sieb:** `|=` / Volltext `error` über alle Container — Treffer **pro Zeile** in A/B/C einteilen; keine flache „ERROR“-Liste als Incident-Beweis.
4. **Correlation:** `esp_id` + Zeitfenster; HTTP-`request_id` und MQTT-synthetische CID **nicht** blind mischen (`IST-observability-correlation-contracts-2026-04-09.md`).

### 2.1 Strenge Muster (Signal)

- **Topic-basiert:** Vollständiger MQTT-Pfad, z. B. `kaiser/{kaiser_id}/esp/{esp_id}/system/error` — Handler `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py`.
- **IDs:** `esp_id` + Zeitfenster; bei Server-Logs zusätzlich HTTP-`X-Request-ID` nur im HTTP-Kontext (nicht mit MQTT-CID vermischen — siehe `IST-observability-correlation-contracts-2026-04-09.md`).
- **Numerische Codes:** Firmware-Kommunikation: `ERROR_MQTT_PAYLOAD_INVALID` = **3016** (`El Trabajante/src/models/error_codes.h`); Server-Mapping z. B. `CommunicationErrorCode.MQTT_PAYLOAD_INVALID = 3016` (`El Servador/god_kaiser_server/src/core/error_codes.py`).
- **Broadcast-Emergency:** Parse-Fehler → `publishIntentOutcome(..., "failed", "EMERGENCY_PARSE_ERROR", …)` und `errorTracker.logCommunicationError(ERROR_MQTT_PAYLOAD_INVALID, …)` in `El Trabajante/src/main.cpp` (Broadcast-Zweig).

**Repo-Strenge Muster (Verdrahtung, nach Code-Stand):**

- **Topic → Handler:** `kaiser/+/esp/+/system/error` — in `El Servador/god_kaiser_server/src/main.py` Registrierung von `error_handler.handle_error_event` für genau dieses Wildcard-Topic (Kommentar/Log: „Error handler registered: kaiser/+/esp/+/system/error“).
- **Kritische Topics:** `El Servador/god_kaiser_server/src/mqtt/subscriber.py` — `_is_critical_topic` schließt u. a. Topics mit Suffix `/system/error` ein (u. a. relevant bei Drops vor Handler-Lauf).
- **Broadcast-Emergency auf dem Bus:** `El Trabajante/src/main.cpp` — Zweig `topic == broadcast_emergency_topic` (aus `TopicBuilder::buildBroadcastEmergencyTopic()`); bei Parse-/Contract-Fehlern `errorTracker.logCommunicationError(ERROR_MQTT_PAYLOAD_INVALID, …)`.
- **Dashboard-Mapping (Server):** numerischer Gerätecode **3016** für Anzeige/Erklärungstexte u. a. in `El Servador/god_kaiser_server/src/core/esp32_error_mapping.py` (konsistent mit `ERROR_MQTT_PAYLOAD_INVALID`).

**Hinweis „6016“ vs. 3016:** In Steuer-/Incident-Texten taucht gelegentlich **„6016“** neben EMERGENCY_PARSE_ERROR auf — im Repo ist der zugehörige Kommunikationscode **`ERROR_MQTT_PAYLOAD_INVALID` = 3016**. **6016** hier als **Schreib- oder Suchfehler** behandeln, bis eine Logzeile mit exakt dieser Zahl und eindeutiger Quelle existiert.

### 2.2 Breitensuche (Screening, kein RCA)

- Volltext `ERROR` über alle Services — nur zum **Filtern**; jede Zeile **klassieren** (A/B/C), bevor sie als Root Cause zählt.

---

## 3. Signal vs. Nicht-Signal (Tabelle)

| Quelle | Beispiel / Muster | Klasse | Signal? |
|--------|-------------------|--------|---------|
| Server | `error_handler` verarbeitet `system/error`, Audit + WS `error_event` | A | Ja (wenn Payload gültig) |
| Firmware | Broadcast-Emergency JSON parse fail → `EMERGENCY_PARSE_ERROR`, Log mit `ERROR_MQTT_PAYLOAD_INVALID` (**3016**); Grundtext kann ArduinoJson-Status enthalten | A | Ja |
| Server | `intent_outcome` ungültig / Lifecycle-Payload — ERROR im `subscriber` / Handler, ggf. **`[-]`** ohne MQTT-CID vor Handler (kritisches „Drop“ der Korrelation) | A | Ja (Contract/Qualität; RCA separat) |
| Grafana | Hinweis fehlendes/unerwartetes Provisioning (z. B. Plugins-Pfad unter `/etc/grafana/provisioning/`) | B | Nur Ops; kein ESP-RCA |
| Alloy | „No such container“ / Tailer auf alter Container-ID | B | Deploy-Lifecycle; Alloy ggf. neu starten nach Recreate |
| cAdvisor | DMI/machine-id-Hinweise (Windows-Host) | B | Oft erwartbar; Compose mountet `machine-id` wo möglich |
| Loki | Query `|= "error"` trifft Feldnamen / JSON | C | Nein (bis kontextualisiert) |
| Postgres | `LOG: execute` mit Wort „error“ in Daten | C | Nein |

---

## 4. Prioritäten

| P | Thema | Empfehlung |
|---|--------|------------|
| **P0** | **3016 / EMERGENCY_PARSE_ERROR** auf `…/system/error` klären (in Steuer-/Suchtexten irrtümlich „**6016**“ — siehe §2.1): leerer/malformed Broadcast-Payload, `intent_outcome` **failed**, ggf. kritische Drops ohne MQTT-CID | Firmware- und Server-Payload prüfen; Topic `buildBroadcastEmergencyTopic()` / Safety-Publisher; **nicht** mit Alloy-/Grafana-Lärm vermischen |
| **P1** | **Alloy / Grafana** — wiederholte Fehler nach Deploy | Runbook: saubere Container-Reihenfolge, Alloy-Neustart; Grafana-Provisioning mit Checkout abgleichen (`docker/grafana/provisioning/`); siehe §4.1 |
| **P2** | **cAdvisor auf Windows** | Als bekannte Host-Einschränkung dokumentieren; keine Priorität über P0-Produktpfad |

### 4.1 Grafana „Plugins“-Provisioning: Doku-first vs. Compose-Follow-up

**IST im Checkout:** `docker-compose.yml` mountet `./docker/grafana/provisioning` → `/etc/grafana/provisioning:ro`. Vorhanden sind u. a. `alerting/`, `dashboards/`, `datasources/` — **kein** Unterordner `plugins/`.

| Option | Wann | Begründung |
|--------|------|------------|
| **Nur Doku / Akzeptanz** | Dashboards und Datenquellen laden; Grafana loggt höchstens **Warnungen** zu optionalen Pfaden | Kein funktionaler Produktdefekt; keine Compose-Änderung nötig |
| **Kleine Compose-/Repo-Anpassung** | Gleiche **ERROR**-Zeile im Grafana-Container-Log wiederholt und stört Ops/On-Call | Optional leeren Ordner `docker/grafana/provisioning/plugins/` (z. B. mit `.gitkeep`) — **nur** nach Skill **`verify-plan`**, Branch `auto-debugger/work`, Paket `TASK-PACKAGES.md` PKG-01 im Incident-Ordner |

**Klare Aussage:** In diesem Lauf ist **keine** Compose-Änderung vorgenommen worden — **Default-Empfehlung bleibt Doku-first**; ein Mount-Fix ist **optional** und evidenzbasiert.

---

## 5. Nächste Schritte (parallel, ohne Produkt-Code in STEUER-02)

Die drei Stränge **dürfen** nicht zu einer flachen „ERROR“-Liste verschmolzen werden:

1. **Produkt / Firmware — Broadcast-Emergency (P0):** Bei erneutem **3016** / `EMERGENCY_PARSE_ERROR` — MQTT-Payload, Uhrzeit, `esp_id` festhalten; Server-Log `error_handler` und WS `error_event` nur nach echtem `…/system/error`-Eingang auswerten; `intent_outcome`- und CID-Themen gemäß `IST-observability-correlation-contracts-2026-04-09.md` separat betrachten.
2. **Operational — Alloy / Grafana (P1):** Nach Deploy oder Stack-Recreate: Alloy-Logs auf „No such container“ / tote Container-IDs — ggf. **Alloy- oder Grafana-Neustart** bzw. saubere Container-Reihenfolge (Deploy-Lifecycle, keine Firmware-RCA). Details §4.1.
3. **Grafana-Plugin-Provisioning (P1 Folge):** Fehlender optionaler Pfad unter `/etc/grafana/provisioning/plugins/` — **Doku-first** (§4.1); optionaler leerer Ordner im Repo **nur** nach evidenzbasierter Ops-Entscheidung und Gate (`verify-plan`, Branch `auto-debugger/work`), nicht spekulativ.

**Screening (C):** Loki-Queries auf Felder und `compose_service` einschränken (`docs/debugging/logql-queries.md`) — keine reine Volltextsuche über alle Container als RCA-Beweis.

---

## 6. Repo-Verweise (ohne Secrets)

| Thema | Pfad |
|-------|------|
| MQTT `system/error` Handler | `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py` |
| Registrierung Handler | `El Servador/god_kaiser_server/src/main.py` |
| Kritische Topics | `El Servador/god_kaiser_server/src/mqtt/subscriber.py` |
| Intent-Outcome | `El Servador/god_kaiser_server/src/mqtt/handlers/intent_outcome_handler.py` |
| Intent-Outcome Lifecycle | `El Servador/god_kaiser_server/src/mqtt/handlers/intent_outcome_lifecycle_handler.py` |
| Emergency parse / 3016 | `El Trabajante/src/main.cpp` (Broadcast-Emergency-Zweig) |
| Fehlercode 3016 Definition | `El Trabajante/src/models/error_codes.h`, `El Servador/god_kaiser_server/src/core/error_codes.py` |
| UI-Mapping 3016 (Operator-Text) | `El Servador/god_kaiser_server/src/core/esp32_error_mapping.py` |
| Korrelation, IDs, zwei Benachrichtigungsketten (IST) | `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md` |
| Alert-Center / Frontend-Flow (Konzept) | `docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md` |
| Grafana provisioning mount | `docker-compose.yml` (Service `grafana`) |
| Alloy Docker logs | `docker-compose.yml` (Service `alloy`), `docker/alloy/config.alloy` |

---

## 7. Playwright / vue-tsc

Keine Behauptung grüner Frontend-Tests aus diesem Lauf — bei Bedarf lokal mit vollem Stack und den Befehlen aus `AGENTS.md` verifizieren.
