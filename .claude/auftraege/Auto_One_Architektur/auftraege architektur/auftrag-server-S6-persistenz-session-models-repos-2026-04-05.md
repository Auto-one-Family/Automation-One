# Auftrag S6 — Persistenz: Session, Models, Repositories, Alembic

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse  
**Empfohlener Agent:** `server-debug`

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — G2, G5, Persistenz in allen Pfaden  
2. Vorarbeit: **S5** (wer schreibt aus MQTT) und **S2** (wer schreibt aus HTTP) — für Kreuzvalidierung

---

## Code-Wurzel

`El Servador/god_kaiser_server/src/db/`  
`El Servador/god_kaiser_server/alembic/` (Migrationen, env)

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S6-persistenz-2026-04-05.md`

---

## Ziel

Du lieferst die **autoritative Schichtenbeschreibung**: welche Tabelle von welchem Repo/Service **gelesen/geschrieben** wird, wo Transaktionen anfangen und enden, und was bei **DB-Ausfall** aus Sicht der Caller passiert (Exception, Buffer, stiller Drop).

---

## Aufgaben

1. **Session-Fabrik:** async/sync, Scopes, `get_session`-Pattern, Fehlerbehandlung.  
2. **Models:** Liste der Tabellen/Entitäten mit Kurzrolle (fachlich).  
3. **Repositories:** Pro Repo die öffentlichen Methoden und welche Tabellen sie berühren.  
4. **Schreibmatrix:** Zeilen = konkrete Writer (Service/Handler/API), Spalten = Tabelle, Zelle = Operation (insert/update/upsert/delete) + **Datei:Funktion**.  
5. **Transaktionen:** typische `commit`-Grenzen; wo `flush` entscheidend ist; bekannte Race-Szenarien.  
6. **DB-down:** pro **Caller-Kategorie** (MQTT-Inbound, HTTP, Background): Exception durchschlagen? Retry? Circuit? Message verloren? — **G2 „keine stillen Verluste“** explizit bewerten.  
7. **Alembic:** wie Migrationen zum Modell passen; auffällige Drifts zwischen Model und Migration (falls sichtbar).

---

## Scope-Hinweis

Keine separate „nur Schema“-Philosophie — Fokus **Laufzeitpfade**. Tiefe nur-Schema-Analyse bleibt anderen Paketen vorbehalten, sofern sie nicht dieselben Pfade duplizieren.

---

## Deliverables

- Schreib-/Lesematrix (kompakt, maschinenlesbar wenn möglich)  
- Liste „authoritative fields“ pro Kernentität (was ist Source of Truth im Server)  
- Gap-Liste P0/P1/P2

---

## Abnahmekriterien

- Jede **in S5/S2 genannte** persistierende Operation ist in der Matrix wiederzufinden oder als Lücke P1/P2 markiert  
- Mindestens drei **DB-Störfall**-Pfade mit erwartetem Verhalten (Codeanker)
