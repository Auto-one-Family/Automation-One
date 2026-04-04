# Analyse- und Fixauftrag: Reset-Laufhaertung fuer NVS, Emergency-Parser und ACK-Recovery

**Stand:** 2026-04-04  
**Typ:** Vollstaendiger Analyse- und Fixauftrag  
**Prioritaet:** P1 (mit P0-Safety-Aspekt im Emergency-Pfad)  
**Ziel:** Die im aktuellen Lauf sichtbaren Restprobleme sauber haerten, ohne die bereits stabile Reset-/Offline-/Reconnect-Logik zu regressieren.

---

## 1) Gesamtbewertung des Laufs

Der Lauf ist in den Kernpfaden stabil:

1. Reset mit partieller Runtime-Basis wird erkannt.
2. Pending-Exit wird korrekt blockiert, solange Aktoren fehlen.
3. Nach Config-Push erfolgt definierter Exit in den Vollbetrieb.
4. Offline-Umschaltung und Warmup-Regeln funktionieren deterministisch.
5. Reconnect-ACK kann den Betrieb wieder normalisieren.

Gleichzeitig zeigen sich drei verbleibende Stoerungscluster:

- Persistenz-/NVS-Fehlerrauschen (`begin NOT_FOUND`, wiederholtes `hist NOT_FOUND`)
- Broadcast-Emergency-Parserfehler mit Fail-safe-Stop
- Outcome-/Publish-Failures im Stoerungsfenster

---

## 2) Evidenz aus dem Lauf (entscheidend)

### E1 - Pending-State funktioniert wie gewuenscht
```text
[BOOT] Runtime config partial after reset: sensors=3, actuators=0, offline_rules=0, policy_decision=MISSING_ACTUATORS
[CONFIG] Pending exit blocked: MISSING_ACTUATORS (sensors=3, actuators=0, offline_rules=0)
[CONFIG] Exit CONFIG_PENDING_AFTER_RESET -> OPERATIONAL
```

### E2 - NVS-/History-Fehler bleiben sichtbar
```text
begin(): nvs_open failed: NOT_FOUND
getString(): nvs_get_str len fail: hist NOT_FOUND
```

### E3 - Emergency-Broadcast parsebar nicht robust
```text
Broadcast emergency parse error: EmptyInput (code=EMERGENCY_PARSE_ERROR)
[SAFETY] Fail-safe emergency stop triggered due to parse error
```

### E4 - Publish/Outcome unter Stoerung fragil
```text
SafePublish failed after retry
Intent outcome publish failed [...]
Critical outcome persisted for replay [...]
```

---

## 3) Priorisierte Befunde

## B1 (hoch): NVS-Read-Pfad ist nicht sauber klassifiziert

### Ist
`NOT_FOUND` tritt in periodischen Pfaden wiederholt auf.

### Risiko
- echtes Persistenzproblem und erwartbare Optional-Keys sind derzeit schwer trennbar,
- Fehlerrauschen verdeckt echte Regressionen.

### Soll
Strikte Trennung:
- `expected_not_found` (kein Fehler),
- `unexpected_missing_key` (Fehler).

### Fixrichtung
1. Missing-Key-Klassifikator fuer alle `hist`-Reads.
2. Severity-Mapping und Rate-Limits.
3. Counter je Klasse fuer maschinelle Abnahme.

---

## B2 (hoch): Emergency-Parser ist funktional sicher, aber operativ zu empfindlich

### Ist
Malformed Broadcast triggert korrekt Fail-safe-Emergency-Stop.

### Risiko
Ein leeres/defektes Broadcast-Paket kann unnoetig harte Stops ausloesen und den Betrieb stoeren.

### Soll
Emergency-Vertrag muss robust gegen Rauschen sein, ohne Safety zu schwächen.

### Fixrichtung
1. Strikter Schema-Parser mit klaren Pflichtfeldern.
2. Trennung zwischen:
   - ungueltig aber harmlos -> reject + log + kein Stop,
   - sicherheitskritisch unklar -> fail-safe-stop.
3. Eindeutige Error-Codes und Counters pro Klasse.

---

## B3 (mittel/hoch): Outcome-Nachweis unter Publish-Fehlern ist nicht abnahmefest

### Ist
Outcome-Publish kann fehlschlagen, Replay wird angedeutet.

### Risiko
Wirkung im Feld ohne durchgaengige finale Nachvollziehbarkeit.

### Soll
Kritische Outcomes muessen auch unter Stoerung final verfolgbar bleiben.

### Fixrichtung
1. Persistenter Outcome-Replay-Pfad fuer kritische Klassen.
2. Idempotente Finalisierung im Empfaenger.
3. Metriken fuer Retry, Replay, final bestätigt.

---

## B4 (mittel): ACK-/Recovery-Zyklus braucht Timeout-Konsistenzregeln

### Ist
ACK timeout fuehrt in Offline-Delegation, spaeter ACK restore normalisiert.

### Risiko
Ohne klare Regeln fuer wiederholte Timeout/Restore-Zyklen drohen Zustandsspruenge in Randfaellen.

### Soll
Deterministische Recovery-State-Maschine mit klaren Debounce-/Timeout-Regeln.

### Fixrichtung
1. Explizite timeout/restore guards und reason-codes.
2. State-Transition-Telemetrie fuer jeden Timeout-/Restore-Zyklus.

---

## 4) Konkreter Fixauftrag (umsetzbar)

## F1 - NVS-Hygiene und Missing-Key-Klassifikation
1. Klassifikator fuer `hist`-Reads einbauen.
2. `expected_not_found` von echtem Fehler trennen.
3. Nur unerwartete Faelle als Error eskalieren.
4. Counter:
   - `hist_not_found_expected_count`
   - `hist_not_found_unexpected_count`

## F2 - Emergency-Parser-Vertrag haerten
1. Pflichtschema fuer Broadcast-Emergency festlegen.
2. Parserresult in Klassen aufteilen (`malformed`, `unsupported`, `critical_unknown`).
3. Fail-safe nur fuer klar definierte Klassen ausloesen.
4. Telemetrie:
   - `emergency_parse_error_count`
   - `emergency_failsafe_trigger_count`

## F3 - Outcome-Robustheit unter Retry
1. Kritische Outcome-Outbox/Replay absichern.
2. Replay-Bestaetigung und Finalzustand korrelieren.
3. Keine stille Outcome-Luecke bei Publish-Fehlern.

## F4 - ACK-Timeout/Restore-Konsistenz
1. Timeout/Restore-Transitions mit Guards standardisieren.
2. Transition-Events + Counters erfassen.
3. Mehrfachzyklen im Soak reproduzierbar stabil halten.

---

## 5) Testmatrix (Pflicht)

1. **T1 Pending-Exit-Schutz**
   - Teilkonfig -> Pending bleibt.
   - Vollkonfig -> definierter Exit.

2. **T2 NVS-Missing-Key-Klassifikation**
   - erwartbare fehlende Keys -> kein Error-Noise.
   - unerwartbare fehlende Keys -> sichtbarer Fehler.

3. **T3 Emergency malformed broadcast**
   - Parser entscheidet deterministisch nach Policy.
   - Kein undefiniertes Verhalten.

4. **T4 Publish-Failure Outcome-Recovery**
   - Kritische Outcomes bleiben final nachvollziehbar.

5. **T5 ACK timeout/restore loop**
   - Mehrfacher Zyklus ohne Zustandsdrift.

6. **T6 24h Soak**
   - Keine eskalierenden NVS-Races, stabile Telemetrie, konsistente Finalitaet.

---

## 6) Abnahmekriterien

- [ ] Pending-State-Logik bleibt stabil und regressionsfrei.
- [ ] `hist NOT_FOUND` ist sauber klassifiziert und verursacht kein blindes Error-Rauschen.
- [ ] Emergency-Parser ist robust und policy-konform.
- [ ] Kritische Outcomes bleiben unter Publish-Stoerung final nachweisbar.
- [ ] ACK timeout/restore-Transitions sind deterministisch und telemetrisch belegt.
- [ ] 24h-Soak zeigt stabile KPI-Werte ohne neue Guard-Bypasses.

Wenn einer dieser Punkte nicht belegt ist, gilt der Auftrag als nicht bestanden.

