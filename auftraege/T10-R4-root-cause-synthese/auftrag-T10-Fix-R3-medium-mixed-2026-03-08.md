# Auftrag T10-Fix-R3: MEDIUM Mixed — Frontend-Types + Encoding + Cleanup

> **Bezug:** T10-R4 Root-Cause-Synthese (2026-03-08)
> **Prioritaet:** MEDIUM (P2)
> **Datum:** 2026-03-08
> **Geschaetzter Aufwand:** ~2.5 Stunden
> **Ersetzt:** auftrag-T10-fixC (veraltet)
> **Voraussetzung:** Fix-Runde 1 abgeschlossen (BUG-08 Fix noetig fuer BUG-12 Verifikation)
> **Naechster Schritt:** Fix-Runde 4 (LOW) oder T11-Retest

---

## Ziel

6 MEDIUM-Priority Bugs fixen — 3 Frontend, 2 Backend, 1 Fullstack. Alle unabhaengig voneinander.

> **[verify-plan Hinweis]:** Fix 1 ist NUR Frontend (Server liefert subzone_id bereits). Fix 5 Root-Cause ist NICHT hard-coded IDs sondern fehlende Delete→Stop Synchronisation. Fix 6 Backend ist BEREITS gefixt (BUG-09). Reale Verteilung: 4 Frontend, 1 Backend, 1 Cleanup.

---

## Fix 1: BUG-04 — MockActuator subzone_id fehlt (~30 Min)

### IST
`El Frontend/src/types/index.ts` (ca. Zeile 295): `MockActuator` Interface hat kein `subzone_id`-Feld. Der Mapper in `api/esp.ts` (ca. Zeile 269-282) `mapActuatorConfigToMockActuator()` uebertraegt `subzone_id` nicht. ESPSettingsSheet gruppiert Geraete nach `subzone_id` — Aktoren haben `undefined` → fallen aus Gruppierung.

### SOLL
1. `types/index.ts` (Zeile 295): `subzone_id?: string | null` zu `MockActuator` Interface hinzufuegen
2. `api/esp.ts` (Zeile 270): Im Mapper `subzone_id: config.subzone_id` ergaenzen
3. ~~Pruefen ob Server-API `ActuatorConfigResponse` `subzone_id` bereits liefert~~ → **BEREITS VORHANDEN** (`actuator.py:268-271`). Mapper `_model_to_schema_response()` setzt es (Zeile 147). NUR Frontend-Fix noetig.

### Begruendung
Aktoren gehoeren zu Subzonen genau wie Sensoren. Beispiel: Eine Bewaesserungspumpe (Aktor) gehoert zur gleichen Subzone wie der Bodenfeuchte-Sensor. Das ESPSettingsSheet zeigt "Geraete nach Subzone" — dort muessen Aktoren neben ihren zugehoerigen Sensoren erscheinen.

### Betroffene Dateien
1. **`El Frontend/src/types/index.ts`** (Zeile 295) — `MockActuator` Interface: `subzone_id` Feld fehlt
2. **`El Frontend/src/api/esp.ts`** (Zeile 269-282) — `mapActuatorConfigToMockActuator()`: `subzone_id` Mapping fehlt
3. ~~Backend~~ — **Nicht betroffen**: `ActuatorConfigResponse` hat `subzone_id` bereits (Zeile 268)

### Akzeptanzkriterien
- [ ] L2 → ESP mit Actuator → ESPSettingsSheet → Actuator in korrekter Subzone sichtbar
- [ ] TypeScript-Kompilierung fehlerfrei
- [ ] Bestehende Tests gruen

---

## Fix 2: BUG-03 — Unit-Encoding Double-UTF8 (~15 Min)

### IST
`El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` (Zeile 235, nicht 329): `unit = payload.get("unit", "")` uebernimmt die Unit direkt aus dem MQTT-Payload. ESP32-Firmware sendet Grad-Zeichen als Latin-1 Byte `0xB0`. Server interpretiert es als UTF-8 → Mojibake (`\u00c2\u00b0C` = "Â°C"). Kein Encoding-Sanitizer vorhanden.

### SOLL
Encoding-Sanitizer nach dem Payload-Lesen:
```python
unit = payload.get("unit", "")
# Latin-1 → UTF-8 Korrektur
try:
    unit = unit.encode('latin-1').decode('utf-8')
except (UnicodeDecodeError, UnicodeEncodeError):
    pass  # Bereits korrektes UTF-8
```

Oder (robuster): Unit aus `sensor_type_registry` holen statt aus Payload. Der Server kennt die korrekte Unit pro Sensor-Typ — die Unit aus dem Payload ist redundant und fehleranfaellig.

### Begruendung
ESP32 (Arduino/ESP-IDF) verwendet Latin-1/CP1252 Encoding. MQTT-Payloads werden als UTF-8 interpretiert. Das Grad-Zeichen (`°`) ist in Latin-1 = `0xB0`, in UTF-8 = `0xC2 0xB0` (2 Bytes). Wenn Latin-1 Bytes als UTF-8 re-interpretiert werden, entsteht Mojibake. Der Server muss diese Konvertierung handhaben, da die Firmware nicht geaendert werden kann.

### Betroffene Dateien
1. **`El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`** — nach `payload.get("unit", "")` (Zeile 235)
2. **Alternative:** `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py` — Unit pro Sensor-Typ ist dort bereits definiert

### Akzeptanzkriterien
- [ ] `curl /api/v1/sensors/data?...` → unit = "°C" (nicht "\u00c2\u00b0C")
- [ ] Hex-Dump in DB: `c2b043` (korrektes UTF-8 fuer °C)
- [ ] Bestehende Tests gruen

---

## Fix 3: BUG-12 — Doppelte Sensor-Eintraege im Monitor (~30 Min)

### IST
Monitor Widget-Dropdown und Komponenten-Tabelle zeigen 2 DS18B20 mit gleichem Display-Name fuer MOCK_A3592B7E. Kein Disambiguierungs-Suffix fuer OneWire-Sensoren mit verschiedenen ROM-Codes auf gleichem GPIO.

### SOLL
Sensor-Labels disambiguieren wenn:
- Gleicher `sensor_type` UND gleicher `gpio` auf gleichem ESP
- Suffix hinzufuegen: `sensor_name (ROM: ...last4)` oder `(Kanal X)`

Alle Selektoren und v-for-Keys muessen `config_id` (UUID) als Unique-Key verwenden, nicht `sensor_type + gpio`.

### Begruendung
OneWire-Bus ist ein Multi-Sensor-Bus — mehrere DS18B20 auf einem GPIO ist der Standard-Anwendungsfall (z.B. 3 Temperatursensoren fuer Wasser/Luft/Substrat). Der Benutzer muss sie visuell unterscheiden koennen. Die `onewire_address` (ROM-Code) ist der natuerliche Differenzierungsschluessel.

### Betroffene Dateien
1. **`El Frontend/src/views/MonitorView.vue`** — Widget-Selector Sensor-Dropdown (Zeile 429: `name: s.name || s.sensor_type || ...`)
2. **`El Frontend/src/shared/stores/inventory.store.ts`** — Komponenten-Tabelle ID: Zeile 121 nutzt `${s.esp_id}_gpio${s.gpio}` statt `config_id` → KEIN eindeutiger Key bei Multi-Sensor OneWire
3. **`El Frontend/src/utils/sensorDefaults.ts`** — `getSensorLabel()` kennt keine Disambiguierung fuer gleiche Typen auf gleichem GPIO
4. **`El Frontend/src/components/devices/SensorCard.vue`** — `resolvedUnit`/Display-Name ohne OneWire-Adress-Suffix

### Akzeptanzkriterien
- [ ] Monitor → Widget-Dropdown → 2 DS18B20 mit unterscheidbaren Namen
- [ ] Komponenten-Tabelle → 2 unterscheidbare Zeilen
- [ ] config_id als v-for Key (nicht sensor_type+gpio)
- [ ] Bestehende Tests gruen

---

## Fix 4: BUG-13 — Unit-Display zeigt sensor_type (~15 Min)

### IST
Komponenten-Tabelle zeigt "22,00 ds18b20" statt "22,00 °C". Frontend nutzt `sensor_type` als Fallback wenn `unit` leer ist (was bei BUG-09 der Fall ist: `raw_mode=True` → `unit=""`).

### SOLL
Wenn `unit` leer: Default-Unit aus sensor_type_registry verwenden (z.B. ds18b20 → "°C", sht31_humidity → "%RH"). NICHT `sensor_type` als Pseudo-Unit anzeigen. Wenn weder `unit` noch Default vorhanden: Leerer String (keine Unit anzeigen) statt sensor_type.

### Begruendung
Sensor-Typen sind keine Einheiten. "ds18b20" ist ein Geraetetyp, nicht eine Masseinheit. Nach Fix-Runde 2 (BUG-09: raw_mode Default → False) sollte die Unit korrekt befuellt sein. Dieser Fix ist ein Frontend-Fallback fuer den Fall dass die Unit trotzdem leer bleibt.

### Betroffene Dateien
1. **`El Frontend/src/shared/stores/inventory.store.ts`** (Zeile 130) — `unit: s.unit || getSensorUnit(s.sensor_type)` hat BEREITS korrekten Fallback ueber `getSensorUnit()`. Fuer ds18b20 liefert `getSensorUnit('ds18b20')` → `"°C"`, NICHT sensor_type.
2. **ACHTUNG:** Falls der Bug real ist, liegt die Ursache NICHT in `inventory.store.ts`. Weitere Stellen pruefen:
   - `El Frontend/src/components/dashboard-widgets/SensorCardWidget.vue` (Zeile 81): nutzt `getSensorUnit()` korrekt
   - `El Frontend/src/components/esp/ESPSettingsSheet.vue` (Zeile 208): `sensor.unit || getSensorUnit(...)` korrekt
   - **Moegliche Ursache:** Serverseitig wird `unit=""` gespeichert UND der sensor_type ist NICHT in `SENSOR_TYPE_CONFIG` registriert → `getSensorUnit()` gibt `"raw"` zurueck → leerer String wird angezeigt. Dann muesste ein anderer Code-Pfad den sensor_type als Label verwenden.

### Akzeptanzkriterien
- [ ] Komponenten-View → DS18B20 Zeile → "22,00 °C" (nicht "22,00 ds18b20")
- [ ] Leere Unit → kein Fallback auf sensor_type (lieber leer lassen)
- [ ] `getSensorUnit()` fuer ALLE 9 Sensor-Typen verifizieren (nicht nur ds18b20)
- [ ] Bestehende Tests gruen

---

## Fix 5: BUG-15 — Ghost-Device Scheduler-Cleanup (~30 Min)

### IST
~~`simulation/scheduler.py` hat eine residuale Konfiguration fuer MOCK_D75008E2~~ **[KORREKTUR]:** Der Scheduler hat KEINE hard-coded Device-IDs. MOCK_D75008E2 ist NIRGENDS im Code. `recover_mocks()` (Zeile 423) laedt ausschliesslich Devices mit `simulation_state='running'` aus der DB. Die 14 Warnings "Sensor not in config" (`_generate_sensor_data()` Zeile 828) entstehen wenn ein Device in-memory existiert (`_runtimes`), aber seine `sensor_configs` nicht mehr in `device_metadata.simulation_config` auffindbar sind.

**Echte Ursache:** MOCK_D75008E2 wurde soft-deleted (`status='deleted'`), aber seine Simulation wurde nicht korrekt gestoppt. Die In-Memory-Runtime blieb bestehen. Es existiert BEREITS `cleanup_orphaned_runtimes()` (Zeile 495), die genau dieses Problem adressiert — aber sie wird moeglicherweise nicht oder zu spaet aufgerufen.

### SOLL
1. Sicherstellen dass `cleanup_orphaned_runtimes()` (Zeile 495) nach `recover_mocks()` (Zeile 423) beim Server-Start aufgerufen wird
2. Bei Device-Delete (`esp_repo.delete`): Simulation explizit stoppen via `stop_mock(device_id)` BEVOR das Device soft-deleted wird
3. In `_generate_sensor_data()` (Zeile 828): Warning nur 1x pro Device statt bei jedem Job-Trigger + automatisch Runtime entfernen

### Begruendung
Mock-Devices werden dynamisch erstellt und geloescht. Der Scheduler laedt bereits aus der DB (kein Hard-coding). Das Problem ist die fehlende Synchronisation zwischen Device-Delete und Simulations-Stop. `cleanup_orphaned_runtimes()` existiert als Safety-Net, wird aber nicht konsequent eingesetzt.

### Betroffene Dateien
1. **`El Servador/god_kaiser_server/src/services/simulation/scheduler.py`** — `cleanup_orphaned_runtimes()` (Zeile 495): Aufruf nach `recover_mocks()` sicherstellen
2. **`El Servador/god_kaiser_server/src/services/simulation/scheduler.py`** — `_generate_sensor_data()` (Zeile 828): Warning-Wiederholung unterbinden
3. **`El Servador/god_kaiser_server/src/api/v1/esp.py`** (oder Service-Layer) — Device-Delete muss `stop_mock()` aufrufen

### Akzeptanzkriterien
- [ ] `{compose_service="el-servador"} |= "MOCK_D75008E2"` → 0 Treffer (oder 1x Info)
- [ ] Scheduler startet ohne Warnings fuer nicht-existierende Devices
- [ ] Existierende Mock-Devices werden weiterhin simuliert
- [ ] Bestehende Tests gruen

---

## Fix 6: BUG-17 — Subzone-Name bei Erstellung setzen (~30 Min)

### IST
5 von 7 `subzone_configs` haben `subzone_name = NULL`. **[KORREKTUR]:** Der Server-seitige Fix existiert BEREITS als BUG-09 in `subzone_service.py`:
- Zeile 613-616: Update ueberschreibt Name nur wenn nicht leer
- Zeile 636-650: Auto-Name-Generierung "Subzone X" bei Neuanlage wenn kein Name mitgeschickt
Die 5 NULL-Eintraege stammen von VOR dem BUG-09 Fix.

### SOLL
1. Frontend Config-Panel: `subzone_name` als Feld im API-Request mitschicken — **pruefen ob das bereits passiert**
2. ~~Backend API: `subzone_name` bei Subzone-Erstellung akzeptieren und speichern~~ → **BEREITS IMPLEMENTIERT** (BUG-09 Fix in `subzone_service.py` Zeilen 636-650)
3. ~~Fallback: Wenn kein Name angegeben → `subzone_name = "Subzone " + auto_increment` statt NULL~~ → **BEREITS IMPLEMENTIERT** (Zeile 638-645: zählt existierende Subzones und generiert "Subzone {count+1}")
4. **NEU:** SQL-Cleanup-Migration fuer die 5 bestehenden NULL-Eintraege (Altlast vor BUG-09 Fix)

### Begruendung
Subzonen ohne Namen sind im Monitor, L2 und ESPSettingsSheet nicht sinnvoll darstellbar. Ein Name wie "Topf-Reihe A" oder "Reservoir" ist fuer den Benutzer essentiell um die physische Zuordnung zu verstehen. AutomationOne verwendet Subzonen als raeumliche Gruppierung innerhalb einer Zone — ohne Namen verlieren sie ihren Sinn.

### Betroffene Dateien
1. **`El Frontend/src/components/esp/SensorConfigPanel.vue`** — Pruefen ob `subzone_name` im API-Request mitgeschickt wird
2. ~~Backend: Subzone-Erstellungs-Endpoint/Service~~ → **BEREITS GEFIXT** in `El Servador/god_kaiser_server/src/services/subzone_service.py` (BUG-09, Zeilen 613-650)
3. **SQL-Cleanup:** Alembic-Migration oder Script zum Befuellen der 5 bestehenden NULL-Namen (`UPDATE subzone_configs SET subzone_name = 'Subzone ' || id WHERE subzone_name IS NULL`)

### Akzeptanzkriterien
- [ ] Neuer Sensor mit Subzone → subzone_name in DB != NULL
- [ ] `SELECT COUNT(*) FROM subzone_configs WHERE subzone_name IS NULL` → 0 (nach Cleanup)
- [ ] Monitor/L2 zeigen Subzone-Namen korrekt an
- [ ] Bestehende Tests gruen
