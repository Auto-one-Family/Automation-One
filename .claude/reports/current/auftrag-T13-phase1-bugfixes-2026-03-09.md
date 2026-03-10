# Auftrag T13-Phase1: 4 Bug-Fixes aus Post-Implementation-Verifikation

> **Bezug:** T13-Verifikationsbericht (55/55 Akzeptanzkriterien PASS, 4 Bugs identifiziert)
> **Prioritaet:** HOCH — Muss VOR Phase 2 (MQTT Hardening) und Phase 4 (Frontend T13-R3) erledigt sein
> **Geschaetzter Umfang:** ~2-3 Stunden
> **Datum:** 2026-03-09
> **[VERIFY-PLAN 2026-03-09]:** ALLE 4 Bugs sind im aktuellen Working Directory BEREITS GEFIXT (uncommitted T13-Changes). Der Verifikationsbericht (T13-verification-report) analysierte einen frueheren Code-Stand. Nur BUG-03 hat ein Restproblem (ANDERES als hier beschrieben). Auftrag in dieser Form NICHT ausfuehrbar — Details: [KORREKTUR] Marker pro Bug.

---

## Ziel

T13-R1 (Zone-Konsolidierung) und T13-R2 (Multi-Zone Device-Scope) sind serverseitig implementiert. Bei der Post-Implementation-Analyse wurden 4 Bugs gefunden die behoben werden muessen bevor das Frontend (T13-R3) oder MQTT-Hardening (Phase 2) beginnt.

**Reihenfolge der Fixes (nach Schweregrad):**

1. **BUG-02 (HIGH):** `remove_zone()` loescht alle Subzones der Zone statt nur die des betroffenen ESP
2. **BUG-01 (MEDIUM):** device_context Router fehlt `/v1/` Prefix — API-URL stimmt nicht
3. **BUG-04 (LOW):** `subzone_strategy` wird nicht validiert — Tippfehler werden verschluckt
4. **BUG-03 (LOW):** Copy-Strategie erzeugt `_copy_copy` bei wiederholtem Kopieren

---

## Was NICHT gemacht wird

- Keine MQTTCommandBridge oder ACK-Wait-Logik (kommt in Phase 2)
- Keine Pending-State-Implementierung (kommt in Phase 2.4)
- Keine Frontend-Aenderungen (kommt in T13-R3)
- Keine Aenderungen an `heartbeat_handler.py` (kommt in Phase 2.4 + 3.1)
- Keine Aenderungen an `sensor_handler.py` (kommt in Phase 3.2)
- Keine neuen Dateien — nur bestehende Dateien korrigieren
- Keine Logic-Engine-Aenderungen
- Keine Firmware-Aenderungen

---

## BUG-02: `remove_zone()` Cascade loescht ALLE Subzones der Zone (HIGH)

> **[BEREITS GEFIXT]** `zone_service.py:265-268` nutzt bereits `subzone_repo.delete_all_by_esp(device_id)`, NICHT `delete_all_by_zone()`. Die Methode `delete_all_by_esp()` existiert in `subzone_repo.py:279-296`. Kommentar im Code: *"Cascade-delete subzones for THIS device only (other devices in the same zone keep their subzones)"*. **Kein Fix noetig.**

### Kontext

Wenn ein ESP aus einer Zone entfernt wird (z.B. bei Zone-Wechsel oder Zone-Removal), ruft `zone_service.py` die Methode `remove_zone()` auf. Diese Methode soll die Subzones des betroffenen ESP bereinigen. Das Problem: Sie loescht ALLE Subzones der gesamten Zone — auch die anderer ESPs.

### Warum das kritisch ist

AutomationOne erlaubt mehrere ESPs in einer Zone. Beispiel: Zone "Gewaechshaus_A" hat ESP-1 (Temperatur, Luftfeuchte) und ESP-2 (pH, EC). Wenn ESP-1 die Zone wechselt, werden auch die Subzones von ESP-2 geloescht — obwohl ESP-2 noch in der Zone bleibt. Das zerstoert die Subzone-Konfiguration unbeteiligter Geraete.

### IST-Verhalten

**Datei:** `src/services/zone_service.py` — Methode `remove_zone()`

Der relevante Aufruf:
```python
subzone_repo.delete_all_by_zone(old_zone_id)
```

Das loescht ALLE Eintraege in `subzone_configs` wo `parent_zone_id == old_zone_id`. Das betrifft Subzones ALLER ESPs in dieser Zone, nicht nur die des ESP der gerade entfernt wird.

### SOLL-Verhalten

**Nur die Subzones des betroffenen ESP loeschen.** Das betrifft den ESP der die Zone verliert — die Subzones aller anderen ESPs in derselben Zone muessen unangetastet bleiben.

### Umsetzung

**Schritt 1:** In `remove_zone()` den Aufruf aendern:

```python
# ALT (FALSCH — loescht alle Subzones der Zone):
subzone_repo.delete_all_by_zone(old_zone_id)

# NEU (KORREKT — loescht nur Subzones des betroffenen ESP):
subzone_repo.delete_all_by_esp(device_id)
```

**Wichtig — FK-Inkonsistenz beachten:** `subzone_configs.esp_id` ist ein String-Feld das auf `esp_devices.device_id` (String) zeigt — NICHT auf `esp_devices.id` (UUID). Das ist eine bekannte Inkonsistenz im Schema (`sensor_configs.esp_id` ist dagegen eine UUID). Daher muss `delete_all_by_esp()` den `device_id`-String verwenden, nicht die UUID.

**Schritt 2:** Falls `subzone_repo.delete_all_by_esp(device_id)` noch nicht existiert, anlegen:

```python
# In src/db/repositories/subzone_repo.py
async def delete_all_by_esp(self, device_id: str) -> int:
    """Delete all subzone_configs for a specific ESP device.

    Args:
        device_id: The string device_id (NOT the UUID id) of the ESP.

    Returns:
        Number of deleted subzone configs.
    """
    result = await self.session.execute(
        delete(SubzoneConfig).where(SubzoneConfig.esp_id == device_id)
    )
    await self.session.flush()
    return result.rowcount
```

**Schritt 3:** Pruefen ob `remove_zone()` den `device_id` (String) verfuegbar hat. Die Methode bekommt typischerweise `esp_id` als Parameter — pruefen ob das die UUID oder der device_id-String ist. Falls es die UUID ist: `esp_repo.get(esp_id)` aufrufen und `.device_id` verwenden.

### Akzeptanzkriterien

- [ ] Zone mit 2 ESPs: ESP-1 verliert Zone → nur Subzones von ESP-1 werden geloescht
- [ ] Subzones von ESP-2 (selbe Zone) bleiben vollstaendig erhalten
- [ ] `delete_all_by_esp()` nutzt `device_id` (String), nicht UUID
- [ ] Bestehende Tests fuer `remove_zone()` bleiben gruen
- [ ] Neuer Test: Zone mit 2 ESPs, remove_zone fuer ESP-1, Subzones ESP-2 pruefen

---

## BUG-01: device_context Router fehlt `/v1/` Prefix (MEDIUM)

> **[BEREITS GEFIXT]** `device_context.py:24-28` hat bereits `prefix="/v1/device-context"`. `api_v1_router` in `__init__.py:46` hat KEIN globales Prefix (`APIRouter()` ohne Argument). Alle 28 Router definieren `/v1/` jeweils selbst im eigenen Prefix (geprueft via grep). **Kein Fix noetig.**

### Kontext

Alle API-Router in AutomationOne folgen einem einheitlichen URL-Schema: `/api/v1/<resource>`. Der neue `device_context`-Router (erstellt in T13-R2 fuer Multi-Zone active_context-Verwaltung) weicht davon ab — sein Prefix enthalt kein `/v1/`.

### Warum das wichtig ist

Das Frontend (T13-R3) wird die device-context-API nutzen um `active_zone_id` fuer Multi-Zone-Sensoren/Aktoren zu setzen. Wenn die URL jetzt `/api/device-context/...` ist und spaeter auf `/api/v1/device-context/...` korrigiert wird, muesste das Frontend nachgezogen werden. Den Prefix jetzt korrigieren verhindert Breaking Changes.

### IST-Verhalten

**Datei:** `src/api/v1/device_context.py` — Zeile ~24

```python
router = APIRouter(prefix="/device-context", tags=["device-context"])
```

**Resultierende URL:** `GET/PUT/DELETE /api/device-context/{config_type}/{config_id}`

Alle anderen Router haben `/v1/` im Prefix:
- `zone.py`: `prefix="/v1/zone"`
- `zones.py`: `prefix="/v1/zones"`
- `sensors.py`: `prefix="/v1/sensors"`
- `actuators.py`: `prefix="/v1/actuators"`

### SOLL-Verhalten

**Datei:** `src/api/v1/device_context.py` — Zeile ~24

```python
router = APIRouter(prefix="/v1/device-context", tags=["device-context"])
```

**Resultierende URL:** `GET/PUT/DELETE /api/v1/device-context/{config_type}/{config_id}`

### Umsetzung

Einzeilige Aenderung:
```python
# ALT:
router = APIRouter(prefix="/device-context", tags=["device-context"])

# NEU:
router = APIRouter(prefix="/v1/device-context", tags=["device-context"])
```

**Pruefen:** `src/api/v1/__init__.py` wo der Router registriert wird (`api_v1_router.include_router(device_context_router)`). Falls `api_v1_router` bereits ein globales `/v1/`-Prefix hat, wuerde die Aenderung zu `/v1/v1/device-context` fuehren. In dem Fall stattdessen nur `prefix="/device-context"` belassen und sicherstellen dass das globale Prefix greift.

**Konkret pruefen:** Wie sind die anderen Router registriert? Wenn `zone.py` `prefix="/v1/zone"` hat und trotzdem unter `/api/v1/zone/...` erreichbar ist, dann hat `api_v1_router` KEIN zusaetzliches `/v1/`-Prefix — und die Aenderung zu `prefix="/v1/device-context"` ist korrekt. Wenn `api_v1_router` ein `/v1/`-Prefix hat, dann haben die anderen Router das redundant im eigenen Prefix stehen — und `device_context.py` muss auch `prefix="/v1/device-context"` haben um konsistent zu sein.

### Akzeptanzkriterien

- [ ] `PUT /api/v1/device-context/sensor/{config_id}` ist erreichbar und gibt 200 zurueck
- [ ] `GET /api/v1/device-context/sensor/{config_id}` ist erreichbar
- [ ] `DELETE /api/v1/device-context/sensor/{config_id}` ist erreichbar
- [ ] Alte URL `/api/device-context/...` gibt 404 zurueck (kein Redirect)
- [ ] URL-Prefix ist konsistent mit allen anderen Routern (`/v1/` vorhanden)

---

## BUG-04: `subzone_strategy` wird nicht validiert (LOW)

> **[BEREITS GEFIXT]** Beide Stellen bereits implementiert: (1) `zone.py:84-91` hat `@field_validator("subzone_strategy")` mit Pruefung gegen `{"transfer", "copy", "reset"}` → gibt 422 bei ungueltigem Wert, (2) `zone_service.py:471-475` hat `else`-Zweig mit `raise ValueError(f"Unknown subzone_strategy '{strategy}'...")`. **Kein Fix noetig.**

### Kontext

Bei Zone-Wechsel (POST `/v1/zone/devices/{esp_id}/assign`) kann ein `subzone_strategy`-Parameter mitgegeben werden. Dieser bestimmt was mit den Subzones des ESP passiert wenn sich die Zone aendert:

- **"transfer"**: Subzones wandern in die neue Zone mit (parent_zone_id wird aktualisiert)
- **"copy"**: Subzones werden in die neue Zone kopiert, Originale bleiben in der alten Zone
- **"reset"**: Subzones bleiben verwaist in der alten Zone, ESP startet ohne Subzones in der neuen Zone

Das Problem: Wenn ein ungueltiger Wert (z.B. `"transferr"` als Tippfehler, oder `"merge"` als nicht-existierende Strategie) uebergeben wird, gibt die Funktion stillschweigend eine leere Liste zurueck — dasselbe Verhalten wie "reset". Der Aufrufer bekommt keinen Fehler und denkt die Subzones wurden transferiert, obwohl nichts passiert ist.

### IST-Verhalten

**Datei:** `src/services/zone_service.py` — Methode `_handle_subzone_strategy()`

Bei unbekanntem Strategy-Wert:
```python
# Pseudo-Logik (IST):
if strategy == "transfer":
    # ... transfer logic
elif strategy == "copy":
    # ... copy logic
# Kein else-Zweig mit Error — bei "transferr", "merge" etc. passiert NICHTS
return affected  # Leere Liste
```

**Datei:** `src/schemas/zone.py` — `ZoneAssignRequest`

```python
subzone_strategy: str  # Akzeptiert jeden beliebigen String
```

### SOLL-Verhalten

Ungueltige Strategy-Werte muessen abgelehnt werden — entweder auf Schema-Ebene (Pydantic, bevorzugt) oder in der Service-Methode.

### Umsetzung (2 Stellen)

**Stelle 1 (bevorzugt): Schema-Validierung in `src/schemas/zone.py`**

```python
# ALT:
subzone_strategy: str = "transfer"

# NEU:
from typing import Literal
subzone_strategy: Literal["transfer", "copy", "reset"] = "transfer"
```

Pydantic gibt automatisch einen 422-Fehler mit klarer Fehlermeldung zurueck wenn ein ungueltiger Wert uebergeben wird. Das ist die sauberste Loesung weil der Fehler am API-Eingang abgefangen wird — bevor ueberhaupt Service-Logik laeuft.

**Stelle 2 (Defense-in-Depth): Service-Validierung in `src/services/zone_service.py`**

In `_handle_subzone_strategy()` einen expliziten else-Zweig ergaenzen:

```python
# Am Ende der if/elif-Kette:
else:
    raise ValueError(f"Unknown subzone_strategy: '{strategy}'. Must be 'transfer', 'copy', or 'reset'.")
```

Das ist Defense-in-Depth — falls die Methode jemals intern (ohne API-Schema-Validierung) aufgerufen wird, faengt die Service-Schicht den Fehler trotzdem ab.

### Akzeptanzkriterien

- [ ] `POST /v1/zone/devices/{esp_id}/assign` mit `subzone_strategy: "transferr"` gibt HTTP 422 zurueck
- [ ] `POST /v1/zone/devices/{esp_id}/assign` mit `subzone_strategy: "merge"` gibt HTTP 422 zurueck
- [ ] `POST /v1/zone/devices/{esp_id}/assign` mit `subzone_strategy: "transfer"` funktioniert weiterhin
- [ ] `POST /v1/zone/devices/{esp_id}/assign` mit `subzone_strategy: "copy"` funktioniert weiterhin
- [ ] `POST /v1/zone/devices/{esp_id}/assign` mit `subzone_strategy: "reset"` funktioniert weiterhin
- [ ] Default-Wert bleibt `"transfer"` (wenn kein Strategy angegeben)
- [ ] `_handle_subzone_strategy()` hat einen else-Zweig mit `ValueError`

---

## BUG-03: Copy-Strategie erzeugt `_copy_copy` bei wiederholtem Kopieren (LOW)

> **[TEILWEISE GEFIXT — IST-Beschreibung FALSCH]** `zone_service.py:433-434` enthaelt bereits `_copy`-Stripping: `base_id = re.sub(r"(_copy)+$", "", sz.subzone_id)`. Es entstehen KEINE `_copy_copy_copy`-Ketten. **Restproblem (anders als beschrieben):** (1) Wiederholtes Kopieren erzeugt immer `{base_id}_copy` → bei 2. Copy-Operation fuer denselben ESP kollidiert die ID mit der UniqueConstraint `(esp_id, subzone_id)` und wirft IntegrityError. (2) `get_by_esp(device_id)` (Zeile 409) holt ALLE Subzones des ESP (auch aus frueheren Zonen), statt nur die aus `old_zone_id` zu filtern — bei Copy werden Subzones aus unbeteiligten Zonen mitkopiert. Vorgeschlagener Fix (Counter) adressiert Problem 1 korrekt. Problem 2 braucht zusaetzlich einen Zone-Filter: `subzones = [sz for sz in subzones if sz.parent_zone_id == old_zone_id]`.

### Kontext

Die Copy-Strategie erstellt eine Kopie jeder Subzone in der neuen Zone. Der Name der Kopie wird durch Anfuegen von `_copy` an die Original-`subzone_id` gebildet. Bei wiederholtem Kopieren (z.B. ESP wechselt Zone A→B, dann B→C) werden die Subzones der Kopien erneut kopiert — und die IDs wachsen: `subzone_a` → `subzone_a_copy` → `subzone_a_copy_copy` → `subzone_a_copy_copy_copy`.

### Warum das problematisch ist

1. **IDs werden unlesbar lang** — in UIs und Logs schwer zu identifizieren
2. **Kein Eindeutigkeitsschutz** — wenn zwei ESPs Subzones mit demselben Namen kopieren, gibt es ID-Kollisionen
3. **Herkunft unklar** — `subzone_a_copy_copy_copy` verraet nicht in welchem Schritt die Kopie entstand

### IST-Verhalten

**Datei:** `src/services/zone_service.py` — `_handle_subzone_strategy("copy")`

```python
# Pseudo-Logik (IST) — [KORREKTUR: Code hat BEREITS _copy-Stripping]:
for sz in subzones:  # ACHTUNG: get_by_esp() holt ALLE Subzones, nicht nur aus old_zone
    base_id = re.sub(r"(_copy)+$", "", sz.subzone_id)  # Strips _copy chains
    await subzone_repo.create_subzone(
        subzone_id=f"{base_id}_copy",  # PROBLEM: Immer gleiche ID bei 2. Kopie → IntegrityError
        subzone_name=f"{base_name} (Copy)",
        parent_zone_id=new_zone_id,
        # ... restliche Felder
    )
```

### SOLL-Verhalten

Kopien bekommen einen eindeutigen Suffix der auch bei wiederholtem Kopieren kontrolliert bleibt.

### Umsetzung

**Option A (empfohlen): Counter-basierter Suffix mit Duplikat-Check**

```python
async def _generate_unique_copy_id(self, base_id: str, device_id: str, subzone_repo: SubzoneRepository) -> str:  # [KORREKTUR: braucht device_id + subzone_repo]
    """Generate a unique subzone_id for copy strategy.

    Strips existing _copy/_copy_N suffixes first, then finds next free counter.
    Examples:
        subzone_a         → subzone_a_copy
        subzone_a_copy    → subzone_a_copy_2  (not subzone_a_copy_copy)
        subzone_a_copy_2  → subzone_a_copy_3  (not subzone_a_copy_2_copy)
    """
    import re
    # Strip existing _copy or _copy_N suffix
    clean_id = re.sub(r'_copy(_\d+)?$', '', base_id)

    # Try _copy first, then _copy_2, _copy_3, ...
    candidate = f"{clean_id}_copy"
    existing = await subzone_repo.get_by_esp_and_subzone(device_id, candidate)  # [KORREKTUR: get_by_subzone_id existiert nicht]
    if not existing or existing.parent_zone_id != zone_id:
        return candidate

    counter = 2
    while True:
        candidate = f"{clean_id}_copy_{counter}"
        existing = await subzone_repo.get_by_esp_and_subzone(device_id, candidate)  # [KORREKTUR: get_by_subzone_id existiert nicht]
        if not existing:  # [KORREKTUR: UniqueConstraint ist (esp_id, subzone_id) — Zone irrelevant]
            return candidate
        counter += 1
        if counter > 99:  # Safety limit
            candidate = f"{clean_id}_copy_{uuid4().hex[:6]}"
            return candidate
```

**In `_handle_subzone_strategy("copy")` dann:**

```python
# [KORREKTUR: Zone-Filter ergaenzen — nur Subzones aus alter Zone kopieren]
subzones = [sz for sz in subzones if sz.parent_zone_id == old_zone_id]
for sz in subzones:
    new_id = await self._generate_unique_copy_id(sz.subzone_id, device_id, subzone_repo)  # [KORREKTUR: device_id + subzone_repo]
    new_subzone = SubzoneConfig(
        subzone_id=new_id,
        subzone_name=f"{sz.subzone_name} (Copy)",
        # ...
    )
```

**Kernlogik:** Zuerst vorhandene `_copy` / `_copy_N` Suffixe entfernen, dann den naechsten freien Counter finden. So bleibt `subzone_a_copy_3` immer lesbar, statt `subzone_a_copy_copy_copy`.

### Akzeptanzkriterien

- [ ] Erste Kopie: `subzone_a` → `subzone_a_copy` (wie bisher)
- [ ] Zweite Kopie: `subzone_a_copy` → `subzone_a_copy_2` (NICHT `subzone_a_copy_copy`)
- [ ] Dritte Kopie: `subzone_a_copy_2` → `subzone_a_copy_3`
- [ ] Kopie in andere Zone: Kein Konflikt wenn `subzone_a_copy` in Zone A bereits existiert und in Zone B kopiert wird
- [ ] `subzone_name` bekommt weiterhin ` (Copy)` Suffix
- [ ] Safety-Limit: Bei >99 Kopien wird ein kurzer UUID-Hash angehaengt statt endlos hochzuzaehlen

---

## Architektur-Kontext (zum Verstaendnis — nicht Teil des Auftrags)

### Betroffene Dateien (nur diese 3-4 Dateien aendern)

> **[KORREKTUR]** Alle 4 Dateien haben die beschriebenen Fixes BEREITS. Einzige verbleibende Aenderung: BUG-03 Copy-Uniqueness + Zone-Filter in `zone_service.py`.

| Datei | Bug | Aenderung | Status |
|-------|-----|-----------|--------|
| `src/services/zone_service.py` | BUG-02, BUG-03, BUG-04 | `remove_zone()`: delete_all_by_esp statt delete_all_by_zone. `_handle_subzone_strategy()`: else-Zweig + copy-ID-Logik | BUG-02+04 GEFIXT. BUG-03: Copy-Uniqueness + Zone-Filter offen |
| `src/db/repositories/subzone_repo.py` | BUG-02 | Ggf. `delete_all_by_esp(device_id)` Methode ergaenzen | GEFIXT (Zeile 279-296) |
| `src/api/v1/device_context.py` | BUG-01 | Router-Prefix auf `/v1/device-context` aendern | GEFIXT (Zeile 25) |
| `src/schemas/zone.py` | BUG-04 | `subzone_strategy: Literal["transfer", "copy", "reset"]` | GEFIXT (field_validator Zeile 84-91) |

### Zone-System Architektur (fuer Orientierung)

```
zones-Tabelle (Single Source of Truth seit T13-R1)
  └── zone_id (UNIQUE)
       ├── esp_devices.zone_id → FK (ON DELETE SET NULL)
       └── subzone_configs.parent_zone_id → kein DB-FK (Application-Level)

subzone_configs
  ├── subzone_id (String, identifizierend)
  ├── esp_id (String → esp_devices.device_id, NICHT die UUID!)
  ├── parent_zone_id (String → zones.zone_id, Application-Level)
  ├── is_active (Boolean, default true)
  └── assigned_sensor_config_ids (JSON Array)

esp_devices
  ├── id (UUID PK)
  ├── device_id (String UNIQUE) ← subzone_configs.esp_id zeigt HIERHIN
  └── zone_id (String FK → zones.zone_id)
```

**Kritische FK-Inkonsistenz (MUSS bei BUG-02 beachtet werden):**
- `subzone_configs.esp_id` = String, referenziert `esp_devices.device_id` (String)
- `sensor_configs.esp_id` = UUID, referenziert `esp_devices.id` (UUID)

Das bedeutet: Wenn `remove_zone()` eine UUID als `esp_id` bekommt, muss sie zuerst den `device_id`-String ueber `esp_repo.get(uuid)` → `.device_id` aufloesen bevor `subzone_repo.delete_all_by_esp(device_id)` aufgerufen wird.

### Zone-Wechsel-Flow (wo BUG-02 auftritt)

```
POST /v1/zone/devices/{esp_id}/assign
  → ZoneService.assign_zone()
    1. ESP-Lookup
    2. Zone-Validierung (muss existieren + active)
    3. Alte Zone entfernen: remove_zone(esp, old_zone_id)
       ├── BUG-02 HIER: delete_all_by_zone(old_zone_id)  ← FALSCH
       └── SOLL:         delete_all_by_esp(device_id)     ← KORREKT
    4. Subzone-Strategie (transfer/copy/reset)
       ├── BUG-03 bei "copy": _copy_copy Problem
       └── BUG-04 bei unbekannt: Stilles Ignorieren
    5. ESP-Felder aktualisieren
    6. Audit-Log
    7. MQTT zone/assign senden
```

### Subzone-Strategien bei Zone-Wechsel (Referenz)

| Strategie | Verhalten | Betroffene Subzones |
|-----------|-----------|---------------------|
| `transfer` | `parent_zone_id` aller Subzones des ESP wird auf neue Zone gesetzt | Nur ESP-eigene |
| `copy` | Kopien in neuer Zone erstellt, Originale bleiben in alter Zone | Nur ESP-eigene |
| `reset` | Subzones bleiben verwaist in alter Zone, ESP startet ohne Subzones | Nur ESP-eigene |

---

## Reihenfolge und Abhaengigkeiten

```
BUG-02 (HIGH)  ──→  Zuerst. Kann Daten zerstoeren.
    │
BUG-01 (MEDIUM) ──→  Unabhaengig. API-Prefix.
    │
BUG-04 (LOW) ───→  Schema + Service. Keine Abhaengigkeit.
    │
BUG-03 (LOW) ───→  Zuletzt. Baut auf copy-Logik in zone_service.py auf.
```

Alle 4 Fixes koennen in einem einzigen Commit zusammengefasst werden. Tests nach jedem Fix laufen lassen (`pytest`), finaler Commit wenn alle 4 gruen sind.

---

## Verifikation nach Implementation

Nach Abschluss aller 4 Fixes die folgenden Tests manuell oder automatisiert durchfuehren:

| Test | Erwartetes Ergebnis |
|------|---------------------|
| Zone mit 2 ESPs: ESP-1 entfernen | Nur Subzones von ESP-1 geloescht, ESP-2 Subzones intakt |
| `PUT /api/v1/device-context/sensor/{id}` aufrufen | HTTP 200 (nicht 404) |
| `PUT /api/device-context/sensor/{id}` aufrufen (alte URL) | HTTP 404 |
| `assign` mit `subzone_strategy: "transferr"` | HTTP 422 mit Fehlermeldung |
| `assign` mit `subzone_strategy: "transfer"` | HTTP 200, Subzones transferiert |
| 3x hintereinander Copy-Strategie | IDs: `sz_copy`, `sz_copy_2`, `sz_copy_3` |
| `pytest` komplett | Alle Tests gruen |
