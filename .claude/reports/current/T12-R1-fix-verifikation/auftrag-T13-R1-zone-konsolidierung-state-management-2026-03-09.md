# Auftrag T13-R1: Zone-Konsolidierung und State-Management

> **Bezug:** T12-R1 Bericht (25/26 PASS), T12-R2 Bericht (FINDING-01, FINDING-03, FINDING-04)
> **Prioritaet:** HOCH — Voraussetzung fuer T13-R2 (Multi-Zone-Scope) und T13-R3 (Frontend)
> **Geschaetzter Umfang:** ~3-4 Stunden
> **Datum:** 2026-03-09

---

## Ziel

Das Zone/Subzone-System hat zwei strukturelle Probleme die geloest werden muessen bevor Multi-Zone-Geraete oder Frontend-Layouts umgesetzt werden:

1. **Zwei parallele Zone-Systeme** die sich widersprechen (FINDING-01)
2. **Subzone-Orphaning** bei Zone-Wechsel — Subzonen verlieren ihren Bezug (FINDING-03)

Zusaetzlich: Zone/Subzone-State-Management (aktiv/archiviert), ~~fehlende Alembic-Migration (BUG-02)~~ BUG-02 bereits gefixt (nur DB-Verifikation noetig), Subzone-Counts nicht synchron, GPIO-0-Handling.

**Dieser Auftrag raeumt das Fundament auf.** Danach ist das System bereit fuer Multi-Zone-Geraete (T13-R2) und Frontend-Ueberarbeitung (T13-R3).

---

## Was NICHT gemacht wird

- Kein neues `device_scope`-Feld (kommt in T13-R2)
- Keine Frontend-Aenderungen (kommt in T13-R3)
- Keine Fertigation-Logic (Rezepte, Ventilmatrix) — spaetere Phase
- Keine Logic-Engine-Aenderungen

---

## IST-Zustand (Probleme aus T12-R2)

### Problem 1: Zwei parallele Zone-Systeme (FINDING-01)

**IST:** Es gibt zwei unabhaengige Wege eine Zone zu definieren:

- **`zones`-Tabelle** (CRUD via `/api/v1/zones/`) — hat z.B. `zone_id=zelt_wohnzimmer`
- **`esp_devices.zone_id`** (Assignment via `/api/v1/zone/devices/{esp_id}/assign`) — hat z.B. `zone_id=echter_esp`
  <!-- [Korrektur] Route-Param heisst {esp_id}, nicht {id} — siehe zone.py:57 -->

Die Zone-Liste im Frontend/Monitor nutzt `GET /v1/zone/zones` — einen **Merged-View** aus `esp_devices` UND `zone_context`. Zusaetzlich existiert `GET /v1/zones` (Entity-CRUD aus `zones`-Tabelle). Dadurch gibt es DREI Zonen-Quellen (zones-Tabelle, esp_devices.zone_id, zone_context) die nicht synchron sind.
<!-- [Korrektur] IST-Beschreibung war unvollstaendig. Es gibt 2 getrennte List-Endpoints (zone.py:48 prefix=/v1/zone, zones.py:34 prefix=/v1/zones) und eine zone_context-Tabelle (add_zone_context_table.py). assign_zone() synct bereits zone_name nach ZoneContext (zone_service.py:179-186). -->

**SOLL:** Eine einzige autoritative Zonenquelle. `zones`-Tabelle ist die Single Source of Truth. `esp_devices.zone_id` ist ein Foreign Key auf `zones.zone_id`.

### Problem 2: Subzone-Orphaning bei Zone-Wechsel (FINDING-03)

**IST:** Wenn ein ESP die Zone wechselt (z.B. von `testzone_alpha` nach `testzone_beta`):
- `esp_devices.zone_id` wird auf `testzone_beta` aktualisiert
- `subzone_configs.parent_zone_id` bleibt auf `testzone_alpha` (ALT!)
- Monitor-Service findet keine passenden Subzones (parent_zone_id ≠ device.zone_id)
- Alle Sensoren erscheinen unter "Keine Subzone"
- Subzone-Konfiguration geht funktional verloren

**SOLL:** Bei Zone-Wechsel wird `subzone_configs.parent_zone_id` automatisch auf die neue Zone aktualisiert. Die Subzone-Konfiguration (Name, assigned_gpios) bleibt erhalten. Alte Sensordaten bleiben bei der alten Zone (bereits korrekt implementiert via `sensor_data.zone_id`).

### Problem 3: ~~Schema-Migration nicht angewendet (BUG-02)~~ BEREITS GEFIXT

**IST:** ~~`subzone_configs.last_ack_at` ist `timestamp without time zone`. Die Alembic-Migration existiert als untracked File, wurde aber nicht ausgefuehrt.~~
<!-- [Korrektur] BUG-02 ist BEREITS BEHOBEN. Die Migration `fix_datetime_timezone_naive_columns.py` existiert als TRACKED File in alembic/versions/. Das SubzoneConfig-Model definiert bereits `DateTime(timezone=True)` fuer last_ack_at. Die Migration wurde committed (nicht untracked). Es muss nur noch geprueft werden ob `alembic upgrade head` in der aktuellen DB-Instanz ausgefuehrt wurde. -->
**KORRIGIERTER IST-Zustand:** Die Alembic-Migration `fix_datetime_timezone_naive_columns.py` existiert als **getracktes File** und das Model (`subzone.py`) definiert bereits `DateTime(timezone=True)`. Es muss nur verifiziert werden ob die Migration in der laufenden DB-Instanz angewendet wurde (`alembic current` pruefen).

**SOLL:** Verifizieren dass Migration angewendet ist (`alembic current`). Falls nicht: `alembic upgrade head`. Danach DB-Spaltentyp verifizieren.

### Problem 4: Subzone-Counts nicht synchron

**IST:** T12-R1 Beobachtung: Subzone "Zelt Wohnzimmer" hat `sensor_count=0` und `actuator_count=0`, obwohl 2 Sensoren + 1 Actuator konfiguriert sind.

**SOLL:** `sensor_count` und `actuator_count` in `subzone_configs` werden bei jeder Sensor/Aktor-Aenderung automatisch aktualisiert.

### Problem 5: GPIO 0 = I2C-Placeholder (FINDING-04)

**IST:** I2C-Sensoren (SHT31, BMP280) bekommen `gpio=0` in `sensor_configs`. Das ist kein physischer GPIO sondern ein Platzhalter. Subzone-Assignment per `assigned_gpios=[0]` wird vom ESP mit Error 2506 abgelehnt — der Server speichert die Zuordnung trotzdem.

**SOLL:** Server erkennt GPIO 0 bei I2C-Sensoren als Platzhalter. Subzone-Zuordnung fuer I2C-Sensoren funktioniert ueber `sensor_config_id` statt ueber `assigned_gpios`. Alternativ: I2C-Sensoren bekommen den echten I2C-GPIO (21/22) oder ein spezielles Flag `is_i2c_placeholder=True`.

---

## SOLL: Zone-State-Management

Zonen brauchen einen Lifecycle-Status damit alte Zonen mit historischen Daten weiterhin sichtbar bleiben aber nicht mehr aktiv bewirtschaftet werden.

> **Validierung:** Das Finite-State-Machine-Pattern fuer Device/Zone-Lifecycle ist ein etabliertes Architekturmuster in IoT/IIoT-Systemen (vgl. OPC UA Information Models, IEC 62541). Die definierten Status-Uebergaenge (active → archived → deleted) folgen diesem Pattern. Es gibt allerdings kein agriculture-spezifisches akademisches Paper das dieses Muster auf Gewaechshaus-Zonen anwendet — AutomationOne ist hier Vorreiter. Die Implementierung ist trotzdem solide weil sie auf allgemeinen Software-Engineering-Prinzipien basiert.

### Zone-Status ENUM

```
zone_status: ENUM('active', 'archived', 'deleted')
```

| Status | Bedeutung | Sichtbar in Monitor? | Daten-Schreiben? | Konfigurierbar? |
|--------|-----------|---------------------|------------------|-----------------|
| `active` | Zone wird aktiv bewirtschaftet | Ja — volle Funktionalitaet | Ja | Ja |
| `archived` | Zone nicht mehr aktiv, historische Daten erhalten | Ja — read-only, eigener Bereich | Nein | Nein |
| `deleted` | Soft-Delete | Nein (nur Admin) | Nein | Nein |

**Regeln:**
- Beim Archivieren einer Zone: Alle zugeordneten ESPs muessen VORHER einer anderen Zone zugeordnet oder entkoppelt werden
- Archivierte Zonen zeigen historische Sensordaten im Monitor (read-only)
- Ein User kann eine archivierte Zone wieder aktivieren
- Loeschen ist Soft-Delete (`deleted_at` Timestamp) — Daten bleiben in DB

### Subzone-Status

Subzonen folgen dem Status ihrer Zone. Zusaetzlich:
- Subzone kann innerhalb einer aktiven Zone deaktiviert werden (`is_active: Boolean, DEFAULT True`)
- Beim Zone-Archivieren werden alle Subzonen automatisch deaktiviert
- Beim Zone-Reaktivieren bleiben Subzonen deaktiviert (User muss manuell aktivieren)

---

## SOLL: Subzone-Transfer bei Zone-Wechsel

Wenn ein ESP die Zone wechselt, gibt es drei Strategien fuer seine Subzonen:

| Strategie | Verhalten | Wann sinnvoll |
|-----------|-----------|---------------|
| **Transfer** (Default) | Subzones werden mit zur neuen Zone genommen. `parent_zone_id` wird aktualisiert. Name und GPIOs bleiben. | ESP wechselt komplett die Zone |
| **Kopie** | Subzones bleiben in alter Zone (fuer andere ESPs). Neue Subzones mit gleichem Setup werden in Zielzone erstellt. | ESP wird dupliziert / mehrere ESPs in einer Zone |
| **Reset** | Subzones in alter Zone bleiben. ESP startet in neuer Zone ohne Subzones ("Keine Subzone"). | Komplett neuer Einsatzort |

**Backend-Implementierung:**
```
POST /api/v1/zone/devices/{esp_id}/assign
{
  "zone_id": "neue_zone",
  "zone_name": "Neue Zone",
  "subzone_strategy": "transfer"  // "transfer" | "copy" | "reset"  — Default: "transfer"
}
```

**Verhalten bei "transfer" (Default):**
1. `esp_devices.zone_id` auf neue Zone setzen
2. Alle `subzone_configs` mit `esp_id` dieses ESPs: `parent_zone_id` auf neue Zone aktualisieren
3. Sensordaten ab JETZT bekommen neue `zone_id` (alte behalten alte — bereits implementiert)
4. MQTT-Notification an ESP senden
5. Audit-Eintrag in `device_zone_changes` schreiben

**Verhalten bei "reset":**
1. `esp_devices.zone_id` auf neue Zone setzen
2. Subzones bleiben unveraendert (verwaist in alter Zone, werden beim naechsten Cleanup bereinigt ODER bleiben fuer andere ESPs)
3. Sensordaten ab JETZT bekommen neue `zone_id`

---

## Implementierungsplan

### Phase 1: Zone-Konsolidierung (FINDING-01)

**Schritt 1.1:** `zones`-Tabelle zum autoritativen System machen.
- Pruefen ob `esp_devices.zone_id` als FK auf `zones.zone_id` gesetzt werden kann
- Wenn ja: Alembic-Migration erstellen die den FK hinzufuegt
- Wenn nein (weil `esp_devices.zone_id` String-Werte hat die nicht in `zones` existieren): Erst fehlende Zonen in `zones`-Tabelle anlegen, dann FK setzen
<!-- [Korrektur] WICHTIG: `ZoneService.assign_zone()` (zone_service.py:116-130) hat bereits einen Auto-Create-Mechanismus: Wenn zone_id nicht in zones-Tabelle existiert, wird sie automatisch angelegt (Backward-Compatibility). Bei FK-Einfuehrung muss dieses Auto-Create VORHER alle existierenden esp_devices.zone_id-Werte in die zones-Tabelle migrieren. Das zone.py Model (zone.py:12-13) dokumentiert explizit: "FK constraint intentionally NOT added. Planned for a follow-up." -->
- **BEACHTE:** `ZoneService.assign_zone()` erstellt bereits automatisch fehlende Zonen in der `zones`-Tabelle (zone_service.py:116-130). Die Migration muss alle bestehenden `esp_devices.zone_id`-Werte pruefen und in `zones` anlegen bevor der FK gesetzt wird.

**Schritt 1.2:** Zone-Aggregation im Backend umstellen.
<!-- [Korrektur] Es gibt ZWEI getrennte Zone-List-Endpoints die konsolidiert werden muessen:
  1. GET /v1/zone/zones (zone.py) — Merged-View aus esp_devices + ZoneContext
  2. GET /v1/zones (zones.py) — Entity-CRUD direkt aus zones-Tabelle
  Zusaetzlich gibt es eine zone_context-Tabelle (add_zone_context_table.py) die Zone-Metadaten speichert.
  Der Plan muss klaeren: Wird /v1/zone/zones auf zones-Tabelle umgestellt ODER werden beide Endpoints zusammengefuehrt? -->
- **Zwei bestehende Zone-List-Endpoints** muessen konsolidiert werden:
  - `GET /v1/zone/zones` (zone.py:48) — Merged-View aus `esp_devices` + `zone_context`
  - `GET /v1/zones` (zones.py:34) — Entity-CRUD aus `zones`-Tabelle
- `GET /v1/zone/zones` soll kuenftig `zones`-Tabelle als Primary Source nutzen, angereichert per JOIN mit Device-Counts
- `GET /v1/zones` (Entity-CRUD) bleibt unveraendert
- Die `zone_context`-Tabelle bleibt als **separater Layer** bestehen (siehe "zone_context-Tabelle" Abschnitt unten). Bei der Abfrage wird `zone_context` per LEFT JOIN angereichert, aber NICHT in `zones` migriert oder als Teil des Zone-CRUD behandelt
- Zonen OHNE Devices trotzdem anzeigen (wichtig fuer "leere Zonen" und Archiv)

**Schritt 1.3:** Zone-CRUD Endpoints konsolidieren.
- `/api/v1/zones` (CRUD) bleibt — erstellt/loescht Zonen in `zones`-Tabelle
- `/api/v1/zone/devices/{esp_id}/assign` aktualisiert `esp_devices.zone_id` — muss pruefen ob Zone in `zones`-Tabelle existiert (Auto-Create in zone_service.py:116-130 entfernen und durch Validierung ersetzen)
  <!-- [Korrektur] Route-Param heisst {esp_id}, nicht {id}. Ausserdem: assign_zone() erstellt aktuell fehlende Zonen automatisch — dieses Verhalten muss bei FK-Einfuehrung zu einer Validierung (Zone muss existieren) umgebaut werden. -->
- Kein Device-Assignment ohne existierende Zone erlauben

**Schritt 1.4:** `zone_status` Spalte hinzufuegen.
- Alembic-Migration: `ALTER TABLE zones ADD COLUMN status VARCHAR DEFAULT 'active'`
- ENUM: `active`, `archived`, `deleted`
- `deleted_at` Spalte hinzufuegen (Soft-Delete)

### Phase 2: Subzone-Orphaning Fix (FINDING-03)

**Schritt 2.1:** `ZoneService.assign_zone()` erweitern (zone_service.py:81-203).
<!-- [Korrektur] KRITISCHER FK-Typ-Hinweis:
  - subzone_configs.esp_id ist String FK auf esp_devices.device_id (z.B. "ESP_12AB34CD")
  - sensor_configs.esp_id ist UUID FK auf esp_devices.id (UUID)
  - actuator_configs.esp_id ist UUID FK auf esp_devices.id (UUID)
  Diese Inkonsistenz ist beim JOIN subzone_configs <-> sensor_configs relevant!
  ZoneService importiert SubzoneRepository bereits (zone_service.py:40), nutzt es aber nicht in assign_zone(). -->
- `ZoneService` importiert bereits `SubzoneRepository` (Zeile 40) — guter Startpunkt
- Nach `esp_devices.zone_id` Update (aktuell Zeile 148):
- Alle `subzone_configs` mit `esp_id` (= `device_id` String, NICHT UUID!) des betroffenen ESPs finden
- `parent_zone_id` auf neue `zone_id` aktualisieren (Transfer-Strategie)
- `subzone_strategy` Parameter implementieren ("transfer", "copy", "reset")
- **ACHTUNG FK-Typ-Inkonsistenz:** `subzone_configs.esp_id` = String (device_id), aber `sensor_configs.esp_id` = UUID (esp_devices.id). Bei Count-Sync und JOINs beachten!

**Schritt 2.2:** Audit-Tabelle `device_zone_changes` erstellen.

```sql
CREATE TABLE device_zone_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    esp_id VARCHAR NOT NULL,
    old_zone_id VARCHAR,
    new_zone_id VARCHAR NOT NULL,
    subzone_strategy VARCHAR DEFAULT 'transfer',
    affected_subzones JSON,  -- [{subzone_id, old_parent, new_parent}]
    changed_by VARCHAR DEFAULT 'system',
    changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Schritt 2.3:** Bei jedem Zone-Wechsel einen Audit-Eintrag schreiben.

### Phase 3: ~~BUG-02 Migration +~~ Count-Sync

**Schritt 3.1:** ~~Alembic-Migration ausfuehren (`alembic upgrade head`).~~ Verifizieren dass Migration `fix_datetime_timezone_naive_columns` in der DB angewendet ist: `alembic current` ausfuehren. Falls nicht: `alembic upgrade head`. Danach DB-Spaltentyp verifizieren.
<!-- [Korrektur] Migration existiert als tracked File. Ist kein neuer Schritt, nur Verifikation. -->

**Schritt 3.2:** Subzone-Counts automatisch aktualisieren.
<!-- [Korrektur] KRITISCH: sensor_configs.esp_id ist UUID (FK auf esp_devices.id), aber subzone_configs.esp_id ist String (FK auf esp_devices.device_id). sync_subzone_counts() muss ueber esp_devices joinen um beide Welten zu verbinden:
  subzone_configs.esp_id (String device_id) -> esp_devices.device_id -> esp_devices.id (UUID) <- sensor_configs.esp_id (UUID)
  Direkter JOIN subzone_configs <-> sensor_configs ist NICHT moeglich wegen FK-Typ-Mismatch! -->
- Service-Funktion `sync_subzone_counts(device_id: str)` — Parameter ist `device_id` (String), NICHT UUID
- JOIN-Pfad: `subzone_configs.esp_id` (String) → `esp_devices.device_id` → `esp_devices.id` (UUID) ← `sensor_configs.esp_id` (UUID)
- **Direkter JOIN `subzone_configs` ↔ `sensor_configs` ist NICHT moeglich** (FK-Typ-Mismatch String vs UUID)
- Berechnet `sensor_count` und `actuator_count` aus tatsaechlichen configs wo `gpio IN assigned_gpios`
- Aufrufen bei: Sensor erstellen/loeschen, Actuator erstellen/loeschen, Subzone-Assignment aendern
- Einmalig: Migration-Script das alle bestehenden Counts korrigiert

### Phase 4: GPIO-0 I2C-Handling (FINDING-04)

**Schritt 4.1:** I2C-Sensoren identifizieren.
- I2C-Sensortypen: `sht31_temp`, `sht31_humidity`, `bmp280_temp`, `bmp280_pressure`, `bme280_*`
- Diese Sensoren haben `gpio=0` als Platzhalter und `i2c_address` als echte Adresse

**Schritt 4.2:** Subzone-Zuordnung fuer I2C-Sensoren anpassen.
- Option A (empfohlen): `assigned_gpios` erweitern um `assigned_sensor_config_ids` — Subzone-Zuordnung auch per `sensor_config_id` moeglich
- Option B: I2C-Sensoren bekommen statt `gpio=0` den echten I2C-Bus-GPIO (z.B. 21 fuer SDA) — Problem: Mehrere Sensoren auf gleichem Bus haetten gleichen GPIO
- Option C: Neues Feld `is_i2c_bus: Boolean` auf `sensor_configs` — Subzone-Matching ignoriert `gpio` und nutzt `sensor_config_id`

**Empfehlung:** Option A — `assigned_sensor_config_ids` als ergaenzende Zuordnung neben `assigned_gpios`. Abwaertskompatibel, kein Breaking Change.

**Schritt 4.3:** ESP-seitiges ACK fuer I2C-Sensoren.
- Wenn GPIO in Subzone-Assignment = 0 UND Sensor ist I2C-Typ: Kein ACK-Request an ESP senden (ESP kann GPIO 0 nicht registrieren)
- Server markiert Subzone-Assignment trotzdem als erfolgreich
- Log-Eintrag: "I2C-Sensor {name} via config_id zugeordnet (GPIO 0 ist I2C-Placeholder)"

---

## Akzeptanzkriterien

- [ ] `esp_devices.zone_id` ist FK auf `zones.zone_id` — kein Device-Assignment ohne existierende Zone moeglich
- [ ] Zone-Liste im Frontend zeigt Zonen aus `zones`-Tabelle (inkl. leere Zonen)
- [ ] `zones`-Tabelle hat `status`-Spalte (`active`, `archived`, `deleted`) und `deleted_at`
- [ ] Zone-Wechsel aktualisiert `subzone_configs.parent_zone_id` automatisch (kein Orphaning)
- [ ] `subzone_strategy` Parameter bei `/assign` funktioniert ("transfer", "copy", "reset")
- [ ] `device_zone_changes` Audit-Tabelle wird bei jedem Zone-Wechsel befuellt
- [ ] `subzone_configs.last_ack_at` ist `timestamp with time zone` (BUG-02 — nur Verifikation, Migration existiert bereits als tracked File)
- [ ] `sensor_count` und `actuator_count` in `subzone_configs` sind korrekt und werden automatisch synchronisiert
- [ ] I2C-Sensoren (gpio=0) koennen per `sensor_config_id` einer Subzone zugeordnet werden ohne ESP-ACK-Error
- [ ] Bestehende Tests laufen weiterhin gruen
- [ ] Neue Tests fuer Zone-Wechsel mit Subzone-Transfer, -Kopie, -Reset

---

## Testszenarien

| Szenario | Erwartung |
|----------|-----------|
| Zone erstellen + Device zuordnen | Zone in `zones`-Tabelle, Device FK gesetzt |
| Device einer nicht existierenden Zone zuordnen | HTTP 400/404 Fehler |
| Zone wechseln (Transfer) | Subzone `parent_zone_id` aktualisiert, Counts korrekt, Audit geschrieben |
| Zone wechseln (Reset) | Subzone bleibt in alter Zone, Device hat neue Zone |
| Zone archivieren | Status `archived`, kein Device-Assignment erlaubt |
| Zone reaktivieren | Status `active`, Subzones bleiben deaktiviert |
| I2C-Sensor einer Subzone zuordnen | Kein Error 2506, Zuordnung per config_id |
| Subzone-Count nach Sensor-Create | `sensor_count` um 1 erhoeht |

---

## Implementierungshinweise (verify-plan Ergaenzungen)

> Folgende Punkte wurden bei der Systemverifikation identifiziert und muessen bei der Umsetzung beachtet werden.

### Kritische FK-Typ-Inkonsistenz

| Tabelle | Spalte `esp_id` | FK-Typ | Referenziert |
|---------|----------------|--------|-------------|
| `subzone_configs` | `String(50)` | `esp_devices.device_id` | z.B. `"ESP_12AB34CD"` |
| `sensor_configs` | `UUID` | `esp_devices.id` | z.B. `uuid4()` |
| `actuator_configs` | `UUID` | `esp_devices.id` | z.B. `uuid4()` |

**Konsequenz:** Kein direkter JOIN zwischen `subzone_configs` und `sensor_configs`/`actuator_configs` moeglich. Immer ueber `esp_devices` joinen.

### Bestehende Dateien (exakte Pfade fuer Dev-Agent)

| Datei | Pfad | Aenderung noetig |
|-------|------|-----------------|
| Zone Model | `El Servador/god_kaiser_server/src/db/models/zone.py` | `status`, `deleted_at` Spalten hinzufuegen |
| Zone Router (Assignment) | `El Servador/god_kaiser_server/src/api/v1/zone.py` | `subzone_strategy` in Request |
| Zone Router (Entity CRUD) | `El Servador/god_kaiser_server/src/api/v1/zones.py` | Status-Filter, Archiv-Endpoints |
| ZoneService | `El Servador/god_kaiser_server/src/services/zone_service.py` | Subzone-Transfer, Auto-Create→Validierung |
| Zone Schema | `El Servador/god_kaiser_server/src/schemas/zone.py` | `ZoneAssignRequest` + `subzone_strategy` |
| Subzone Model | `El Servador/god_kaiser_server/src/db/models/subzone.py` | `is_active` Spalte |
| Zone-Subzone Resolver | `El Servador/god_kaiser_server/src/utils/zone_subzone_resolver.py` | I2C-GPIO-0 Handling |
| Subzone Repo | `El Servador/god_kaiser_server/src/db/repositories/subzone_repo.py` | Count-Sync Methoden |
| Zone Repo | `El Servador/god_kaiser_server/src/db/repositories/zone_repo.py` | Status-Queries |

### Neue Dateien

| Datei | Zweck |
|-------|-------|
| `alembic/versions/add_zone_status_and_fk.py` | Migration: status, deleted_at auf zones + FK esp_devices→zones |
| `alembic/versions/add_device_zone_changes.py` | Migration: Audit-Tabelle |
| `alembic/versions/add_subzone_is_active.py` | Migration: is_active auf subzone_configs |
| `src/db/models/device_zone_change.py` | SQLAlchemy Model fuer Audit-Tabelle |

### zone_context-Tabelle: SEPARATER LAYER — NICHT in zones migrieren

> **ENTSCHEIDUNG (verbindlich):** Die `zone_context`-Tabelle BLEIBT als eigenstaendige Tabelle bestehen. Sie wird NICHT in die `zones`-Tabelle migriert oder mit ihr verschmolzen.

**Begruendung (Separation of Concerns):**
Die `zone_context`-Tabelle (Migration: `add_zone_context_table.py`) speichert **Zone-Metadaten** — Informationen wie Pflanzenanzahl, Sorte, Pflanz-IDs, Entwicklungsstadium. Diese Daten sind **funktional unabhaengig** von Sensor/Aktor-Zuweisungen und Zone-Device-Management. Sie informieren sich gegenseitig (z.B. Zone-Metadaten koennen die Steuerungslogik beeinflussen), aber die Datenhaltung MUSS getrennt bleiben:

- `zones`-Tabelle = **Zone als Infrastruktur-Einheit** (ID, Name, Status, Timestamps)
- `zone_context`-Tabelle = **Zone als agronomische Einheit** (Pflanzen, Sorte, Wachstumsphase, Umgebungsinfos)
- `sensor_configs`/`actuator_configs` = **Geraetezuordnung** (welcher Sensor/Aktor misst/steuert wo)

Diese Trennung ermoeglicht spaeter eine eigenstaendige zone_context-Konfigurationsoberflaeche (Komponenten-Tab im Frontend) ohne dass Aenderungen an der Zone-Infrastruktur (T13-R1) oder am Multi-Zone-Routing (T13-R2) die Metadaten beruehren.

**Konsequenz fuer Phase 1.2 (Zone-Aggregation):**
- `GET /v1/zone/zones` liest Zonen aus `zones`-Tabelle, enriched per LEFT JOIN mit `zone_context` fuer Metadaten und mit Device-Counts
- `ZoneService.assign_zone()` synct weiterhin `zone_name` nach `zone_context` (zone_service.py:179-186) — dieses Sync-Verhalten beibehalten
- `zone_context` Eintraege OHNE passende Zone in `zones`-Tabelle sind verwaist und koennen spaeter bereinigt werden
- Neue Zonen in `zones`-Tabelle erstellen automatisch KEINEN `zone_context`-Eintrag — der wird spaeter separat konfiguriert

**Was NICHT gemacht werden darf:**
- `zone_context`-Spalten in `zones`-Tabelle verschieben
- `zone_context` als Teil des Zone-CRUD behandeln (CREATE zone erstellt keinen Context)
- `zone_context`-Felder in `ZoneResponse`-Schema flach einbetten (nur als verschachteltes `context`-Objekt falls noetig)
