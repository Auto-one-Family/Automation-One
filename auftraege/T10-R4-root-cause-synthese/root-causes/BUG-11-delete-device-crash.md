# Root-Cause: BUG-11 — Device-Delete 500 (astext AttributeError)

## Symptom
DELETE /api/v1/esp/devices/{id} → HTTP 500. Geraete koennen nicht ueber das Frontend geloescht werden.

## Reproduktion
1. Geraeteverwaltung → Device auswaehlen → Loeschen
2. Frontend zeigt generischen "500 Internal Server Error"
3. Loki: `AttributeError: Neither 'BinaryExpression' object nor 'Comparator' object has an attribute 'astext'`
→ Device-Loeschung komplett blockiert

## Root Cause
- **Datei:** `notification_repo.py:621`
- **Funktion:** `resolve_all_for_device()`
- **Problem:** `Notification.extra_data["esp_id"].astext == esp_id` — `.astext` ist eine PostgreSQL JSONB-API. Die Spalte `Notification.extra_data` ist aber als `Column(JSON)` deklariert (nicht `JSONB`) in `notification.py:139`. Bei `JSON`-Spalten gibt es kein `.astext`-Attribut → `AttributeError` bei jedem DELETE.

**Aufrufkette:**
```
DELETE /api/v1/esp/devices/{id}
  → esp_service.delete_device()
    → notification_repo.resolve_all_for_device(esp_id)  ← CRASH
      → Notification.extra_data["esp_id"].astext == esp_id  ← Zeile 621
```

## Betroffene Schicht
- [x] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [ ] El Frontend (Vue 3)
- [x] Infrastruktur (DB-Schema)

## Blast Radius
- Welche Devices: JEDES Device — Delete ist komplett blockiert
- Welche Daten: Devices bleiben in DB, manuelles Cleanup noetig
- Welche Funktionen: Device-Verwaltung (Loeschen, Cleanup)

## Fix-Vorschlag
Option A (Quick-Fix): `cast(Notification.extra_data["esp_id"], Text) == esp_id`
Option B (Empfohlen): Column-Typ von `JSON` auf `JSONB` aendern (Alembic-Migration). Dann funktioniert `.astext` korrekt und JSONB-Indizes sind moeglich.

## Fix-Komplexitaet
- [x] Einzeiler (Option A)
- [ ] Klein (1-2 Dateien, < 50 Zeilen) — Option B mit Migration
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: —
- Blockiert: — (standalone, aber blockiert T11 Phase 10)

## Verifikation nach Fix
```query
DELETE /api/v1/esp/devices/{test_device_id}
→ SOLL: HTTP 200 (oder 204)

{compose_service="el-servador"} |= "astext"
→ SOLL: 0 Treffer
```
