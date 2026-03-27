# Server Debug Report

**Erstellt:** 2026-03-26
**Modus:** B (Spezifisch: "ESP_EA5484 Sensor-Config Probleme — DS18B20 Overwrite, SHT31 0x45, Subzone-Reset, I2C-Fehler-Kaskade")
**Quellen:** Loki API (`{container="automationone-server"}`), PostgreSQL DB (sensor_configs, subzone_configs), config_builder.py, config_mapping.py

---

## 1. Zusammenfassung

**Vier separate Probleme** wurden identifiziert, von denen zwei (2.1, 2.2) auf bekannte Architektur-Lücken zurückgehen, die bereits in MEMORY.md dokumentiert sind (NB6, NB7, NB8). Das kritischste Problem ist die **I2C-Bus-Absturz-Kaskade** (16:41–16:58 Uhr), die in drei Wiederholungen auftrat und jeweils mit einem ESP-Reboot endete. Der Server selbst ist stabil — alle Errors sind ESP32-seitige Hardware-Events, korrekt protokolliert und gespeichert.

**Wichtigste Befunde:**
1. DS18B20-Overwrite: Kein Server-Bug — der DB-Unique-Constraint `unique_esp_gpio_sensor_interface_v2` schützt zwar mit `onewire_address`, aber ein NULL-Constraint-Lücke erlaubt zwei Einträge ohne Adresse. Problem liegt im Frontend-AddFlow (NB7).
2. SHT31 0x45 wird nicht erkannt: Sensor wurde nie in der DB angelegt — kein POST mit `i2c_address=0x45` gefunden. Aktuell nur `i2c_address=68 (0x44)` in DB.
3. Subzone-Reset: Server sendet bei jedem Heartbeat Full-State-Push inkl. Subzone-Reassignment — das ist gewolltes Verhalten, aber die `assigned_subzones`-Spalte in `sensor_configs` ist für alle ESP_EA5484-Sensoren `[]`.
4. I2C-Fehler-Kaskade: Drei Zyklen 1016->1018->1013->1014->8072, alle severity=critical/error — ESP-seitig, Server protokolliert korrekt, keine Server-Reaktion (kein Auto-Recovery-Mechanismus).

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| Loki API `{container="automationone-server"}` | OK | Alle 6 Queries erfolgreich, 24h Zeitfenster |
| PostgreSQL `sensor_configs` | OK | 4 Einträge für ESP_EA5484 |
| PostgreSQL `subzone_configs` | OK | 3 Subzonen für ESP_EA5484 |
| `config_builder.py` | OK | Gelesen — enthält onewire_address + i2c_address im Payload |
| `config_mapping.py` | OK | Gelesen — beide Adress-Felder in DEFAULT_SENSOR_MAPPINGS |

---

## 3. Befunde

### 3.1 API-Flow: Sensor hinzufügen (dokumentiert)

Aus den Logs rekonstruierter Ablauf:

```
POST /api/v1/sensors/ESP_EA5484/{gpio}  →  HTTP 200, ~30-50ms
  └─ src.api.v1.sensors: "Sensor created: ESP_EA5484 GPIO X by admin (config_status=pending)"
  └─ Config-Push wird ausgelöst
  └─ src.api.v1.sensors: "Config published to ESP ESP_EA5484 after sensor delete/create"
```

Für GPIO 0 (SHT31-Adds) fehlt das "Sensor created"-Log — nur HTTP 200 sichtbar. Für GPIO 4 (DS18B20) erscheint es zweimal:
- `2026-03-26 13:33:09` — Sensor created GPIO 4 (config_status=pending)
- `2026-03-26 14:19:07` — Sensor created GPIO 4 (config_status=pending)

**Sensor-Delete-Flow** (vollständig dokumentiert):
```
DELETE /api/v1/sensors/ESP_EA5484/{config_uuid}  →  HTTP 200, ~25-43ms
  └─ "Sensor deleted: ESP_EA5484 config_id={uuid} GPIO X type=Y by admin"
  └─ "Config published to ESP ESP_EA5484 after sensor delete"
```

Jede Löschung triggert sofort einen Config-Push. Kein Cascade-Cleanup auf sensor_data (unlimited retention per Maintenance-Config).

### 3.2 Config-Push-Inhalt (was geht per MQTT raus)

Aus `config_builder.py` und `config_mapping.py` verifiziert: Der MQTT-Push enthält **beide Adress-Felder**:

```json
{
  "sensors": [
    {
      "gpio": 0,
      "sensor_type": "sht31_temp",
      "interface_type": "I2C",
      "i2c_address": 68,
      "onewire_address": "",
      "active": true
    },
    {
      "gpio": 4,
      "sensor_type": "ds18b20",
      "interface_type": "ONEWIRE",
      "onewire_address": "28FF641F7FCCBAE1",
      "i2c_address": 0,
      "active": true
    }
  ]
}
```

Der `strip_auto_prefix`-Transform laeuft auf `onewire_address`. Die `i2c_address` wird als Integer gesendet (68 = 0x44). VIRTUAL-Sensoren (VPD) werden vor dem Push gefiltert.

**Aktueller DB-Stand (sensor_configs fuer ESP_EA5484):**

| GPIO | sensor_type    | interface_type | i2c_address | onewire_address  | config_status |
|------|----------------|----------------|-------------|------------------|---------------|
| 0    | sht31_humidity | I2C            | 68 (0x44)   | —                | applied       |
| 0    | sht31_temp     | I2C            | 68 (0x44)   | —                | applied       |
| 0    | vpd            | VIRTUAL        | —           | —                | active        |
| 4    | ds18b20        | ONEWIRE        | —           | 28FF641F7FCCBAE1 | applied       |

**Kein zweiter SHT31 mit Adresse 0x45 (=69) in der DB.** Nur eine I2C-Adresse 0x44 vorhanden.

### 3.3 OneWire-Scan Flow

**Scan-Endpoint:** `POST /api/v1/sensors/esp/ESP_EA5484/onewire/scan`

```
12:40:15 — MQTT Publish: onewire/scan →  284ms → HTTP 200
12:40:38 — MQTT Publish: onewire/scan →  171ms → HTTP 200
13:05:41 — MQTT Publish: onewire/scan → 10019ms → HTTP 504 (TIMEOUT)
13:08:07 — MQTT Publish: onewire/scan → 10020ms → HTTP 504 (TIMEOUT)
13:09:02 — MQTT Publish: onewire/scan → 10017ms → HTTP 504 (TIMEOUT)
13:10:21 — MQTT Publish: onewire/scan → 10019ms → HTTP 504 (TIMEOUT)
13:11:05 — MQTT Publish: onewire/scan →   531ms → HTTP 200 (wieder erreichbar)
13:33:03 — MQTT Publish: onewire/scan →   270ms → HTTP 200
14:18:31 — MQTT Publish: onewire/scan →   245ms → HTTP 200
16:45:40 — MQTT Publish: onewire/scan →   242ms → HTTP 200
16:48:56 — MQTT Publish: onewire/scan →   287ms → HTTP 200
```

**Befund:** 4 aufeinanderfolgende 504-Timeouts (13:05–13:10) korrelieren mit dem I2C-Error-Zeitfenster. Der ESP war waehrend dieser Zeit nicht erreichbar (Reboot-Phase). Nach Wiederherstellung laufen Scans normal (~250ms). Keine automatische Retry-Logik — User musste manuell neu scannen.

### 3.4 SHT31 Mehrfach-Config (KRITISCHER WARNING-STORM)

**Befund: Zwischen 13:39 und 14:03 Uhr — 85+ WARNING-Eintraege:**

```
src.db.repositories.sensor_repo - WARNING
"Multiple configs for esp=f259c9a3-bfa3-479b-b61e-4ca97c986894 gpio=0 type=sht31_temp: 2 results.
OneWire/I2C without address? Returning first match."
```

- **ESP-UUID:** `f259c9a3...` ist die interne DB-UUID von ESP_EA5484
- **Zeitraum:** 13:39–14:03 Uhr (alle 30s, 2x pro Zyklus = ~85 Eintraege)
- **Ursache:** Zum Zeitpunkt 13:39 existierten zwei `sensor_configs`-Eintraege fuer `gpio=0, sht31_temp` ohne distinguishing `i2c_address`. Das ist der bekannte **NB8-Bug** (Dual-Storage-Desync + fehlender Unique-Constraint auf i2c_address bei NULL-Werten).
- **Aufloesung:** Um 14:03:19–14:03:35 wurden drei Sensoren geloescht — Warnings verstummen danach.

**Root Cause:** Der Unique-Constraint `unique_esp_gpio_sensor_interface_v2` ist definiert als:
```sql
UNIQUE (esp_id, gpio, sensor_type, COALESCE(onewire_address, ''), COALESCE(i2c_address::text, ''))
```
Zwei Eintraege mit `i2c_address=NULL` und gleichem `gpio+sensor_type` landen beide als leerer String — der Constraint wird verletzt, aber die Datenbank erlaubt es wegen NULL-Semantik. Dies ist eine **DB-Schema-Luecke**: NULL != NULL in SQL-UNIQUE ist kein Constraint-Fehler.

### 3.5 Subzone-Mechanismus

**Befund: Subzone-Zuordnung ist server-gesteuert via Full-State-Push.**

Server sendet bei jedem Heartbeat automatisch alle Subzonen per MQTT:

```
17:02:09 — subzone command SENT: ESP_EA5484, subzone_id=au_en, gpios=[4]     → ACK 104ms
17:02:09 — subzone command SENT: ESP_EA5484, subzone_id=innen, gpios=[0]     → ACK 877ms
17:02:10 — subzone command SENT: ESP_EA5484, subzone_id=innen_ebene_2        → ACK 91ms
17:02:10 — Full-State-Push completed: zone=zelt_wohnzimmer, subzones=3/3
```

**Aktuelle DB-Subzonen fuer ESP_EA5484:**

| subzone_id    | subzone_name  | assigned_gpios | sensor_count | assigned_sensor_config_ids |
|---------------|---------------|----------------|--------------|----------------------------|
| au_en         | Aussen        | [4]            | 1            | []                         |
| innen         | Innen         | [0]            | 3            | []                         |
| innen_ebene_2 | Innen Ebene 2 | []             | 0            | []                         |

**Befund: `assigned_sensor_config_ids` ist UEBERALL `[]`** — obwohl `sensor_count` fuer "Innen" = 3 ist. Die Zuordnung laeuft ausschliesslich ueber `assigned_gpios` (GPIO-basiert), nicht ueber sensor_config UUIDs.

**Problem "Subzone reset beim Sensor-Hinzufuegen":** Wenn ein neuer Sensor auf GPIO 0 hinzugefuegt wird, wird ein neuer Config-Push ausgeloest. Der Full-State-Push sendet danach die Subzonen mit denselben GPIOs. Der ESP-seitige Reset kommt daher, dass die Firmware die Subzone-Zuordnung neu initialisiert wenn die Sensor-Config reinkommt. Dies ist **ESP32-seitiges Verhalten**, nicht ein Server-Bug. Der Server sendet einen manuellen Subzone-Assign naechsten Heartbeat automatisch nach.

**Manueller Subzone-Assign via API:**
```
POST /api/v1/subzone/devices/ESP_EA5484/subzones/assign
  → "Subzone assignment sent: subzone_id=au_en, gpios=[4]"
  → MQTT ACK ~30ms
```

### 3.6 I2C-Fehler-Kaskade (3 Wiederholungen)

**Chronologie Zyklus 1 (16:41–16:43):**

```
16:41:51 — error_code=1016, severity=warning   (I2C Read Fehler)
16:41:52 — error_code=1018, severity=warning   (I2C Sensor Response Timeout)
16:41:53 — error_code=1013, severity=error     (I2C Initialisierung fehlgeschlagen)
16:42:24 — error_code=1014, severity=CRITICAL  (I2C Bus nicht verfuegbar)
16:42:33 — error_code=8072, severity=error     (System-Reset / ESP-Reboot)
16:43:01 — error_code=1022, severity=error     (Post-Reboot Init-Fehler)
16:43:01 — error_code=1028, severity=error     (Post-Reboot Init-Fehler)
```

**Chronologie Zyklus 2 (16:43–16:52):**

```
16:43:21 — 1016 (warning), 16:43:22 — 1018 (warning)
... weitere 1011/1016/1018 Warnings bis ~16:51
16:51:22 — error_code=1013 (error)
16:52:21 — error_code=1014 (CRITICAL)
16:52:26 — error_code=8072 (Reboot)
```

**Chronologie Zyklus 3 (16:52–16:58):**

```
16:52:50 — 1011 (warning)
16:52:54 — 1016/1018 (warning)
16:55:18 — 1016/1018/1013 (error)
16:57:48 — 1016/1018/1013 (error)
16:58:21 — 1014 (CRITICAL)
16:58:23 — 8072 (Reboot)
```

**Nach 17:00 Uhr:** Keine weiteren I2C-Errors. ESP laeuft stabil.

**Error-Code-Bedeutung:**

| Code | Schwere | Bedeutung |
|------|---------|-----------|
| 1011 | warning | I2C Bus Warning |
| 1016 | warning | I2C Read-Fehler (wiederholbar) |
| 1018 | warning | I2C Sensor Response Timeout |
| 1013 | error | I2C Initialisierung fehlgeschlagen |
| 1014 | CRITICAL | I2C Bus nicht verfuegbar (fataler Zustand) |
| 8072 | error | System-Reset / ESP-Reboot |
| 1022 | error | Post-Reboot Init-Fehler |
| 1028 | error | Post-Reboot Init-Fehler |

**Server-Reaktion:** Keine aktive Reaktion. `error_handler` speichert alle Events in DB. Kein Auto-Recovery, kein Retry-Command, kein Alert.

### 3.7 Grafana-Alert Webhook-Fehler (sekundaer)

**Befund:** Recurrenter ERROR in `src.api.v1.webhooks`:

```
ERROR: Failed to route Grafana alert 'Error Cascade':
(sqlalchemy.dialects.postgresql.asyncpg.IntegrityError)
<class 'asyncpg.exceptions.UniqueViolationError'>:
duplicate key value violates unique constraint "ix_notifications_fingerprint_unique"
```

- Tritt auf: 16:43:52, 16:48:52, 16:53:51, 17:03:51 Uhr
- Ursache: Grafana sendet denselben Alert mehrfach mit gleichem Fingerprint. Der Server-Code behandelt den IntegrityError nicht graceful — kein UPSERT, kein ON CONFLICT DO NOTHING.

### 3.8 Weitere ESP_EA5484-Errors (ausserhalb I2C-Kaskade)

```
12:40:15 — error_code=1021 (warning)  — OneWire nach Scan, normal
14:08:33 — error_code=1041/1001/1051  — ESP_EA5484 Sensor-Timeout + Boot-Zyklus
14:08:56 — error_code=1052            — Config-Verarbeitungs-Fehler
14:20:20 — error_code=1001/1051       — weiterer Boot-Zyklus
14:22:10 — error_code=1052/1001/1051  — weiterer Boot-Zyklus
16:33:05 — error_code=1009            — vor I2C-Kaskade
```

Der Zeitraum 14:08–14:22 zeigt drei Boot-Zyklen korrelierend mit dem Hinzufuegen des zweiten DS18B20-Sensors (14:19:07) und nachfolgendem Config-Push.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `docker compose ps` | Alle 11 Services running/healthy |
| Loki verfuegbar | Ja — `automationone-loki Up 5 hours (healthy)` |
| DB `sensor_configs` ESP_EA5484 | 4 Eintraege: sht31_temp+sht31_humidity (GPIO0, 0x44), ds18b20 (GPIO4, 28FF641F7FCCBAE1), vpd (VIRTUAL) |
| DB `subzone_configs` ESP_EA5484 | 3 Subzonen: au_en (GPIO[4]), innen (GPIO[0]), innen_ebene_2 (GPIO[]) |
| `sensor_configs.assigned_subzones` | Alle `[]` — subzone-Zuordnung nur via `subzone_configs.assigned_gpios` |
| Unique-Constraint `sensor_configs` | `COALESCE(i2c_address::text, '')` — NULL-i2c_address-Duplikate moeglich (SQL NULL != NULL Semantik) |
| config_mapping.py | `onewire_address` + `i2c_address` beide in DEFAULT_SENSOR_MAPPINGS |
| config_builder.py | VIRTUAL-Filter vorhanden, GPIO-Konflikt-Check vorhanden, I2C/ONEWIRE aus Konflikt-Check ausgenommen |
| OneWire-Scan Status | 4x 504-Timeout (13:05–13:10), danach wieder normal (~250ms) |
| Grafana-Alert-Webhook | ERROR: UniqueViolationError bei fingerprint — kein ON CONFLICT handling |

---

## 5. Bewertung & Empfehlung

### Root Causes (nach Problem)

**Problem 1: DS18B20 zweiter Sensor ersetzt ersten**
- **Root Cause:** NB7 (bekannt). Frontend-AddFlow fuer DS18B20 uebergibt beim zweiten Hinzufuegen keine eindeutige `onewire_address`. Kombiniert mit DB-Luecke (COALESCE NULL-Semantik) entstehen Duplikate.
- **Server-Verhalten:** Korrekt — kein Server-Bug. Der zweite POST hat keinen `onewire_address`-Parameter.
- **Fix-Ort:** Frontend `AddSensorModal` fuer DS18B20-Flow.

**Problem 2: SHT31 0x45 nicht erkannt**
- **Root Cause:** Sensor wurde nie in der DB angelegt. In keinem der 24h-Logs findet sich ein POST mit `i2c_address=69` fuer ESP_EA5484.
- **Server-Verhalten:** Korrekt — was nicht in der DB ist, wird nicht an den ESP gesendet.
- **Fix-Ort:** Frontend `AddSensorModal` fuer I2C-Flow — `i2c_address` wird beim Add-Flow moeglicherweise nicht korrekt uebergeben (vgl. NB7: zwei divergente Code-Pfade).

**Problem 3: Subzone-Reset beim Sensor-Hinzufuegen**
- **Root Cause:** ESP32-Firmware initialisiert Subzone-State neu nach Config-Push. Server sendet naechsten Heartbeat den State-Push nach.
- **Fix-Empfehlung:** Server sollte nach Config-Push proaktiv einen Subzone-Reassign senden (ohne Heartbeat abzuwarten).

**Problem 4: I2C-Bus-Crash-Kaskade**
- **Root Cause:** ESP32-Hardware/Firmware-Problem. Drei Zyklen, jeder 10-16 Minuten nach vorherigem Reboot.
- **Server-Verhalten:** Korrekt — Events werden gespeichert. Kein Auto-Recovery (by design).
- **Sekundaerproblem:** Grafana-Webhook UniqueViolationError unabhaengig davon.

### Naechste Schritte (Prioritaet)

| Prio | Problem | Empfohlene Aktion | Ort |
|------|---------|-------------------|-----|
| HOCH | SHT31 0x45 nicht in DB | Frontend I2C-AddFlow debuggen: wird `i2c_address` korrekt uebergeben? Manuell testen: `POST /api/v1/sensors/ESP_EA5484/0` mit Body `{"sensor_type":"sht31_temp","i2c_address":69}` | Frontend / API-Test |
| HOCH | DB NULL-Constraint-Luecke | Backend-Validierung: I2C-Sensor ohne `i2c_address` ablehnen. Oder Alembic: i2c_address NOT NULL fuer I2C interface_type | Server `api/v1/sensors.py` |
| MITTEL | DS18B20 Overwrite | Frontend `AddSensorModal` DS18B20-Pfad: `onewire_address` aus Scan-Ergebnis zwingend uebernehmen | Frontend |
| MITTEL | Grafana-Alert UniqueViolation | Webhook-Handler: ON CONFLICT DO NOTHING oder Upsert | Server `api/v1/webhooks.py` |
| NIEDRIG | Subzone-Reset nach Config-Push | Nach Config-Push sofortigen Subzone-Reassign senden | Server `services/subzone_service.py` |
| NIEDRIG | I2C-Kaskade Recovery | ESP32-Firmware: I2C-Recovery nach 1014 verbessern | ESP32-Firmware |
