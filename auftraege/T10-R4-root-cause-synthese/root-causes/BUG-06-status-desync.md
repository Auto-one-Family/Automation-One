# Root-Cause: BUG-06 — Status-Desync / Online-Offline-Flicker

## Symptom
Wokwi-ESP zeigt endlosen Online→Offline-Zyklus (~30s). Config-Saves scheitern mit 403 DEVICE_NOT_APPROVED.

## Reproduktion
1. Wokwi-ESP starten (sendet `ts=0`)
2. Heartbeat setzt `status="online"` + `last_seen=1970-01-01`
3. Maintenance-Check (alle 15-30s): `last_seen` ist 56 Jahre alt → `status="offline"`
4. Naechster Heartbeat: `status="online"` (kurzzeitig)
→ Endlos-Flicker + Config-Save → 403

## Root Cause
- **Datei:** `heartbeat_handler.py:202` + `heartbeat_handler.py:164-174`
- **Funktion:** `_handle_heartbeat()` + `_update_pending_heartbeat()`
- **Problem (2 Ursachen):**
  1. **Problem A:** `ts=0` von Wokwi → `last_seen = datetime.fromtimestamp(0) = 1970-01-01` → Maintenance-Service sieht "56 Jahre alt" → setzt `status="offline"` (= BUG-05 Folgewirkung)
  2. **Problem B:** `pending_approval`-Zweig kehrt FRUEH zurueck (Zeile 164-174): `_update_pending_heartbeat()` aktualisiert nur Metadata, `update_status()` (Zeile 214) wird NIE erreicht → `status` bleibt `pending_approval`/`offline`, Frontend berechnet aber "online" aus `last_seen`-Alter

**Frontend-Inkonsistenz:** `useESPStatus.ts:97-103` berechnet Online-Status als Fallback aus `last_seen`-Alter (Priority 3). Dies widerspricht dem Server-Guard in `sensors.py:583` der den DB-`status` prueft.

## Betroffene Schicht
- [x] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [x] El Frontend (Vue 3) — Fallback-Logik
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: ALLE Wokwi-ESPs + ALLE pending_approval-Devices
- Welche Daten: Config-Saves blockiert (403)
- Welche Funktionen: Sensor-Konfiguration, Aktor-Konfiguration, Device-Approval-Workflow

## Fix-Vorschlag
1. BUG-05 Fix (ts=0 Guard) loest Problem A automatisch
2. Problem B: Im `pending_approval`-Pfad nach Approval → Status-Transition zu "online" (Zeile 164-174)
3. Frontend: `useESPStatus.ts` muss `pending_approval` als eigenen Status behandeln, nicht als "online" Fallback

## Fix-Komplexitaet
- [ ] Einzeiler
- [x] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: BUG-05 (ts=0 ist die eigentliche Ursache fuer Problem A)
- Blockiert: T11 Phase 6 (Config-Edit komplett blockiert)

## Verifikation nach Fix
```query
{compose_service="el-servador"} |= "timed out" |= "ESP_00000001"
→ SOLL: 0 Treffer (nach Wokwi-Start mit korrektem Timestamp)

Playwright: L1 → Wokwi-ESP MiniCard 60s beobachten
→ SOLL: Status-Dot bleibt gruen (kein Flicker)
```
