# DB Inspector Report

**Erstellt:** 2026-03-04
**Modus:** A (Allgemeine Analyse) + Not-Aus-Persistenz-Fix
**Quellen:** automationone-postgres, pg_isready, alembic_version, esp_devices, sensor_data, sensor_configs, actuator_states, esp_heartbeat_logs

---

## 1. Zusammenfassung

Datenbank ist gesund. Schema aktuell (Migration `add_subzone_custom_data`), keine Orphaned Records. **Not-Aus-Fix:** Ursache für „nach Docker-Neustart wieder alle im Not-Aus“ war persistierter Zustand in `actuator_states.state = 'emergency_stop'`. Der Monitor/das Dashboard liest `emergency_stopped` aus dieser Tabelle; SafetyService ist nur im RAM. Fix: Beim Aufheben (clear_emergency) werden betroffene `actuator_states` auf `idle` gesetzt; beim Server-Start werden alle `emergency_stop`-Einträge auf `idle` zurückgesetzt.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | Container Up 8h, healthy |
| pg_isready | OK | accepting connections |
| alembic current | OK | add_subzone_custom_data (head) |
| esp_devices | OK | 4 online |
| sensor_data | OK | 56 Einträge letzte Stunde |
| sensor_configs | OK | Keine Orphaned Records |
| alert_config (esp_devices) | OK | Spalte vorhanden |

---

## 3. Befunde

### 3.1 Schema & Migration
- **Schwere:** Keine
- **Detail:** Migration `add_subzone_custom_data` ist HEAD. Spalte `alert_config` in `esp_devices` existiert (historischer BUG-002 behoben).

### 3.2 Orphaned Records
- **Schwere:** Keine
- **Detail:** Keine orphaned sensor_configs (LEFT JOIN esp_devices → 0 Zeilen).

### 3.3 Datenvolumen
- **sensor_data:** 6032 kB, 56 Einträge letzte Stunde
- **esp_heartbeat_logs:** 2712 kB
- **audit_logs:** 344 kB

---

## 4. Extended Checks

| Check | Ergebnis |
|-------|----------|
| pg_isready | OK |
| docker compose ps | automationone-postgres Up 8h |
| alembic current | add_subzone_custom_data (head) |
| SELECT alert_config | Spalte vorhanden |

---

## 5. Not-Aus-Persistenz (Behoben)

- **Ursache:** `actuator_states.state = 'emergency_stop'` bleibt in der DB erhalten. SafetyService (Not-Aus-Flag) ist nur im RAM und geht bei Neustart verloren. Die Monitor-API (`get_zone_monitor_data`) liest `emergency_stopped = (state.state == "emergency_stop")` aus `actuator_states` → Dashboard zeigt nach Neustart weiterhin Not-Aus.
- **Fix (implementiert):**
  1. **Clear-API:** `POST /api/v1/actuators/clear_emergency` setzt für alle betroffenen ESPs in `actuator_states` alle Zeilen mit `state='emergency_stop'` auf `state='idle'`, `current_value=0`.
  2. **Startup:** Beim Server-Start wird einmalig jede Zeile in `actuator_states` mit `state='emergency_stop'` auf `idle` gesetzt, damit nach Docker-Neustart kein veralteter Not-Aus angezeigt wird.
- **Prüfung in DB:** `SELECT esp_id, gpio, state FROM actuator_states WHERE state = 'emergency_stop';` sollte nach Clear bzw. nach Neustart 0 Zeilen liefern.

---

## 6. Bewertung & Empfehlung

- **Root Cause:** Not-Aus-Zustand wurde nur im SafetyService (RAM) und per MQTT an ESPs geleert, nicht in `actuator_states` → Stale State nach Neustart.
- **Nächste Schritte:** Server neu starten und prüfen, dass der grüne Button „Aufheben“ weiterhin funktioniert und nach einem erneuten Docker-Neustart keine Geräte mehr im Not-Aus angezeigt werden.
