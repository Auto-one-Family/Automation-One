# Analyse- und Fixauftrag: `CONFIG_PENDING_AFTER_RESET` Haertung (State, Guards, Exit, Telemetrie)

**Stand:** 2026-04-04  
**Typ:** Verbindlicher Analyse- und Umsetzungsauftrag  
**Fokus:** Runtime-Zwischenzustand bei unvollstaendiger Konfigurationsbasis nach Reset  
**Ziel:** Sicherstellen, dass der Pending-Zustand nicht vorzeitig verlassen wird und alle externen Kommandopfade konsistent derselben Guard-Matrix folgen.

---

## 1) Problemdefinition

Nach einem Reset kann das System in einem technisch validen Zwischenzustand starten:

- Basisdienste laufen,
- Kommunikation ist moeglich,
- aber die fachliche Runtime-Basis ist noch unvollstaendig (z. B. fehlende Aktoren oder Offline-Regeln).

Dafuer existiert der Zustand `CONFIG_PENDING_AFTER_RESET`.  
Dieser Zustand ist nur dann korrekt, wenn **alle** relevanten Pfade dieselbe Semantik erzwingen:

1. Kein vorzeitiger Sprung in Normalbetrieb durch externe ACKs.
2. Konsistente Command-Guards fuer alle Command-Typen.
3. Eindeutige, reproduzierbare Exit-Bedingung.
4. Saubere Transition-Telemetrie fuer Abnahme und Forensik.

---

## 2) Priorisierte Befunde

## B1 (kritisch): ACK kann Pending indirekt aushebeln

### Ist
Der Heartbeat-ACK-Pfad setzt je nach Status den globalen Systemzustand auf `PENDING_APPROVAL` oder `OPERATIONAL`.

### Risiko
Wenn diese Mutation ohne erneute Runtime-Vollstaendigkeitspruefung passiert, kann `CONFIG_PENDING_AFTER_RESET` zu frueh verlassen werden.

### Soll
ACK darf in Pending-Konstellation nur den Contract-Status bestaetigen, nicht blind den Runtime-State ueberschreiben.

### Fixprinzip
- ACK-Handler muss `CONFIG_PENDING_AFTER_RESET` priorisieren.
- Statewechsel aus Pending nur ueber zentrale Exit-Funktion mit Vollstaendigkeitscheck.

---

## B2 (hoch): Guard-Matrix fuer `system_command` ist unvollstaendig

### Ist
Aktor- und Sensor-Commands haben Pending-Guards, `system_command` jedoch nicht in derselben Strenge.

### Risiko
Systembefehle koennen im Pending-Zustand wirksam werden, obwohl die Runtime-Basis noch nicht freigegeben ist.

### Soll
Einheitliche Guard-Matrix fuer alle Command-Subtypen:

- `actuator_command`
- `sensor_command`
- `system_command`

mit konsistenten Reason-Codes und klaren Allowlist-Ausnahmen.

### Fixprinzip
- Zentrale Command-Admission-Funktion statt verteilter Einzelguards.
- `system_command` nur per expliziter Allowlist im Pending erlauben.

---

## B3 (mittel): Definition der "Mindestbasis" ist nicht eindeutig

### Ist
Vollstaendigkeit wird aktuell ueber starre Zaehlkriterien bestimmt.

### Risiko
Wenn fachlich sensorloser Betrieb in bestimmten Setups erlaubt ist, ist die aktuelle Definition zu streng oder missverstaendlich.

### Soll
Eine verbindliche, dokumentierte Semantik:

- Welche Komponenten sind **zwingend**?
- Welche sind **optional** je Betriebsprofil?

### Fixprinzip
- `RuntimeReadinessPolicy` als klarer Vertrag (nicht nur impliziter bool).
- Betriebsprofile dokumentieren (z. B. sensorpflichtig vs sensoroptional).

---

## B4 (mittel): Transition-Telemetrie ist nicht vollstaendig strukturiert

### Ist
Eintritt/Austritt sind teilweise geloggt und ueber State beobachtbar.

### Risiko
Abnahme und Root-Cause-Analyse bleiben auf unscharfe Logkorrelation angewiesen.

### Soll
Strukturierte Transition-Events:

- `entered_config_pending`
- `exit_blocked_config_pending`
- `exited_config_pending`

jeweils mit reason, Basiszaehlern, decision code.

### Fixprinzip
- Dedizierte Event-Emission bei jedem Statewechselversuch.
- Counter fuer enter/exit/blocked.

---

## 3) Verbindliche Architekturregeln

1. `CONFIG_PENDING_AFTER_RESET` hat Vorrang vor ACK-induzierter "normal"-Promotion.
2. Statewechsel aus Pending ist nur ueber **eine** zentrale Exit-Entscheidung erlaubt.
3. Command-Admission ist zentralisiert und subtype-uebergreifend konsistent.
4. Jede Block-/Allow-Entscheidung hat maschinenlesbaren Reason-Code.
5. Telemetrie und Logik muessen dieselbe Entscheidungsquelle verwenden.

---

## 4) Konkreter Fixauftrag

## F1 - ACK-Handler haerten (kritisch)

### Umsetzung
1. Vor jeder ACK-getriebenen State-Mutation:
   - `is_config_pending_after_reset == true`?
2. Falls ja:
   - keine Promotion nach `PENDING_APPROVAL` oder `OPERATIONAL`,
   - stattdessen `pending retained` Event mit reason.
3. Promotion nur ueber `evaluatePendingExit()` (zentrale Funktion).

### Pflicht-Reason-Codes
- `CONFIG_PENDING_RETAINS_STATE_ON_ACK`
- `CONFIG_PENDING_EXIT_NOT_READY`
- `CONFIG_PENDING_EXIT_READY`

---

## F2 - Zentrale Guard-Matrix fuer alle Commands

### Umsetzung
1. Eine zentrale Funktion `shouldAcceptCommand(subtype, command, context)` einfuehren.
2. Regeln fuer Pending-Zustand:
   - Default: reject.
   - Nur explizite Allowlist erlaubt.
3. Einheitliche Outcome-Codes fuer alle Subtypen.

### Pflicht-Reason-Codes
- `CONFIG_PENDING_AFTER_RESET`
- `COMMAND_NOT_ALLOWED_IN_PENDING`
- `COMMAND_ALLOWED_PENDING_ALLOWLIST`

---

## F3 - Runtime-Readiness-Definition explizit machen

### Umsetzung
1. Readiness-Policy als expliziten Vertrag auslagern:
   - Pflichtkomponenten,
   - optionale Komponenten,
   - Profilparameter.
2. Exit aus Pending nur wenn Policy `READY == true`.

### Pflichtartefakt
- Kurzspezifikation "Runtime-Mindestbasis und Profile".

---

## F4 - Transition-Telemetrie vervollstaendigen

### Umsetzung
1. Strukturierte Events fuer Enter/Exit/Blocked.
2. Felder:
   - `event_type`
   - `reason_code`
   - `sensor_count`
   - `actuator_count`
   - `offline_rule_count`
   - `state_before`
   - `state_after`
3. Zusaetzliche Counter:
   - `config_pending_enter_count`
   - `config_pending_exit_count`
   - `config_pending_exit_blocked_count`

---

## 5) Pflichttests (mindestens)

1. **T1 Pending bleibt trotz ACK approved**
   - Setup: unvollstaendige Runtime-Basis.
   - Erwartung: ACK verarbeitet, aber State bleibt Pending.

2. **T2 Definierter Exit bei vervollstaendigter Basis**
   - Setup: Config-Push macht Basis vollstaendig.
   - Erwartung: zentraler Exit, sauberer Zielstate, Exit-Event vorhanden.

3. **T3 system_command im Pending**
   - Setup: Pending aktiv.
   - Erwartung: Block/Allow exakt laut Matrix, einheitlicher Reason-Code.

4. **T4 Regressionstest fuer actuator/sensor command**
   - Erwartung: bestehende Guards bleiben wirksam und kompatibel.

5. **T5 Telemetrie-Verifikation**
   - Erwartung: Enter/Exit/Blocked Events + Counter konsistent.

---

## 6) Abnahmekriterien

- [ ] ACK kann `CONFIG_PENDING_AFTER_RESET` nicht mehr indirekt aushebeln.
- [ ] Exit-Bedingung ist zentral, reproduzierbar und testbelegt.
- [ ] Guard-Matrix gilt konsistent fuer actuator/sensor/system command.
- [ ] Readiness-Definition ist explizit dokumentiert und implementiert.
- [ ] Transition-Telemetrie ist strukturiert und maschinenlesbar.
- [ ] Alle Pflichttests T1-T5 sind gruen.

Wenn einer dieser Punkte nicht belegt ist, gilt der Auftrag als nicht bestanden.

