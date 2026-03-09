# T12-R2 Zone/Subzone-Zuordnung — Ergebnisbericht

> **Datum:** 2026-03-09, 07:10–07:25 UTC
> **Bezug:** T12-R1 (Fix-Verifikation)
> **Tester:** AutoOps Agent (Claude)
> **Methode:** REST API + DB Queries + Loki (Playwright blockiert — keine Screenshots)
> **Stack:** Docker (all healthy), ESP_472204 (online), ESP_00000001 (offline/Wokwi)

---

## Zusammenfassung

| Phase | Ergebnis | Bugs |
|-------|----------|------|
| 0 Baseline | **OK** | FINDING-01: zones-Tabelle vs. esp_devices.zone_id Inkonsistenz |
| 1 Zone erstellen | **PASS** | — |
| 2 Subzone erstellen | **PASS** | BUG-17 Fix verifiziert (subzone_name NOT NULL) |
| 3 Subzone-ACK | **PARTIAL** | GPIO 27 ACK OK, GPIO 0 Error 2506 (FINDING-04) |
| 4 Cross-View | **SKIP** | Playwright blockiert, API-Monitor getestet |
| 5 Zone-Wechsel | **FAIL** | FINDING-03: Subzone-Orphaning bei Zone-Wechsel |
| 6 Sensor umzuordnen | **PASS** | GPIO-Reassignment funktioniert korrekt |
| 7 Cleanup | **PASS** | Originalzustand wiederhergestellt, kein Datenverlust |
| 8 Loki | **PASS** | 0 offset-naive Errors (BUG-02 Fix OK), 6x Error 2506 (nur GPIO 0) |

**Gesamtergebnis: 6 PASS, 1 PARTIAL, 1 FAIL, 1 SKIP**

---

## Phase 0 — Baseline

### 0.1 Zonen (DB: `zones` Tabelle)

| zone_id | name |
|---------|------|
| zelt_wohnzimmer | Zelt Wohnzimmer |

### 0.2 Zonen (REST API: `/api/v1/zone/zones`)

| zone_id | zone_name | device_count | sensor_count | actuator_count |
|---------|-----------|-------------|-------------|----------------|
| echter_esp | Zelt Wohnzimmer | 1 | 2 | 1 |
| wokwi_testzone | wokwi_testzone | 1 | 0 | 0 |

**FINDING-01 (MEDIUM):** Zwei parallele Zone-Systeme:
- `zones`-Tabelle (CRUD via `/api/v1/zones/`) — hat `zone_id=zelt_wohnzimmer`
- `esp_devices.zone_id` (Assignment via `/api/v1/zone/`) — hat `zone_id=echter_esp`
- Die Zone-Liste im Frontend/Monitor aggregiert aus `esp_devices`, NICHT aus `zones`.
- **Resultat:** `zones`-Tabellen-Eintrag `zelt_wohnzimmer` wird nirgends angezeigt.

### 0.3 Subzonen (DB: `subzone_configs`)

| esp_id | subzone_id | subzone_name | parent_zone_id | assigned_gpios | last_ack_at |
|--------|-----------|-------------|----------------|----------------|-------------|
| ESP_472204 | zelt | Zelt | echter_esp | [0, 27] | 2026-03-09 07:05:42 |
| ESP_472204 | zelt_wohnzimmer | Zelt Wohnzimmer | echter_esp | [] | 2026-03-08 14:24:00 |

### 0.4 ESP Devices

| device_id | zone_id | zone_name | status |
|-----------|---------|-----------|--------|
| ESP_472204 | echter_esp | Zelt Wohnzimmer | online |
| ESP_00000001 | wokwi_testzone | (null) | offline |

### 0.5 Sensor Configs + Monitor-Data

| sensor_name | sensor_type | gpio | i2c_address | Subzone | Live-Wert |
|-------------|-------------|------|-------------|---------|-----------|
| Temp&Hum | sht31_temp | 0 | 68 | Zelt | 17.8°C |
| Temp&Hum | sht31_humidity | 0 | 68 | Zelt | 41.7%RH |
| Luftbefeuchter | digital (actuator) | 27 | — | Zelt | OFF |

---

## Phase 1 — Zone erstellen und Device zuordnen

### 1.1 Zone "Testzone-Alpha" erstellt

```
POST /api/v1/zones
{"zone_id":"testzone_alpha","name":"Testzone-Alpha","description":"T12-R2 Testzone"}
→ 201 Created, id=f6ba6feb-0c77-400f-8f5b-ec7acac6a55c
```

### 1.2 Device zugewiesen

```
POST /api/v1/zone/devices/ESP_472204/assign
{"zone_id":"testzone_alpha","zone_name":"Testzone-Alpha"}
→ 200 OK, mqtt_sent=true
```

**DB-Verifikation:** `ESP_472204.zone_id = testzone_alpha` ✓
**Zone-Liste:** testzone_alpha (1 device, 2 sensors, 1 actuator) ✓

**Ergebnis: PASS**

---

## Phase 2 — Subzonen erstellen

### 2.1 Subzone "Topfreihe-A" (GPIO 27)

```
POST /api/v1/subzone/devices/ESP_472204/subzones/assign
{"subzone_id":"topfreihe_a","subzone_name":"Topfreihe-A","assigned_gpios":[27]}
→ 200 OK, mqtt_sent=true
```

**DB:** `subzone_name='Topfreihe-A'` ✓ (BUG-17: Name wird gespeichert, nicht NULL)
**ACK:** `status=subzone_assigned`, `last_ack_at=2026-03-09 07:17:30` ✓

### 2.2 Subzone "Reservoir" (GPIO 0)

```
POST /api/v1/subzone/devices/ESP_472204/subzones/assign
{"subzone_id":"reservoir","subzone_name":"Reservoir","assigned_gpios":[0]}
→ 200 OK, mqtt_sent=true
```

**DB:** `subzone_name='Reservoir'` ✓
**ACK:** `status=error, error_code=2506` — GPIO 0 Assignment vom ESP abgelehnt
**Trotzdem:** Monitor-Data zeigt SHT31-Sensoren korrekt unter "Reservoir" (GPIO-Matching in DB)

### 2.3 Keine Subzone-Duplikate

**DB:** `SELECT COUNT(DISTINCT id) FROM subzone_configs WHERE subzone_name='Topfreihe-A'` → **1** ✓

### 2.4 Monitor-Data nach Subzone-Erstellung

```json
{"subzones": [
  {"subzone_id": "reservoir", "sensors": [sht31_temp, sht31_humidity], "actuators": []},
  {"subzone_id": "topfreihe_a", "sensors": [], "actuators": [Luftbefeuchter]}
]}
```

**Ergebnis: PASS** (Subzone-Erstellung, Namens-Persistenz, GPIO-Gruppierung funktionieren)

---

## Phase 3 — Subzone-ACK Verifikation

| Subzone | GPIO | ACK Status | last_ack_at | BUG-02 |
|---------|------|-----------|-------------|--------|
| topfreihe_a | 27 | subzone_assigned ✓ | 2026-03-09 07:17:30 | Kein DateTime-Crash ✓ |
| reservoir | 0 | error (2506) ✗ | NULL | N/A (kein ACK) |

**Loki:** 0 "offset-naive" Errors → **BUG-02 Fix bestätigt** ✓

**FINDING-04 (MEDIUM):** GPIO 0 Subzone-Assignment wird immer vom ESP mit Error 2506 abgelehnt.
GPIO 0 ist ein I2C-Bus-Placeholder in `sensor_configs` (nicht der echte GPIO).
Die echten I2C-Pins sind GPIO 21 (SDA) + 22 (SCL).
**Server speichert die Subzone trotzdem** → Monitor-Data zeigt korrekte Gruppierung.
Der ESP kann GPIO 0 aber nicht als Subzone-GPIO registrieren.

**Ergebnis: PARTIAL** (GPIO 27 OK, GPIO 0 systembedingt fehlgeschlagen)

---

## Phase 4 — Cross-View-Konsistenz

**Status: SKIP** — Playwright-Browser blockiert (Singleton-Lock von vorheriger Session).

API-basierte Konsistenz-Matrix:

| Sensor | Subzone (DB) | Monitor-API | Konsistent? |
|--------|-------------|-------------|-------------|
| SHT31-Temp | Reservoir (GPIO 0) | Reservoir ✓ | ✓ |
| SHT31-Humidity | Reservoir (GPIO 0) | Reservoir ✓ | ✓ |
| Luftbefeuchter | Topfreihe-A (GPIO 27) | Topfreihe-A ✓ | ✓ |

**Hinweis:** L1/L2/Frontend-Screenshots fehlen — nur API-Level verifiziert.

---

## Phase 5 — Device Zone-Wechsel

### 5.1 Testzone-Beta erstellt

```
POST /api/v1/zones {"zone_id":"testzone_beta","name":"Testzone-Beta"}
→ 201 Created
```

### 5.2 ESP von Alpha nach Beta verschoben

```
POST /api/v1/zone/devices/ESP_472204/assign {"zone_id":"testzone_beta"}
→ 200 OK, mqtt_sent=true
```

**DB:** `ESP_472204.zone_id = testzone_beta` ✓

### 5.3 Subzone-Verhalten nach Zone-Wechsel

```
DB: subzone_configs WHERE esp_id='ESP_472204'
→ parent_zone_id = 'testzone_alpha' (ALT!)
→ Device zone_id = 'testzone_beta' (NEU!)
```

**FINDING-03 (HIGH) — Subzone-Orphaning bei Zone-Wechsel:**

| Aspekt | Vor Wechsel | Nach Wechsel |
|--------|------------|-------------|
| Device zone_id | testzone_alpha | testzone_beta |
| Subzone parent_zone_id | testzone_alpha | testzone_alpha (**nicht aktualisiert!**) |
| Monitor-Data Subzones | Reservoir, Topfreihe-A | "Keine Subzone" (**Gruppierung verloren!**) |

**Verhalten = Option B:** Subzonen verlieren zone_id-Bezug.
- `parent_zone_id` wird bei Zone-Wechsel NICHT aktualisiert
- Monitor-Service findet keine passenden Subzones (parent_zone_id ≠ device.zone_id)
- Alle Sensoren erscheinen unter "Keine Subzone"
- **Subzone-Konfiguration geht funktional verloren**, Daten existieren noch in DB

**Fix-Vorschlag:** `ZoneService.assign_zone()` sollte `subzone_configs.parent_zone_id` automatisch
auf den neuen `zone_id` aktualisieren, wenn das Device eine Zone wechselt.

**Ergebnis: FAIL**

---

## Phase 6 — Sensor→Subzone Umzuordnung

### 6.1 Neue Subzones in testzone_beta erstellt

```
sensor_ecke: assigned_gpios=[0]
aktor_ecke: assigned_gpios=[27]
```

### 6.2 GPIO 27 von aktor_ecke nach sensor_ecke verschoben

```
POST /subzone/.../assign {"subzone_id":"sensor_ecke","assigned_gpios":[0,27]}
→ 200 OK
```

**DB:**
- sensor_ecke: assigned_gpios=[0, 27] ✓ (beide GPIOs)
- aktor_ecke: assigned_gpios=[] ✓ (automatisch geleert)

**Monitor-Data:** Alle Sensoren + Actuator korrekt unter "Sensor-Ecke" gruppiert ✓

**Ergebnis: PASS**

---

## Phase 7 — Cleanup

### 7.1 Originalzustand wiederhergestellt

| Schritt | Aktion | Ergebnis |
|---------|--------|----------|
| 7.1 | Test-Subzones gelöscht | sensor_ecke, aktor_ecke removed ✓ |
| 7.2 | ESP zurück zu `echter_esp` | zone_id=echter_esp, zone_name="Zelt Wohnzimmer" ✓ |
| 7.3 | Original-Subzone "Zelt" wiederhergestellt | assigned_gpios=[0,27], parent_zone_id=echter_esp ✓ |
| 7.4 | Test-Zonen gelöscht | testzone_alpha, testzone_beta deleted ✓ |
| 7.5 | Orphaned Subzones bereinigt | 2 orphaned records manuell via DB gelöscht |

### 7.2 Datenverlust-Check

```sql
SELECT COUNT(*) FROM sensor_data WHERE timestamp > NOW() - interval '1 hour';
→ 372 Readings
```

**Kein Datenverlust!** Sensor-Daten bleiben bei der Zone/Subzone des Aufnahmezeitpunkts:

| zone_id | subzone_id | count |
|---------|-----------|-------|
| echter_esp | zelt | 202 |
| testzone_beta | sensor_ecke | 48 |
| echter_esp | (none) | 44 |
| testzone_alpha | zelt | 38 |
| testzone_alpha | reservoir | 28 |
| testzone_beta | reservoir | 28 |

**Ergebnis: PASS**

---

## Phase 8 — Loki-Abschluss

| Query | Treffer | Bewertung |
|-------|---------|-----------|
| `"offset-naive"` | **0** | BUG-02 Fix bestätigt ✓ |
| `"ERROR"` (Zone/Subzone) | **6** | Alle error_code=2506 (GPIO 0), keine Logik-Fehler |
| `"zone" \|= "error"` | 0 relevante | Keine Zone-Fehler |
| `"subzone" \|= "error"` | 0 relevante | Nur GPIO-2506, kein Subzone-Logik-Error |

**Ergebnis: PASS** (Errors sind bekanntes GPIO-0-Problem, keine Zone/Subzone-Bugs)

---

## Neue Bugs / Findings

| # | Severity | Beschreibung | Empfehlung |
|---|----------|-------------|------------|
| FINDING-01 | MEDIUM | Zwei parallele Zone-Systeme: `zones`-Tabelle vs. `esp_devices.zone_id` — API aggregiert aus devices, nicht aus zones-Tabelle | Zone-Tabelle mit esp_devices verlinken oder konsolidieren |
| FINDING-02 | LOW | GPIO 0 in `assigned_gpios` obwohl ESP Error 2506 zurückgibt — Server speichert trotzdem | Server sollte bei ACK-Error assigned_gpios bereinigen |
| **FINDING-03** | **HIGH** | **Zone-Wechsel aktualisiert `subzone_configs.parent_zone_id` NICHT** — Subzones werden orphaned, Monitor-Gruppierung geht verloren | `ZoneService.assign_zone()` muss parent_zone_id migrieren |
| FINDING-04 | MEDIUM | GPIO 0 = I2C-Placeholder, kein echter GPIO — Subzone-Assignment immer Error 2506 | I2C-Sensoren mit echtem GPIO (21/22) oder speziellem Flag behandeln |

---

## Akzeptanzkriterien

- [x] Zone erstellen und Device zuordnen funktioniert
- [x] Subzone erstellen mit Name (nicht NULL) funktioniert (BUG-17 Fix ✓)
- [x] Subzone-ACK funktioniert für GPIO 27 (BUG-02 Fix ✓, kein DateTime-Crash)
- [ ] Cross-View-Konsistenz: **SKIP** (Playwright blockiert)
- [x] Device Zone-Wechsel funktioniert — **ABER: Subzone-Orphaning (FINDING-03)**
- [x] Sensor→Subzone Umzuordnung funktioniert
- [x] Kein Datenverlust bei Zone/Subzone-Änderungen
- [x] 0 zone/subzone-bezogene Logik-Errors in Loki
- [ ] Screenshots S01-S23: **SKIP** (Playwright blockiert)

---

## Empfehlung

1. **FINDING-03 fixen (HIGH):** `ZoneService.assign_zone()` muss bei Zone-Wechsel
   `subzone_configs.parent_zone_id` auf den neuen zone_id aktualisieren.
   Ohne diesen Fix verlieren User ihre Subzone-Konfiguration bei jedem Zone-Wechsel.

2. **FINDING-01 konsolidieren (MEDIUM):** Die parallelen Zone-Systeme (zones-Tabelle vs.
   esp_devices.zone_id) sollten vereinheitlicht werden. Entweder FK auf zones-Tabelle
   oder zones-Tabelle deprecaten.

3. **Phase 4 nachholen:** Playwright-Browser-Lock beheben, dann Cross-View-Screenshots
   für L1/L2/Monitor erstellen.

4. **Nach FINDING-03 Fix:** T12-R2 Zone-Wechsel-Test wiederholen und bestätigen.

5. **Nächster Schritt:** T12-R3 (Wokwi Full-Stack) oder FINDING-03 Fix → Re-Test.
