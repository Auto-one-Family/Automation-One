# BERICHT — Phase 0 Domain-Events / Fertigation Inflow–Runoff / Traceability / Frontend-Doppelungen

**Steuerlauf:** `phase0-domain-events-fertigation-trace-2026-04-14`  
**Datum:** 2026-04-14  
**Branch-Politik:** `origin/HEAD` → `master`; Code-Fixes auf `auto-debugger/work`.

---

## 1. Inventar: heiße Mutations- und Persistenzpfade (IST, Evidence)

### 1.1 HTTP — `request_id` / `X-Request-ID`

- **RequestIdMiddleware** setzt ContextVar und hängt `X-Request-ID` an HTTP-Antworten (reiner ASGI-Pfad, kein `BaseHTTPMiddleware`).

```46:74:El Servador/god_kaiser_server/src/middleware/request_id.py
        # Extract X-Request-ID from headers
        request_id = None
        for header_name, header_value in scope.get("headers", []):
            if header_name == b"x-request-id":
                request_id = header_value.decode("latin-1")
                break

        if not request_id:
            request_id = generate_request_id()

        # Set ContextVar BEFORE calling inner app — this is the key fix.
        token = set_request_id(request_id)
        ...
                headers.append((b"x-request-id", request_id.encode("latin-1")))
```

- **FastAPI** exponiert `expose_headers=["X-Request-ID"]` (`main.py`).

### 1.2 Audit / Korrelation

- Audit-API und Schemas führen `correlation_id` und `request_id` (z. B. `El Servador/god_kaiser_server/src/api/v1/audit.py`).
- Kalibrier-Service persistiert/übergibt `correlation_id` in mehreren Pfaden (`calibration_service.py`).

### 1.3 WebSocket — `sensor_data` (Fertigation-relevant)

- Server-Broadcast nach Speichern der Messung: Felder u. a. `esp_id`, `config_id`, **`value`**, `quality`, `timestamp` (roher ESP-Zeitstempel), **kein** `correlation_id` im Broadcast-Payload.

```521:539:El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py
                        await ws_manager.broadcast(
                            "sensor_data",
                            {
                                "esp_id": esp_id_str,
                                "message": message,
                                "severity": "info",
                                "device_id": esp_id_str,
                                "gpio": gpio,
                                "sensor_type": sensor_type,
                                "value": display_value,
                                "unit": unit,
                                "quality": quality,
                                "timestamp": esp32_timestamp_raw,
                                "zone_id": zone_id,
                                "subzone_id": subzone_id,
                                "config_id": str(sensor_config.id) if sensor_config else None,
```

### 1.4 Schema-Version / `measurement_role`

- **Repo-weite Suche (Python):** keine Treffer für `measurement_role`, `fertigation`, `inflow`, `runoff` unter `El Servador/god_kaiser_server/src` (Stand Analyse). Fertigation ist **Konfigurationsebene** (zwei `sensor_config_id`) im Frontend, kein separates Server-Domain-Modell.

---

## 2. Fertigation Inflow / Runoff — End-to-End (UI → API → Server → DB → WS)

| Schicht | IST | Evidence |
|--------|-----|------------|
| **UI** | `FertigationPairWidget.vue` → `useFertigationKPIs` | `El Frontend/src/components/dashboard/widgets/FertigationPairWidget.vue` |
| **API** | `sensorsApi.queryData({ sensor_config_id, limit })` | `El Frontend/src/api/sensors.ts` (`GET /sensors/data`) |
| **Server** | `sensor_handler.py` persistiert über `sensor_repo.save_data`, broadcast `sensor_data` | siehe 1.3 |
| **DB** | Standard-Sensordaten-Tabelle (kein dediziertes Fertigation-Aggregat) | Persistenz über bestehenden Sensor-Pfad |
| **Realtime** | `websocketService.on('sensor_data', …)` im Composable | `El Frontend/src/composables/useFertigationKPIs.ts` |

### 2.1 Lücken / Inkonsistenzen

1. **Doku vs. Code (WebSocket):** `docs/FERTIGATION_WIDGET_INTEGRATION.md` behauptet `msg.payload` und `processed_value` — **IST** ist `WebSocketMessage.data` und Server-Feld **`value`** (`websocket.ts`, `sensor_handler.py`). Im Bericht als P0 dokumentiert; Composable wurde an IST angeglichen (siehe Run `FEHLER-REGISTER.md`).
2. **Dashboard-Registry:** `useDashboardWidgets.ts` listet **keinen** Widget-Typ `fertigation-pair` / ähnliches; `FertigationPairWidget` ist **nirgends** per `CustomDashboardView` / GridStack registriert (nur manuelles Einbinden laut Doku). **P1:** Widget in `widgetComponentMap` + `WIDGET_TYPE_META` + Defaults aufnehmen, falls Dashboard-Builder das Ziel ist.
3. **Zeitstempel:** WS sendet `esp32_timestamp_raw`, DB/API liefern normalisierte Zeiten — Staleness-Berechnung kann zwischen Erst-Load (REST) und Live-Updates (WS) inkonsistent wirken, wenn Roh-TS edge cases hat. **P1:** optional Server-Broadcast auf normalisierte ISO angleichen.

---

## 3. Frontend: Doppelungen und Kanäle (mindestens drei Nachweise)

1. **REST + WebSocket für dieselbe physikalische Größe:** `useFertigationKPIs` lädt initial per `Promise.all` zwei `queryData`-Aufrufe und aktualisiert live per zwei `sensor_data`-Listenern — beabsichtigter Dual-Channel, aber **zwei parallele Schreibpfade** auf dieselben `kpi`-Felder.

```163:183:El Frontend/src/composables/useFertigationKPIs.ts
      const [inflowData, runoffData] = await Promise.all([
        sensorsApi.queryData({
          sensor_config_id: inflowSensorId.value,
          limit: 100,
        }),
        sensorsApi.queryData({
          sensor_config_id: runoffSensorId.value,
          limit: 100,
        }),
      ])
```

2. **Globales Store-Update + Widget-lokaler Listener:** dieselbe WS-Nachricht `sensor_data` wird im **ESP-/Sensor-Store** verarbeitet (`esp.ts` → `sensorStore.handleSensorData`) **und** parallel von `useFertigationKPIs` (zwei zusätzliche `websocketService.on`-Registrierungen). Kein Daten-Leak, aber **doppelte Verarbeitung** desselben Events im Frontend.

3. **`data-testid`-Namensraum:** dynamische IDs `fertigation-inflow-kpi-${sensorType}` vermeiden Kollisionen zwischen EC/pH in einer View; **kein** generischer Listen-Duplikat-Befund innerhalb derselben Komponente — Suchraum: `FertigationPairWidget.vue` + Specs.

**Cleanup:** `onUnmounted` entfernt WS-Listener (Array `wsUnsubscribers`) — Pattern erfüllt.

---

## 4. Empfehlungen (priorisiert)

| Prio | Maßnahme |
|------|----------|
| **P0** | WS-Payload im Fertigation-Composable an Server-Contract (`message.data`, `value`) binden — **umgesetzt** auf `auto-debugger/work` inkl. Unit-Test `tests/unit/composables/useFertigationKPIs.ws.test.ts`. |
| **P1** | `docs/FERTIGATION_WIDGET_INTEGRATION.md` an echten WS-Shape anpassen (optional eigenes Doku-Ticket; Inhalt hier verifiziert). |
| **P1** | Fertigation-Widget in `useDashboardWidgets` integrieren, falls Produktziel „Customizer“ ist. |
| **P2** | Phase 2 laut Konzept: `measurement_role` / Paarung in DB — erst mit Migrations-Gate. |

---

## 5. Verifikation (ehrlich)

- `npx vue-tsc --noEmit` im Ordner `El Frontend`: **Exit 0** (Lauf 2026-04-14 im Agent-Terminal).
- `npx vitest run tests/unit/composables/useFertigationKPIs.ws.test.ts`: **grün**.

---

## 6. Run-Artefakte (auto-debugger)

- `.claude/reports/current/auto-debugger-runs/phase0-domain-events-fertigation-trace-2026-04-14/FEHLER-REGISTER.md`
- `.claude/reports/current/auto-debugger-runs/phase0-domain-events-fertigation-trace-2026-04-14/TASK-PACKAGES.md`
- `.claude/reports/current/auto-debugger-runs/phase0-domain-events-fertigation-trace-2026-04-14/VERIFY-PLAN-REPORT.md`

---

## 7. BLOCKER

- **Keine** für den durchgeführten P0-Fix (WS-Shape). **BLOCKER** für reine „Phase-0-Domain-Events überall“ ohne weiteres Gate: WS `sensor_data` trägt **kein** `correlation_id`; Querschnitt nur über HTTP/Audit/MQTT-andere Kanäle — muss pro Feature spezifiziert werden, nicht pauschal in WS duplizieren.
