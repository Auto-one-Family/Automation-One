# Analyseauftrag Server: Modultrennung, State-Adoption und Uebernahme ohne Aktor-Aussetzer

**Stand:** 2026-04-03  
**Typ:** Tiefenanalyseauftrag Backend (nur Server-Seite)  
**Ziel:** Finden, warum bei Reconnect in Einzelfaellen eine kurze OFF-Phase entsteht, obwohl lokale ESP-Regeln stabil laufen, und wie die Uebernahme ohne Flackern sauber umgesetzt wird.

---

## 0) Hauptbefund und Ziel-Loesung (verbindlich)

### Hauptbefund (kontextbezogen)
Das Reconnect-Fenster enthaelt aktuell mindestens einen Pfad, der vor abgeschlossener Adoption eine erzwungene Schaltreaktion ausloesen kann. Dadurch entstehen kurzfristige OFF-Impulse trotz grundsaetzlich stabiler Gesamtlage.

### Ziel-Loesung fuer dein System (ohne Dopplung, robust, nicht ueberkompliziert)
1. **Server uebernimmt nicht blind**, sondern startet immer mit State-Adoption.
2. **Reconnect-Evaluation ist gated**: keine Enforce-Logik vor `adoption_completed`.
3. **Delta-only-Steuerung**: nur reale Abweichungen werden geschaltet.
4. **Freshness vor Trigger**: replayte/stale Daten duerfen keine falschen Schaltentscheidungen erzeugen.

### Architekturregel ohne Dopplungen
- ESP haelt lokale Kontinuitaet und meldet Istzustand.
- Server bildet globale Sollpolitik und orchestriert Konflikte.
- Uebergabe passiert genau einmal je Reconnect-Zyklus: `adopt -> compare -> delta`.

---

## 1) Auftrag und Zielbild

Du analysierst den Server **modulweise getrennt**, aber im gemeinsamen Architekturkontext mit autonomem ESP-Betrieb.

Der Auftrag ist erfolgreich, wenn belegt ist:

1. Der Server unterscheidet strikt zwischen Transport-Reconnect und fachlicher Uebernahmebereitschaft.
2. Die Uebernahme von ESP-Zustaenden erfolgt als Adoption/Reconciliation, nicht als pauschales Enforce-Reset.
3. Lokale ESP-Regelaktivitaet wird beim Reconnect korrekt erkannt und konfliktfrei uebernommen.
4. Unnoetige OFF-Impulse beim Wiederverbinden werden technisch verhindert.

---

## 2) Architektur-Invarianten (verbindlich)

1. **Autonomie respektieren:** Solange Server nicht fachlich synchronisiert ist, bleibt lokale ESP-Regelwirkung gueltig.
2. **Adoption vor Enforce:** Bei Reconnect zuerst Istzustand uebernehmen und bewerten, dann erst Sollzustand aktiv durchsetzen.
3. **Keine Blind-Reset-Regel:** "connected" allein darf keine Aktor-Ruecksetzung ausloesen.
4. **Deterministische Autoritaetsuebergabe:** Uebergabezeitpunkt und -bedingungen muessen explizit und testbar sein.
5. **Safety bleibt hart:** Safety-Gates dürfen nie durch Uebergabeoptimierung umgangen werden.

---

## 3) Pflicht-Szenarien (Server-Sicht)

1. **Serververlust, ESP regelt lokal weiter** (Server ist komplett weg).
2. **Server kommt zurueck, ESP hat aktive Regeln** (kein Aktor-Flackern).
3. **ESP rebootet ohne Server, dann Reconnect** (Adoption aus frischem Device-State).
4. **Reconnect waehrend hoher Eventlast** (Sensor, Outcomes, Commands parallel).
5. **Late/out-of-order Rueckkanalereignisse** (ACK/Status/Outcome verspätet).
6. **Teilpartition** (einige ESP online, andere offline).

### Pflichtzusatz fuer alle Szenarien
Pro Szenario muss explizit nachgewiesen werden:
1. wann die serverseitige Enforce-Phase freigeschaltet wird,
2. welche Events als stale gelten und daher nicht schalten duerfen,
3. dass bei `Ist==Soll` keine Kommandos gesendet werden.

---

## 4) Modulweise Analyse (Server)

## S1 - Runtime-Orchestrierung und Betriebsmodi

### Pruefen
- Trennung zwischen Prozessgesundheit und fachlicher Uebernahmefaehigkeit.
- Zustandswechsel bei Reconnect/Recovery.
- Guard-Regeln vor Wechsel in vollen Betriebsmodus.

### Achten auf
- False-normal (zu fruehe "alles gruen"-Freigabe).
- Betriebsmodus ohne abgeschlossene Reconciliation.

### Soll-Ergebnis
- Moduswechsel nur nach erfuellten fachlichen Guards.

---

## S2 - Device-Liveness (Heartbeat/LWT/Timeout)

### Pruefen
- Korrekte Online/Offline-Bewertung bei schnellen Wechseln.
- Reconnect-Erkennung und Trigger fuer Uebernahmeprozess.
- Konflikte zwischen LWT, Heartbeat und Timeout-Auswertung.

### Achten auf
- Doppelte oder widerspruechliche Statuswechsel.
- Fruehe Reconnect-Aktionen ohne belastbaren Device-Istzustand.

### Soll-Ergebnis
- Stabiler Liveness-Status als Basis fuer Uebergabeentscheidungen.

---

## S3 - Sensor-Ingest und Triggerpfad

### Pruefen
- Sensorereignisse als Trigger waehrend Recovery.
- Reihenfolge zwischen Ingest, Persistenz und Logic-Trigger.
- Verhalten bei DB-Degradation.

### Achten auf
- Trigger auf unvollstaendigem Zustand.
- Eventverlust in kritischen Reconnect-Fenstern.

### Soll-Ergebnis
- Trigger feuern nur auf konsistentem Datenstand.

### Exakter Auftrag (umsetzungsnah)
- Fuehre ein Freshness-Gate ein (event-time statt nur processing-time).
- Replay-Events duerfen nur dann Logic triggern, wenn sie innerhalb des gueltigen Freshness-Fensters liegen.
- Dokumentiere harte Regeln fuer stale-drop vs stale-observe.

---

## S4 - Command-/Actuator-Pipeline

### Pruefen
- Trennung von dispatch accepted vs hardware confirmed.
- Verhalten bei parallelen lokalen und serverseitigen Schaltentscheidungen.
- Dedup-/Korrelationslogik bei Reconnect.

### Achten auf
- Server-send OFF als generisches Reconnect-Verhalten.
- Doppelkommandos oder out-of-order Finalisierung.

### Soll-Ergebnis
- Kein unnoetiger Reset-Befehl bei kompatiblem Ist-/Sollzustand.

### Exakter Auftrag (umsetzungsnah)
- Vor jedem Enforce-Command muss ein idempotenter Dispatch-Guard laufen:
  - wenn `desired == adopted_current`, dann no-op.
- Kommandos im Reconnect-Fenster nur als Delta zulassen.
- Outcome je Aktor-Intent durchgaengig finalisieren (kein offener Zwischenstatus ohne Abschluss).

---

## S5 - Logic Engine und Konfliktaufloesung

### Pruefen
- Wann und wie Regeln nach Reconnect erneut evaluiert werden.
- Konfliktregeln zwischen "bereits lokal aktiv" und "serverseitig geplant".
- Cooldown/Hysterese/Rate-Limit im Recovery-Fenster.

### Achten auf
- Sofortige Re-Eval, die lokale stabile Aktorlage zerstoert.
- Konfliktmanager ohne Kontext "State bereits aktiv".

### Soll-Ergebnis
- Re-Evaluation fuehrt zu konsistenter Uebernahme statt Oszillation.

### Exakter Auftrag (umsetzungsnah)
- Reconnect-Eval in zwei Stufen aufteilen:
  1) Adoption abgeschlossen?
  2) Dann erst Regel-Reevaluation mit Delta-Ausgabe.
- Ohne Adoption darf die Logic beobachten, aber nicht enforcen.

---

## S6 - Reconciliation-/State-Adoption-Manager

### Pruefen
- Existiert ein expliziter Adoption-Schritt vor Enforce?
- Wie wird Device-Istzustand gegen Rule-Sollzustand gematcht?
- Wann gilt ein Zustand als "bereits korrekt" (idempotente Uebernahme)?

### Achten auf
- Fehlen einer "no-op bei Kompatibilitaet"-Regel.
- Enforce trotz bereits passendem Aktorzustand.

### Soll-Ergebnis
- Bei Kompatibilitaet: Uebernahme ohne Aktorumschaltung.

### Exakter Auftrag (umsetzungsnah)
- Etabliere einen expliziten `StateAdoptionService` (oder funktional gleichwertig):
  - Snapshot einlesen,
  - Kompatibilitaet bewerten,
  - Delta berechnen,
  - Enforce nur bei Delta.
- Definiere `adoption_completed` als harte technische Vorbedingung fuer Enforce.

---

## S7 - Safety-Service

### Pruefen
- Safety-Checks waehrend Recovery und Uebergabe.
- Emergency/clear_emergency in Kombination mit Reconnect.
- Safety als letzter Gatekeeper vor jedem Schaltkommando.

### Achten auf
- Safety-Freigabe zu frueh nach Reconnect.
- Recovery-Pfade, die Safety indirekt umgehen.

### Soll-Ergebnis
- Safety bleibt konsistent, ohne unnötige OFF-Impulse durch Fehlgating.

---

## S8 - Outcome-, API- und WebSocket-Schicht

### Pruefen
- Vollstaendige Sichtbarkeit von accepted/rejected/applied/failed/expired.
- Korrelation pro Intent ueber Persistenz, API und Realtime.
- Konsistenz zwischen Fachstatus und UI-relevanter Projektion.

### Achten auf
- Erfolgssignal ohne finale Bestaetigung.
- Statusmischung waehrend v1/v2-Parallelitaet.

### Soll-Ergebnis
- Einheitliche, korrelierbare Outcome-Kette ohne semantische Luecken.

### Exakter Auftrag (umsetzungsnah)
- Reconnect-Uebergabe als eigene Outcome-Phase sichtbar machen (`adopting`, `adopted`, `delta_enforced` oder aequivalente Semantik).
- Sicherstellen, dass UI nicht "final erfolgreich" zeigt, bevor finaler Intent-Zustand vorliegt.

---

## S9 - Persistenz, Idempotenz und Backfill

### Pruefen
- Persistente Endzustandsfuehrung pro Intent.
- Idempotente Verarbeitung bei Duplicate/Reorder.
- Backfill-/Migration-Regeln in Uebergangsfenstern.

### Achten auf
- Mehrfach-finalisierung pro Intent.
- Inkonsistente Alt-/Neustatus im gleichen Intent.

### Soll-Ergebnis
- Genau ein finaler Zustand pro Intent, auch unter Reconnect- und Migrationslast.

---

## S10 - Observability und No-Go-Gates

### Pruefen
- Gibt es Kennzahlen fuer OFF-Impulse bei Reconnect?
- Gibt es Trigger fuer v1/v2-Statusinkonsistenz pro Intent?
- Sind No-Go-Bedingungen operational scharf definiert?

### Achten auf
- "Green Dashboard", aber ungelöste Fachinkonsistenz.
- Fehlende Alarmierung bei kurzzeitigen, aber kritischen Umschaltimpulsen.

### Soll-Ergebnis
- Harte, automatisierbare No-Go-Erkennung.

### Exakter Auftrag (umsetzungsnah)
- Fuehre dedizierte Reconnect-Flackern-KPIs ein:
  - OFF->ON/OFF innerhalb definierter Sekunden nach Reconnect pro ESP/GPIO.
- Definiere harten No-Go-Trigger:
  - Inkonsistente Alt-/Neustatus pro `intent_id` oder wiederholte Reconnect-Oszillation.

---

## 5) Kernanalyse "Uebernahme ohne Aktor-Aus"

Du untersuchst den gesamten Uebergabepfad mit Fokus auf:

1. **Adoption-Phase:** Device-Istzustand zuerst einlesen und als gueltigen Startpunkt setzen.
2. **Kompatibilitaetspruefung:** Wenn Ist==Soll (fachlich), dann keine Schaltaktion.
3. **Delta-Enforce:** Nur echte Deltas schalten.
4. **Idempotenz:** Wiederholte Reconnect-/Replay-Events duerfen keine Umschaltimpulse erzeugen.
5. **Safety-Ausnahme:** Nur Safety darf einen harten Zustandswechsel erzwingen.

Ziel: Reconnect ohne sichtbares Aktor-Flackern in kompatiblen Faellen.

### Verbindliche Minimal-Implementierung (nicht ueberkomplizieren)
1. Reconnect erkannt -> `ADOPTING`
2. Device-Istzustand aufnehmen
3. Kompatibilitaet gegen Soll bewerten
4. `Ist==Soll` -> no-op, sonst Delta-Enforce
5. `adoption_completed=true` -> normale Logic/Command-Freigabe

---

## 6) Nachweisformat (Pflicht)

1. **Pro Modul:** Istpfad, Sollpfad, Luecke, Risiko, Fix-Ansatz.
2. **Pro Pflichtszenario:** Ereignis-Timeline mit Zustandsuebergaengen und Kommandofolge.
3. **Fuer OFF-Intermezzo:** exakter Ausloeser, Bedingung, Vermeidungsregel.
4. **Abschluss:** priorisierte P0/P1/P2-Fixliste mit Akzeptanzkriterien.

---

## 7) Abnahmekriterien

- [ ] Reconnect fuehrt in kompatiblen Faellen nicht zu OFF-Impulsen.
- [ ] Autoritaetsuebergabe erfolgt deterministisch und nachvollziehbar.
- [ ] Jeder kritische Intent hat korrelierbaren finalen Zustand.
- [ ] Recovery-/Reconciliation-Pfade sind unter Last stabil.
- [ ] Architektur-Invarianten in allen Pflichtszenarien eingehalten.

### Zusatzkriterien ohne Dopplungen
- [ ] Kein generisches Reconnect-OFF ohne fachliche Notwendigkeit.
- [ ] Enforce-Logik startet nie vor abgeschlossener Adoption.
- [ ] Jeder Reconnect durchlaeuft genau einen Uebergabezyklus (keine doppelten Adoption/Enforce-Loops).

Wenn einer dieser Punkte nicht belegt ist, gilt der Auftrag als nicht bestanden.

