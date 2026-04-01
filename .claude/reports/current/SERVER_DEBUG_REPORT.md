# Server Debug Report

**Erstellt:** 2026-03-31
**Modus:** B — Spezifisch: "POST /api/v1/actuators/ESP_EA5484/14 gibt 403 Forbidden"
**Request-ID:** 34fde1f1-12d3-4f82-a90e-c92c4e04454c
**Quellen:**
- Docker-Container-Log: `docker logs automationone-server`
- `El Servador/god_kaiser_server/src/api/v1/actuators.py`
- `El Servador/god_kaiser_server/src/core/exceptions.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- PostgreSQL: `esp_devices`-Tabelle

---

## 1. Zusammenfassung

Das Device `ESP_EA5484` hat in der Datenbank den Status `offline`. Der Device-Status-Guard in `actuators.py` Zeile 450 erlaubt Konfigurationsoperationen ausschliesslich fuer Devices mit Status `approved` oder `online`. Da `offline` nicht in dieser Menge liegt, wird `DeviceNotApprovedError` (HTTP 403, Error-Code 5405) geworfen. Handlungsbedarf besteht: Das Device muss zunaechst online gebracht werden (Heartbeat senden) oder — wenn Offline-Konfiguration gewaenscht ist — der Guard muss bewusst erweitert werden.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `docker logs automationone-server` | OK | Request-ID gefunden, eindeutiger Log-Eintrag |
| `actuators.py` | OK | Device-Status-Guard auf Zeile 450 identifiziert |
| `exceptions.py` | OK | `DeviceNotApprovedError` auf Zeile 586-601 |
| `lwt_handler.py` | OK | Setzt Status auf `offline` via LWT-MQTT-Topic |
| `heartbeat_handler.py` | OK | Setzt Status auf `online` bei eingehendem Heartbeat |
| PostgreSQL `esp_devices` | OK | `ESP_EA5484` existiert, Status: `offline` |

---

## 3. Befunde

### 3.1 Root Cause — Device-Status-Guard blockiert Konfiguration

- **Schwere:** Mittel (kein Bug, korrektes Systemverhalten — aber moegliche UX-Luecke)
- **Detail:** Der POST-Endpoint `/{esp_id}/{gpio}` prueft vor jeder Konfigurationsoperation den Device-Status. Nur `approved` oder `online` werden akzeptiert.
- **Exakte Code-Zeile:**
  ```
  El Servador/god_kaiser_server/src/api/v1/actuators.py, Zeile 450:
  if esp_device.status not in ("approved", "online"):
      raise DeviceNotApprovedError(esp_id, esp_device.status)
  ```
- **Exception-Klasse:** `DeviceNotApprovedError` (definiert in `exceptions.py:586`)
  - HTTP-Status: 403 Forbidden
  - Error-Code: `DEVICE_NOT_APPROVED`
  - Numerischer Code: 5405 (ServiceErrorCode.PERMISSION_DENIED)
  - Message: `Device 'ESP_EA5484' must be approved before configuration (current status: offline)`

### 3.2 Bestaetigung durch Log-Eintrag

- **Schwere:** Information
- **Evidenz (exakt):**
  ```
  2026-03-31 16:01:29 - src.core.exception_handlers - WARNING -
  [34fde1f1-12d3-4f82-a90e-c92c4e04454c] - API error: DEVICE_NOT_APPROVED -
  Device 'ESP_EA5484' must be approved before configuration (current status: offline)
  ```

### 3.3 Device-Zustand in der Datenbank

- **Schwere:** Information
- **Detail:** `ESP_EA5484` ist in `esp_devices` registriert (kein `404 ESPNotFoundError`), aber hat Status `offline`. `last_seen` war `2026-03-31 16:00:49 UTC` — das Device hat zuletzt kurz vor dem fehlgeschlagenen Request gesendet, dann aber den Heartbeat verloren oder eine LWT-Nachricht gesendet.

| device_id | status | last_seen |
|-----------|--------|-----------|
| ESP_EA5484 | offline | 2026-03-31 16:00:49 UTC |

### 3.4 Status-Lifecycle-Analyse

- **Schwere:** Information
- **Detail:** Der Status-Lifecycle des Servers ist:
  - `pending_approval` → (Admin-Aktion) → `approved`
  - `approved` → (erster Heartbeat) → `online` (heartbeat_handler.py:204-206)
  - `online` → (LWT-Nachricht oder Heartbeat-Timeout) → `offline` (lwt_handler.py:111, heartbeat_handler.py:1508)
  - `offline` → (naechster Heartbeat) → `online`

  Das Device `ESP_EA5484` hatte frueheren Status `approved` (oder `online`), wurde aber durch LWT/Timeout auf `offline` gesetzt. Status `offline` war nie vorgesehen fuer Konfigurationsoperationen — das ist designbedingt.

### 3.5 Kein Mock-ESP-Problem

- **Schwere:** Information
- **Detail:** Die Spalte `is_mock` existiert nicht in `esp_devices`. Es gibt keine Mock-Only-Einschraenkung im Guard. Der 403 ist **ausschliesslich** auf den `offline`-Status zurueckzufuehren, nicht auf eine Real-vs-Mock-Differenzierung.

### 3.6 Auth-Pruefung: JWT ist korrekt

- **Schwere:** Information
- **Detail:** Der Endpoint verwendet `OperatorUser` als Dependency (`current_user: OperatorUser`). Ein `role=admin`-Token erfuellt diese Anforderung. Der 403 kommt **nicht** vom JWT-Check, sondern vom Device-Status-Guard danach.

---

## 4. Extended Checks (eigenständig durchgeführt)

| Check | Ergebnis |
|-------|----------|
| `docker logs automationone-server` — Request-ID grep | `DEVICE_NOT_APPROVED` mit Status `offline` bestaetigt |
| PostgreSQL: `SELECT device_id, status, last_seen FROM esp_devices WHERE device_id = 'ESP_EA5484'` | Status: `offline`, last_seen: 2026-03-31 16:00:49 UTC |
| PostgreSQL: `SELECT DISTINCT status FROM esp_devices` | Alle vorhandenen Stati: `approved`, `offline` |
| `actuators.py` Zeile 450 — Guard-Logik | `not in ("approved", "online")` — `offline` wird abgelehnt |
| `exceptions.py` Zeile 586-601 — Exception-Definition | HTTP 403, numeric code 5405 |
| `sensors.py` Zeile 599 — gleicher Guard | Identische Pruefung auch im Sensor-Endpoint |

---

## 5. Bewertung & Empfehlung

- **Root Cause:** `ESP_EA5484` hat Status `offline` in der Datenbank. Der Device-Status-Guard in `actuators.py:450` schliesst `offline`-Devices bewusst aus, da Konfigurationen nur an nachweislich erreichbare (oder frisch genehmigte) Devices gesendet werden sollen.

- **Ist das ein Bug?** Nein. Das ist intentionales Systemverhalten gemaess Safety-Design: Ein offline-Device kann keine Konfiguration empfangen und soll nicht konfiguriert werden. Der Fehler-Name `DEVICE_NOT_APPROVED` ist dabei irrefuehrender als noetig — der eigentliche Grund ist `DEVICE_OFFLINE`.

- **Nächste Schritte (3 Optionen — nach Prioritaet):**

  **Option A (sofort, empfohlen): Device online bringen**
  1. Sicherstellen dass `ESP_EA5484` physisch laeuft und WLAN/MQTT-Verbindung besteht
  2. Das Device sendet automatisch Heartbeats → Server setzt Status auf `online`
  3. Danach POST-Request wiederholen — wird dann durchgehen

  **Option B (Guard erweitern fuer offline konfigurierbare Devices):**
  Wenn Offline-Konfiguration beabsichtigt ist (Config wird bei naechstem Reconnect gepusht), muss der Guard angepasst werden:
  ```python
  # Zeile 450 in actuators.py — aktuell:
  if esp_device.status not in ("approved", "online"):
      raise DeviceNotApprovedError(esp_id, esp_device.status)

  # Erweiterung um "offline" erlauben:
  if esp_device.status not in ("approved", "online", "offline"):
      raise DeviceNotApprovedError(esp_id, esp_device.status)
  ```
  Achtung: Dann muss die Config-Delivery-Logik sicherstellen, dass die Config beim naechsten Reconnect gepusht wird (Config-Push bei `approved`-Heartbeat existiert bereits im heartbeat_handler).

  **Option C (Error-Message verbessern — kein Code-Pfad-Change):**
  Die Fehlermeldung `DEVICE_NOT_APPROVED` ist missverstaendlich wenn das Device zwar approved war, aber gerade offline ist. Ein dedizierter `DeviceOfflineError` (der bereits in `actuators.py:39` importiert ist) waere praziser.

- **Empfehlung fuer diesen Fall:** Option A — Device starten/reconnecten. Das Systemverhalten ist korrekt.

---

## 6. Betroffene Dateien

| Datei | Zeile | Rolle |
|-------|-------|-------|
| `El Servador/god_kaiser_server/src/api/v1/actuators.py` | 450-451 | Device-Status-Guard (403-Ausloeser) |
| `El Servador/god_kaiser_server/src/core/exceptions.py` | 586-601 | `DeviceNotApprovedError`-Definition |
| `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py` | 111 | Setzt Status auf `offline` via LWT |
| `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` | 204-236 | Setzt Status auf `online` bei Heartbeat |
| `El Servador/god_kaiser_server/src/api/v1/sensors.py` | 599 | Identischer Guard (Referenz) |
