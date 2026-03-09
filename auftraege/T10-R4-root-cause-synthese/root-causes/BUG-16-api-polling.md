# Root-Cause: BUG-16 — Excessive API-Polling

## Symptom
`/api/v1/notifications/alerts/stats` wird 6+ mal pro Seitenladung abgefragt. Unnoetige Last auf Backend.

## Reproduktion
1. Browser DevTools → Network Tab
2. Beliebige Seite laden
3. Filter auf "alerts/stats"
→ 6+ identische GET-Requests innerhalb weniger Sekunden

## Root Cause
- **Datei:** Frontend Notification-Stores (mehrere)
- **Funktion:** Alert-Stats-Polling
- **Problem:** Mehrere Vue-Stores/Composables rufen unabhaengig voneinander den gleichen Endpoint ab. Kein zentrales Dedup oder Shared-Cache. Jede Komponente die Alert-Badge/Count zeigt, triggert eigenen API-Call.

## Betroffene Schicht
- [ ] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [x] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: —
- Welche Daten: Keine Datenverluste
- Welche Funktionen: Performance — 6x statt 1x API-Calls pro Navigation

## Fix-Vorschlag
Zentralen Notification-Store mit Debounce/Cache: Alle Alert-Stats-Abfragen ueber einen einzigen Store leiten. Cache mit 5-10s TTL. Oder: WebSocket-basierte Push-Updates statt Polling.

## Fix-Komplexitaet
- [ ] Einzeiler
- [x] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: —
- Blockiert: — (standalone Performance)

## Verifikation nach Fix
```
Browser DevTools → Network → Seitenladung
→ SOLL: Maximal 1x /api/v1/notifications/alerts/stats pro Navigation
```
