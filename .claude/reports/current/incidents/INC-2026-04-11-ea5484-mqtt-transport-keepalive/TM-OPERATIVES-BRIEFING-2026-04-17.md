# STATE-ARCHITECTURE-ANALYSIS — TM Operatives Briefing

**Incident:** INC-2026-04-11-ea5484-mqtt-transport-keepalive
**Datum:** 2026-04-17
**Zielgruppe:** Technical Management (Erstanalyse -> Linear-Verteilung -> Umsetzungssteuerung)
**Scope:** Cross-Layer-State-Drift bei Reconfigure/Reconnect (Firmware <-> Broker <-> Server <-> DB <-> Frontend)
**Arbeitsbranch fuer Umsetzung:** `auto-debugger/work`

---

## 1) Executive Klartext fuer die Erstentscheidung

Kein singulärer Crash-Bug, sondern ein Drift-Loop aus mehreren korrekt gemeinten Mechanismen, die unter Last nicht strikt auf dieselbe Autoritaet zeigen.

Der wichtigste operative Punkt fuer den TM:

1. **Der Ausloeser liegt im Transportpfad**, aber der **schwerere Schaden entsteht im Recovery-/Contract-Pfad**.
2. **Safety-P4-Verhalten ist erwartungskonform**, kein Regressionstreiber.
3. **AUT-54..AUT-67 reichen im Kern aus**, wenn korrekt geschaerft und in Abhaengigkeiten orchestriert.
4. **Neue Arbeit nur minimal als Gap-Ergaenzung** (Backpressure, Adoption-Restart-Persistenz, WS-Drift-Projektion).

---

## 2) TM-Entscheidungsregeln

| Frage | Antwort | Regel |
|---|---|---|
| A — Primär MQTT-Transport? | Nein, nur Trigger. | AUT-54 immer mit AUT-67 + AUT-55 zusammen fahren. |
| B — P4/Offline-Mode fehlerhaft? | Nein, policy-konform. | Nur Regressions-Härtung; Fokus auf Re-Adoption und Ready-Gates. |
| C — Autoritätskollision? | Drei Stellen (ACK-Quelle, In-Memory-Adoption, connected-vs-ready). | Ein autoritativer Writer pro State-Feld, Rest nur Spiegel. |
| D — AUT-54..AUT-67 ausreichend? | Ja zu ~90 %. | Drei Gap-Tickets optional. |
| E — Reihenfolge in Linear? | Transport+Counter → Outcome → Reconnect/Adoption/Readiness → Cooldown/WS/UX → Soak. | Workstream-Matrix §4. |

---

## 3) SSOT-Regeln (zwingend)

1. `transport_connected` ist kein Betriebsstatus. Betriebsfähigkeit erst bei `ack_validated && readiness_ok`.
2. Finale Config-Erfolge nur nach Commit. `applied` ist Zwischenstatus.
3. Queue-Fails sind immer terminal. Kein reines Logging bei `errQUEUE_FULL`/Parse-Fail/Persist-Fail.
4. Offline-Exit nur über autoritativen ACK-Contract. Andere Signale sind Hinweise.
5. Readiness muss per-ESP sichtbar sein, nicht nur global.
6. Counter duplizieren keine Fehlerklasse. Jede Transportstörung in genau eine Primärkategorie.

---

## 4) Workstream-Matrix

### WS-1 Transport & Counter-Wahrheit
**Tickets:** AUT-54, AUT-67
**In Scope:** Reconnect-Attempt-Reset nur nach valider ACK-Contract-Bestätigung; eindeutige Klassifikation `write_timeout` vs. `tls_timeout` inkl. Metrik/Alert.
**Out of Scope:** Config-Lifecycle, UI.
**DoD:** Attempt-Peak sinkt nach validem Reconnect deterministisch; Counter bilden Feldlogs konsistent ab.

### WS-2 Firmware Outcome/Queue-Terminalität
**Tickets:** AUT-55, AUT-60 (Teil), AUT-61
**In Scope:** Terminale NACK-Pfade für Queue-Full/Parse/Persist; `payload_degraded` beeinflusst Publish-Backpressure; Approval-Dedup-Invarianten in Tests.
**Out of Scope:** Server-Adoption-Policy.
**DoD:** Keine stillen Drops in kritischen Pfaden; jede kritische Fehlersituation hat finalen Outcome-Code.

### WS-3 Reconnect/Adoption/Readiness (Server)
**Tickets:** AUT-56, AUT-63, AUT-59
**In Scope:** Reconnect-Threshold an Heartbeat-Realität koppeln (`2 × interval`); Adoption als Gate für Logic-Evaluation; Per-ESP-Readiness-Snapshot.
**Out of Scope:** Broker TLS-Profil.
**DoD:** Keine Logic-Ausführung vor Adoption-Complete; sichtbarer, reproduzierbarer Converged-Endzustand pro ESP.

### WS-4 Config-Cooldown & Contract-Roundtrip
**Tickets:** AUT-57, AUT-62, AUT-65
**In Scope:** Cooldown aus JSON-Metadaten in verlässliche Persistenz; Correlation/Generation/Epoch end-to-end; WS-Projektion konsistent mit Contract-Lifecycle.
**Out of Scope:** Safety-P4 Kernlogik.
**DoD:** Recovery-Push wird bei echten Reconnect-Zuständen nicht unnötig blockiert; WS/REST/MQTT zeigen dieselbe Kontraktwahrheit.

### WS-5 Safety-/Emergency-Konsistenz
**Tickets:** AUT-64, AUT-66
**In Scope:** Emergency-Payload-Normalisierung (lowercase-Contract); Re-Arm-Regressionen nach OFFLINE_ACTIVE.
**Out of Scope:** Transportmetriken.
**DoD:** Kein 3016 durch Payload-Case-Drift; Safety-Rückkehrpfad stabil.

### WS-6 UX-/Operator-Gates
**Tickets:** AUT-58
**In Scope:** Deterministisches Config-Timeout-Banner + Retry; klare Anzeige `connected` vs. `ready`.
**Out of Scope:** Firmware intern.
**DoD:** Kein unendliches „waiting" ohne terminale Rückmeldung.

---

## 5) Präzisierung AUT-54..AUT-67

| AUT | Schärfung (AC-Zusatz) |
|---|---|
| **AUT-54** | AC: „attempt reset ≤ 2 valide ACKs" nach Reconnect. |
| **AUT-55** | Pflichtfeld `intent_outcome/lifecycle=failed` bei critical publish exhaustion. |
| **AUT-56** | Reconnect-Threshold dynamisch (`2 × heartbeat_interval`); stale-epoch fail-closed. |
| **AUT-57** | Cooldown dauerhaft in stabiler Persistenz (Spalte), nicht nur metadata-JSON. |
| **AUT-58** | Deterministisches Config-Timeout-Banner + Retry; `connected` vs. `ready` sichtbar. |
| **AUT-59** | Per-ESP ready snapshot (`adoption_phase`, `last_ack_epoch`, `backoff_state`). |
| **AUT-60** | Backpressure-Regel aus `payload_degraded` (priorisierte Publish-Klassen, non-critical bremsen). |
| **AUT-61** | Einheitsdokument + Invariant-Test für Approval-Dedup-Pfade (Callsite + ConfigManager). |
| **AUT-62** | LWT/Config-Response Roundtrip mit konsistentem Schlüsselraum (correlation_id/generation). |
| **AUT-63** | Logic-Gate = `is_online && adoption_completed && readiness_ok`. |
| **AUT-64** | Emergency-Contract casing normalisieren + Tests (lowercase `stop_all` / `emergency_stop`). |
| **AUT-65** | E2E `correlation_id` lückenlos REST → WS → MQTT → FW → Response. |
| **AUT-66** | Nur Regressionshärtung (funktional bereits korrigiert). |
| **AUT-67** | Counter mutual exclusivity (`errno=119` → genau ein Primärcounter) + Prometheus-Alert bei Drift. |

---

## 6) Neue Erkenntnisse und minimale Gap-Ergänzungen

Nur wenn AUT-Präzisierungen nicht reichen:

1. **G-NEW-01 — Backpressure aus Degradation-Signal**
   `payload_degraded=true` bremst non-critical publishing temporär.

2. **G-NEW-02 — Restartfeste Adoption-Wahrheit**
   In-Memory-Adoption reicht nicht für Server-Restart-Fälle.

3. **G-NEW-03 — WS-Drift-Event bei terminal-authority block**
   Metrik allein reicht nicht, Operator braucht sichtbares Drift-Ereignis.

---

## 7) Convergence-Gates

Ein Zyklus gilt nur als „converged", wenn gleichzeitig gilt:

- FW: `registration_confirmed=true`
- FW: `offline_mode=ONLINE`
- FW: reconnect-attempt wieder auf Basisniveau
- Server: epoch konsistent mit FW
- Server: adoption completed
- DB: status `online` + terminal authority final
- Logic: kein offener backoff für das ESP
- UI: `ready` sichtbar, kein config-timeout-banner

**Zeitbudget:** kurzer Hiccup ≤ 15 s · echter Reconnect ≤ 45 s · Reconfigure ≤ 10 s

---

## 8) Best Practices of Coding (Pflicht)

1. Contract-First: erst Status-/Fehlervertrag, dann Code.
2. Minimaldiff: keine opportunistischen Refactors in kritischen Pfaden.
3. Single Writer: pro State-Feld genau ein autoritativer Schreiber.
4. Terminalität erzwingen: kein Pending ohne Endzustand.
5. Negativtests verpflichtend: Queue-Full, Parse-Fail, Cooldown-Race, Reconnect-Burst.
6. Leistung mit Sicherheit koppeln: Backpressure statt blindes Retry-Spamming.

**Typische KI-Fehler (TM verhindert aktiv):** „connected = success"-Fehlannahme · stille Fallbacks statt expliziter Rejections · zusammengelegte Fehlerklassen · große Cross-Layer-Diffs ohne isolierbare Ursache · fehlende Abhängigkeitsreihenfolge in Linear.

---

## 9) Sofortige TM-Handlungsfolge

1. **Startblock:** AUT-54 + AUT-67 zusammen freigeben.
2. **Parallel dazu:** AUT-55 + AUT-61 (Outcome/Queue/Approval-Invarianten).
3. **Strikt sequenziell:** AUT-56 → AUT-63 → AUT-59 (Lifecycle vor Logic vor UI-State).
4. **Danach:** AUT-57/62/65 als Contract- und Projektionsebene.
5. **P0-Hygiene:** AUT-64 sofort abräumen.
6. **Nach Contract-Projektion:** AUT-58.
7. **G-NEW-01..03** nur bei bestätigter Restlücke anlegen.
