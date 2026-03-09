# Root-Cause: BUG-17 — Subzone-Namen NULL in DB

## Symptom
5 von 7 subzone_configs haben `subzone_name = NULL`. Subzonen existieren aber ohne lesbaren Namen.

## Reproduktion
1. `SELECT id, subzone_name FROM subzone_configs;` → 5x NULL
2. Monitor/L2: Subzonen ohne Namen oder als "Unbenannt" angezeigt
→ Benutzer sieht keine sinnvollen Subzone-Labels

## Root Cause
- **Datei:** Config-Panel → API (Fullstack)
- **Funktion:** Subzone-Erstellung (implizit ueber Sensor-Config-Save)
- **Problem:** Subzonen werden implizit beim Sensor-Config-Save angelegt (kein dedizierter Dialog, siehe FL-02). Der Erstellungs-Flow setzt `subzone_name` nicht korrekt — entweder wird der Name nicht aus dem Frontend mitgeschickt, oder die API ignoriert ihn beim Anlegen.

## Betroffene Schicht
- [x] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [x] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: Alle ESPs mit Subzonen
- Welche Daten: subzone_name bleibt NULL
- Welche Funktionen: Monitor-View, L2 Subzone-Labels, ESPSettingsSheet Gruppierung

## Fix-Vorschlag
1. Frontend: Name-Feld im Config-Panel muss als `subzone_name` an die API gesendet werden
2. Backend: API-Endpoint fuer Subzone-Erstellung muss `subzone_name` akzeptieren und speichern
3. Fallback: Wenn kein Name → `subzone_name = "Subzone " + index`

## Fix-Komplexitaet
- [ ] Einzeiler
- [x] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: —
- Blockiert: — (standalone)

## Verifikation nach Fix
```query
SELECT COUNT(*) FROM subzone_configs WHERE subzone_name IS NULL;
→ SOLL: 0 (nach Fix + manuellem Update bestehender Rows)
```
