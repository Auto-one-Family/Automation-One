# Analyseauftrag Server: Restpunkte State-Autoritaet, Reconnect-Uebergabe und Finalitaet

**Stand:** 2026-04-04  
**Typ:** Tiefenanalyseauftrag Backend (nur Server-Seite)  
**Ziel:** Die verbleibenden State-Restpunkte so analysieren und absichern, dass Reconnect-Uebergaben deterministisch, idempotent und ohne vermeidbare Schaltimpulse ablaufen.

---

## 0) Kontext und Zielbild

Das Zielsystem nutzt eine verteilte Autoritaetslogik:

- Der ESP traegt die Laufzeitautoritaet fuer den realen Aktorzustand.
- Der Server traegt die fachliche Autoritaet fuer globale Sollpolitik.
- Reconnect darf nie als impliziter Hard-Reset interpretiert werden.

Der Serverauftrag ist bestanden, wenn der gesamte Reconnect-Pfad als kontrollierter Uebergabeprozess laeuft:

1. reconnect erkannt,  
2. Adoption-Phase aktiv,  
3. Kompatibilitaet gegen Device-Istzustand geprueft,  
4. nur Delta-Enforce ausgefuehrt,  
5. finale Outcome-Kette eindeutig und regressionsfrei abgeschlossen.

---

## 1) Verbindliche Invarianten (Server)

1. **Adoption-vor-Enforce-Invariante:** Kein Enforce vor abgeschlossener Adoption.
2. **Delta-only-Invariante:** Wenn `adopted_current == desired`, dann no-op.
3. **Finalitaets-Invariante:** Jeder kritische Intent endet genau einmal final.
4. **Regressions-Invariante:** Kein spaeteres Event darf einen finalen Zustand zurueckdrehen.
5. **Prioritaets-Invariante:** Recovery-/Adoption-Pfade sind unter Last vor normaler Last zu bedienen.
6. **Safety-Invariante:** Safety darf nie durch Reconnect-Optimierung geschwaecht werden.

---

## 2) Aktueller Fokus: Offene Restpunkte

Der Auftrag fokussiert ausschliesslich auf die verbleibenden Luecken:

### P0 (blockierend)

1. **Reconnect-Uebergabe exakt einmal je Reconnect-Generation**
   - Es existiert bereits eine Adoption-Logik auf Device-Seite; serverseitig fehlt die harte Session-/Generation-Semantik fuer "exactly once handover complete".
   - Der Server muss Reconnect-Sessions als eigene fachliche Einheit fuehren, damit out-of-order oder duplicate ACKs keine zweite Uebergabe ausloesen.

### P1 (hoch)

2. **Generationsharte Config-Anwendung**
   - `generation` wird transportiert, aber die serverseitige End-to-End-Haertung gegen Replay/Out-of-order muss sicherstellen, dass nie eine aeltere Konfiguration ueber eine neuere gelegt wird.

3. **Final-State-Store je Intent**
   - Ohne bounded final state guard besteht Risiko von spaeten Duplikaten oder Statusregressionen in verteilten Fehlerfaellen.

4. **Recovery-Priorisierung in Queue-Orchestrierung**
   - Unter Last duerfen Adoption, Recovery und kritische Finalisierungen nicht von Normalverkehr verdraengt werden.

### P2 (Qualitaet/Abnahmefaehigkeit)

5. **Autoritaets- und Uebergabe-Metriken**
   - Reconnect-Qualitaet muss maschinell beweisbar sein, nicht nur per Einzel-Log.

---

## 3) Analyseumfang nach Server-Modulen

## S1 - Reconnect Session Orchestrator

### Pruefen
- Gibt es ein explizites serverseitiges `handover_session`-Konzept pro ESP?
- Werden Session-Start, Session-Ende und Session-Abbruch deterministisch markiert?
- Ist die Enforce-Freigabe strikt an den Abschluss der laufenden Session gekoppelt?

### Soll
- Pro Reconnect genau eine gueltige Uebergabesession.
- Events aus alter Session werden verworfen oder rein diagnostisch behandelt.

### Minimal-Fixrichtung
- Session-Key: `(esp_id, reconnect_epoch|handover_id)`.
- Enforce nur fuer aktive Session.
- Abschlussflag nur einmal setzbar (idempotent).

---

## S2 - Config Generation Gate

### Pruefen
- Wo wird `generation` final geprueft?
- Erfolgt ein harter Vergleich gegen `config_applied_generation` pro Scope?
- Ist Verhalten bei Retry/Replay/Out-of-order eindeutig?

### Soll
- Aeltere oder gleiche Generation wird konsequent abgelehnt.
- Neuer Stand wird atomar persistiert und als neue Referenz verwendet.

### Minimal-Fixrichtung
- Persistenter Applied-Stand pro Config-Scope.
- Eindeutige reject reasons (`STALE_GENERATION`, `DUPLICATE_GENERATION`).

---

## S3 - Intent Finalization Guard

### Pruefen
- Existiert ein finaler Zustandsspeicher je `intent_id`?
- Verhindert die Pipeline finale Regression (`applied -> failed`) durch spaete Duplikate?
- Ist dedupe bounded und speichersicher?

### Soll
- Genau ein finaler Outcome je Intent.
- Duplikate nach Finalisierung sind no-op mit observability.

### Minimal-Fixrichtung
- Bounded Ringbuffer/Store (z. B. 64-256 letzte Finalisierungen je ESP/Domain).
- Final-state write-once policy.

---

## S4 - Queue Scheduling und Recovery Priority

### Pruefen
- Welche Prioritaetsklassen sind definiert?
- Gibt es harte Vorrangregeln fuer Adoption/Recovery/Critical?
- Sind starvation und inversion unter Last ausgeschlossen?

### Soll
- Recovery-Klassen werden bevorzugt abgearbeitet.
- Normale Last darf Recovery nicht blockieren.

### Minimal-Fixrichtung
- Priority classes: `critical_recovery`, `critical`, `normal`, `best_effort`.
- Drain-Budgets pro Klasse mit garantierter Mindestrate fuer `critical_recovery`.

---

## S5 - Observability fuer Autoritaet und Uebergabe

### Pruefen
- Sind autoritaetsrelevante Zustandswechsel als Metrik sichtbar?
- Ist die handover-Qualitaet pro Szenario maschinell pruefbar?

### Soll
- Pro Reconnect klare Zaehler und Ereignisse fuer:
  - Adoption gestartet/abgeschlossen,
  - no-op Adoption vs Delta-Enforce,
  - Abbruch/Timeout.

### Minimal-Fixrichtung
- Metriken: `adopting_enter_count`, `adoption_noop_count`, `adoption_delta_count`, `handover_abort_count`.
- Outcome-Event mit session-id und reason-codes.

---

## 4) Pflichtszenarien (Server-Abnahme)

1. **S1 Serverausfall waehrend ESP weiterlaeuft**
   - Nach Rueckkehr keine blind enforce-Phase; zuerst Adoption.

2. **S2 ESP rebootet ohne Server, spaeter Reconnect**
   - Erster gueltiger Servereingriff erst nach abgeschlossener Adoption.

3. **S3 Reconnect bei aktivem lokalem Regelbetrieb**
   - Kompatibel: no-op. Inkompatibel: genau ein Delta-Enforce.

4. **S4 Reboot nahe Reconnect-Fenster**
   - Keine doppelte Uebergabe, keine zweite Delta-Welle.

5. **S5 Out-of-order ACK/Outcome**
   - Keine finale Regression, keine zweite Uebernahme.

6. **S6 Reconnect unter Last**
   - Recovery priorisiert, kritische Intents finalisiert.

---

## 5) Nachweisformat (verbindlich)

1. **Pro Modul:** Istpfad, Sollpfad, Luecke, Risiko, Minimal-Fix.
2. **Pro Szenario:** Timeline mit Session-ID, Autoritaet, Enforce-Freigabe, finalem Outcome.
3. **Pro Intent-Anomalie:** Ursache, betroffene Invariante, Schutzregel.
4. **Abschluss:** Priorisierte P0/P1/P2-Liste mit Aufwand, Risiko und Abnahmetest.

---

## 6) Abnahmekriterien

- [ ] Pro Reconnect existiert genau eine serverseitig gueltige Uebergabesession.
- [ ] Kein Enforce vor abgeschlossener Adoption.
- [ ] Aeltere oder gleiche Config-Generation wird hart abgelehnt.
- [ ] Jeder kritische Intent endet genau einmal final (keine Regression).
- [ ] Unter Last behalten Recovery-Intents Vorrang.
- [ ] Autoritaet und Uebergabe sind ueber Metriken maschinell nachweisbar.

Wenn einer der Punkte nicht belastbar gezeigt ist, gilt der Auftrag als nicht bestanden.

