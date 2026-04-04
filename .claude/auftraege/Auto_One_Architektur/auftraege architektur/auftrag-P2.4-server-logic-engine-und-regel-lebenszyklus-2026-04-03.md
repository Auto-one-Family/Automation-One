# Auftrag P2.4: Server Logic Engine und Regel-Lebenszyklus (selbsttragend)

**Ziel-System:** Auto-one Backend "El Servador"  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** HIGH  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~6-10h  
**Abhaengigkeit:** P2.1 bis P2.3 abgeschlossen

---

## Verbindlicher Arbeits- und Ablagekontext

Der bearbeitende Agent hat keinen Zugriff auf das Life-Repo.

- Arbeitswurzel: `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
- Ausgabeordner:
  `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server`

---

## Systemwissen fuer diesen Auftrag

Die Logic Engine ist die Bruecke zwischen Datenlage und automatischer Aktorentscheidung.

Der Regel-Lebenszyklus umfasst:

1. Rule-Definition (Create/Update/Delete).
2. Aktivierung und Laufzeit-Evaluation.
3. Triggering und Action-Ausfuehrung.
4. Konfliktbehandlung zwischen mehreren Regeln.
5. Schutz gegen Endlosschleifen und Selbsttrigger.

Die Analyse muss explizit zeigen, wie Definition, Runtime und UI-Sicht konsistent bleiben.

---

## Ziel

Erstelle ein belastbares Modell des kompletten Rule-Lifecycles inklusive Triggerlogik, Konfliktloesung, Loop-Prevention und Konsistenzgrenzen.

---

## Pflichtvorgehen (detailliert)

### Block A - Rule-Domain und Datenmodell

1. Dokumentiere Rule-Struktur:
   - Bedingungen (Conditions),
   - Aktionen (Actions),
   - Prioritaet,
   - Timing,
   - Aktivierungsstatus.
2. Dokumentiere Persistenzfelder und Versionierungslogik.

### Block B - Evaluationspipeline

1. Triggerquellen erfassen (Telemetry, Zeit, Event, manuell).
2. Evaluationsreihenfolge und Kurzschlussregeln dokumentieren.
3. Action-Dispatch-Pfade und Ruemeldekanal (ACK/NACK/Status) erfassen.

### Block C - Konflikte und Schleifen

1. Konfliktklassen definieren:
   - gleichzeitige gegensaetzliche Actions,
   - konkurrierende Regeln mit gleichem Ziel,
   - Prioritaetskollision.
2. Dokumentiere Conflict-Resolution-Strategie.
3. Dokumentiere Loop-Prevention:
   - Selbsttrigger vermeiden,
   - Thrashing/Flapping abfangen,
   - Cooldown/Hysterese/Guard-Timing.

### Block D - Konsistenz Definition vs Runtime vs UI

1. Dokumentiere, wie Runtime-Status in die UI uebertragen wird.
2. Markiere Drift-Risiken:
   - Rule gespeichert aber nicht aktiv,
   - Rule aktiv aber UI stale,
   - Action ausgefuehrt aber Rule-State unvollstaendig.
3. Definiere beobachtbare Beweise (Logs/Metriken/Events) fuer jeden kritischen Zustand.

---

## Verbindliche Ausgabe

Erstelle exakt diese Datei:

`C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server\paket-04-server-logic-engine-und-regel-lebenszyklus.md`

Pflichtstruktur:

1. Scope und Rule-Begriffe
2. Rule-Datenmodell und Versionierungsregeln
3. Evaluations- und Triggerpipeline
4. Konflikt- und Loop-Prevention-Matrix
5. Konsistenzanalyse Runtime/UI
6. Risiken (Top 10) + Priorisierung
7. Hand-off in P2.5/P2.7

---

## Akzeptanzkriterien

- [ ] Rule-Lifecycle ist fuer Create/Update/Delete/Runtime vollstaendig beschrieben
- [ ] Triggering und Ausfuehrungsreihenfolge sind klar nachvollziehbar
- [ ] Konflikt- und Loop-Schutz ist explizit und pruefbar dokumentiert
- [ ] Konsistenzgrenzen zwischen Rule, Runtime und UI sind transparent
- [ ] Ergebnis ist ohne externe Kontextdatei voll verstaendlich
