# MQTT Dev Report: Orphaned Topics Inventarisierung

## Modus: B (Implementierung)
## Auftrag: Verwaiste MQTT Topics inventarisieren, dokumentieren und im Code markieren (kein Code entfernt)

## Codebase-Analyse

Analysierte Dateien auf BEIDEN Seiten:
- **ESP32:** `El Trabajante/src/utils/topic_builder.cpp` (270 Zeilen), `topic_builder.h` (57 Zeilen)
- **Dokumentation:** `El Trabajante/docs/Mqtt_Protocoll.md` (3828 Zeilen)

## Qualitaetspruefung: 8-Dimensionen Checkliste

| # | Dimension | Status |
|---|-----------|--------|
| 1 | Struktur & Einbindung | OK - Nur Kommentare hinzugefuegt, keine strukturellen Aenderungen |
| 2 | Namenskonvention | OK - `// ORPHANED` Prefix konsistent in allen Markierungen |
| 3 | Rueckwaertskompatibilitaet | OK - Kein Code entfernt, keine Funktionssignaturen geaendert |
| 4 | Wiederverwendbarkeit | OK - Kommentare referenzieren zentrale Doku (Mqtt_Protocoll.md) |
| 5 | Speicher & Ressourcen | OK - Nur Kommentare, kein RAM/Flash Impact |
| 6 | Fehlertoleranz | OK - Keine Logik-Aenderung |
| 7 | Seiteneffekte | OK - Keine, reine Dokumentation |
| 8 | Industrielles Niveau | OK - Inventar-Tabelle mit Status, Empfehlung und Cross-Referenz |

## Synchronisations-Status

| Komponente | Datei | Aenderung | Status |
|------------|-------|-----------|--------|
| Server constants.py | - | Keine Aenderung noetig | N/A |
| Server topics.py | - | Keine Aenderung noetig (system/response orphan bleibt fuer spaeteres Cleanup) | N/A |
| Server handler | - | Keine Aenderung noetig | N/A |
| Server main.py | - | Keine Aenderung noetig | N/A |
| ESP32 topic_builder.h | `El Trabajante/src/utils/topic_builder.h` | 4x `// ORPHANED` Kommentare | OK |
| ESP32 topic_builder.cpp | `El Trabajante/src/utils/topic_builder.cpp` | 4x `// ORPHANED` Kommentare | OK |
| Mqtt_Protocoll.md | `El Trabajante/docs/Mqtt_Protocoll.md` | Neuer Abschnitt "Orphaned Topics Inventory" | OK |

## Durchgefuehrte Aenderungen

### 1. Mqtt_Protocoll.md (Zeile 3832+)

Neuer Abschnitt `## Orphaned Topics Inventory (PHASE_2 Audit 2026-02-11)` am Ende des Dokuments mit Inventar-Tabelle (7 Eintraege: 4 ORPHANED, 1 KEEP, 1 GHOST, 1 LEGACY).

### 2. topic_builder.cpp - 4 Funktionen markiert

| Funktion | Zeile | Kommentar |
|----------|-------|-----------|
| `buildSensorBatchTopic()` | 88 | `// ORPHANED - No server handler.` |
| `buildActuatorEmergencyTopic()` | 147 | `// ORPHANED - Redundant to actuator/{gpio}/alert.` |
| `buildBroadcastEmergencyTopic()` | 213 | `// ORPHANED (GHOST) - Server->ESP but ESP never subscribes.` |
| `buildSubzoneStatusTopic()` | 244 | `// ORPHANED - No server handler.` |

### 3. topic_builder.h - 4 Deklarationen markiert

| Funktion | Zeile | Kommentar |
|----------|-------|-----------|
| `buildSensorBatchTopic()` | 17 | `// ORPHANED - No server handler.` |
| `buildActuatorEmergencyTopic()` | 26 | `// ORPHANED - Redundant to actuator/{gpio}/alert.` |
| `buildBroadcastEmergencyTopic()` | 35 | `// ORPHANED (GHOST) - Server->ESP but ESP never subscribes.` |
| `buildSubzoneStatusTopic()` | 42 | `// ORPHANED - No server handler.` |

### NICHT markiert (bewusst)

- `buildSensorResponseTopic()` - Phase 2C Feature, wird behalten

## Verifikation

- **ESP32 Build:** `pio run -e seeed_xiao_esp32c3` -- SUCCESS (47.23s)
  - RAM: 19.5% (64004/327680 bytes)
  - Flash: 88.9% (1165280/1310720 bytes)
- **Keine Kompilierungs-Fehler oder Warnings** durch die Kommentare

## Cross-Layer Impact

Keine. Reine Dokumentations-/Kommentar-Aenderung. Kein Code entfernt, keine Funktionalitaet geaendert.

## Empfehlung

Die Server-seitigen Orphans (`system/response` Parser in `topics.py`, `discovery/esp32_nodes` in `discovery_handler.py`) wurden hier NICHT markiert -- das ist Aufgabe des `server-dev` Agents wenn der TM das Cleanup freigibt.
