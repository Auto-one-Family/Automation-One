# Root-Cause: BUG-18 — Acknowledged-Status toter Code

## Symptom
ISA-18.2 `acknowledged`-Status wird nie genutzt. 0 Rows mit Status "acknowledged" in notifications-Tabelle. Transition-Code existiert aber wird nie getriggert.

## Reproduktion
1. `SELECT status, COUNT(*) FROM notifications GROUP BY status;`
2. → active: 16, resolved: 46, acknowledged: 0
→ Feature implementiert aber nie benutzt

## Root Cause
- **Datei:** Frontend Alert-UI (vermutlich NotificationDrawer oder QuickAlertPanel)
- **Funktion:** Acknowledge-Button/Action
- **Problem:** Entweder:
  1. Der Acknowledge-Button ist im Frontend nicht erreichbar/sichtbar
  2. Oder der Acknowledge-Flow wird nie vom Benutzer getriggert (UX-Problem)
  3. Backend-Code fuer `active → acknowledged` Transition existiert und ist korrekt implementiert (inkl. `AlertInvalidStateTransition` Guard)

## Betroffene Schicht
- [ ] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [x] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: —
- Welche Daten: Kein Datenverlust
- Welche Funktionen: ISA-18.2 Alarm-Lifecycle unvollstaendig (nur active→resolved, kein acknowledge)

## Fix-Vorschlag
1. Frontend pruefen: Ist der Acknowledge-Button sichtbar und funktional?
2. Falls nicht: Button hinzufuegen oder sichtbar machen
3. Falls ja: UX verbessern damit Benutzer den Workflow kennen

## Fix-Komplexitaet
- [ ] Einzeiler
- [x] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: —
- Blockiert: — (standalone Feature-Completion)

## Verifikation nach Fix
```
Notification-Drawer → Tab "Aktiv" → Alert auswaehlen → "Zur Kenntnis nehmen"
→ SOLL: Status wechselt auf "acknowledged"

SELECT COUNT(*) FROM notifications WHERE status = 'acknowledged';
→ SOLL: > 0 (nach manuellem Test)
```
