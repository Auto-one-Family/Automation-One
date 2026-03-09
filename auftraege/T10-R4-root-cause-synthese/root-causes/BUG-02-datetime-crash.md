# Root-Cause: BUG-02 — Subzone-ACK Datetime-Crash

## Symptom
`can't subtract offset-naive and offset-aware datetimes` bei jedem Subzone-ACK. Alle Subzone-Zuweisungen scheitern.

## Reproduktion
1. Sensor einer Subzone zuweisen (beliebiger ESP)
2. Subzone-ACK wird getriggert
3. `TypeError: can't subtract offset-naive and offset-aware datetimes`
→ ACK scheitert, Subzone bleibt ohne Bestaetigung

## Root Cause
- **Datei:** `subzone.py:127-131`
- **Funktion:** Model-Definition `last_ack_at`
- **Problem:** `DateTime` ohne `timezone=True` → PostgreSQL speichert als `TIMESTAMP WITHOUT TIME ZONE` → DB liefert naive datetime. Python-Code vergleicht `naive_from_db - datetime.now(timezone.utc)` → TypeError. Aufrufer: `subzone_service.py:674` setzt `datetime.now(timezone.utc)` (aware), DB liefert naive zurueck.

**Verstoss gegen eigene Regel:** `.claude/rules/api-rules.md` verbietet explizit `DateTime` ohne `timezone=True`.

## Betroffene Schicht
- [x] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [ ] El Frontend (Vue 3)
- [x] Infrastruktur (DB-Schema)

## Blast Radius
- Welche Devices: ALLE ESPs auf ALLEN Subzonen
- Welche Daten: Subzone-ACKs werden nicht gespeichert
- Welche Funktionen: Subzone-Zuweisungs-Workflow komplett blockiert

## Fix-Vorschlag
1. Model: `DateTime(timezone=True)` in `subzone.py:128`
2. Alembic-Migration: `op.alter_column('subzone_configs', 'last_ack_at', type_=sa.DateTime(timezone=True))`
3. Existierende NULL-Werte bleiben NULL (kein Datenverlust)

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
{compose_service="el-servador"} |= "offset-naive" |= "offset-aware"
→ SOLL: 0 Treffer
```
