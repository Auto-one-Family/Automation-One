# Analyse-Auftrag: P4-GUARD Sensor-Typ-Normalisierungskette + Alias-Luecken

**Ziel-Repo:** auto-one (Alle 3 Schichten)
**Typ:** Analyse (KEIN Code aendern, nur IST-Zustand dokumentieren + Fix-Empfehlung)
**Prioritaet:** HIGH
**Datum:** 2026-03-31
**Geschaetzter Aufwand:** ~3-4h
**Abhaengigkeit:** SAFETY-P4-GUARD (implementiert, Pruefbericht liegt vor)

---

## Hintergrund

SAFETY-P4-GUARD wurde implementiert: Server filtert kalibrierungspflichtige Sensoren (`ph`, `ec`, `moisture`) aus Offline-Rules, Firmware hat Defense-in-Depth Guard. 16 Tests PASS, Build OK.

Ein Pruefbericht hat **eine relevante Luecke** aufgedeckt:

**Das `soil_moisture`-Problem:**
- `sensor_type_registry.py` mappt `soil_moisture` → `moisture` (ueber `SENSOR_TYPE_MAPPING`)
- Der GUARD-Filter nutzt `sensor_value_type.split("_")[0]` → fuer `"soil_moisture"` ergibt das `"soil"` → `"soil"` ist NICHT in `{"ph", "ec", "moisture"}` → **Filter greift nicht**
- Die Firmware-Guard-Funktion `requiresCalibration()` prueft exakt `"ph"`, `"ec"`, `"moisture"` per `strcmp` → `"soil_moisture"` wird auch dort **nicht erkannt**

**Warum das trotzdem "zufaellig sicher" ist (aber nicht auditierbar):**
- Der ValueCache speichert Eintraege mit dem Key aus `getServerSensorType()` → fuer Bodenfeuchtesensoren ist das `"moisture"` (von `MOISTURE_CAP.server_sensor_type`)
- Eine Offline-Rule mit `sensor_value_type: "soil_moisture"` wuerde `getSensorValue(gpio, "soil_moisture")` aufrufen → `strncmp` gegen Cache-Key `"moisture"` → **kein Treffer** → NAN → Rule wird uebersprungen
- Das ist zufaellig sicher, aber NICHT Defense-in-Depth: Der Aktor wird nicht explizit abgeschaltet, die Rule wird nur ignoriert weil der String nicht matcht

**Die eigentliche Frage:** Wie fliesst der `sensor_type`-String durch das GESAMTE System — von der DB ueber die Logic-Rule ueber den Config-Builder bis zum ESP ValueCache? Wo wird normalisiert, wo nicht? Welche Aliase existieren und welche davon koennten den GUARD umgehen?

---

## Ziel dieser Analyse

**Vollstaendige Nachverfolgung des sensor_type-Strings** durch alle Schichten, um:
1. ALLE Sensor-Typ-Aliase zu identifizieren die im System existieren
2. Den exakten Pfad zu verstehen: Logic-Rule Condition → config_builder → Config-Push JSON → Firmware OfflineRule.sensor_value_type → ValueCache-Key-Vergleich
3. Zu pruefen ob es neben `soil_moisture` weitere Aliase gibt die den GUARD umgehen koennten
4. Eine praezise Fix-Empfehlung zu formulieren die das Problem an der RICHTIGEN Stelle loest (Normalisierung einmal, konsistent)

---

## Block A: Sensor-Typ-Landschaft — Alle Aliase inventarisieren

### A1: sensor_type_registry.py — SENSOR_TYPE_MAPPING

Die zentrale Normalisierungs-Map auf dem Server.

```bash
# Alle Alias-Mappings finden
grep -n "SENSOR_TYPE_MAPPING\|normalize_sensor_type" El\ Servador/god_kaiser_server/src/ -r --include="*.py" | head -30

# Die vollstaendige Map ausgeben
grep -A 50 "SENSOR_TYPE_MAPPING" El\ Servador/god_kaiser_server/src/sensors/sensor_type_registry.py | head -60
```

**Erwartete Struktur:**
```python
SENSOR_TYPE_MAPPING = {
    "soil_moisture": "moisture",
    # Weitere Aliase?
    # "temp": "temperature"?
    # "hum": "humidity"?
    # ...
}
```

**Fragen:**
- Wie viele Aliase existieren insgesamt?
- Welche davon sind kalibrierungspflichtige Sensortypen (analog, ADC)?
- Gibt es Aliase die auf `ph`, `ec`, oder `moisture` mappen?

### A2: sensor_registry.cpp (Firmware) — Registrierte Typen

Die Firmware hat eine statische Sensor-Registry mit `server_sensor_type` pro Capability.

```bash
# Alle registrierten Sensor-Typen in der Firmware
grep -n "server_sensor_type\|sensor_type\|SensorCapability" El\ Trabajante/src/ -r --include="*.cpp" --include="*.h" | head -40

# sensor_registry.cpp komplett lesen (klein genug)
cat -n El\ Trabajante/src/models/sensor_registry.cpp | head -150
```

**Fragen:**
- Welche `server_sensor_type` Strings sind registriert?
- Stimmen sie 1:1 mit den Server-Side-Keys ueberein?
- Gibt es Firmware-seitige Aliase oder Normalisierung?

> **Bekannter Kontext:** `sensor_registry.cpp` hat in `SENSOR_TYPE_MAP[]` bereits `{"soil_moisture", &MOISTURE_CAP}` (ca. Zeile 180) — aber diese Zuordnung gilt nur fuer `findSensorCapability()` (MQTT-Verarbeitung). Der ValueCache-Key kommt von `MOISTURE_CAP.server_sensor_type = "moisture"`. Der `getSensorValue(gpio, sensor_type)`-Aufruf in `evaluateOfflineRules()` nutzt dagegen direkt `rule.sensor_value_type` aus dem Config-Push — kein Alias-Lookup. **Das ist der Kern-Disconnect:** Alias in sensor_registry.cpp hilft NICHT fuer den Offline-Rule-Pfad. Zeilennummer verifizieren — kann sich verschoben haben.

### A3: DB — sensor_configs.sensor_type Werte

Welche `sensor_type` Werte existieren tatsaechlich in der Datenbank?

```bash
# Alle einzigartigen sensor_type Werte in sensor_configs
# (SQL via psql oder ueber API)
psql -d god_kaiser_db -c "SELECT DISTINCT sensor_type FROM sensor_configs ORDER BY sensor_type;"
```

Alternativ ueber die REST-API:
```bash
curl -s http://localhost:8000/api/v1/sensors | python -m json.tool | grep -o '"sensor_type": "[^"]*"' | sort -u
```

**Fragen:**
- Werden Aliase (z.B. `soil_moisture`) in der DB gespeichert, oder nur die normalisierten Formen (`moisture`)?
- Wo findet die Normalisierung statt — beim CREATE oder beim READ?

### Ergebnis-Format Block A

Vollstaendige Tabelle:

| Alias (Input) | Normalisierter Typ | Kalibrierungspflichtig? | Im GUARD-Filter? | Risiko |
|---------------|-------------------|------------------------|------------------|--------|
| `ph` | `ph` | JA | JA | Kein |
| `ec` | `ec` | JA | JA | Kein |
| `moisture` | `moisture` | JA | JA | Kein |
| `soil_moisture` | `moisture` | JA | **NEIN** | **MITTEL** |
| ... | ... | ... | ... | ... |

---

## Block B: Sensor-Typ-Fluss durch die Offline-Rule-Pipeline

### B1: Logic-Rule Condition → sensor_type

Wenn ein User eine Logic-Rule erstellt (Frontend → API → DB), welchen `sensor_type` speichert die `cross_esp_logic` Tabelle in der Condition?

```bash
# Logic-Rule Conditions Schema / Inhalt
grep -n "cross_esp_logic\|conditions\|sensor_type" El\ Servador/god_kaiser_server/src/models/ -r --include="*.py" | head -20

# Wo wird der sensor_type in die Condition geschrieben?
grep -rn "sensor_type.*condition\|condition.*sensor_type" El\ Servador/god_kaiser_server/src/ --include="*.py" | head -20
```

**Frage:** Wird der `sensor_type` in der Logic-Rule-Condition normalisiert (z.B. `soil_moisture` → `moisture`), oder wird er 1:1 gespeichert wie vom Frontend gesendet?

### B2: config_builder._extract_offline_rule() — Welcher String wird gelesen?

**Verifizierte Signatur:** `_extract_offline_rule(self, rule, esp_id)` — Parameter heisst `rule` (nicht `logic_rule`), kein `session`-Parameter. Variable: `sensor_value_type = hysteresis_cond.get("sensor_type") or ""` (ca. Zeile 421).

```bash
# Die Stelle wo sensor_value_type aus der Rule extrahiert wird
grep -n -A 5 "sensor_value_type\|sensor_type.*hysteresis\|hysteresis_cond" El\ Servador/god_kaiser_server/src/services/config_builder.py | head -30
```

**Fragen:**
- Wird `hysteresis_cond.get("sensor_type")` direkt aus der DB-Condition gelesen?
- Oder wird irgendwo dazwischen normalisiert?
- Wenn die DB `"soil_moisture"` enthaelt, kommt das 1:1 als `sensor_value_type` im Config-Push an?

### B3: Config-Push JSON → Firmware parseOfflineRules()

```bash
# Wie der Config-Push-Payload fuer offline_rules aussieht
grep -n "offline_rules\|sensor_value_type\|build_offline" El\ Servador/god_kaiser_server/src/services/config_builder.py | head -20

# Firmware: Wie wird sensor_value_type aus dem JSON geparsed?
grep -rn "sensor_value_type\|svtyp\|parseOfflineRules\|offline.*parse\|offline.*json" El\ Trabajante/src/services/safety/ --include="*.cpp" --include="*.h" | head -20
```

**Frage:** Ist der String der in `OfflineRule.sensor_value_type` landet identisch mit dem aus der DB?

### B4: ValueCache-Key vs. OfflineRule.sensor_value_type

**Das ist die entscheidende Stelle.** Wenn die beiden Strings nicht uebereinstimmen, wird `getSensorValue()` NAN liefern und die Rule ignoriert.

```bash
# ValueCache Key-Herkunft
grep -rn "updateValueCache\|getServerSensorType\|server_sensor_type" El\ Trabajante/src/services/sensor/ --include="*.cpp" --include="*.h" | head -20

# getSensorValue Vergleich
grep -n -A 10 "getSensorValue" El\ Trabajante/src/services/sensor/sensor_manager.cpp | head -30
```

**Fragen:**
- ValueCache-Key kommt von `getServerSensorType()` → welchen String liefert das fuer Bodenfeuchte? `"moisture"` oder `"soil_moisture"`?
- OfflineRule.sensor_value_type kommt vom Config-Push → welchen String enthaelt der? `"moisture"` oder `"soil_moisture"`?
- Stimmen die beiden IMMER ueberein, oder gibt es Faelle wo sie divergieren?

### Ergebnis-Format Block B

Flussdiagramm fuer JEDEN kalibrierungspflichtigen Sensortyp:

```
soil_moisture:
  Frontend UI → [welcher String?]
  → Logic-Rule DB Condition → [welcher String?]
  → config_builder._extract_offline_rule() → sensor_value_type = [?]
  → GUARD Filter: split("_")[0] = "soil" → NICHT gefiltert!
  → Config-Push JSON: "sensor_value_type": [?]
  → Firmware parseOfflineRules() → OfflineRule.sensor_value_type = [?]
  → getSensorValue(gpio, [?]) → ValueCache Key = [?]
  → strncmp([?], [?]) → MATCH oder KEIN MATCH?
```

Gleiches Diagramm fuer `moisture`, `ph`, `ec`.

---

## Block C: Normalisierungs-Luecken im GUARD

### C1: Wo SOLLTE normalisiert werden?

Es gibt mehrere moegliche Stellen:

| Stelle | Normalisierung? | Aufwand |
|--------|----------------|---------|
| **Frontend:** Sensor-Dropdown im Logic-Rule-Builder | Sendet normalisierten Key | Nur wenn Frontend die SENSOR_TYPE_CONFIG-Keys nutzt |
| **Backend API:** Logic-Rule-Create Endpoint | Normalisiert sensor_type in Condition | 1 Zeile: `normalize_sensor_type()` |
| **config_builder:** `_extract_offline_rule()` | Normalisiert VOR dem Filter-Check | 1 Zeile: `sensor_value_type = normalize_sensor_type(sensor_value_type)` |
| **Firmware:** `parseOfflineRules()` | Normalisiert beim JSON-Parse | Muesste Alias-Tabelle in Firmware haben |
| **Firmware:** `requiresCalibration()` | Erweitert um Aliase | Einfach, aber braucht Wartung bei neuen Typen |

**Prinzip:** Normalisierung sollte **so frueh wie moeglich** stattfinden (Single Source of Truth). Wenn die DB nur normalisierte Typen enthaelt, ist das Problem geloest bevor es den Config-Builder erreicht.

### C2: Gibt es weitere problematische Aliase?

Aus der Tabelle in A1 — pruefen ob es Aliase gibt die:
1. Auf einen kalibrierungspflichtigen Typ mappen
2. Durch `split("_")[0]` NICHT im Filter-Set landen
3. UND tatsaechlich in einer Logic-Rule-Condition vorkommen koennten

Beispiele die zu pruefen sind:
- `soil_moisture` → `moisture` (BESTAETIGT problematisch)
- Gibt es `ph_sensor`, `ph_probe`, `ec_meter` o.ae.?
- Gibt es `cap_moisture`, `analog_moisture` o.ae.?

### C3: Firmware requiresCalibration() — Vollstaendigkeits-Check

```bash
# Alle strcmp/strncmp in requiresCalibration und evaluateOfflineRules
grep -n "requiresCalibration\|strcmp.*ph\|strcmp.*ec\|strcmp.*moisture" El\ Trabajante/src/services/safety/offline_mode_manager.cpp
```

**Frage:** Muss `requiresCalibration()` erweitert werden, und wenn ja — um welche Strings exakt?

### Ergebnis-Format Block C

Empfehlung wo und wie normalisiert werden soll:

| Stelle | Aenderung | Zeilen Code | Prio |
|--------|-----------|-------------|------|
| ? | ? | ? | ? |

---

## Block D: Case-Sensitivity und Edge Cases

### D1: Firmware strcmp vs. strcasecmp

```bash
# Alle String-Vergleiche in offline_mode_manager.cpp
grep -n "strcmp\|strncmp\|strcasecmp" El\ Trabajante/src/services/safety/offline_mode_manager.cpp
```

**Fragen:**
- Nutzt `requiresCalibration()` `strcmp` (case-sensitive) oder `strcasecmp` (case-insensitive)?
- Koennte ein Config-Push jemals einen Sensortyp in Grossbuchstaben oder Mixed-Case senden?
- Koennen NVS-Altdaten (vor dem GUARD) abweichende Schreibweisen enthalten?

### D2: NVS-Altdaten — Risiko-Bewertung

Wenn ein ESP vor dem GUARD-Update Offline-Rules mit `sensor_value_type: "soil_moisture"` in NVS gespeichert hat:
1. Nach Firmware-Update mit GUARD: Wird `requiresCalibration("soil_moisture")` triggern? → **NEIN** (nur `moisture` geprueft)
2. Wird `getSensorValue(gpio, "soil_moisture")` NAN liefern? → Haengt von Block B ab (ValueCache-Key)
3. Ist das ein realistisches Szenario oder rein theoretisch?

### D3: `_extract_offline_rule` — "Erste Hysterese-Condition" Verhalten

Der Pruefbericht notiert: "Code nimmt die ERSTE passende Hysterese-Bedingung aus einer Liste von Conditions."

```bash
# Wie werden Conditions iteriert?
grep -n -B 5 -A 15 "hysteresis_cond\|conditions.*for\|for.*conditions" El\ Servador/god_kaiser_server/src/services/config_builder.py | head -40
```

**Frage:** Wenn eine Logic-Rule 2 Conditions hat (z.B. Zeitfenster + Hysterese), und die Hysterese-Condition einen analogen Sensor nutzt — wird die korrekt gefiltert? Oder koennte die Zeitfenster-Condition zuerst geprueft werden und die Hysterese-Condition uebersehen werden?

---

## Ergebnis-Zusammenfassung (am Ende des Berichts)

### Vollstaendige Alias-Risiko-Matrix

| Alias | Normalisiert zu | Kalibrierungspflichtig | GUARD Server | GUARD Firmware | ValueCache Key | Risiko-Level |
|-------|----------------|----------------------|--------------|----------------|----------------|-------------|
| ph | ph | JA | Filtert | Filtert | ph | KEIN |
| ec | ec | JA | Filtert | Filtert | ec | KEIN |
| moisture | moisture | JA | Filtert | Filtert | moisture | KEIN |
| soil_moisture | moisture | JA | ? | ? | ? | ? |
| ... | ... | ... | ... | ... | ... | ... |

### Fix-Empfehlung

Basierend auf den Ergebnissen: Welche Stellen im Code muessen geaendert werden?

**Drei Optionen bewerten:**

**Option A — Normalisierung im config_builder (Server, minimal):**
```python
# In _extract_offline_rule(), VOR dem Filter:
from ..sensors.sensor_type_registry import normalize_sensor_type
sensor_value_type = normalize_sensor_type(sensor_value_type)
```
Pro: 1 Zeile, nutzt bestehende Infrastruktur. Contra: Firmware bleibt verwundbar fuer NVS-Altdaten.

**Option B — Normalisierung + Firmware-Erweiterung (Defense-in-Depth):**
Wie A, plus: `requiresCalibration()` erhaelt alle bekannten Aliase.
Pro: Vollstaendiger Schutz. Contra: Firmware braucht Alias-Wissen.

**Option C — Normalisierung bei Logic-Rule-Create (frueheste Stelle):**
API normalisiert `sensor_type` in Conditions beim Speichern → DB enthaelt nur kanonische Typen.
Pro: Problem existiert nie. Contra: Retroaktive DB-Migration noetig.

Welche Option ist am konsistentesten fuer AutomationOne? Bewertung in der Zusammenfassung.

---

## Was NICHT gemacht wird

- **Kein Code aendern** — reine Analyse und Dokumentation
- **Keine neuen Sensor-Typen hinzufuegen** — nur bestehende inventarisieren
- **Keine Performance-Analyse** — nur Korrektheit und Sicherheit
- **Keine Frontend-Tiefenanalyse** — nur soweit noetig um den sensor_type-Fluss zu verstehen

---

## Empfohlener Agent

**General-Purpose** oder **server-dev + esp32-dev** im auto-one Repo — Code-Analyse ueber alle 3 Schichten.

**Ergebnis:** Bericht mit vollstaendiger Alias-Matrix + Fix-Empfehlung (eine der 3 Optionen, begruendet). Bericht nach `.claude/reports/current/` im auto-one Repo ODER als Chat-Ergebnis zurueck an Robin.
