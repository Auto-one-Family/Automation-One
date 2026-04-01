# FIX-Auftrag: Aktor-Typ-Konsistenz (actuator_type Mismatch)

> **Typ:** Implementierung (2 aufeinander aufbauende Stufen)
> **Finding:** F-V4-02 (MEDIUM) — Root-Cause analysiert in BERICHT-AKTOR-TYP-KONFUSION-2026-03-30.md
> **Schicht:** El Servador (Backend) in Stufe 1, Backend + El Frontend in Stufe 2
> **Geschaetzter Aufwand:** Stufe 1 ~2h | Stufe 2 ~3h
> **Abhaengigkeit:** Stufe 2 baut auf Stufe 1 auf. P8-A6 (Aktor-Analytics, KOMPLETT) liest actuator_history — Details in Stufe 2 beachten.
> **Datum:** 2026-03-30

---

## Kontext und Systemwissen

AutomationOne hat ein **Zwei-Typ-System** fuer Aktoren by design:

- **Server-Typen** (`ACTUATOR_TYPES` in `schemas/actuator.py`): `"digital"`, `"pwm"`, `"servo"` — interne Server-Klassifikation
- **ESP32-Typen** (`ESP32_ACTUATOR_TYPES` in `schemas/actuator.py`): `"pump"`, `"valve"`, `"relay"`, `"pwm"` — physische Hardware-Kategorien
- **Normalisierungs-Mapping** (in `schemas/actuator.py` via `normalize_actuator_type()`): `relay→digital`, `pump→digital`, `valve→digital`, `pwm→pwm`
- **Reverse-Mapping** (in `config_mapping.py` via `map_actuator_type_for_esp32()`): `digital→relay`, `pwm→pwm` — wird beim Config-Push Server→ESP32 angewendet

`actuator_configs.actuator_type` wird durch den Pydantic-Validator bei **allen** Schreibpfaden normalisiert — gespeichert wird ausnahmslos der Server-Typ (`"digital"` oder `"pwm"`).

`actuator_states.actuator_type` und `actuator_history.actuator_type` werden **ohne Normalisierung** aus dem MQTT-Payload des ESP32 uebernommen — gespeichert wird der rohe ESP32-Typ (`"relay"`, `"pump"`, `"valve"`, `"pwm"`).

Die Firmware (El Trabajante) sendet im Status-Payload den Key `"type"` (NICHT `"actuator_type"`):
```cpp
// actuator_manager.cpp:881
payload += "\"type\":\"" + config.actuator_type + "\",";
```
Das Backend kompensiert via Fallback: `payload.get("actuator_type", payload.get("type", "unknown"))` — der Fallback trifft immer, der Primärpfad nie.

Der Simulation-Handler (`services/simulation/actuator_handler.py`) sendet dagegen beide Keys (`"actuator_type"` und `"type"`) mit Default-Wert `"relay"`. Das Ergebnis ist identisch — kein Normalisierer wird angewendet.

**Das Frontend** laedt `actuator_type` initial via REST aus `actuator_configs` (Server-Typ `"digital"`). `actuator.store.ts:107-136` aktualisiert bei WebSocket-Events (`actuator_status`) den `actuator_type` **nicht** — der Store haelt den REST-Wert. `getActuatorTypeInfo()` in `labels.ts` hat Mappings fuer ESP32-Typen: `relay→ToggleRight`, `pump→Waves`, `valve→GitBranch`, `pwm→Activity`. Fuer `"digital"` existiert **KEIN explizites Mapping** — es faellt ins generische Power-Fallback. Das bedeutet: Alle digitalen Aktoren zeigen dasselbe Power-Icon, unabhaengig ob Pumpe, Ventil oder Relais.

**P8-A6 (Aktor-Analytics, bereits implementiert)** nutzt `actuator_history.actuator_type` fuer Filterung und Gruppierung. Aktuell sind dort ESP32-Typen gespeichert (`"relay"`, etc.). Das muss beim Data-Migration-Schritt beruecksichtigt werden — Details in Stufe 1 Schritt 5.

---

## Problem-Statement

### IST-Zustand

| Tabelle | Spalte | Wert | Warum |
|---------|--------|------|-------|
| `actuator_configs` | `actuator_type` | `"digital"` | Pydantic-Validator normalisiert alle Schreibpfade |
| `actuator_states` | `actuator_type` | `"relay"` | MQTT-Handler schreibt ESP32-Typ roh aus Payload |
| `actuator_history` | `actuator_type` | `"relay"` | Gleiche Quelle, kein Normalisierer |
| WebSocket-Broadcast | `actuator_type` | `"relay"` | `actuator_handler.py:224` sendet ungefiltert |

**Root Cause:** `actuator_handler.py:124` liest den Typ direkt aus dem MQTT-Payload ohne `normalize_actuator_type()` aufzurufen. `actuator_config` ist an dieser Stelle bereits geladen (Zeile 116-122) und koennte als konsistente Quelle verwendet werden.

**Sekundaer:** Die Firmware sendet `"type"` statt `"actuator_type"` — der Backend-Handler trifft immer den Fallback-Pfad statt den Primärpfad. Kein Datenproblem, aber Protokoll-Inkonsistenz.

### SOLL-Zustand (nach Stufe 1)

| Tabelle | Spalte | Soll-Wert | Anmerkung |
|---------|--------|-----------|-----------|
| `actuator_configs` | `actuator_type` | `"digital"` | Unveraendert — bereits korrekt |
| `actuator_states` | `actuator_type` | `"digital"` | Nach Fix normalisiert |
| `actuator_history` | `actuator_type` | `"digital"` | Nach Fix normalisiert — P8-A6 Analytics anpassen |
| WebSocket-Broadcast | `actuator_type` | `"digital"` | Konsistent mit DB |

### SOLL-Zustand (nach Stufe 2)

Zusaetzlich zum oben genannten: Ein neues Feld `hardware_type` speichert den Original-ESP32-Typ persistent (`"relay"`, `"pump"`, `"valve"`, `"pwm"`). Frontend-Icons und P8-A6 Analytics nutzen `hardware_type` fuer differenzierte Darstellung.

---

## Stufe 1 — Konsistenz-Fix Backend (~2h)

**Ziel:** `actuator_states` und `actuator_history` verwenden einheitlich den Server-Typ. Bestehende Rows werden migriert. Keine neuen DB-Felder.

**Voraussetzung:** Stufe 1 komplett bevor Stufe 2 begonnen wird.

---

### Schritt 1.1 — MQTT-Handler: Typ aus Config holen

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_handler.py`

**IST (Zeile 124):**
```python
actuator_type = payload.get("actuator_type", payload.get("type", "unknown"))
```

**SOLL:**
```python
# actuator_config ist bereits in Zeile 116-122 geladen (Step 5 im Handler)
if actuator_config:
    actuator_type = actuator_config.actuator_type  # Server-Typ aus DB (z.B. "digital")
else:
    # Edge case: Status ohne config (z.B. unbekannter Aktor beim Startup)
    raw_type = payload.get("actuator_type", payload.get("type", "unknown"))
    actuator_type = normalize_actuator_type(raw_type) if raw_type != "unknown" else "unknown"
```

**Begruendung:** `actuator_config` ist die normalisierte Server-Side-Truth. Der MQTT-Payload enthaelt den ESP32-Typ — diese Grenze soll am Eintrittspunkt (Zeile 124) aufgeloest werden. `normalize_actuator_type` ist im gleichen Modul verfuegbar — Import pruefen und bei Bedarf hinzufuegen.

> **Hinweis:** Pruefen ob `normalize_actuator_type` in `actuator_handler.py` bereits importiert ist. Falls nicht, Import ergaenzen: `from ...schemas.actuator import normalize_actuator_type` (exakter Import-Pfad im auto-one Repo verifizieren).

**Einschraenkung:** Den Fallback-Block (Edge case ohne Config) nicht entfernen — er sichert den Fall eines unbekannten Aktors ab der Status sendet bevor er konfiguriert wurde.

---

### Schritt 1.2 — WebSocket-Broadcast: Server-Typ senden

**Datei:** `actuator_handler.py`, Zeile 224-234 (WebSocket-Broadcast des Aktor-Status)

Der Broadcast sendet `"actuator_type"` aus dem Handler-lokalen `actuator_type`-Wert. Nach Schritt 1.1 ist dieser Wert bereits der Server-Typ — der Broadcast korrekt sich dadurch **automatisch**.

**Pruefen:** Sicherstellen dass in Zeile 224-234 der `actuator_type` Variable aus Schritt 1.1 (nicht aus dem Payload) verwendet wird. Wenn ein separater dict-Zugriff auf den Payload existiert, diesen durch den normalisierten Wert ersetzen.

---

### Schritt 1.3 — History-Schreibpfad: Server-Typ verwenden

**Datei:** `actuator_handler.py`, Zeile 167-181 (actuator_history Insert)

Der History-Insert verwendet dieselbe `actuator_type`-Variable wie der States-Insert. Nach Schritt 1.1 ist der Wert normalisiert — **automatisch korrekt**.

**Pruefen:** Sicherstellen dass in Zeile 167-181 die normalisierte `actuator_type`-Variable verwendet wird und kein separater Payload-Zugriff den ESP32-Typ wieder einschleust.

**WICHTIG fuer P8-A6:** P8-A6 (Aktor-Analytics) ist BEREITS implementiert und live (verifiziert 2026-03-30). Es filtert/gruppiert nach `actuator_history.actuator_type`. Die **Deployment-Reihenfolge ist kritisch:** Zuerst Alembic-Migration (Schritt 1.5) laufen lassen, DANN den neuen Code deployen. So gibt es kein Zeitfenster in dem neue Rows "digital" und alte Rows "relay" haben. Nach der Migration sind alle Rows konsistent auf Server-Typen. P8-A6 Analytics-Queries die aktuell nach ESP32-Typen filtern (z.B. `WHERE actuator_type = 'relay'`) muessen auf Server-Typen umgestellt werden (`WHERE actuator_type = 'digital'`) — oder besser: Stufe 2 zuerst implementieren und nach `hardware_type` filtern.

---

### Schritt 1.4 — Simulation-Handler: Gleiches Verhalten sicherstellen

**Datei:** `El Servador/god_kaiser_server/src/services/simulation/actuator_handler.py`

**IST (Zeile 668):**
```python
actuator_type = await self._get_actuator_type(esp_id, gpio)
# _get_actuator_type liest aus simulation_config, default "relay" (ESP32-Typ)
```

**SOLL:**
```python
# Option A: actuator_config aus DB holen (analog zu MQTT-Handler Schritt 1.1)
actuator_config = await self._get_actuator_config_from_db(esp_id, gpio)
if actuator_config:
    actuator_type = actuator_config.actuator_type  # Server-Typ
else:
    raw_type = await self._get_actuator_type(esp_id, gpio)  # Fallback auf simulation_config
    actuator_type = normalize_actuator_type(raw_type) if raw_type != "unknown" else "unknown"

# Option B (einfacher): normalize_actuator_type auf den Wert aus _get_actuator_type anwenden
raw_type = await self._get_actuator_type(esp_id, gpio)
actuator_type = normalize_actuator_type(raw_type) if raw_type not in ("unknown", None) else "unknown"
```

**Empfehlung:** Option B verwenden wenn `_get_actuator_config_from_db` noch nicht existiert — einfacher, gleicher Effekt. Option A bevorzugen wenn die DB-Lookup-Methode schon vorhanden ist oder leicht ergaenzbar.

---

### Schritt 1.5 — Data-Migration: Bestehende Rows normalisieren

**Alembic-Migration erstellen** (neue Datei in `alembic/versions/`):

```python
"""normalize actuator_type in actuator_states and actuator_history

Revision ID: <auto-generiert>
Down revision: <letzte Migration>
"""

def upgrade() -> None:
    # Normalisierungs-Mapping: ESP32-Typen → Server-Typen
    op.execute("""
        UPDATE actuator_states
        SET actuator_type = CASE
            WHEN actuator_type IN ('relay', 'pump', 'valve') THEN 'digital'
            WHEN actuator_type = 'pwm' THEN 'pwm'
            ELSE actuator_type  -- 'unknown', 'error', 'emergency_stop' bleiben unveraendert
        END
        WHERE actuator_type IN ('relay', 'pump', 'valve')
    """)

    op.execute("""
        UPDATE actuator_history
        SET actuator_type = CASE
            WHEN actuator_type IN ('relay', 'pump', 'valve') THEN 'digital'
            WHEN actuator_type = 'pwm' THEN 'pwm'
            ELSE actuator_type
        END
        WHERE actuator_type IN ('relay', 'pump', 'valve')
    """)

def downgrade() -> None:
    # Downgrade ist destruktiv (verlorener ESP32-Typ) — nur notig wenn explizit gewollt
    # Kein downgrade implementieren, pass
    pass
```

**Hinweis:** Das downgrade ist absichtlich leer — der originale ESP32-Typ ist nach der Migration nicht mehr rekonstruierbar. Das ist der Preis fuer die Konsistenz in Stufe 1. Stufe 2 behebt diesen Verlust durch `hardware_type`.

---

### Schritt 1.6 — Tests

**pytest:**

1. Tests fuer MQTT-Handler (bestehende Testdatei erweitern oder neue erstellen — im auto-one Repo pruefen ob `test_actuator_handler.py` existiert):
   - Test: Eingehender MQTT-Payload mit `"type": "relay"` → `actuator_states.actuator_type` = `"digital"` nach dem Update.
   - Test: Eingehender Payload mit `"type": "pump"` → `actuator_states.actuator_type` = `"digital"`.
   - Test: Eingehender Payload ohne bekannte Config (Edge case) → Normalisierung via `normalize_actuator_type()`.
   - Test: `"type": "pwm"` → `actuator_states.actuator_type` = `"pwm"`.

2. Tests fuer Simulation-Handler (analog zu 1 — bestehende Datei erweitern oder neue erstellen):
   - Test: Simulation-Handler liefert normalisierten Typ fuer States und History.

3. Bestehende Aktor-Tests pruefen: Kein bestehender Test der explizit `actuator_states.actuator_type == "relay"` erwartet — falls vorhanden, anpassen auf `"digital"`.

**WebSocket-Check:** Nach dem Fix einen manuellen Aktor-Toggle durchfuehren und pruefen dass das WS-Event `actuator_type: "digital"` (nicht `"relay"`) sendet.

---

### Akzeptanzkriterien Stufe 1

- [ ] `actuator_states.actuator_type` zeigt nach einem Aktor-MQTT-Status-Eingang `"digital"` (nicht `"relay"`) in der DB.
- [ ] `actuator_history.actuator_type` zeigt fuer neue Eintraege `"digital"`.
- [ ] WebSocket-Broadcast `actuator_status` Event hat `"actuator_type": "digital"`.
- [ ] Simulation-Handler schreibt ebenfalls `"digital"` in States und History.
- [ ] Alembic-Migration laeuft durch: `alembic upgrade head` ohne Fehler.
- [ ] Nach Migration: `SELECT DISTINCT actuator_type FROM actuator_states` zeigt nur `"digital"`, `"pwm"`, `"unknown"` — kein `"relay"`, `"pump"`, `"valve"`.
- [ ] Alle neuen pytest-Tests PASS.
- [ ] Keine bestehenden Tests gebrochen.

---

### Was in Stufe 1 NICHT geaendert wird

- `actuator_configs.actuator_type` — bleibt unveraendert, ist bereits korrekt
- `schemas/actuator.py` (Pydantic-Validator, Typ-Definitionen) — kein Eingriff
- `config_mapping.py` (Reverse-Map digital→relay fuer Config-Push) — kein Eingriff
- Firmware (`actuator_manager.cpp`) — kein Eingriff in Stufe 1
- Frontend — kein Eingriff in Stufe 1
- `actuator_states` Tabellen-Schema (keine neuen Felder)
- Safety-Service, Logic Engine, Emergency-Stop-Pfad — nicht betroffen

---

## Stufe 2 — Hardware-Typ bewahren (~3h)

**Ziel:** Den verloren gegangenen Hardware-Typ (`"relay"`, `"pump"`, `"valve"`) persistent machen, ohne das Zwei-Typ-System zu aendern. Ein neues Feld `hardware_type` speichert den Original-ESP32-Typ. Frontend-Icons und Analytics nutzen `hardware_type` fuer differenzierte Darstellung.

**Voraussetzung:** Stufe 1 vollstaendig implementiert und verifiziert.

**Hintergrund:** Nach Stufe 1 haben wir Konsistenz auf Kosten der Hardware-Semantik. `"digital"` unterscheidet nicht mehr ob es eine Pumpe, ein Ventil oder ein Relay ist. Fuer den User im Dashboard und fuer P8-A6 Analytics ist diese Unterscheidung wertvoll — eine Pumpe soll ein Wellen-Icon zeigen, ein Ventil ein GitBranch-Icon, ein Relay ein Toggle-Icon.

---

### Schritt 2.1 — DB-Feld `hardware_type` in actuator_configs

**Alembic-Migration erstellen:**

```python
"""add hardware_type to actuator_configs

Revision ID: <auto-generiert>
Down revision: <Stufe-1-Migration>
"""
from alembic import op
import sqlalchemy as sa

def upgrade() -> None:
    op.add_column(
        'actuator_configs',
        sa.Column('hardware_type', sa.String(50), nullable=True)
    )
    # Backfill: actuator_configs hat kein ESP32-Typ mehr direkt
    # Reverse-Map aus actuator_type anwenden: "digital" → "relay" als Default-Annahme
    # WICHTIG: Das ist eine Annahme — echter Hardware-Typ muss via ESP32-Sync verifiziert werden
    op.execute("""
        UPDATE actuator_configs
        SET hardware_type = CASE
            WHEN actuator_type = 'digital' THEN 'relay'
            WHEN actuator_type = 'pwm' THEN 'pwm'
            ELSE actuator_type
        END
        WHERE hardware_type IS NULL
    """)

def downgrade() -> None:
    op.drop_column('actuator_configs', 'hardware_type')
```

**Hinweis zum Backfill:** Der Backfill setzt alle bestehenden `"digital"` Aktoren auf `hardware_type = "relay"` — das ist die sicherste Annahme (Relay ist der haeufigste digitale Typ). Aktoren die eigentlich Pumpen oder Ventile waren koennen nach einem Config-Push vom ESP32 korrekt gesetzt werden (Schritt 2.3).

---

### Schritt 2.2 — Pydantic-Schema: hardware_type speichern

**Datei:** `schemas/actuator.py`

In `ActuatorConfigBase` das Feld `hardware_type` hinzufuegen:
```python
hardware_type: Optional[str] = None  # Original ESP32-Typ vor Normalisierung
```

Im Validator `validate_actuator_type` den Original-Wert VOR der Normalisierung in `hardware_type` schreiben:
```python
@field_validator("actuator_type")
@classmethod
def validate_actuator_type(cls, v: str) -> str:
    v = v.lower()
    if v not in ALL_ACTUATOR_TYPES:
        raise ValueError(...)
    return normalize_actuator_type(v)

@model_validator(mode='before')
@classmethod
def capture_hardware_type(cls, values):
    # Nur setzen wenn hardware_type nicht explizit mitgegeben wurde
    if not values.get('hardware_type'):
        raw_type = values.get('actuator_type', '')
        if raw_type and raw_type.lower() in ESP32_ACTUATOR_TYPES:
            values['hardware_type'] = raw_type.lower()
    return values
```

**ACHTUNG:** Einen Alternativansatz direkt im API-Endpoint (nach Pydantic-Validierung) ist NICHT moeglich — FastAPI injiziert das Pydantic-Objekt bereits validiert, `config.actuator_type` ist dann schon `"digital"`. Der `model_validator(mode='before')` oben ist der einzig korrekte Weg, da er VOR den field_validators laeuft und den rohen Input-Wert abfangen kann.

**ORM-Model:** `ActuatorConfig` Model in `db/models/actuator.py` das Feld `hardware_type` hinzufuegen:
```python
hardware_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
```

---

### Schritt 2.3 — MQTT-Handler: hardware_type aus Payload extrahieren

**Datei:** `actuator_handler.py` (Bearbeitung nach Schritt 1.1)

Beim Verarbeiten des MQTT-Status-Payloads den ESP32-Typ als `hardware_type` separat extrahieren und in `actuator_configs` aktualisieren wenn er noch nicht gesetzt ist (oder abweicht):

```python
# Nach dem Fix aus Stufe 1 (Zeile 124):
actuator_type = actuator_config.actuator_type if actuator_config else ...

# NEU (Stufe 2): Hardware-Typ aus Payload extrahieren
raw_esp32_type = payload.get("actuator_type", payload.get("type", None))
if raw_esp32_type and actuator_config and actuator_config.hardware_type != raw_esp32_type:
    await actuator_repo.update_hardware_type(actuator_config.id, raw_esp32_type)
    # ODER: direkt via session update ohne separate Repo-Methode
```

**Hinweis:** Das `update_hardware_type` soll ein leichtgewichtiges Update sein (nur ein Feld, kein vollstaendiges Objekt), kein vollstaendiger Config-Push.

---

### Schritt 2.4 — WebSocket-Broadcast: hardware_type mitsenden

**Datei:** `actuator_handler.py`, Zeile 224-234

Das WS-Broadcast-Dict um `hardware_type` erweitern:
```python
# Im Broadcast-Dict:
"hardware_type": actuator_config.hardware_type if actuator_config else raw_esp32_type
```

---

### Schritt 2.5 — Frontend: hardware_type fuer Icons und Analytics nutzen

**Datei:** `El Frontend/src/labels.ts` (oder `src/utils/labels.ts` — exakten Pfad im auto-one Repo pruefen) — `getActuatorTypeInfo()`

**IST:**
```typescript
// getActuatorTypeInfo() hat Mappings fuer ESP32-Typen:
// relay → ToggleRight, pump → Waves, valve → GitBranch, pwm → Activity
// Fuer "digital" existiert KEIN explizites Mapping → Power-Fallback (generisches Icon)
// Da der Store "digital" aus actuator_configs laed, zeigen ALLE digitalen Aktoren dasselbe Icon
```

**SOLL:**
```typescript
// 1. Explizites 'digital' Default-Mapping hinzufuegen (fuer den Fall dass hardware_type fehlt):
const ACTUATOR_TYPE_INFO: Record<string, ActuatorTypeInfo> = {
    // ... bestehende Eintraege (relay, pump, valve, pwm) BEHALTEN
    'digital': { label: 'Digital', icon: 'ToggleRight' },  // NEU: Default fuer normalisierten Typ
}

// 2. getActuatorTypeInfo() erweitern — hardware_type bevorzugen, actuator_type als Fallback:
export function getActuatorTypeInfo(actuatorType: string, hardwareType?: string): ActuatorTypeInfo {
    const lookupType = hardwareType ?? actuatorType
    return ACTUATOR_TYPE_INFO[lookupType] ?? ACTUATOR_TYPE_INFO['digital']
}
```

**Ergebnis:** Wenn `hardware_type = "pump"` → Wellen-Icon (Pumpe). Wenn `hardware_type = undefined` und `actuatorType = "digital"` → ToggleRight (Default). Die bestehenden ESP32-Typ-Mappings (relay, pump, valve, pwm) bleiben erhalten und werden ueber `hardware_type` angesteuert.

Alle Aufrufer von `getActuatorTypeInfo()` pruefen (ActuatorCard, ActuatorStatusWidget, ggf. ActuatorConfigPanel) — `hardware_type` aus dem Pinia-Store uebergeben wenn vorhanden.

**Datei:** `actuator.store.ts`

Das Aktor-Interface um `hardware_type?: string` erweitern. Bei `fetchDevice()` (REST-Load) aus dem Response lesen. Bei `handleActuatorStatus()` (WS-Event) ebenfalls updaten wenn im Event vorhanden.

**Dateien:** Aktor-Widgets im Dashboard (exakte Dateinamen im auto-one Repo pruefen — bekannt sind `ActuatorRuntimeWidget.vue` und ggf. `ActuatorCardWidget.vue`).

P8-A6 Analytics (Runtime-KPIs, Timeline, Korrelation) nutzt `actuator_type` aus `actuator_history` fuer Filterung/Gruppierung. Nach Stufe 1 steht dort `"digital"` — keine Differenzierung mehr. Alle Stellen die nach `actuator_type` filtern oder gruppieren auf `hardware_type` umstellen. Konkret pruefen:
- `useActuatorHistory.ts` Composable (API-Aufrufe, Datenverarbeitung)
- `historyToBlocks()` Funktion (ON/OFF/ERROR Farbkodierung — falls nach Typ differenziert)
- MultiSensorWidget `actuatorIds` Korrelation (Phase C — falls Typ-basierte Farben)

---

### Schritt 2.6 — Alembic-Migration: actuator_states hardware_type (optional)

Wenn die Analytics ausserdem nach `hardware_type` in `actuator_states` filtern sollen (z.B. fuer Laufzeit-Differenzierung), koennte `hardware_type` auch in `actuator_states` hinzugefuegt werden. Das ist **optional** — abwaegen ob der Mehrwert den Aufwand rechtfertigt. In actuator_configs ist `hardware_type` die primaere Quelle.

**Empfehlung:** Vorerst weglassen. `hardware_type` in `actuator_configs` reicht fuer Icon-Mapping und Analytics. Bei Bedarf als eigener Follow-up-Auftrag.

---

### Tests Stufe 2

**pytest:**
1. Test: Neuer Aktor mit `actuator_type="relay"` via API → `actuator_configs.hardware_type = "relay"`, `actuator_configs.actuator_type = "digital"`.
2. Test: Neuer Aktor mit `actuator_type="pump"` → `hardware_type = "pump"`, `actuator_type = "digital"`.
3. Test: MQTT-Status-Payload mit `"type": "relay"` → `actuator_configs.hardware_type` auf `"relay"` aktualisiert.
4. Test: WS-Broadcast enthaelt `"hardware_type"` Feld.

**Frontend (vue-tsc + manuell):**
5. `getActuatorTypeInfo("digital", "pump")` → gibt Waves-Icon zurueck (Pumpe).
6. `getActuatorTypeInfo("digital", "relay")` → gibt ToggleRight-Icon zurueck (Relay).
7. `getActuatorTypeInfo("digital", undefined)` → gibt ToggleRight-Icon zurueck (neues 'digital' Default-Mapping).
8. Pinia-Store: Nach `fetchDevice()` ist `hardware_type` auf dem Aktor-Objekt vorhanden.

---

### Akzeptanzkriterien Stufe 2

- [ ] `actuator_configs.hardware_type` ist in der DB vorhanden (Alembic-Migration erfolgreich).
- [ ] Neuer Aktor mit ESP32-Typ `"pump"` → `hardware_type = "pump"` in DB.
- [ ] Nach MQTT-Status-Eingang eines `"relay"`-ESP32 → `hardware_type` in DB auf `"relay"`.
- [ ] WS-Broadcast `actuator_status` enthaelt `"hardware_type"` Feld.
- [ ] Frontend: Pumpe-Aktor zeigt Wellen-Icon (Waves), Ventil zeigt GitBranch-Icon, Relay zeigt Toggle-Icon.
- [ ] P8-A6 Analytics unterscheidet nach `hardware_type` (Pumpe vs. Relay getrennte Laufzeiten).
- [ ] Alle pytest-Tests PASS, keine bestehenden Tests gebrochen.
- [ ] `vue-tsc --noEmit` ohne Fehler.

---

### Was in Stufe 2 NICHT geaendert wird

- `normalize_actuator_type()` in `schemas/actuator.py` — bleibt unveraendert
- `map_actuator_type_for_esp32()` in `config_mapping.py` — bleibt unveraendert
- Config-Push-Logik — kein Eingriff (ESP32 empfaengt weiterhin `"relay"` via Reverse-Map)
- Firmware (`actuator_manager.cpp`) — kein Eingriff; der JSON-Key-Fix (`"type"` → `"actuator_type"`) ist ein separater Low-Priority-Auftrag
- `ACTUATOR_TYPES` und `ESP32_ACTUATOR_TYPES` Konstanten — keine Aenderung des Typ-Systems
- `ActuatorConfigUpdate` (kein `actuator_type`-Feld by design) — bleibt so
- Safety-Service, Logic Engine, Emergency-Stop-Pfad — nicht betroffen

---

## Empfohlene Reihenfolge

```
Stufe 1 — Entwicklung:
  1.1 MQTT-Handler Typ-Quelle wechseln (+ Import pruefen)
  1.2 WS-Broadcast (auto-korrekt nach 1.1 — pruefen)
  1.3 History-Schreibpfad (auto-korrekt nach 1.1 — pruefen)
  1.4 Simulation-Handler anpassen
  1.5 Alembic-Migration schreiben (States + History normalisieren)
  1.6 Tests schreiben + pytest laufen lassen

Stufe 1 — Deployment (Reihenfolge kritisch wegen P8-A6!):
  1. alembic upgrade head (Migration ZUERST — normalisiert bestehende Rows)
  2. Code deployen (neuer Handler schreibt ab jetzt Server-Typen)
  3. SQL-Check: SELECT DISTINCT actuator_type FROM actuator_states
  4. Manueller WS-Check: Aktor schalten, Event pruefen

Stufe 2 (nach Stufe 1 verifiziert):
  2.1 Alembic-Migration hardware_type in actuator_configs
  2.2 Pydantic-Schema (model_validator) + ORM-Model erweitern
  2.3 MQTT-Handler hardware_type extrahieren + aktualisieren
  2.4 WS-Broadcast hardware_type hinzufuegen
  2.5 Frontend: labels.ts ('digital' Default + Signatur erweitern) + Store + Widgets
  2.6 P8-A6 Analytics auf hardware_type umstellen
  → vue-tsc + pytest + manueller Check
```

---

## Abloesende Auftraege

Nach diesem Fix sind folgende Auftraege **obsolet oder abgeschlossen**:
- `ANALYSE-2` (auftrag-ANALYSE-aktor-typ-konfusion-2026-03-29.md) → durch diesen Fix ersetzt
- `BERICHT-AKTOR-TYP-KONFUSION-2026-03-30.md` → Analyse-Grundlage, kein aktiver Auftrag

`ANALYSE-ED-3 C2` (Aktor-Typ-System Chirurgischer Eingriff) aus dem Editor-Dashboard-Roadmap beschreibt das gleiche Problem und schlaegt ein `interface_type + function` Modell vor. Stufe 2 dieses Auftrags setzt das `hardware_type`-Feld um, das dem `interface_type`-Konzept aus ED-3 C2 entspricht. Nach Abschluss von Stufe 2 kann ED-3 C2 als bearbeitet markiert werden.
