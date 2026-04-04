# Analyse- und Fixauftrag Bereich 04: Device-Degraded als First-Class-Betriebszustand

**Stand:** 2026-04-04  
**Prioritaet:** P1  
**Ziel:** Degraded ist ein persistierter, querybarer und alarmierbarer Betriebszustand mit klaren Eintritts- und Clear-Regeln.

---

## 1) Problemmechanik (fachlich erklaert)

Ein einzelnes Degraded-Feld in Heartbeats reicht operativ nicht aus.  
Ohne Zustandsmodell fehlt:

- Historie (seit wann degradiert?),
- Ursache (warum degradiert?),
- Schwere (wie kritisch?),
- Exit-Bedingung (wann gilt das System wieder als stabil?).

Folge: Drift und Teilstoerungen bleiben zwar "irgendwie sichtbar", aber nicht belastbar auswertbar.

---

## 2) Sollbild

Degraded wird als eigenes Zustandsobjekt gefuehrt:

1. `active` (boolean),
2. `reason_code` (kanonisch),
3. `severity`,
4. `entered_at`,
5. `last_updated_at`,
6. `clear_eligibility_state`,
7. `cleared_at`,
8. zaehlbare Ursachemetriken.

Zustandswechsel sind Ereignisse, nicht implizite Nebenwirkungen.

---

## 3) Pflichtanalyse

1. Definiere Ursachenfamilien:
   - Persistenzdrift,
   - Commit-/Queue-/Outbox-Stoerung,
   - Transportinstabilitaet,
   - Safety-induzierte Degradierung.
2. Definiere Eintrittslogik:
   - welches Signal,
   - wie oft,
   - in welchem Zeitfenster.
3. Definiere Clear-Logik:
   - notwendige Stabilitaetsdauer,
   - notwendige Gegenbelege (z. B. erfolgreiche Commits),
   - verbotene Sofort-Clears.
4. Analysiere Fehlklassifikation:
   - false positive degraded,
   - false negative normal.

---

## 4) Fixauftrag

## F1 - Normalisiertes Degraded-Datenmodell

- Fuehre ein persistiertes Zustandsschema pro Device ein.
- Nutze kanonische reason_codes statt Freitext.
- Aktualisiere Zustand transaktional bei neuen Heartbeats/Outcomes.

## F2 - Lifecycle-Engine

- Implementiere Zustandsuebergaenge:
  `normal -> degraded -> recovering -> normal`.
- `recovering` ist Pflichtzustand vor Rueckkehr nach `normal`.
- Clear nur nach nachgewiesener Stabilitaet.

## F3 - Sichtbarkeit + Alarmierung

- Exponiere Degraded-Lifecycle in API und Live-Event-Strom.
- UI zeigt:
  - aktiven Zustand,
  - Ursache,
  - Dauer,
  - Trend (haeufigkeit/haertung).

## F4 - Metrikstandard

- Definiere mindestens:
  - `device_degraded_active_total`,
  - `device_degraded_enter_total`,
  - `device_degraded_clear_total`,
  - `device_degraded_duration_seconds`.

---

## 5) Testmatrix

1. **T1 Eintritt bei wiederholter Drift**  
   Device wechselt deterministisch nach degraded.

2. **T2 Kein Sofort-Clear**  
   Ein einzelner "guter" Zyklus beendet degraded nicht sofort.

3. **T3 Stabilitaets-Clear**  
   Nach definierter stabiler Phase erfolgt korrektes Clear.

4. **T4 Ursachewechsel waehrend degraded**  
   Reason-Code-Update erfolgt ohne Zustandskorruption.

5. **T5 Historie und API-Query**  
   Eintritt, Dauer und Exit sind vollstaendig nachvollziehbar.

---

## 6) Abnahmekriterien

- [ ] Degraded besitzt ein persistiertes Lifecycle-Modell.
- [ ] Jeder aktive Degraded-Zustand hat reason_code + severity.
- [ ] Clear folgt nur definierten Stabilitaetsregeln.
- [ ] API und UI koennen aktiven Zustand und Verlauf anzeigen.
- [ ] Metriken erlauben Trendauswertung pro Device und Ursache.

Wenn Degraded ohne Grundcode aktiv ist oder ohne Stabilitaetsnachweis cleared, gilt der Auftrag als nicht bestanden.

