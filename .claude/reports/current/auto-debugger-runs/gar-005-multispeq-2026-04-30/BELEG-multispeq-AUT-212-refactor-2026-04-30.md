# BELEG — MultispeQ AUT-212 Refactor (2026-04-30)

**run_id:** gar-005-multispeq-2026-04-30
**finding_id:** multispeq-AUT-212-refactor
**datum:** 2026-04-30
**linear:** AUT-212

## Grund der Aenderung

Robin-Erkenntnis (2026-04-30): Die urspruengliche Issue-Formulierung beschrieb den Ingress-Endpoint
als monolithische Einheit, die gleichzeitig Datei parst + MultispeQ-Protokoll kennt + sensor_data-Rows
erzeugt. Das koppelt Transport und Parsing-Logik — falsche Architektur.

## Architektur-Argument

Drei zukuenftige Eingangs-Pfade nutzen dieselbe Parser-Logik:
1. CSV/JSON-Upload (Stufe 1, jetzt) — HTTP-Upload via Ingress-Endpoint
2. Cloud-API-Polling (Pfad beta, spaeter) — Server-Scheduler-Task
3. BLE-Live-Feed (Stufe 2a, Herbst 2026) — BLE-Adapter-Plugin

Wenn die Parser-Logik im Endpoint steckt, muss sie dreimal dupliziert werden.
Library einmal korrekt bauen = kein Duplikat.

## Was geaendert wurde in AUT-212

- Zwei-Teil-Struktur eingefuehrt: Library (Teil 1) + Ingress-Endpoint (Teil 2)
- Library-API-Skizze hinzugefuegt: `MULTISPEQ_FIELD_MAP`, `parse_photosynq_measurement()`,
  `validate_calibration()`, `expand_to_sensor_rows()`
- Pattern-Bezug zu `sensor_type_registry.SENSOR_TYPE_MAPPING` + `expand_multi_value()` hergestellt:
  MultispeQ = dasselbe Multi-Value-Expansion-Pattern wie SHT31, nur 9 statt 2 Typen
- Library ist transportagnostisch deklariert (kein CSV, kein BLE hier)
- Ingress-Pipeline jetzt explizit: Datei-Parse → JSON-Dict → Library-Aufruf → DB-INSERT
- E6 (Pfad-Entscheidung) als offener Punkt in Issue dokumentiert

## Was NICHT geaendert wurde

- Issue-Split (AUT-212a / AUT-212b) nicht gemacht — Library und Endpoint werden gemeinsam gebaut,
  Abhaengigkeit so eng dass zwei Issues keinen Mehrwert bringen
- AUT-211 Abhaengigkeit unveraendert
- Priortaet, Status, Labels unveraendert

## Kanonische Stelle (Architektur-Anker)

`sensor_type_registry.py`: SENSOR_TYPE_MAPPING + expand_multi_value() — MultispeQ-Library folgt
demselben Expansion-Muster. Bestehende Stelle, kein neues Pattern erfunden.
