# Auftrag T13-R2: Multi-Zone Device-Scope und Datenrouting

> **Bezug:** T13-R1 (Zone-Konsolidierung — muss VORHER abgeschlossen sein)
> **Recherche-Basis:** Shared-Device-Datenmodell, Multi-Zone-Fertigation-Architektur, Cross-Zone-Geraete in IoT-Plattformen, Ventilmatrix-Recherche
> **Prioritaet:** HOCH — Kernfunktionalitaet fuer flexible Geraetezuordnung
> **Geschaetzter Umfang:** ~4-5 Stunden
> **Datum:** 2026-03-09

---

## Ziel

Sensoren und Aktoren sollen vorher fuer **mehrere Zonen und Subzonen konfigurierbar** sein, sodass sie flexibel Daten in die vom User vorgesehene Zone schreiben koennen. Beispiele:

- **Duengerpumpe** im Technikraum versorgt Zone A, B und C nacheinander
- **pH/EC-Sensoren** im Mischbehaelter messen fuer alle Zonen — Daten werden der aktuell aktiven Zone zugeordnet
- **Luftbefeuchter** zwischen zwei Subzonen bedient beide gleichzeitig
- **Mobiler pH-Tester** wird physisch zwischen Zonen bewegt — Messdaten gehoeren zur Zone wo gemessen wird

Das System muss dabei die Datenintegritaet wahren: Jede Messung bekommt die Zone/Subzone zum Messzeitpunkt. Historische Daten bleiben bei ihrer urspruenglichen Zone.

> **Hinweis zur Datenzuordnung (Temporal Data Attribution):** Die Zuordnung von Sensordaten zur Zone zum Messzeitpunkt ist ein Eigendesign von AutomationOne. Es gibt kein akademisches Paper das dieses Muster in Agriculture-IoT-Systemen beschreibt — die naechste akademische Parallele sind Bi-Temporal Tables aus der Datenbanktheorie. Die Praxis-Grundlage kommt aus professionellen Fertigation-Systemen (Priva, Agrowtek): Dort speichern shared pH/EC-Sensoren im Mischsystem ihre Messdaten mit der Zone die gerade dosiert wird. AutomationOne formalisiert dieses implizite Verhalten durch das `device_active_context`-Konzept.

**Dieser Auftrag erweitert das Datenmodell und den sensor_handler.** Frontend kommt in T13-R3.

---

## Was NICHT gemacht wird

- Keine Frontend-Aenderungen (kommt in T13-R3)
- Keine Fertigation-Rezepte oder Ventilmatrix-Logik (spaetere Phase)
- Keine Stations-Queue in Logic Engine (spaetere Phase)
- Kein neuer REST-Endpoint fuer Rezept-Management
- **Keine Aenderungen an der `zone_context`-Tabelle** — diese Tabelle speichert Zone-Metadaten (Pflanzen, Sorten, Wachstumsphasen) und ist funktional unabhaengig von device_scope und Sensor/Aktor-Zuweisungen. Multi-Zone-Routing darf `zone_context` weder lesen noch schreiben. Die Verbindung zwischen Zone-Metadaten und Steuerung kommt in einer spaeteren Phase.

---

## Hintergrund: Drei Arten von Cross-Zone-Geraeten

> **Herkunft dieses Modells:** Die drei Typen (statisch multi-zone, dynamisch sequenziell, mobil) wurden aus der Analyse professioneller Fertigation-Systeme und IoT-Plattformen abgeleitet. Kein bestehendes System hat diese Dreiteilung explizit — jedes System loest nur einen Teilaspekt. Priva/Agrowtek implementieren sequenzielles Pumpen-Sharing ohne es als "device_scope" zu formalisieren. ThingsBoard/OpenHAB haben Raum-Zuordnungen aber kein Multi-Zone-Routing. AutomationOne formalisiert diese impliziten Patterns in ein einheitliches `device_scope`-Modell.

Professionelle Gewaechshaussteuerungen (Priva, Agrowtek, Netafim) und IoT-Plattformen (ThingsBoard, OpenHAB) kennen drei fundamental verschiedene Zuordnungstypen:

### Typ 1: Statisch Multi-Zone
**Geraet bedient IMMER mehrere Zonen/Subzonen gleichzeitig.**
Beispiel: Ein Luftbefeuchter steht zwischen Subzone A und B und befeuchtet beide. Ein Abluftventilator entlueftet zwei benachbarte Zonen.
- Konfiguration: `assigned_zones` oder `assigned_subzones` sind FEST gesetzt
- Es gibt keinen "aktiven Kontext" — das Geraet arbeitet immer fuer alle zugewiesenen Bereiche
- Sensordaten: `zone_id = NULL` (Messung gilt fuer alle assigned_zones) ODER Datensatz wird pro Zone dupliziert

### Typ 2: Dynamisch Sequenziell
**Geraet bedient Zonen NACHEINANDER — nur eine Zone zur gleichen Zeit.**
Beispiel: Duengerpumpe befuellt Zone A, dann Zone B, dann Zone C. pH/EC-Sensor misst waehrend der Dosierung fuer die aktuelle Zone.
- Konfiguration: `assigned_zones` definiert den SCOPE (welche Zonen das Geraet bedienen KANN)
- Runtime: `active_zone_id` zeigt an welche Zone GERADE bedient wird
- `active_zone_id` wechselt bei Stations-Sequenzierung oder manuell durch User
- Sensordaten: `zone_id = active_zone_id` zum Messzeitpunkt
- Safety: Nur eine Zone gleichzeitig (Mutex via ConflictManager — bereits vorhanden)

### Typ 3: Mobil
**Geraet wird physisch zwischen Zonen bewegt.**
Beispiel: Handmessgeraet fuer pH wird in Zone A gemessen, dann zu Zone B getragen.
- Konfiguration: `assigned_zones` definiert wo das Geraet eingesetzt werden DARF (optional — kann leer sein fuer "ueberall")
- Runtime: `active_zone_id` wird MANUELL gesetzt (User sagt: "Ich messe jetzt in Zone B")
- Sensordaten: `zone_id = active_zone_id` zum Messzeitpunkt
- Wichtig: Alte Messungen behalten ihre Zone — nur neue Messungen bekommen die neue Zone

---

## IST-Zustand

- `sensor_configs` und `actuator_configs` haben KEINE Felder fuer Multi-Zone-Zuordnung
- Jeder Sensor/Aktor gehoert implizit zur Zone seines ESPs (`esp_devices.zone_id`)
- `sensor_data` hat `zone_id` und `subzone_id` — werden bei Messzeitpunkt gesetzt (Phase 0.1, funktioniert)
- Logic Engine: `SensorConditionEvaluator` (in `src/services/logic/conditions/sensor_evaluator.py`) prueft `condition.subzone_id` gegen Trigger-Sensor-Daten `sensor_data.subzone_id` (Phase 2.4, funktioniert). Kein direktes `sensor.subzone_id === actuator.subzone_id` Matching.
- ConflictManager (in `src/services/logic/safety/conflict_manager.py`) verhindert parallelen Aktor-Zugriff. Key-Format: `esp_id:gpio` — aktuell NICHT zone-aware. Zone-Awareness muss in T13-R2 ergaenzt werden (z.B. Key-Format auf `esp_id:gpio:zone_id` erweitern).

---

## SOLL: Datenmodell-Erweiterung

### Neue Spalten auf `sensor_configs` und `actuator_configs`

```sql
ALTER TABLE sensor_configs ADD COLUMN device_scope VARCHAR DEFAULT 'zone_local';
ALTER TABLE sensor_configs ADD COLUMN assigned_zones JSONB DEFAULT '[]';
ALTER TABLE sensor_configs ADD COLUMN assigned_subzones JSONB DEFAULT '[]';

ALTER TABLE actuator_configs ADD COLUMN device_scope VARCHAR DEFAULT 'zone_local';
ALTER TABLE actuator_configs ADD COLUMN assigned_zones JSONB DEFAULT '[]';
ALTER TABLE actuator_configs ADD COLUMN assigned_subzones JSONB DEFAULT '[]';
```

**`device_scope` Werte:**

| Wert | Bedeutung | assigned_zones | active_context |
|------|-----------|---------------|----------------|
| `zone_local` | Gehoert zu genau einer Zone (Default, klassisches Verhalten) | Leer `[]` — Zone kommt vom ESP | Nicht noetig |
| `multi_zone` | Bedient mehrere Zonen (statisch oder sequenziell) | `["zone_a", "zone_b", "zone_c"]` | Optional: `active_zone_id` fuer sequenziell |
| `mobile` | Wird zwischen Zonen bewegt | Optional: erlaubte Zonen | `active_zone_id` = manuell gesetzt |

**Regeln:**
- `zone_local` ist Default — bestehende Geraete brauchen KEINE Aenderung
- `device_scope` ist auf Config-Level (Sensor/Aktor), NICHT auf Device-Level — ein ESP kann zone_local-Sensoren UND multi_zone-Sensoren gleichzeitig haben
- `assigned_zones` darf nur Zone-IDs enthalten die in `zones`-Tabelle existieren (Application-Level-Validierung im Service — kein echtes DB-FK moeglich auf JSONB-Array)
- `assigned_subzones` ist optional und nur relevant wenn statische Multi-Zone-Subzonen gemeint sind

### Neue Tabelle: `device_active_context`

Fuer dynamisch-sequenzielle und mobile Geraete braucht es einen Runtime-State der angibt welche Zone GERADE bedient wird.

```sql
CREATE TABLE device_active_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_type VARCHAR NOT NULL,         -- 'sensor' | 'actuator'
    config_id UUID NOT NULL,              -- FK auf sensor_configs.id ODER actuator_configs.id
    active_zone_id VARCHAR,               -- Welche Zone wird GERADE bedient (NULL = alle)
    active_subzone_id VARCHAR,            -- Optional: Welche Subzone
    context_source VARCHAR DEFAULT 'manual',  -- 'manual' | 'sequence' | 'mqtt'
    context_since TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(config_type, config_id)        -- Nur ein aktiver Kontext pro Config
);
```

**Nutzung:**
- Bei `multi_zone` + sequenziell: Logic Engine oder Stations-Queue setzt `active_zone_id` wenn eine neue Zone an der Reihe ist
- Bei `mobile`: User setzt `active_zone_id` manuell ueber API oder Frontend
- Bei `zone_local`: Kein Eintrag in dieser Tabelle noetig
- Bei `multi_zone` + statisch (gleichzeitig alle Zonen): `active_zone_id = NULL`

### Audit-Erweiterung: `device_zone_changes`

> **VORBEDINGUNG:** T13-R1 muss abgeschlossen sein — diese Tabelle wird DORT erstellt. Pruefen: `SELECT * FROM device_zone_changes LIMIT 1;` muss funktionieren.

Die in T13-R1 erstellte Audit-Tabelle wird um Multi-Zone-Events erweitert:

```sql
-- Ergaenzung um context_change-Typ
ALTER TABLE device_zone_changes ADD COLUMN change_type VARCHAR DEFAULT 'zone_switch';
-- Werte: 'zone_switch' (ESP wechselt Zone), 'context_change' (active_zone_id aendert sich),
--         'scope_change' (device_scope geaendert), 'zones_update' (assigned_zones geaendert)
```

---

## SOLL: Zone-Aufloesung — 3-Wege Erweiterung

> **IST-Code:** Die Zone-Aufloesung erfolgt in `src/utils/zone_subzone_resolver.py` via `resolve_zone_subzone_for_sensor(esp_id_str, gpio, esp_repo, subzone_repo)`. Diese Funktion wird von `sensor_handler.py` (Zeile ~200) aufgerufen. Zone kommt aus `esp_devices.zone_id` (server-seitig), Subzone aus `subzone_configs.assigned_gpios` via `SubzoneRepository.get_subzone_by_gpio()`.

Die bestehende `resolve_zone_subzone_for_sensor()` in `zone_subzone_resolver.py` muss um die 3-Wege-Logik erweitert werden. Zusaetzlich braucht sie Zugriff auf `sensor_config.device_scope` und den neuen `DeviceActiveContextRepository`.

```python
# Erweiterung von zone_subzone_resolver.py — resolve_zone_subzone_for_sensor()

async def resolve_zone_subzone_for_sensor(
    esp_id_str: str,
    gpio: int,
    esp_repo: ESPRepository,
    subzone_repo: SubzoneRepository,
    sensor_config: Optional[SensorConfig] = None,  # NEU
    context_repo: Optional[DeviceActiveContextRepository] = None,  # NEU
) -> tuple[Optional[str], Optional[str]]:
    """
    Bestimmt zone_id und subzone_id fuer eine neue Messung.
    Erweitert um device_scope-Logik (T13-R2).
    """
    # Default: zone_local (bestehendes Verhalten)
    scope = getattr(sensor_config, 'device_scope', 'zone_local') if sensor_config else 'zone_local'

    if scope == 'zone_local':
        # Bestehendes Verhalten: Zone aus esp_devices.zone_id
        esp_device = await esp_repo.get_by_device_id(esp_id_str)
        zone_id = esp_device.zone_id if esp_device else None
        subzone = await subzone_repo.get_subzone_by_gpio(esp_id_str, gpio)
        subzone_id = subzone.subzone_id if subzone else None
        return zone_id, subzone_id

    elif scope == 'multi_zone':
        # Multi-Zone: Aktiven Kontext abfragen
        context = await context_repo.get_active_context(
            config_type='sensor', config_id=sensor_config.id
        ) if context_repo else None
        if context and context.active_zone_id:
            return context.active_zone_id, context.active_subzone_id
        else:
            # Statisch (alle Zonen gleichzeitig): zone_id = NULL
            return None, None

    elif scope == 'mobile':
        # Mobil: Manuell gesetzten Kontext nehmen
        context = await context_repo.get_active_context(
            config_type='sensor', config_id=sensor_config.id
        ) if context_repo else None
        if context and context.active_zone_id:
            return context.active_zone_id, context.active_subzone_id
        else:
            # Fallback auf ESP-Zone + Warning
            esp_device = await esp_repo.get_by_device_id(esp_id_str)
            zone_id = esp_device.zone_id if esp_device else None
            subzone = await subzone_repo.get_subzone_by_gpio(esp_id_str, gpio)
            subzone_id = subzone.subzone_id if subzone else None
            logger.warning(
                "Mobile sensor %s ohne active_context — Fallback auf ESP-Zone",
                sensor_config.id
            )
            return zone_id, subzone_id
```

**Wichtig:**
- `zone_local` bleibt 100% kompatibel — bestehende Signatur mit optionalen Parametern, kein Breaking Change
- `get_active_context()` muss performant sein (gecachte Abfrage, nicht bei jeder Messung DB-Query)
- Cache-Strategie: In-Memory-Dict mit TTL im `DeviceScopeService` (NICHT in `simulation_config` — das ist ein Mock-ESP-Simulationsmechanismus in `device_metadata`, kein allgemeiner Config-Cache). Es gibt aktuell KEINEN Config-Cache im System; dieser muss NEU implementiert werden (z.B. `dict[UUID, DeviceActiveContext]` mit 30s TTL, Invalidierung bei Context-Update).

---

## SOLL: API-Endpoints

### Config-Erweiterung (bestehende Endpoints anpassen)

> **Betroffene Dateien:** `src/api/v1/sensors.py` (POST /{esp_id}/{gpio}), `src/schemas/sensor.py` (`SensorConfigCreate`, `SensorConfigUpdate`, `SensorConfigResponse`), `src/api/v1/actuators.py` (analog), `src/schemas/actuator.py` (analog)

```
POST /api/v1/sensors/{esp_id}/{gpio}
{
  "sensor_type": "ph",
  "sensor_name": "pH Mischbehaelter",
  "device_scope": "multi_zone",           // NEU — Pydantic-Feld in SensorConfigCreate
  "assigned_zones": ["zone_a", "zone_b"], // NEU — Pydantic-Feld in SensorConfigCreate
  "assigned_subzones": []                  // NEU — Pydantic-Feld in SensorConfigCreate
}
```

- `device_scope` ist optional, Default: `zone_local`
- Bei `multi_zone`/`mobile`: `assigned_zones` validieren (Application-Level im Service, KEIN DB-FK moeglich auf JSONB)
- Bei `zone_local`: `assigned_zones` wird ignoriert
- Pydantic-Schemas (`SensorConfigCreate`, `SensorConfigUpdate`, `SensorConfigResponse`) muessen um die 3 Felder erweitert werden

### Active Context Management (NEUE Endpoints)

> **Router-Entscheidung:** Es gibt KEINEN bestehenden `/api/v1/devices/` Router. Optionen:
> - **Option A (empfohlen):** Neuen Router `src/api/v1/device_context.py` mit Prefix `/device-context/` erstellen und in `main.py` registrieren
> - **Option B:** In bestehenden `src/api/v1/zone.py` Router integrieren (Prefix: `/zone/`)
> - **Option C:** In `src/api/v1/esp.py` Router integrieren (Prefix: `/esp/`)

```
# Aktiven Kontext setzen (fuer sequenziell oder mobil)
PUT /api/v1/device-context/{config_type}/{config_id}
{
  "active_zone_id": "zone_b",
  "active_subzone_id": null,       // optional
  "context_source": "manual"       // "manual" | "sequence"
}
→ 200 OK, context updated

# Aktiven Kontext abfragen
GET /api/v1/device-context/{config_type}/{config_id}
→ { "active_zone_id": "zone_b", "context_since": "2026-03-09T14:30:00Z" }

# Aktiven Kontext loeschen (zurueck zu Default/Fallback)
DELETE /api/v1/device-context/{config_type}/{config_id}
→ 200 OK, context cleared
```

**Validierung:**
- `active_zone_id` muss in `assigned_zones` des Sensors/Aktors enthalten sein (wenn assigned_zones nicht leer)
- Bei `zone_local` Devices: Context-Endpoints geben 400 zurueck ("Device ist zone_local")
- `config_type` validieren: nur `sensor` oder `actuator` erlaubt

### Abfrage-Endpoints fuer Multi-Zone-Sensordaten

> **IST:** `GET /api/v1/sensors/data` (in `src/api/v1/sensors.py:1106`) hat BEREITS `zone_id` und `subzone_id` Query-Parameter (Phase 0.1). Filter nach `esp_id`, `gpio`, `sensor_type`, `start_time`, `end_time`, `quality`, `zone_id`, `subzone_id`, `limit`. Aber: KEIN `sensor_config_id` Filter vorhanden — muss ergaenzt werden.

```
# Sensordaten eines multi_zone Sensors, gefiltert nach Zone (zone_id existiert bereits)
GET /api/v1/sensors/data?sensor_config_id={id}&zone_id=zone_a&start_time=...&end_time=...
→ Nur Messungen die zone_id=zone_a haben
→ sensor_config_id ist NEU und muss als Query-Parameter hinzugefuegt werden

# Sensordaten eines multi_zone Sensors, ALLE Zonen
GET /api/v1/sensors/data?sensor_config_id={id}&limit=100
→ Alle Messungen, jede mit ihrer zone_id
```

> **Hinweis:** `hours` ist KEIN existierender Parameter — stattdessen `start_time` und `end_time` (datetime). Fuer Convenience koennte `hours` als Shortcut ergaenzt werden.

---

## SOLL: Logic Engine Anpassung (minimal)

Die Logic Engine muss Multi-Zone-Geraete bei der Condition-Evaluation beruecksichtigen:

### Condition-Matching erweitert

> **Datei:** `src/services/logic/conditions/sensor_evaluator.py`

**IST:** `SensorConditionEvaluator` prueft optionales `condition["subzone_id"]` gegen `sensor_data.subzone_id` aus dem Trigger-Kontext (Phase 2.4). Cross-ESP-Referenzen via `context["sensor_values"]`.

**SOLL (Ergaenzung):**
- Wenn Sensor `device_scope == 'multi_zone'`: Condition matched wenn `active_zone_id` (aus `device_active_context`) zur `condition["zone_id"]` passt. Neues optionales Feld `condition["zone_id"]` einfuehren.
- Wenn Sensor `device_scope == 'mobile'`: Condition matched wenn `active_zone_id` zur `condition["zone_id"]` passt
- Wenn Sensor `device_scope == 'zone_local'`: Keine Aenderung (bestehendes Verhalten)

### Action-Matching erweitert

**IST:** Action triggert Aktor direkt.

**SOLL (Ergaenzung):**
- Wenn Aktor `device_scope == 'multi_zone'`: Action wird nur ausgefuehrt wenn Zielzone in `assigned_zones` des Aktors enthalten ist
- ConflictManager (in `src/services/logic/safety/conflict_manager.py`) prueft: Ist der Aktor gerade fuer eine andere Zone aktiv? Wenn ja → Queue oder Reject
- **Erweiterung noetig:** ConflictManager Key-Format aktuell `esp_id:gpio` muss um Zone erweitert werden (z.B. `esp_id:gpio:zone_id`). Strategien `HIGHER_PRIORITY_WINS`, `FIRST_WINS`, `SAFETY_WINS`, `BLOCKED` bleiben, aber Lock-Metadata muss `active_zone_id` enthalten.
- Bei sequenziellen Aktoren (Pumpe): ConflictManager-Mutex stellt sicher dass nur eine Zone gleichzeitig die Pumpe nutzt (Lock-TTL aktuell 60s)
- **Scheduling-Hintergrund:** Das Mutex-Pattern fuer shared Aktoren entspricht dem klassischen Resource-Locking aus der Betriebssystem-Theorie (Semaphore/Mutex). Die Strategien `HIGHER_PRIORITY_WINS`, `FIRST_WINS`, `SAFETY_WINS` sind direkte Adaptionen von Priority-basierten Scheduling-Algorithmen. In professionellen Fertigation-Systemen wird dieses Muster als "Station Sequencing" realisiert — nur ein Zonenventil gleichzeitig offen, Zonen werden in programmierter Reihenfolge abgearbeitet. AutomationOne implementiert das durch den bestehenden ConflictManager, der jetzt um Zone-Awareness erweitert wird.

---

## SOLL: WebSocket-Events

> **IST-System:** WebSocket-Events werden via `ws_manager.broadcast(message_type, data)` (async) oder `ws_manager.broadcast_threadsafe(message_type, data)` (aus MQTT-Threads) gesendet. Event-Typen nutzen `snake_case` (z.B. `sensor_data`, `zone_assignment`), KEINE Doppelpunkt-Notation. Message-Format: `{"type": "...", "timestamp": unix_ts, "data": {...}}`. Definiert in `src/websocket/manager.py`.

Neue Events fuer Echtzeit-Updates im Frontend:

```python
# Wenn sich der aktive Kontext eines Geraets aendert
await ws_manager.broadcast("device_context_changed", {
    "config_type": "sensor",       # "sensor" | "actuator"
    "config_id": "uuid-...",
    "active_zone_id": "zone_b",
    "active_subzone_id": None,
    "context_source": "manual"     # "manual" | "sequence"
})

# Wenn device_scope oder assigned_zones geaendert werden
await ws_manager.broadcast("device_scope_changed", {
    "config_type": "sensor",
    "config_id": "uuid-...",
    "device_scope": "multi_zone",
    "assigned_zones": ["zone_a", "zone_b"]
})
```

> **Frontend-Integration:** `src/types/websocket-events.ts` muss um die neuen Event-Typen erweitert werden. `esp.ts` Store braucht Handler fuer `device_context_changed` und `device_scope_changed` (kommt in T13-R3).

---

## Implementierungsplan

### Phase 1: Datenmodell (Alembic-Migration)

1. `device_scope` + `assigned_zones` + `assigned_subzones` auf `sensor_configs` und `actuator_configs`
2. `device_active_context` Tabelle erstellen
3. `device_zone_changes` um `change_type` erweitern (wenn nicht in T13-R1 geschehen)
4. Migration testen: Alle bestehenden Configs bekommen `device_scope='zone_local'`, `assigned_zones='[]'`

### Phase 2: Backend-Services

> **Betroffene Dateien:** Neuer Service `src/services/device_scope_service.py`, neues Repository `src/db/repositories/device_context_repo.py`, Erweiterung von `src/utils/zone_subzone_resolver.py`, Erweiterung von `src/mqtt/handlers/sensor_handler.py`

1. `DeviceScopeService` erstellen (in `src/services/device_scope_service.py`):
   - `set_device_scope(config_type, config_id, scope, assigned_zones)`
   - `set_active_context(config_type, config_id, zone_id, subzone_id, source)`
   - `get_active_context(config_type, config_id)` mit In-Memory-Cache (dict mit TTL)
   - Validierung: assigned_zones muessen in `zones`-Tabelle existieren (via `ZoneRepository`), active_zone muss in assigned_zones sein
2. `DeviceActiveContextRepository` erstellen (in `src/db/repositories/device_context_repo.py`) — CRUD fuer `device_active_context` Tabelle
3. `resolve_zone_subzone_for_sensor()` in `zone_subzone_resolver.py` um 3-Wege-Logik erweitern (zone_local/multi_zone/mobile) — siehe Pseudocode oben
4. In-Memory-Cache fuer `device_active_context` im `DeviceScopeService` implementieren (NICHT in `simulation_config` — das ist ein Mock-ESP-Simulationsmechanismus, kein Cache)

### Phase 3: API-Endpoints

> **Betroffene Dateien:** `src/api/v1/sensors.py`, `src/api/v1/actuators.py`, `src/schemas/sensor.py`, `src/schemas/actuator.py`, neuer Router `src/api/v1/device_context.py`, `src/main.py` (Router-Registrierung)

1. Bestehende Sensor/Aktor-CRUD-Endpoints um `device_scope` und `assigned_zones` erweitern (Pydantic-Schemas: `SensorConfigCreate`, `SensorConfigUpdate`, `SensorConfigResponse`, analog fuer Actuator)
2. Neuen Router `device_context.py` erstellen und in `main.py` registrieren (`PUT/GET/DELETE /api/v1/device-context/{config_type}/{config_id}`)
3. Sensor-Daten-Abfrage: `sensor_config_id` als neuen Query-Parameter hinzufuegen (`zone_id` Filter existiert BEREITS seit Phase 0.1)
4. Validierung und Error-Handling (Pydantic-Validators fuer `device_scope` Enum, `assigned_zones` Liste)

### Phase 4: Logic Engine + WebSocket

> **Betroffene Dateien:** `src/services/logic/conditions/sensor_evaluator.py`, `src/services/logic_engine.py`, `src/services/logic/safety/conflict_manager.py`, `src/websocket/manager.py`

1. `SensorConditionEvaluator` um Multi-Zone-Matching erweitern (neues optionales `condition["zone_id"]` Feld)
2. Action-Execution um Zone-Scope-Pruefung erweitern (`assigned_zones` Check vor Aktor-Command)
3. ConflictManager um Zone-Awareness erweitern (Key-Format: `esp_id:gpio` → `esp_id:gpio:zone_id`, Lock-Metadata um `active_zone_id`)
4. WebSocket-Events: `device_context_changed` und `device_scope_changed` via `ws_manager.broadcast()` senden (Event-Typ-Registrierung in `websocket-events.ts` kommt in T13-R3)

### Phase 5: Tests

1. Unit-Tests fuer `DeviceScopeService` (scope setzen, context setzen, validierung)
2. Unit-Tests fuer sensor_handler 3-Wege-Logik
3. Integration-Tests: Multi-Zone-Sensor erzeugen, Context setzen, Messung empfangen, zone_id pruefen
4. Integration-Tests: Logic Engine Rule mit Multi-Zone-Aktor

---

## Akzeptanzkriterien

- [ ] `device_scope` Spalte auf sensor_configs und actuator_configs (Default: 'zone_local')
- [ ] `assigned_zones` JSONB-Spalte mit Application-Level-Validierung gegen zones-Tabelle (kein DB-FK auf JSONB)
- [ ] `device_active_context` Tabelle mit UNIQUE-Constraint
- [ ] Bestehende zone_local Sensoren funktionieren EXAKT wie bisher (keine Regression)
- [ ] Multi-Zone-Sensor: Messdaten bekommen `zone_id` aus `active_context` (nicht ESP-Zone)
- [ ] Mobile-Sensor: Fallback auf ESP-Zone wenn kein active_context gesetzt + Warning-Log
- [ ] Context-API Endpoints funktionieren (PUT/GET/DELETE)
- [ ] Validierung: active_zone_id muss in assigned_zones sein (wenn nicht leer)
- [ ] Logic Engine matched Multi-Zone-Sensoren korrekt (active_zone muss zur Regel passen)
- [ ] ConflictManager verhindert parallelen Zugriff auf sequenzielle Aktoren
- [ ] WebSocket-Events `device_context_changed` und `device_scope_changed` werden via `ws_manager.broadcast()` gesendet
- [ ] Audit-Trail: Jede Scope-Aenderung und Context-Aenderung wird protokolliert
- [ ] Alle bestehenden Tests laufen gruen
- [ ] Neue Tests: mind. 15 Tests fuer Scope, Context, Routing, Logic Engine

---

## Testszenarien

| Szenario | Erwartung |
|----------|-----------|
| zone_local Sensor: Messung empfangen | zone_id = ESP-Zone (keine Aenderung) |
| multi_zone Sensor ohne active_context: Messung | zone_id = NULL (gilt fuer alle) |
| multi_zone Sensor mit active_context=zone_b: Messung | zone_id = zone_b |
| active_context auf Zone setzen die nicht in assigned_zones | HTTP 400 Fehler |
| mobile Sensor ohne active_context: Messung | zone_id = ESP-Zone + Warning-Log |
| mobile Sensor mit active_context=zone_c: Messung | zone_id = zone_c |
| Context wechseln: zone_a → zone_b | Alte Messungen bleiben zone_a, neue zone_b |
| Logic Rule: "Wenn pH < 5.5 (multi_zone, active=zone_a)" | Rule feuert NUR fuer zone_a Kontext |
| Zwei Zonen wollen gleichzeitig shared Pumpe nutzen | ConflictManager blockiert zweite |
| device_scope von zone_local auf multi_zone aendern | Audit-Eintrag, assigned_zones erforderlich |

---

## Vorbedingungen (T13-R1 muss VORHER abgeschlossen sein)

- [ ] `zones`-Tabelle hat `status`-Spalte (`active`, `archived`, `deleted`) und `deleted_at`
- [ ] `esp_devices.zone_id` ist FK auf `zones.zone_id`
- [ ] `device_zone_changes` Audit-Tabelle existiert
- [ ] Subzone-Orphaning bei Zone-Wechsel ist gefixt
- [ ] Alembic-Migration fuer `subzone_configs.last_ack_at` timezone ist angewendet

**Check:** `SELECT * FROM device_zone_changes LIMIT 1;` und `SELECT status FROM zones LIMIT 1;` muessen ohne Error laufen.

---

## Datei-Referenz (betroffene Dateien, vollstaendige Pfade)

> Alle Pfade relativ zu `El Servador/god_kaiser_server/`

### Neue Dateien (zu erstellen)

| Datei | Zweck |
|-------|-------|
| `src/services/device_scope_service.py` | DeviceScopeService mit Cache |
| `src/db/repositories/device_context_repo.py` | CRUD fuer device_active_context |
| `src/db/models/device_context.py` | SQLAlchemy Model fuer device_active_context |
| `src/api/v1/device_context.py` | REST-Router fuer Context-Endpoints |
| `src/schemas/device_context.py` | Pydantic-Schemas fuer Context-API |
| `alembic/versions/add_device_scope_and_context.py` | Alembic-Migration |
| `tests/unit/test_device_scope_service.py` | Unit-Tests DeviceScopeService |
| `tests/unit/test_zone_resolver_multi_zone.py` | Unit-Tests 3-Wege-Resolver |
| `tests/integration/test_multi_zone_sensor_flow.py` | Integration-Tests |

### Bestehende Dateien (zu erweitern)

| Datei | Aenderung |
|-------|-----------|
| `src/db/models/sensor.py` | `device_scope`, `assigned_zones`, `assigned_subzones` Spalten |
| `src/db/models/actuator.py` | `device_scope`, `assigned_zones`, `assigned_subzones` Spalten |
| `src/schemas/sensor.py` | `SensorConfigCreate/Update/Response` um 3 Felder |
| `src/schemas/actuator.py` | `ActuatorConfigCreate/Update/Response` um 3 Felder |
| `src/utils/zone_subzone_resolver.py` | 3-Wege-Logik in `resolve_zone_subzone_for_sensor()` |
| `src/mqtt/handlers/sensor_handler.py` | `sensor_config` und `context_repo` an Resolver weiterreichen |
| `src/services/logic/conditions/sensor_evaluator.py` | Multi-Zone condition matching |
| `src/services/logic/safety/conflict_manager.py` | Zone-aware Key-Format |
| `src/api/v1/sensors.py` | `sensor_config_id` Query-Parameter in `query_sensor_data()` |
| `src/main.py` | Neuen Router `device_context` registrieren |
| `src/db/models/__init__.py` | DeviceActiveContext Model importieren |
