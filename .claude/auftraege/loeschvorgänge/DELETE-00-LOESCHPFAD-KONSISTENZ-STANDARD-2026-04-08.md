# DELETE-00 - Loeschpfad Konsistenz-Standard (verbindlich)

> Typ: Querschnitts-Standard fuer alle DELETE-01 bis DELETE-10  
> Ziel: Einheitliche Loesch-/Archiv-/Restore-Mechanik ueber alle Bereiche, mit bereichsspezifischen Add-ons

---

## Zweck

Dieser Standard stellt sicher, dass jeder Loeschpfad:
- dieselbe technische Grundlogik verwendet,
- dieselbe Nutzerkommunikation bietet,
- dieselben Backup-/Archiv-/Restore-Phasen einhaelt,
- und trotzdem die Besonderheiten seines Bereichs (ESP, Zone, Subzone, Sensor, Aktor, User, Dashboard, Logic, Migration) sauber abbildet.

---

## Verbindliches 9-Phasen-Modell

Jeder DELETE-Auftrag muss alle 9 Phasen explizit analysieren und im Bericht nachweisen:

1. **Preflight und Berechtigung**
   - Rolle/Permission, Objektzustand, Sperrbedingungen (z. B. letzte Admin-Person, aktive Zuweisungen).
2. **Impact-Scan**
   - Direkte Tabellen, indirekte Referenzen (JSON/String), UI-Referenzen, Rules, Caches, Scheduler.
3. **Pflicht-Snapshot**
   - `backup-before-delete` mit `backup_id`, Scope je Entitaetstyp, Operator, Zeitfenster, Korrelations-ID.
4. **Safety-Quiesce (falls physisch relevant)**
   - Aktor OFF, Offline-Rules neutralisieren, Pending-MQTT/ACK-Status dokumentieren.
5. **Mutation**
   - Soft-Delete/Archive/Hard-Delete/Update als transaktionaler Kernschritt mit klarer Reihenfolge.
6. **Referenz- und Folgebereinigung**
   - FK-Cleanup + App-Level-Cleanup (`device_active_context`, Dashboards, Logic-Referenzen, denormalisierte Felder).
7. **Sync und Eventing**
   - MQTT/WS/Audit/Notifications, inkl. Offline-, Retry- und Partial-Failure-Verhalten.
8. **Restore-Faehigkeit**
   - Konfliktvorschau, Revert-Pfad, Wiederherstellungsgrenzen und noetige Remapping-Optionen.
9. **Retention und Purge**
   - 7 Tage User-Restore, 30 Tage Admin-Archiv, danach Purge; Policy in `system_config` steuerbar. Nur wenn eingestellt. Vollständige persistenz des Backups IMMER Möglich machen. 

---

## Einheitliche Ergebnisstruktur in allen Berichten

Fuer jeden einzelnen Flow (z. B. Delete, Rename, Archive, Toggle) muss der Bericht enthalten:

- **IST-Zustand**
- **GAPS**
- **SOLL**
- **Phase-Check (1-9)** mit `erfuellt / teilweise / offen`
- **Risiko-Klasse** (`critical/high/medium/low`)
- **Restore-Klasse** (`voll`, `teilweise`, `nicht moeglich`)

---

## Pflichtfelder fuer Snapshot/Audit

Minimum-Felder, die in jedem Auftrag als Zielbild gefordert sein muessen:

- `backup_id`
- `entity_type`
- `entity_id`
- `scope` (`delete|archive|update|migration`)
- `created_at`
- `created_by`
- `correlation_id`
- `expires_at_user`
- `expires_at_admin`
- `restore_status`

---

## Einheitliche UX-Mindesttexte

Delete/Archive-Dialoge muessen semantisch einheitlich sein:

- "Wird vor der Aenderung gesichert."
- "Wiederherstellung fuer 7 Tage verfuegbar."
- "Historische Daten bleiben entsprechend der Datenpolitik erhalten."
- "Bei Konflikten waehrend Restore ist eine Vorschau verfuegbar."

---

## Bereichsspezifische Erweiterung (Pflicht)

Zusaetzlich zur Querschnittslogik muss jeder Auftrag seine Domainenrisiken explizit absichern:

- ESP: Device-Zone-Context, Mock/Real, CommandBridge-ACK.
- Zone/Subzone: Topologie und Zuordnungsintegritaet.
- Sensor/Aktor: Kalibrierung, Safety, Offline-Rules, Laufzeitdaten.
- User: Rollen, letzte Admin-Person, DSGVO-konforme Endphase.
- Dashboard: Widget-Referenzen, shared ownership.
- Logic: Execution-History, tote Referenzen, Konfliktmanager.
- Migration: Preview, Batch, Revert, Konfliktauflosung.

---

## Freigabekriterien fuer kuenftige Umsetzungsauftraege

Ein DELETE-Auftrag gilt nur als "umsetzungsreif", wenn:

- alle 9 Phasen bewertet wurden,
- Backup/Restore nicht nur erwaehnt, sondern je Flow konkretisiert wurde,
- bereichsspezifische Risiken mit klaren SOLL-Regeln erfasst sind,
- und keine stillen Hard-Deletes ohne Backup verbleiben.

