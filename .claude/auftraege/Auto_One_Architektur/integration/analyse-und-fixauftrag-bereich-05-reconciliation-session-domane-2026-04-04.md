# Analyse- und Fixauftrag Bereich 05: Reconciliation als Session-Domaene

**Stand:** 2026-04-04  
**Prioritaet:** P1  
**Ziel:** Recovery-/Reconnect-Vorgaenge sind als abgeschlossene Session mit Start, Verlauf, Ende und Ergebnis bilanzierbar.

---

## 1) Problemmechanik (fachlich erklaert)

Einzelne Reconnect- und Replay-Ereignisse liefern nur Punktinformation.  
Ohne Sessionbegriff fehlen:

- ein gemeinsamer Kontext fuer alle Recovery-Ereignisse,
- eindeutige Abschlussbedingungen,
- belastbare Metriken je Recovery-Lauf.

Damit bleibt unklar, ob ein Wiederanlauf wirklich erfolgreich war oder nur teilweise "ruhig aussieht".

---

## 2) Sollbild

Es existiert eine Session-Entitaet pro Recovery-Lauf:

1. `session_id`,
2. `device_id`,
3. `trigger_reason`,
4. `started_at`,
5. `phase`,
6. `counters` (replayed, rejected, dropped, recovered),
7. `terminal_status` (`completed` oder `failed`),
8. `terminal_reason`,
9. `ended_at`.

Eine Session ist erst beendet, wenn die Abschlussbedingungen explizit erfuellt sind.

---

## 3) Pflichtanalyse

1. Definiere Triggerereignisse fuer Sessionstart:
   - reconnect nach Verbindungsverlust,
   - handover/adoption,
   - recovery nach persistenzkritischem Fehler.
2. Definiere Phasenmodell:
   - `started`,
   - `running`,
   - `verifying`,
   - `completed`/`failed`.
3. Definiere Abschlusskriterien:
   - keine offenen kritischen Outcomes,
   - Replay-Queue abgearbeitet,
   - Konsistenzbelege vorhanden.
4. Definiere Fehlabschlusskriterien:
   - wiederholte terminale Drops,
   - Session-Timeout,
   - Verifikationsbruch.

---

## 4) Fixauftrag

## F1 - Session-Datenmodell + Persistenz

- Implementiere ein persistiertes Sessionobjekt mit eindeutiger ID.
- Speichere Phasenwechsel und Counter inkrementell.

## F2 - Eventverkettung

- Verknuepfe alle relevanten Outcome-/Replay-/Adoption-Ereignisse mit `session_id`.
- Stelle sicher, dass Events ohne Sessionkontext als Abweichung erkennbar sind.

## F3 - API + Live-Sicht

- Exponiere:
  - aktive Session je Device,
  - Historie abgeschlossener Sessions,
  - Abschlussgrund und Kennzahlen.
- Live-Event-Strom fuer Session-Lifecycle bereitstellen.

## F4 - Metrikstandard

- Definiere mindestens:
  - `reconciliation_sessions_started_total`,
  - `reconciliation_sessions_completed_total`,
  - `reconciliation_sessions_failed_total`,
  - `reconciliation_session_duration_seconds`,
  - `reconciliation_session_replayed_total`.

---

## 5) Testmatrix

1. **T1 Reconnect erzeugt Sessionstart**  
   Session startet deterministisch mit Triggergrund.

2. **T2 Erfolgreicher Lauf**  
   Session durchlaeuft Phasen und endet `completed`.

3. **T3 Fehlgeschlagener Lauf**  
   Session endet `failed` mit terminal_reason.

4. **T4 Parallelereignisse waehrend Session**  
   Counter bleiben konsistent, keine Doppelzuordnung.

5. **T5 Session-Historie**  
   API liefert nachvollziehbare Verlaufsdaten mit korrekter Dauer.

---

## 6) Abnahmekriterien

- [ ] Jeder Recovery-Lauf erzeugt genau eine Session.
- [ ] Jede Session endet explizit in `completed` oder `failed`.
- [ ] Session-Counter sind konsistent und querybar.
- [ ] Session-Lifecycle ist live sichtbar und historisch auswertbar.
- [ ] Abschlussgruende sind ursachenscharf und nicht generisch.

Wenn Recovery-Ereignisse ohne Sessionkontext auftreten oder Sessions ohne Terminalstatus offen bleiben, gilt der Auftrag als nicht bestanden.

