# Auftrag R20-P6 — SIM_-Prefix in Config-Mapping strippen

**Typ:** Bugfix — Backend (El Servador)
**Schwere:** MEDIUM
**Erstellt:** 2026-03-26
**Ziel-Agent:** server-dev (`.claude/agents/server/server_dev_agent.md`)
**Aufwand:** ~30 Minuten
**Abhaengigkeit:** Keine — eigenstaendiger schneller Fix

---

## Hintergrund und Root Cause (RC4)

AutomationOne generiert fuer simulierte ESP-Sensoren Platzhalter-Adressen. Wenn beim
Erstellen eines Sensors keine `onewire_address` angegeben wird, generiert der Server
automatisch eine Adresse mit dem Praefix `SIM_`:

```
SIM_A1B2C3D4E5F6   ← 4 Zeichen Praefix + 12 Hex-Zeichen
```

Der Config-Push-Mechanismus in `config_mapping.py` sendet diese Adresse an den ESP.
Die Firmware-Funktion `hexStringToRom()` in `sensor_manager.cpp` erwartet einen reinen
Hex-String (16 Zeichen fuer 8 Bytes, z.B. "28FF641F7FCCBAE1").

**Warum `SIM_A1B2C3D4E5F6` nicht einfach beim Length-Check scheitert:**
Der String `SIM_A1B2C3D4E5F6` ist exakt 16 Zeichen lang — der Length-Check (16 Hex-Zeichen)
wird bestanden. Das Parsen scheitert erst innerhalb von `hexStringToRom()` wenn die
Non-Hex-Zeichen `S`, `I`, `M` und `_` verarbeitet werden.

**Firmware-Reaktion auf das Scheitern:**
`sensor_manager.cpp` hat an den relevanten Stellen (Zeile 448-462) explizite Fehlerbehandlung:
`LOG_E` (Error-Level-Log) + `errorTracker.trackError(ERROR_SENSOR_INIT_FAILED)`. Der Sensor
wird **abgelehnt** (return false), nicht fehlerhaft konfiguriert. Das bedeutet: Der ESP loggt
den Fehler und ignoriert diesen Sensor-Eintrag vollstaendig.

**Bereits existierender Praezedenzfall:**
Im TRANSFORMS Dict in `config_mapping.py` (Zeile ~391) existiert bereits ein Lambda fuer
`onewire_address`, das den `AUTO_`-Praefix behandelt. Das ist das gleiche Muster — `SIM_`
muss gleichartig behandelt werden.

---

## IST-Zustand

**Datei:** `config_mapping.py`

Im TRANSFORMS Dict befindet sich ein Lambda fuer `onewire_address` (Zeile ~391), das
`AUTO_`-Praefix entfernt, aber `SIM_`-Praefix nicht kennt:

```python
# Im TRANSFORMS Dict, aktuell (~Zeile 391):
"onewire_address": lambda v: v.replace("AUTO_", "") if isinstance(v, str) and v.startswith("AUTO_") else (v if isinstance(v, str) else ""),
```

Wenn ein simulierter Sensor mit `SIM_A1B2C3D4E5F6` als `onewire_address` per Config-Push
an den ESP gesendet wird, passiert der Length-Check (16 Zeichen), scheitert dann aber in
`hexStringToRom()` an den Non-Hex-Zeichen. Die Firmware loggt `ERROR_SENSOR_INIT_FAILED`
und lehnt den Sensor ab.

**Wichtig:** Das Lambda gibt immer einen `str` zurueck, NIE `None`. Die Transform-Pipeline
hat keinen Skip-Mechanismus — `None` wuerde zu `""` konvertiert werden.

---

## SOLL-Zustand

**Option A (Empfohlen — Backend-Fix in config_mapping.py):**

Das Lambda im TRANSFORMS Dict erweitern, damit auch `SIM_`-Praefix zu einem leeren
String fuehrt:

```python
# Im TRANSFORMS Dict, Zeile ~391:
# IST:
"onewire_address": lambda v: v.replace("AUTO_", "") if isinstance(v, str) and v.startswith("AUTO_") else (v if isinstance(v, str) else ""),

# SOLL:
"onewire_address": lambda v: "" if isinstance(v, str) and (v.startswith("AUTO_") or v.startswith("SIM_")) else (v if isinstance(v, str) else ""),
```

**Warum `""` und nicht `None`:** Das Lambda muss immer einen `str` zurueckgeben. Die
Transform-Pipeline kennt keinen Skip-Mechanismus; `None` wuerde zu einem leeren String
konvertiert oder einen Typfehler ausloesen. Ein explizites `""` ist korrekt und konsistent
mit dem bestehenden Fallback `(v if isinstance(v, str) else "")`.

**Konsequenz des Fixes fuer die Firmware:** Mit `""` als `onewire_address` erkennt die
Firmware einen leeren ROM-Code (Length 0 statt 16) und lehnt die Adressierung ab — kein
`hexStringToRom()`-Fehler, kein `ERROR_SENSOR_INIT_FAILED`-Log. Das ist korrekt: SIM_-Sensoren
haben keine echten ROM-Codes und koennen auf echtem Hardware nicht initialisiert werden.

**Logik:** Simulierte Adressen (`SIM_`, `AUTO_`) sind Platzhalter fuer den Mock-ESP.
Echte ESP-Geraete bekommen diese Adressen nicht — der Config-Push filtert sie raus.

---

**Option B (Firmware-Fix als Alternative):**

Falls der Backend-Fix nicht bevorzugt wird, kann alternativ in `sensor_manager.cpp`
vor dem Aufruf von `hexStringToRom()` ein Praefix-Check eingefuegt werden:

```cpp
// In sensor_manager.cpp, vor hexStringToRom()-Aufruf:
if (strncmp(config.onewire_address, "SIM_", 4) == 0 ||
    strncmp(config.onewire_address, "AUTO_", 5) == 0) {
    // Simulierte Adresse — kein echter ROM-Code vorhanden
    // Sensor wird ohne Adress-Bindung initialisiert oder uebersprungen
    memset(config.onewire_address, 0, sizeof(config.onewire_address));
}
```

Dieser Fix wuerde verhindern, dass `hexStringToRom()` ueberhaupt aufgerufen wird.
Der bestehende `LOG_E`-Pfad (Zeile 448-462, `ERROR_SENSOR_INIT_FAILED`) wuerde
nicht mehr ausgeloest.

**Empfehlung: Option A (Backend)** — simulierte Adressen sollten grundsaetzlich nicht an
echte ESPs gesendet werden. Ein echter ESP hat immer echte ROM-Codes. Die Filterung im
Config-Push ist die richtige Schicht fuer diese Entscheidung.

---

## Was NICHT geaendert werden darf

- Mock-ESP-Simulation (nutzt weiterhin SIM_-Adressen intern in der DB)
- Echte OneWire-Sensor-Konfiguration (ROM-Codes ohne SIM_/AUTO_-Praefix)
- Sensor-CRUD-Endpoints
- DB-Schema
- Generierungslogik fuer SIM_-Adressen (bleibt intern erhalten)

---

## Tests nach dem Fix

Nach dem Fix muessen folgende bestehenden Tests laufen:

- `test_onewire_validation.py` — referenziert config_mapping, Verhalten bei leerer Adresse pruefen
- `test_actuator_type_mapping.py` — referenziert config_mapping, darf nicht brechen

Neuer Testfall (wenn moeglich):

```python
# Prueft dass SIM_-Adressen zu leerem String transformiert werden
def test_sim_address_stripped():
    result = TRANSFORMS["onewire_address"]("SIM_A1B2C3D4E5F6")
    assert result == ""

# Prueft dass echte ROM-Codes unveraendert bleiben
def test_real_address_unchanged():
    result = TRANSFORMS["onewire_address"]("28FF641F7FCCBAE1")
    assert result == "28FF641F7FCCBAE1"
```

---

## Akzeptanzkriterien

- [ ] Das Lambda fuer `onewire_address` im TRANSFORMS Dict gibt `""` zurueck wenn der Wert mit `SIM_` beginnt
- [ ] Das Lambda gibt `""` zurueck wenn der Wert mit `AUTO_` beginnt (Regression: bisheriges Verhalten erhalten)
- [ ] Echte OneWire-Adressen (16 Hex-Zeichen, kein SIM_/AUTO_-Praefix) werden unveraendert durchgereicht
- [ ] Config-Push fuer einen ESP mit SIM_-Sensoren enthaelt keine ungueltigen Adressen im Payload
- [ ] Firmware-Log zeigt nach dem Fix keinen `ERROR_SENSOR_INIT_FAILED` fuer simulierte Sensoren
- [ ] `test_onewire_validation.py` und `test_actuator_type_mapping.py` laufen fehlerfrei durch
- [ ] Mock-ESP-Simulation laeuft weiterhin korrekt (SIM_-Adressen bleiben in der DB erhalten)

---

> Erstellt von: automation-experte Agent
> Roadmap-Referenz: R20-P6, Bug R20-15 in `auftraege/roadmap-R20-bugfix-konsolidierung-2026-03-26.md`
> Aufwand: ~30min — schnellster Fix in der R20-Serie
