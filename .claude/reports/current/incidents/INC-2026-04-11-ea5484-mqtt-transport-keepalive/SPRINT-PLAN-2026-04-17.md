# SPRINT-PLAN — INC EA5484 MQTT-Transport & Recovery Hardening

**Erstellt:** 2026-04-17 · **Planungsmodus:** Flow bis INC durch (kein fester Sprintrahmen) · **Modell:** 3 Wellen á ~1 Woche auf ~20 SP/Woche Parallelkapazität
**Linear-Projekt:** MQTT-Transport & Recovery Hardening (INC EA5484)
**Arbeitsbranch:** `auto-debugger/work` (von `master`)
**Quelle:** LAGEBILD 2026-04-17, RUN-FORENSIK-REPORT-2026-04-17, VERIFY-PLAN-REPORT-2026-04-17-issues, Live-Stresstest COM4 13:36

---

## Sprint-Goal

> Alle 14 Incident-Issues (AUT-54 bis AUT-67) sind gemerged, das Mehrgeräte-Reconnect-Fenster läuft 4 h unter Last ohne zyklische TLS-Timeout-Loops, kein 3016-Regress, keine Aktor-Latch-Gefahr ohne explizite Policy. Die Vorher/Nachher-Metriken sind durch AUT-67 quantitativ belegbar.

Einziger messbarer Proof: `4h-Dauerlauf mit 2 ESPs → 0 zyklische Reconnect-Loops → 0 ungeplante OFFLINE_ACTIVE-Übergänge → keine SafePublish-Verluste auf kritischen Topics`.

---

## Kapazität

| Agent | Rolle | SP/Woche | Anmerkung |
|-------|-------|----------|-----------|
| `mqtt-dev` | Primär Transport/Topics/Contract | ~6 | Führt AUT-54/55/57/63/65/67 mit an |
| `esp32-dev` | Firmware/NVS/Safety | ~6 | Führt AUT-55/56/58/59/61/66/67 |
| `server-dev` | Python/FastAPI/LogicEngine | ~5 | Führt AUT-56/60/62/63/64 |
| `frontend-dev` | Vue/WS/UX | ~3 | Führt AUT-64/65 |
| **Summe** | | **~20 SP/Woche** | Parallel-Dispatch nach CLAUDE.md Regeln |

**Pufferregel:** Planung bewusst auf 100% der Kapazität, weil Flow-Modus Scheinlücken erzeugt (Reviews, Verify-Gates, Sub-Agent-Wait). Stretch-Issues markiert, damit klar ist was bei Verzug zuerst rausrutscht.

---

## Backlog-Status 2026-04-17 (Ist)

| Issue | Titel kurz | Prio | SP | Status | Gate |
|-------|-----------|------|----|--------|------|
| AUT-54 | EA-01 Transport/Session | P0 | 5 | **In Review** | B-NET-01, B-TLS-URI-01, AUT-67 |
| AUT-55 | EA-02 Outbox+Backpressure | P0 | 3 | **In Review** | B-OUT-REPRO-01, B-HEAP-BASELINE-01 |
| AUT-63 | EA-10 Broadcast-Emergency Contract | P0 | 2 | **In Review** | B-CONTRACT-AUDIT-01 |
| AUT-59 | EA-06 Pending-Exit-Blockade | P0 | 5 | Backlog | B-POLICY-DECISION-01 |
| AUT-66 | EA-13 Aktor-Latch Offline-Rules | P0 | 5 | Backlog | Design-Frage (Typ vs Instanz) |
| AUT-56 | EA-03 Lifecycle-Publish | P0 | 3 | Backlog | blocked by AUT-55 |
| AUT-57 | EA-04 SafePublish-Retry | P1 | 2 | Backlog | related AUT-55/56 |
| AUT-60 | EA-07 Cross-ESP Readiness-Gate | P1 | 3 | Backlog | blocked by AUT-59 |
| AUT-61 | EA-08 Approval-NVS-Write Dedup | P1 | 2 | Backlog | — |
| AUT-64 | EA-11 Frontend Config-Timeout UX | P1 | 3 | Backlog | related AUT-56/65 |
| AUT-65 | EA-12 WS-Envelope correlation_id | P1 | 3 | Backlog | — |
| AUT-67 | **EA-14 Write-Timeouts-Telemetrie (NEU)** | P1 | 2 | Backlog | Vorbedingung für AUT-54-Verify |
| AUT-58 | EA-05 Heartbeat-Degradation Policy | P2 | 2 | Backlog | B-POLICY-DECISION-01 |
| AUT-62 | EA-09 Emergency Fail-Closed Default | P2 | 3 | Backlog | B-POLICY-DECISION-01 |
| | | | **44 SP** | | |

---

## Welle 1 — W17 (2026-04-21 .. 2026-04-27) — 20 SP

**Ziel:** Drei In-Review-Issues durch Merge-Gate, zwei P0-Recovery-Issues neu aufnehmen.

| Reihenfolge | Issue | Owner | SP | Sequenz-Anmerkung |
|---|-------|-------|----|-------------------|
| 1 | AUT-54 Finalisierung | `mqtt-dev` + `esp32-dev` | 5 | Merge nach Gate-Checkliste (Kommentar 17.04.) |
| 1 | AUT-55 Finalisierung | `esp32-dev` | 3 | Merge entblockt AUT-56 |
| 1 | AUT-63 Finalisierung | `server-dev` | 2 | E2E `/emergency_stop` vor Merge |
| 2 | AUT-59 Start | `esp32-dev` + `server-dev` | 5 | Parallel zu AUT-54, unabhängige Domäne |
| 2 | AUT-66 Start | `esp32-dev` + `server-dev` | 5 | Parallel zu AUT-59, unabhängige Domäne |
| | **Summe** | | **20** | |

**Parallel-Dispatch-Matrix (gem. CLAUDE.md):** AUT-59 und AUT-66 haben keine geteilten Dateien (safety_task.cpp vs command_admission.cpp). AUT-54/55/63 sind In-Review, d.h. nur Gate-Arbeit. Parallel möglich.

**Verify-Gates zum Wochenende:**
- AUT-54 Merge ← Gate-Checkliste im Sprint-Update-Kommentar grün
- AUT-55 Merge ← Backpressure-Policy dokumentiert, B-OUT-REPRO-01 geklärt
- AUT-63 Merge ← Pydantic `Literal[...]` + Negativtest grün
- AUT-59/AUT-66 mindestens PR-draft mit Akzeptanz-Szenarien-Test

---

## Welle 2 — W18 (2026-04-28 .. 2026-05-04) — 20 SP

**Ziel:** P0-Downstream abschliessen + P1-Bulk durch. Verify-Metriken durch AUT-67 tragfähig.

| Reihenfolge | Issue | Owner | SP | Sequenz-Anmerkung |
|---|-------|-------|----|-------------------|
| 1 | AUT-67 (NEU) | `mqtt-dev` + `esp32-dev` | 2 | **Zuerst**: macht AUT-54-Verify quantitativ |
| 1 | AUT-56 | `mqtt-dev` + `esp32-dev` | 3 | Entblockt nach AUT-55-Merge |
| 1 | AUT-60 | `server-dev` | 3 | Entblockt nach AUT-59-Merge |
| 2 | AUT-57 | `esp32-dev` | 2 | Konsumiert AUT-67-Counter |
| 2 | AUT-61 | `esp32-dev` | 2 | Unabhängig, gut parallelisierbar |
| 2 | AUT-64 | `frontend-dev` | 3 | Wartet auf AUT-56/65 Grundpfad |
| 2 | AUT-65 | `mqtt-dev` + `frontend-dev` | 3 | WS-Envelope — entblockt AUT-64 |
| 3 | AUT-58 (Stretch) | `esp32-dev` | 2 | Wenn Wellen-Zeit reicht; sonst W19 |
| | **Summe (Soll)** | | **18** | + 2 Stretch |

**Abhängigkeits-Kette:** AUT-55 → AUT-56 → (AUT-57 \| AUT-64) · AUT-59 → AUT-60 · AUT-65 → AUT-64

---

## Welle 3 — W19 (2026-05-05 .. 2026-05-11) — ~8 SP + Verifikation

**Ziel:** P2-Policies + finaler 4h-Dauerlauf + Postmortem.

| Reihenfolge | Issue / Aufgabe | Owner | SP |
|---|-----------------|-------|----|
| 1 | AUT-62 Emergency Fail-Closed Default | `server-dev` + `esp32-dev` | 3 |
| 1 | AUT-58 (falls nicht in W18 gelandet) | `esp32-dev` | 2 |
| 2 | **4h-Mehrgeräte-Dauerlauf** (2 ESPs EA5484 + 6B27C8) | `mqtt-dev` + `mqtt-debug` | — |
| 2 | Verify-Plan Re-Run gegen gesamte Issue-Kette | `auto-debugger` | — |
| 2 | Regression: W16 Bodenfeuchte-Kalibrierung unaffected | `server-dev` | — |
| 3 | INC EA5484 Postmortem + Archivierung `.claude/reports/current` → `archive` | TM | — |
| | **Summe** | | **5** + Verify-Block |

---

## RC-Cluster-Zuordnung (aus RUN-FORENSIK)

| Cluster | Issues | Welle |
|---------|--------|-------|
| **Cluster 1 — Transport/Session** (F-01) | AUT-54, **AUT-67**, AUT-57 | W1+W2 |
| **Cluster 2 — Publish-Backpressure** (F-02) | AUT-55, AUT-56, AUT-58 | W1+W2 |
| **Cluster 3 — Recovery-State-Mismatch** (F-03) | AUT-59, AUT-60, **AUT-66** | W1+W2 |
| **Cluster 4 — Contract/Policy-Drift** (F-04..F-08) | AUT-61, AUT-62, AUT-63, AUT-64, AUT-65 | W1..W3 |

Fettgedruckt: neu aus Live-Evidence 2026-04-17.

---

## Risiken

| Risiko | Impact | Mitigation |
|--------|--------|------------|
| B-NET-01 nicht beschaffbar (Broker-Log im UTC-Fenster) | AUT-54-Merge verzögert sich | Alternative Evidence: Serial-Trace + Broker `docker logs automationone-mqtt --since` live zum nächsten Repro-Lauf generieren — fällt nicht zurück auf „wir wissen nicht was der Broker sah" |
| AUT-55 Outbox-Hebel zeigt in Last-Test keine Entlastung | Welle 2 verschiebt sich, AUT-56 bleibt blockiert | Priorisierungs-Fallback: Shed-Policy + kritische-Topic-Whitelist als Mindestmass, Dimensionierung folgt Heap-Baseline separat |
| AUT-66 Design-Frage (Typ vs Instanz) unbeantwortet | Fix-Pfad bricht mitten im Issue ab | Vor Dispatch: 30-Min-Klärung mit Robin, Default-Typ-Mapping + Instance-Override als Arbeits-Hypothese, keine Blockade |
| AUT-67 enthüllt, dass `errno=119` gar nicht konsistent Write-Timeout ist | AUT-54-Verify bleibt qualitativ | Serial-Marker `[INC-EA5484]`-basierte Ereigniszählung als Fallback, Telemetrie später nachrüsten |
| Herd-Effekt bei 4h-Dauerlauf mit 2 ESPs — Broker-CPU/RAM limitiert | Verify-Ergebnis nicht belastbar | `docker stats automationone-mqtt` während Lauf, Baseline vorher aufnehmen |
| Scope-Creep durch GPIO32-ADC-Nachbar-Incident (`INC-2026-04-11-ea5484-gpio32-soil-adc-signal`) | Zeit-Abfluss | Strikte Trennung — Hardware-Signal bleibt separates Incident, nicht dieses Projekt |

---

## Definition of Done (pro Issue)

- [ ] Build grün: `pio run -e esp32_dev` **und/oder** `pytest --tb=short -q` **und/oder** `npm run build` (je nach Scope)
- [ ] Linter grün: `ruff check .` / `vue-tsc --noEmit` 
- [ ] Akzeptanzkriterien aus Issue-Beschreibung alle abgehakt
- [ ] BLOCKER-Codes aus Sprint-Update-Kommentar geklärt oder explizit ausgenommen
- [ ] PR auf `auto-debugger/work` gemerged (nicht `master` direkt)
- [ ] Serial-Marker `[INC-EA5484]` beibehalten, falls Firmware betroffen
- [ ] Regressionsschutz: W16-Sprint-Funktionalität unaffected

## Definition of Done (Sprint-Gesamt)

- [ ] 14 Issues `Done`
- [ ] 4h-Dauerlauf 2 ESPs parallel ohne zyklische Reconnects
- [ ] `pytest` + `pio run` + `npm run build` + `vue-tsc --noEmit` grün
- [ ] Incident-Ordner in `.claude/reports/archive/` mit Postmortem
- [ ] TECHNICAL_MANAGER.md um INC-Abschluss ergänzt
- [ ] Folge-Issues aus Postmortem im Backlog (kein stilles Verlieren)

---

## Kommunikation / Rituale

| Kadenz | Event | Artefakt |
|--------|-------|----------|
| Täglich | Stand-Up via `engineering:standup` Skill | Yesterday/Today/Blockers pro aktiver Agent |
| Ende W17 | Welle-1-Review | Gate-Checklisten AUT-54/55/63 abgehakt im Linear |
| Ende W18 | Welle-2-Review | P1-Set done, AUT-67 als Metric-Anchor sichtbar |
| Ende W19 | Sprint-Retro + Postmortem | `.claude/reports/current/incidents/.../POSTMORTEM.md` |

---

## Nicht-Ziele / Abgrenzung

- **GPIO32-ADC-Signal-Thema** (`INC-2026-04-11-ea5484-gpio32-soil-adc-signal`) bleibt getrennt
- **6014/UNKNOWN-Mapping** (`INC-2026-04-10`) bleibt abgeschlossen, nur Regressionstest
- **ISA-18.2 / NotificationRouter** als Cross-Concern nur bei separater Evidence-Kette
- Parallele Tracks W16-Bodenfeuchte, Monitor-L2, UI/UX Token-Audit laufen **unabhängig** — dieser Sprint tritt nicht auf fremde Dateien zu

---

## Referenzen

- Lagebild: `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/INCIDENT-LAGEBILD.md`
- Forensik: `.../RUN-FORENSIK-REPORT-2026-04-17.md`
- Task-Packages: `.../TASK-PACKAGES.md` (PKG-01, PKG-04..PKG-14)
- Verify-Plan: `.../VERIFY-PLAN-REPORT-2026-04-17-issues.md`
- Steuerdatei: `.claude/auftraege/auto-debugger/inbox/STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`
- Projekt in Linear: <https://linear.app/autoone/project/mqtt-transport-and-recovery-hardening-inc-ea5484-e3e7b6d2b3e1>
