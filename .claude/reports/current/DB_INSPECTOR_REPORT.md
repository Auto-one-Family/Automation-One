# DB Inspector Report

**Erstellt:** 2026-03-08 ~12:50 UTC
**Modus:** B (Spezifisch: "T10-R2 Alert-System-Audit — Notification-Lifecycle & Cross-View-Matrix")
**Quellen:** notifications, esp_devices, sensor_configs, actuator_configs, zones, subzone_configs

---

## 1. Zusammenfassung

Die Datenbank ist healthy. Das Notification-System zeigt einen klaren Alert-Storm: 62 Notifications in 24h, 14 davon allein in der letzten Stunde. 16 aktive Alerts existieren — KEIN Status-/resolved_at-Inkonsistenz-Problem (Query 3, 4, 5 alle 0 Rows). Die Storm-Muster betreffen "Sensordaten veraltet" (6x aktiv) und "ESP32 Heartbeat-Luecke" (6x aktiv) — beide ohne Deduplication/Cooldown. Die Cross-View-Matrix zeigt 3 aktive Devices, 6 Sensor-Configs, 1 Actuator-Config, 4 Zonen und 7 Subzone-Configs.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | Erreichbar, alle Queries erfolgreich |
| notifications | AUFFAELLIG | 62 in 24h, 14 in letzter Stunde — Alert-Storm |
| esp_devices | OK | 3 aktive (2 online, 1 offline), 4 deleted |
| sensor_configs | OK | 6 aktive Configs (zu aktiven Devices) |
| actuator_configs | OK | 1 Config total |
| zones | OK | 4 Zonen |
| subzone_configs | OK | 7 Subzone-Configs |

**Schema-Abweichungen von Query-Vorgabe (dokumentiert):**
- `esp_devices.esp_id` existiert nicht — korrekte Spalte: `device_id`
- `sensor_configs.name` existiert nicht — korrekte Spalte: `sensor_name`
- `actuator_configs.name` existiert nicht — korrekte Spalte: `actuator_name`
- `zones.slug` existiert nicht — korrekte Spalten: `zone_id`, `name`, `description`
- `subzones` Tabelle existiert nicht — aequivalente Tabelle: `subzone_configs`

---

## 3. Query-Ergebnisse (alle 13)

### Query 1 — Notification Status-Verteilung

```sql
SELECT status, COUNT(*) FROM notifications GROUP BY status;
```

| status   | count |
|----------|-------|
| resolved |    46 |
| active   |    16 |

Gesamt: 62 Notifications. Kein "acknowledged"-Status vorhanden — entweder nicht implementiert oder noch nicht genutzt.

---

### Query 2 — Aktive Alerts (neueste 15)

```sql
SELECT id, title, severity, status, resolved_at, created_at
FROM notifications WHERE status = 'active' ORDER BY created_at DESC LIMIT 15;
```

| id (kurz) | title | severity | status | resolved_at | created_at |
|-----------|-------|----------|--------|-------------|------------|
| 329cb9a2 | ESP32 Heartbeat-Luecke | warning | active | NULL | 2026-03-08 12:35:33 UTC |
| 626b3a32 | ESP32 Heartbeat-Luecke | info | active | NULL | 2026-03-08 12:30:33 UTC |
| 23f3225b | Sensordaten veraltet | warning | active | NULL | 2026-03-08 12:09:58 UTC |
| 2afe9636 | Sensordaten veraltet | info | active | NULL | 2026-03-08 12:08:50 UTC |
| 0a7e56f2 | Frontend-Container nicht erreichbar — keine Logs seit 5 Minuten | warning | active | NULL | 2026-03-08 11:25:34 UTC |
| ae9944fb | ESP32 Heartbeat-Luecke | warning | active | NULL | 2026-03-08 10:38:11 UTC |
| c8341f46 | ESP32 Heartbeat-Luecke | info | active | NULL | 2026-03-08 10:17:07 UTC |
| 4f88965c | Sensordaten veraltet | warning | active | NULL | 2026-03-08 09:33:27 UTC |
| 4fc5970b | Sensordaten veraltet | warning | active | NULL | 2026-03-08 09:18:28 UTC |
| d5897d4a | Sensordaten veraltet | info | active | NULL | 2026-03-08 09:04:34 UTC |
| c6a7f311 | ESP32 Heartbeat-Luecke | info | active | NULL | 2026-03-08 09:02:39 UTC |
| c2d436b6 | No Grafana webhooks received for >1 hour | info | active | NULL | 2026-03-08 07:46:35 UTC |
| e691c479 | No Grafana webhooks received for >1 hour | info | active | NULL | 2026-03-08 07:41:35 UTC |
| abb0f548 | No digest emails processed for >2 hours | info | active | NULL | 2026-03-08 07:41:27 UTC |
| 8c55686c | Sensordaten veraltet | info | active | NULL | 2026-03-08 00:18:43 UTC |

**Beobachtung:** Kein Alert-Titel enthaelt "aufgelöst" im Text. Alle 15 aktiven Alerts haben resolved_at = NULL (korrekt fuer Status "active").

---

### Query 3 — Inkonsistenz: Status active + resolved_at gesetzt

```sql
SELECT id, title, status, resolved_at FROM notifications
WHERE status = 'active' AND resolved_at IS NOT NULL LIMIT 10;
```

| id | title | status | resolved_at |
|----|-------|--------|-------------|
| (0 rows) | | | |

**Befund: SAUBER.** Keine Inkonsistenz. Kein einziger aktiver Alert hat resolved_at gesetzt.

---

### Query 4 — Alerts mit "resolved/aufgelost" im Titel

```sql
SELECT id, title, status FROM notifications
WHERE title LIKE '%aufgelöst%' OR title LIKE '%aufgeloest%' OR title LIKE '%resolved%' LIMIT 10;
```

| id | title | status |
|----|-------|--------|
| (0 rows) | | |

**Befund:** Keine Alerts mit "resolved"-Text im Titel. Titel-Texte sind konsistent (kein frei-formulierter "aufgelöst"-Text in Titeln).

---

### Query 5 — Inkonsistente Alerts: Text "aufgeloest" + Status active

```sql
SELECT id, title, status FROM notifications
WHERE title LIKE '%aufgelöst%' AND status = 'active' LIMIT 10;
```

| id | title | status |
|----|-------|--------|
| (0 rows) | | |

**Befund: SAUBER.** Keine Inkonsistenz dieser Art vorhanden.

---

### Query 6 — Alert-Storm-Rate: Neue Alerts letzte Stunde

```sql
SELECT COUNT(*) FROM notifications WHERE created_at > NOW() - INTERVAL '1 hour';
```

| count |
|-------|
|    14 |

**Befund: KRITISCH.** 14 neue Alerts in der letzten Stunde. Das entspricht einem Alert alle ~4 Minuten.

---

### Query 7 — Alerts letzte 24 Stunden

```sql
SELECT COUNT(*) FROM notifications WHERE created_at > NOW() - INTERVAL '24 hours';
```

| count |
|-------|
|    62 |

**Befund: HOCH.** 62 Notifications in 24 Stunden. Durchschnitt: ~2,6 Alerts/Stunde — aber die letzte Stunde zeigt 14 (5x ueber Durchschnitt), was auf einen eskalierenden Storm hindeutet.

---

### Query 8 — Haeufigste aktive Alert-Titel (Storm-Muster)

```sql
SELECT title, COUNT(*) as cnt FROM notifications WHERE status = 'active'
GROUP BY title ORDER BY cnt DESC LIMIT 10;
```

| title | cnt |
|-------|-----|
| Sensordaten veraltet | 6 |
| ESP32 Heartbeat-Luecke | 6 |
| No Grafana webhooks received for >1 hour | 2 |
| No digest emails processed for >2 hours | 1 |
| Frontend-Container nicht erreichbar — keine Logs seit 5 Minuten | 1 |

**Befund: Alert-Storm-Muster klar sichtbar.**
- "Sensordaten veraltet" und "ESP32 Heartbeat-Luecke" treten jeweils 6x auf — kein Deduplication/Cooldown-Mechanismus aktiv.
- Beide Alerts werden bei jedem Check-Intervall neu erstellt, ohne den bestehenden aktiven Alert zu updaten oder zu deduplizieren.
- "No Grafana webhooks" 2x — gleiches Muster.

---

### Query 9 — Device-Status (BUG-06 Cross-View-Verifikation)

```sql
SELECT device_id, status, last_seen, approved_at FROM esp_devices ORDER BY last_seen DESC;
```

| device_id | status | last_seen | approved_at |
|-----------|--------|-----------|-------------|
| MOCK_A3592B7E | online | 2026-03-08 12:46:21 UTC | NULL |
| ESP_472204 | online | 2026-03-08 12:46:07 UTC | 2026-03-08 09:18:30 UTC |
| ESP_00000001 | offline | 2026-03-08 12:30:06 UTC | 2026-03-08 09:24:30 UTC |
| MOCK_5FC52D0B | deleted | 2026-03-08 09:26:25 UTC | NULL |
| MOCK_D75008E2 | deleted | 2026-03-08 09:21:36 UTC | NULL |
| MOCK_4B2668C2 | deleted | 2026-03-08 00:31:39 UTC | NULL |
| MOCK_3917D1BC | deleted | 2026-03-08 00:27:23 UTC | NULL |

**Beobachtungen:**
- MOCK_A3592B7E: online, aber `approved_at = NULL` — Mock-Device, kein Approval-Flow.
- ESP_472204: online, approved. Echter ESP, zuletzt gesehen 12:46 UTC.
- ESP_00000001: offline, approved. Letzter Heartbeat 12:30 UTC — koennte Wokwi-Simulation sein.
- 4 Devices: status = "deleted" (Soft-Delete, deleted_at gesetzt in frueherer Session).

---

### Query 10 — Alle Sensor-Configs (Cross-View-Matrix)

```sql
SELECT sc.id, sc.esp_id, sc.gpio, sc.sensor_type, sc.sensor_name
FROM sensor_configs sc ORDER BY sc.esp_id, sc.gpio;
```

| id (kurz) | esp_id (kurz) | gpio | sensor_type | sensor_name |
|-----------|---------------|------|-------------|-------------|
| 2d397712 | b6a83569 (ESP_00000001) | 0 | sht31_temp | Temperatur und Luftfeuchte Temperature |
| a13fce3c | b6a83569 (ESP_00000001) | 0 | sht31_humidity | Temperatur und Luftfeuchte Humidity |
| b97a2d64 | b6a83569 (ESP_00000001) | 4 | ds18b20 | Lufttemperatur |
| 9e679530 | b6a83569 (ESP_00000001) | 4 | ds18b20 | Lufttemperatur |
| 48e632ed | fd4e0972 (ESP_472204) | 0 | sht31_temp | Temp&Luftfeuchte |
| 7c89863a | fd4e0972 (ESP_472204) | 0 | sht31_humidity | Temp&Luftfeuchte |

**Beobachtungen:**
- ESP_00000001: 2x ds18b20 auf GPIO 4 mit gleichem Namen "Lufttemperatur" — das ist NB6 (OneWire Multi-Sensor, unterschiedliche Adressen, gleicher Name).
- MOCK_A3592B7E: 0 sensor_configs — kein Sensor konfiguriert.
- 6 Sensor-Configs total fuer 2 aktive (nicht-deleted) Devices.

---

### Query 11 — Alle Actuator-Configs

```sql
SELECT id, esp_id, gpio, actuator_type, actuator_name FROM actuator_configs ORDER BY esp_id;
```

| id (kurz) | esp_id (kurz) | gpio | actuator_type | actuator_name |
|-----------|---------------|------|---------------|---------------|
| f5c81a69 | fd4e0972 (ESP_472204) | 27 | digital | Luftbefeuchter |

**Befund:** 1 Actuator-Config fuer ESP_472204. Typ "digital" (On/Off). Kein Actuator fuer ESP_00000001 oder MOCK_A3592B7E.

---

### Query 12 — Alle Zonen

```sql
SELECT id, zone_id, name, description FROM zones ORDER BY zone_id;
```

*(Hinweis: Spalte `slug` existiert nicht — Schema nutzt `zone_id` als eindeutigen Identifier)*

| id (kurz) | zone_id | name | description |
|-----------|---------|------|-------------|
| 424dd01d | echter_esp | Echter ESP | NULL |
| 676d007b | naehrloesung | Nährlösung | NULL |
| 33eccb21 | test | Test | NULL |
| f53cfcc0 | wokwi_testzone | Wokwi-Testzone | NULL |

**Befund:** 4 Zonen. Keine Beschreibungen gesetzt. Zone "naehrloesung" (Nährlösung) — Umlaut in DB korrekt gespeichert.

---

### Query 13 — Alle Subzonen

```sql
SELECT id, esp_id, subzone_id, subzone_name, parent_zone_id FROM subzone_configs
ORDER BY parent_zone_id, subzone_id;
```

*(Hinweis: Tabelle `subzones` existiert nicht — korrekte Tabelle: `subzone_configs`)*

| id (kurz) | esp_id | subzone_id | subzone_name | parent_zone_id |
|-----------|--------|------------|--------------|----------------|
| c51355ec | ESP_00000001 | naehrloesung_zelt | NULL | echter_esp |
| 70dc9701 | ESP_472204 | zelt_wohnzimmer | NULL | echter_esp |
| 1de2ae8e | MOCK_A3592B7E | block_a | NULL | test |
| f3cf088e | MOCK_A3592B7E | block_b | Block B | test |
| 3458692e | ESP_00000001 | reservoir | Reservoir | wokwi_testzone |
| 80e96b74 | ESP_00000001 | topf_reihe_a | Topf-Reihe-A | wokwi_testzone |
| 8968e149 | ESP_00000001 | topf_reihe_b | Topf-Reihe-B | wokwi_testzone |

**Beobachtungen:**
- ESP_00000001 hat 4 Subzones: naehrloesung_zelt (echter_esp), reservoir, topf_reihe_a, topf_reihe_b (wokwi_testzone).
- MOCK_A3592B7E: 2 Subzones in Zone "test" — block_a (kein Name), block_b ("Block B").
- 5 von 7 subzone_names sind NULL — subzone_id wird als impliziter Name verwendet.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| pg_isready | Nicht explizit geprueft — alle Queries erfolgreich (implizit OK) |
| Schema-Verifikation esp_devices | `\d esp_devices` ausgefuehrt — Spalte heisst `device_id`, nicht `esp_id` |
| Schema-Verifikation sensor_configs | `\d sensor_configs` ausgefuehrt — Spalte heisst `sensor_name`, nicht `name` |
| Schema-Verifikation zones | `\d zones` — kein `slug`, stattdessen `zone_id` als unique identifier |
| Tabellen-Inventar | `subzones` existiert nicht — aequivalent: `subzone_configs` |
| Alle 29 Tabellen gelistet | vollstaendig via `pg_tables WHERE schemaname='public'` |

---

## 5. Bewertung & Empfehlung

### 5.1 Notification-Lifecycle — Befund

**Root Cause: Fehlender Deduplication-Mechanismus.**

Queries 3, 4, 5 sind alle leer — das bedeutet: Es gibt KEINE Status-Inkonsistenz in der DB (kein "active" mit resolved_at, kein "aufgelöst" im Titel). Der Notification-Lifecycle ist DB-seitig korrekt implementiert.

Das eigentliche Problem: Der Alert-Generator erstellt bei jedem Check-Zyklus EINEN NEUEN Alert-Row, anstatt einen bestehenden aktiven Alert zu updaten oder zu deduplizieren. Resultat: 6 gleichlautende "Sensordaten veraltet"-Alerts nebeneinander, alle "active", alle mit NULL resolved_at.

### 5.2 Alert-Storm-Analyse

| Alert-Typ | Aktive Duplicates | Zeitraum der Duplicates |
|-----------|-------------------|------------------------|
| Sensordaten veraltet | 6 | 00:18 bis 12:09 UTC |
| ESP32 Heartbeat-Luecke | 6 | 09:02 bis 12:35 UTC |
| No Grafana webhooks | 2 | 07:41 bis 07:46 UTC |

**Eskalation:** 14 neue Alerts in der letzten Stunde (Stand ~12:50 UTC) — der Storm intensiviert sich.

### 5.3 Cross-View-Matrix (T10-R2)

| Kategorie | Anzahl | Aktiv | Anmerkung |
|-----------|--------|-------|-----------|
| Devices | 7 | 3 | 2 online, 1 offline, 4 deleted |
| Sensor-Configs | 6 | 6 | Alle zu nicht-deleted Devices |
| Actuator-Configs | 1 | 1 | ESP_472204, GPIO 27, digital |
| Zonen | 4 | 4 | echter_esp, naehrloesung, test, wokwi_testzone |
| Subzone-Configs | 7 | 7 | 3 ohne Namen (subzone_name=NULL) |

### 5.4 Naechste Schritte

1. **Alert-Deduplication (Server-Dev-Aufgabe):** Vor dem INSERT in `notifications` pruefen ob ein aktiver Alert mit gleichem Titel bereits existiert. Falls ja: updaten statt neu erstellen. Alternativ: Cooldown-Fenster (z.B. min. 30 Min zwischen gleichem Alert-Typ).

2. **Acknowledged-Status (optional):** Derzeit nur "active" und "resolved" in Nutzung. Ein "acknowledged"-State wuerde User-Bestaetigung tracken koennen.

3. **subzone_name befuellen:** 5 von 7 Subzones haben keinen lesbaren Namen — nur subzone_id. Frontend zeigt wahrscheinlich kryptische IDs an.

4. **ESP_00000001 offline:** Letzter Heartbeat 12:30 UTC. Falls Wokwi-Simulation — normal. Falls echter ESP — pruefen ob Verbindung verloren.
