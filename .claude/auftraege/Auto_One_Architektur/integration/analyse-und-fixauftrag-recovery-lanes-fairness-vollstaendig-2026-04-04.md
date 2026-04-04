# Analyse- und Fixauftrag: Recovery-Lanes und Fairness unter Last (vollstaendig)

**Stand:** 2026-04-04  
**Typ:** Verbindlicher Analyse- und Umsetzungsauftrag  
**Ziel:** Ein systemweit einheitliches Lane-/Admission-/Fairness-System fuer `sensor`, `actuator`, `config`, `publish` herstellen und reproduzierbar nachweisen, dass kritische Recovery-Flows unter Last nicht verdrängt werden.

---

## 1) Ausgangslage

Der aktuelle Stand ist funktional brauchbar, aber nicht abnahmefest:

1. Es gibt verteilte Priorisierungslogik (z. B. punktuelle Front-Queue-Priorisierung, `critical` bei Publish).
2. Queue-Full wird oft sichtbar gehandhabt (Logs/Outcomes), aber nicht nach einheitlichem Vertrag.
3. Drain-Budgets existieren teilweise je Queue, jedoch ohne globale Lane-Fairness.
4. Es fehlt ein verbindliches, gemeinsames Lane-Modell ueber alle Fluesse.

Folge: Kritische Recovery-Ereignisse koennen unter Last weiterhin indirekt benachteiligt werden.

---

## 2) Zielbild (Definition of Done)

Der Auftrag ist erst bestanden, wenn alle Punkte gleichzeitig gelten:

1. Ein **einheitliches Lane-Schema** gilt fuer alle relevanten Queue-Items.
2. Eine **einheitliche Admission-Policy** (`retry/reject/defer`) ist verbindlich implementiert.
3. Ein **globaler Fair-Drain-Mechanismus** steuert alle vier Fluesse deterministisch.
4. Kritische Recovery-Items besitzen **Aufnahmegarantie** auch bei hoher Last.
5. **Lane-spezifische Telemetrie** (Depth, Starvation, p95/p99) ist aktiv.
6. Ein **reproduzierbarer Lasttest-Workflow** belegt die Invarianten.

---

## 3) Verbindliche Invarianten

1. **No-Starvation-Invariante**
   - `critical_recovery` darf unter Last nicht verhungern.

2. **Admission-Invariante**
   - Jede Queue-Aufnahmeentscheidung ist explizit einer Klasse zugeordnet: `accepted`, `deferred`, `rejected`, `retryable`.

3. **Fairness-Invariante**
   - Lane-Bedienung folgt einer dokumentierten Quote je Drain-Zyklus.

4. **Consistency-Invariante**
   - Lane-Zuordnung fuer semantisch gleiche Ereignisse ist in allen Fluesse identisch.

5. **Observability-Invariante**
   - Jede Verdrängung, Defer-Entscheidung und Starvation wird messbar.

---

## 4) Konkrete Restluecken (aus Befunden abgeleitet)

## L1 - Lane-Modell ist nicht einheitlich

### Problem
Aktuell existiert verteilte Sonderlogik statt eines gemeinsamen Typs.

### Fix
- Ein zentraler Lane-Typ fuer alle Queue-Items:
  - `critical_recovery`
  - `critical`
  - `normal`

- Verbindliche Mapping-Regeln:
  - Recovery-Events (z. B. `clear_emergency`, Recovery-Handshake, kritische Reconcile-Aktionen) -> `critical_recovery`
  - Safety-kritische, aber nicht Recovery-spezifische Events -> `critical`
  - reguläre Telemetrie-/Konfig-/Command-Last -> `normal`

---

## L2 - Admission-Policy nicht normiert

### Problem
Je Queue unterschiedliche Heuristiken (sofort drop, kurzes wait, langes wait, teils Persistenz), kein einheitlicher Vertrag.

### Fix
- Zentrale Admission-API einführen:
  - Input: `lane`, `queue_state`, `message_class`
  - Output: `accept`, `defer`, `reject`, `retry`

- Verbindliches Verhalten:
  - `critical_recovery`: nie still droppen; bei Kapazitaet `defer` oder kontrollierte Eviction niedriger Lane.
  - `critical`: bevorzugt aufnehmen, ggf. kurzes `defer`.
  - `normal`: bei Druck frueh `reject/retry`.

- Einheitliche Outcome-Codes fuer Entscheidungen.

---

## L3 - Keine globale Fair-Drain-Steuerung

### Problem
Einzelne Queues haben Budgets, Publish drain’t teils eigenstaendig ohne lane-uebergreifende Koordination.

### Fix
- Globalen Fair-Drain-Scheduler definieren (z. B. WRR).
- Beispielquote pro Zyklus:
  - `critical_recovery`: 4
  - `critical`: 2
  - `normal`: 1

- Scheduler gilt fuer alle vier Fluesse mit identischer Semantik.

---

## L4 - Aufnahmegarantie fuer Recovery fehlt

### Problem
Bei Queue-Druck kann kritische Recovery indirekt verlieren.

### Fix
- Reserved Slots je Queue fuer `critical_recovery`.
- Optional kontrollierte Eviction von `normal` zugunsten `critical_recovery`.
- Harte Guard-Regel: `critical_recovery_drop_count` muss im Normalbetrieb 0 bleiben.

---

## L5 - Telemetrie fehlt fuer Abnahme

### Problem
Es fehlen lane-spezifische Depth-/Starvation-/Latenzmetriken.

### Fix
- Pflichtmetriken je Lane:
  - `queue_depth_{lane}`
  - `enqueue_decision_{lane,accept|defer|reject|retry}`
  - `starvation_count_{lane}`
  - `queue_wait_ms_{lane}` (p50/p95/p99)
  - `drain_items_{lane}`
  - `drop_count_{lane}`

- Export in bestehende Heartbeat-/Diagnostikkanäle integrieren.

---

## L6 - Lasttest nicht operationalisiert

### Problem
Es fehlt ein reproduzierbarer, standardisierter Nachweis fuer Parallel-Last plus Recovery.

### Fix
- Dediziertes Testprofil erstellen:
  1) hoher normaler Sensor-/Aktor-/Config-Druck,
  2) parallel Recovery-Events injizieren,
  3) Messung je Lane.

- Standard-Reportformat:
  - Input-Lastprofil
  - erwartete Quoten
  - gemessene Quoten
  - Starvation-/Drop-/Latency-Auswertung
  - Pass/Fail je Invariante.

---

## 5) Umsetzungsauftrag (dateinah und ausfuehrungsfest)

## Block A - Shared Lane Contract
1. Zentralen Lane-Typ + Mapping-Regeln definieren.
2. In allen Queue-Item-Typen Lane-Feld verpflichtend machen.
3. Bestehende Sonderflags auf Lane-Modell abbilden.

## Block B - Shared Admission Contract
1. Zentrale Admission-Funktion implementieren.
2. Alle `queue*()`-Aufrufe auf diese API migrieren.
3. Einheitliche Outcome-Codes und Logs fuer Admission-Entscheidungen.

## Block C - Global Fair Drain
1. Fair-Drain-Scheduler (WRR/Quota) implementieren.
2. Drain-Loops der vier Fluesse an Scheduler koppeln.
3. Quote und Burst-Limits konfigurierbar machen.

## Block D - Recovery Aufnahmegarantie
1. Reserved Slots oder kontrollierte Eviction fuer `critical_recovery`.
2. Harte Checks gegen stilles Dropping kritischer Recovery.

## Block E - Telemetrie und Reports
1. Lane-Metriken beim Enqueue/Dequeue/Outcome sammeln.
2. Export in Diagnosekanal integrieren.
3. Automatischen Lasttest-Report generieren.

---

## 6) Testmatrix (verbindlich)

1. **T1 Baseline-Lane-Mapping**
   - Alle Eingangsarten werden korrekt einer Lane zugeordnet.

2. **T2 Admission-Kontrakt**
   - `accept/defer/reject/retry` verhalten sich je Lane wie spezifiziert.

3. **T3 Fairness ohne Recovery**
   - Unter normaler Last entsprechen Drain-Raten der Zielquote.

4. **T4 Recovery unter Burst**
   - `critical_recovery` bleibt bedient, keine Starvation.

5. **T5 Queue-Full Stress**
   - Normale Last wird ggf. verworfen, Recovery bleibt aufnahmefaehig.

6. **T6 E2E Finalitaet unter Last**
   - Kritische Intents bleiben final nachvollziehbar trotz Druck und Retry.

---

## 7) Abnahmekriterien

- [ ] Einheitliches Lane-Schema ist in allen vier Fluesse aktiv.
- [ ] Admission-Vertrag (`retry/reject/defer`) ist durchgaengig umgesetzt.
- [ ] Fair-Drain-Quote ist deterministisch und messbar.
- [ ] `critical_recovery` zeigt keine Starvation in Lasttests.
- [ ] Lane-spezifische Depth/Starvation/p95/p99-Metriken sind verfuegbar.
- [ ] Lasttest-Workflow liefert reproduzierbaren Pass/Fail-Report.

Wenn ein Punkt nicht belegt ist, gilt der Auftrag als nicht bestanden.

