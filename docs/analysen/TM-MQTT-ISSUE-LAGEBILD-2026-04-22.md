# TM-MQTT-ISSUE-LAGEBILD 2026-04-22

> **Auftrag:** "TM-Testlauf MQTT-Issues — naechste Schritte verbindlich abarbeiten"
> **Ausfuehrer:** Technical Manager (Claude, Desktop-Session Dresden)
> **Projekt:** MQTT-Transport & Recovery Hardening (INC EA5484) — Linear-Project-ID `e16d523e-1891-48b6-98fc-f7173a505de4`
> **Team:** AutoOne (`bb5f728a-91bd-4596-b173-876ebbc9bc16`)
> **Scope:** In-Scope nur MQTT-Issues des INC-EA5484-Streams; INC-2026-04-22 Klima-Forensik (AUT-109..115) explizit **Out-of-Scope** fuer diesen Lauf.
> **Gueltig ab:** 2026-04-22 Nachmittag (nach TM-Scope-Cleanup 22.04. 07:46 UTC)

---

## 1. Schritt A — Ist-Durchlauf bestehender MQTT-Issues

Das Projekt enthaelt **22 Issues** (AUT-54..AUT-72, AUT-116..AUT-121). 11 sind am 21.04. auf DONE gesetzt worden (W17-Welle), 11 sind formell offen (davon 5 als Sub-Issues unter AUT-66 aus Dispatch-Planung 22.04. und 1 als Sub-Issue unter AUT-68 ausgekoppelt).

### 1.1 Vollstaendige Issue-Tabelle (Stand 2026-04-22 ~15 Uhr)

| AUT-ID | Titel (Kurz) | Prio | SP | Linear-Status | Parent / Relations | Naechste Aktion (IST-Befund) | Risiko |
|---|---|---|---|---|---|---|---|
| AUT-54 | Transport/Session-Stabilitaet (EA-01) | Urgent | 5 | **Done 21.04.** | rel AUT-57/66/67 | Keine — W17 geschlossen | — |
| AUT-55 | Outbox-Kapazitaet (EA-02) | Urgent | 3 | **Done 21.04.** | blockt AUT-56 | Keine | — |
| AUT-56 | Lifecycle-Publish Robustheit (EA-03) | Urgent | 3 | **Done 21.04.** | blockedBy AUT-55 | Keine | — |
| AUT-57 | SafePublish-Retry (EA-04) | High | 2 | **Done 21.04.** | rel AUT-54 | Keine | — |
| AUT-58 | Heartbeat-Degradation Policy (EA-05) | Medium | 2 | **Done 21.04.** | rel AUT-67/68/71/72 | Keine | — |
| AUT-59 | Pending-Exit-Blockade (EA-06) | Urgent | 5 | **Done 21.04.** | blockt AUT-60 | Keine | — |
| AUT-60 | Cross-ESP Readiness-Gate (EA-07) | High | 3 | **Done 21.04.** | blockedBy AUT-59 | Keine | — |
| AUT-61 | Approval-NVS-Dedup (EA-08) | High | 2 | **Done 21.04.** | — | Keine | — |
| AUT-62 | Emergency fail-closed (EA-09) | Medium | 3 | **Backlog** | rel AUT-63 | **Code lokal fertig (17.04.), nicht committed**; TM-Schaerfung 17.04. mit zusaetzlichen AC (correlation_id/generation/epoch-Konsistenz); Build Dev+Prod gruen → Entscheidung B-TOKEN-GEN-01 noch offen | **P1** Last-Mile + Drift |
| AUT-63 | Broadcast-Emergency 3016 (EA-10) | Urgent | 2 | **Done 21.04.** | rel AUT-62 | Keine | — |
| AUT-64 | Frontend Config-Timeout UX (EA-11) | High | 3 | **Backlog** | rel AUT-56/65 | Kein Kommentar, unbearbeitet → voller Zyklus erforderlich | **P1** |
| AUT-65 | WS-correlation_id Konsistenz (EA-12) | High | 3 | **Done 21.04.** | rel AUT-64 | Keine | — |
| AUT-66 | Aktor-Latch Offline-Rules (EA-13) | **Urgent** | 5 | **Todo** | hat 5 Sub-Issues (AUT-116..120) | Dispatch-Plan 22.04. erstellt, aber verify-plan-Gate (AUT-119) nicht abgenommen; Sub-Issues noch unbearbeitet | **P0** (Safety) blockiert durch Gate |
| AUT-67 | Write-Timeouts-Telemetrie H5 (EA-14) | High | 2 | **Done 21.04.** | rel AUT-54/72 | Keine | — |
| AUT-68 | Heartbeat-Slimming Phase 1 konservativ (EA-15) | Low (P4) | 1 | **Backlog** | rel AUT-58/67/71/72; child=AUT-109/AUT-121 | **Re-scoped 22.04.**: alte H6-Aktionen verworfen, neuer Scope = max. 2 Unused-Felder pro Iteration aus Kandidatenliste (seq, boot_sequence_id, reset_reason, segment_start_ts, wifi_ip, zone_assigned); unberuehrt unter neuem Scope | **P2** (klein, reversibel) |
| AUT-69 | SESSION_EPOCH H7 Reconnect-Ordering (EA-16) | Urgent | 3 | **Backlog** | hat Kinder AUT-71/72 | **Commit existiert** (`4fb1e77b`, Firmware `b5d5d780`), Live-Verify 20.04. gruen (3× Reconnect clean), aber Status = Backlog; Poetry-Test-Collection-Konflikt laut TM-Dok offen; **sollte In Review** | **Drift** |
| AUT-70 | NTP-Boot-Entblockung Doku+Telemetrie (EA-17) | Medium | 1 | **Backlog** | — | 0 Kommentare, unberuehrt; Doku-Ticket + 1 Telemetriefeld | **P3** |
| AUT-71 | Frontend-Wiring AUT-69 (EA-16.1) | High | 2 | **Backlog** | parent=AUT-69; rel AUT-58/67/68/72 | **Commit existiert** (`745bb213`), `npm run build` + `vue-tsc` gruen (2× verifiziert 20./21.04.); Status = Backlog; **sollte In Review oder Done** | **Drift** |
| AUT-72 | Server Memory-Leak Fix (EA-16.2) | High | 2 | **Backlog** | parent=AUT-69; rel AUT-58/67/68/71/121 | **Commit existiert** (`1cdd7407`); pytest 5/5 gruen, ruff clean; ABER `poetry.lock` **nicht aktualisiert** (cachetools nicht in lock); Status = Backlog; **Last-Mile + Drift** | **Drift + P1 Last-Mile** |
| AUT-116 | [EA-13][QA] Repro/Regression AUT-66 | — | — | Backlog | parent=AUT-66 | Wartet auf AUT-66 Dispatch | blockiert |
| AUT-117 | [EA-13][MQTT] Telemetrie-Contract actuator_latched_offline | — | — | Backlog | parent=AUT-66 | Wartet auf verify-plan AUT-119 | blockiert |
| AUT-118 | [EA-13][ESP32] fail_safe_on_disconnect Firmware | — | — | Backlog | parent=AUT-66 | Wartet auf verify-plan AUT-119 | blockiert |
| AUT-119 | [EA-13][Gate] Verify-Plan Freigabe AUT-66 | — | — | Backlog | parent=AUT-66 | **Voraussetzung fuer AUT-66-Dispatch**; Gate nicht abgenommen | **Gate** |
| AUT-120 | [EA-13][Server] Schema+Config fail_safe_on_disconnect | — | — | Backlog | parent=AUT-66 | Wartet auf verify-plan AUT-119 | blockiert |
| AUT-121 | [EA-15.3] Heartbeat Metrics Split | Medium | 3 | **Backlog** | parent=AUT-68; rel AUT-69 | Geplant fuer W3a nach AUT-68 Phase 1 | **P3** |

### 1.2 Systematische Drift-Befunde

Beim Ist-Durchlauf sind **drei Drift-Kategorien** aufgefallen, die ueber den Einzel-Issue-Scope hinausgehen und fuer das ganze Projekt gelten:

- **Drift-1: Linear-Status vs. Code-Realitaet** — AUT-72 (Commit `1cdd7407`, Tests gruen), AUT-71 (Commit `745bb213`, build gruen) und AUT-69 (Commit `4fb1e77b` + Firmware-Commit `b5d5d780`, Live-Verify 20.04. mit 3× Reconnect sauber) sind inhaltlich erledigt, stehen aber alle drei weiter auf "Backlog". Korrekt waere mindestens "In Review", fuer AUT-71 nach `vue-tsc`-Erfolg 21.04. auch "Done".
- **Drift-2: Poetry-Lockfile-Sync** — AUT-72 hat `cachetools = "^5.3"` in `pyproject.toml` ergaenzt, aber `poetry.lock` zeigt noch keinen `cachetools`-Eintrag. Ohne `poetry lock` scheitert jede CI/Container-Installation.
- **Drift-3: AUT-68 Dokumentations-Drift zwischen TM-Kommentaren und Linear-Body** — Bis 22.04. morgens trug AUT-68 gleichzeitig vier Themen (Payload-Minimum + H6-Root-Cause + Counter-Split + REST-Fallback). Nach TM-Scope-Cleanup 22.04. 07:40 ist der Body konservativ auf Phase 1 reduziert, die aelteren Kommentare beziehen sich aber noch auf alten Scope — mentaler Bruch beim Lesen.

### 1.3 Projekt-weiter Workspace-Befund (nicht Issue-gebunden)

Auf Branch `auto-debugger/work` liegen ~100 uncommitted Changes quer ueber alle drei Schichten (Frontend, Server, ESP32). Die Commits `1cdd7407` (AUT-72) und `745bb213` (AUT-71) sind im History-Pfad vorhanden, aber der Working-Tree darueber hat seither weitere Modifikationen gesammelt. Das beeinflusst die Wahl des Fokus-Issues: **jede Server-/Frontend-Umsetzung** wuerde auf einem nicht-sauberen Tree landen und Cross-Scope-Vermischung riskieren. Fuer den Praxistest empfiehlt sich ein **ESP32-seitiges** Fokus-Issue, weil dort die uncommitted Changes minimaler sind (nur `El Trabajante/src/main.cpp` + 2 weitere Dateien, ueberschaubar).

---

## 2. Schritt A.2 — Next-Action-Reihenfolge (max. 3 sofort startbare Kandidaten)

Ranking nach: (a) Impact, (b) geringe Blocker-Lage, (c) sauberer Scope fuer einen kontrollierten Durchlauf.

### Kandidat 1 — AUT-68 Phase 1 (konservativ, Iteration 1)

- **Impact:** P4, aber Vorbereitung fuer 4-h-Dauerlauf W3b. Kleines, messbares Payload-Plus (~60-80 B pro Heartbeat bei 2 Feldern).
- **Blocker-Lage:** Keine. Scope ist nach 22.04. Cleanup glasklar (Kandidaten 1+2 der Feldliste entfernen).
- **Sauberer Scope:** 1 SP, nur `El Trabajante/src/services/communication/mqtt_client.cpp`, 2 Zeilen-Loeschungen + Kommentar.
- **Kann voller Workflow durchlaufen:** Ja — Analyse (fertig in TM-Kommentar 22.04.), Plan (esp32-dev einzeln), verify-plan (Kandidaten-Check + Grep gegen Server-Consumer), Umsetzung, Verifikation (Build + Payload-Baseline), updatedocs.
- **Einzige Grenze:** `pio run -e esp32_dev` ist in der Cowork-Sandbox nicht ausfuehrbar → Verifikation als dokumentierte User-Hand-Aktion.

### Kandidat 2 — AUT-72 Last-Mile (poetry.lock + Linear-Sync)

- **Impact:** Hoch (unblockiert CI/Container-Build) + behebt Drift-1 + Drift-2.
- **Blocker-Lage:** Keine. Nur `poetry lock --no-update` + Linear-Status-Update.
- **Sauberer Scope:** 1 Datei (poetry.lock), 1 Linear-Operation.
- **Kann voller Workflow durchlaufen:** **Nein** — das ist operatives Close-Out, keine neue Analyse/Plan/verify-plan-Arbeit. Passt nicht zum Auftragsablauf §3 (Analyse → Plan → verify-plan → Umsetzung).
- **Deshalb:** Eignung fuer diesen Praxistest **gering**, aber als Parallel-Task waehrend Fokus-Arbeit machbar.

### Kandidat 3 — AUT-70 NTP-Doku + Telemetrie

- **Impact:** Niedrig (nur Doku + 1 Telemetriefeld `ntp_boot_wait_ms`).
- **Blocker-Lage:** Keine (0 Kommentare, unberuehrt).
- **Sauberer Scope:** 1 SP, ESP32-seitig.
- **Kann voller Workflow durchlaufen:** Ja, aber sehr kleiner Nutzwert fuer einen Workflow-Praxistest, weil die meiste Arbeit Dokumentation ist (nicht Dev-Agent-getrieben).

### Ranking-Entscheidung

1. **AUT-68 Phase 1 Iteration 1** (Fokus)
2. AUT-72 Last-Mile (als Parallel-Task waehrend Fokus-Arbeit)
3. AUT-70 (Reserve, falls Fokus blockiert)

---

## 3. Schritt B — Fokus-Issue

### Gewaehltes Fokus-Issue: **AUT-68 Phase 1 Iteration 1** (Unused-Felder `seq` + `boot_sequence_id` entfernen)

**Begruendung (nach Auftragskriterien):**

AUT-68 Phase 1 bietet in dieser Lage den besten Workflow-Praxistest, weil die Analyse unmittelbar nach dem 22.04. Cleanup frisch und vollstaendig ist (Kandidatenliste mit 6 Feldern, Feld-fuer-Feld Grep-Evidenz gegen Server-Consumer), der Scope nach Feldliste auf max. 2 Kandidaten pro Iteration begrenzt ist (Iteration 1 = `seq` + `boot_sequence_id` mit zusammen ~43 B Ersparnis), keine harten Blocker vorliegen, und der Zyklus Analyse → Plan → verify-plan → Umsetzung vollstaendig durchlaufbar ist. Die einzige Workflow-Grenze — `pio run -e esp32_dev` in Sandbox nicht ausfuehrbar — ist in TECHNICAL_MANAGER.md Zeile 124 als bekannte Sandbox-Grenze dokumentiert und wird im Durchlauf als User-Hand-Schritt sauber markiert. Die re-scopede Variante wurde explizit so gebaut, dass Rollback < 2 min moeglich ist und jede Aenderung ihr eigenes verify-plan-Gate bekommt — perfekt fuer einen kontrollierten Testlauf.

**Warum NICHT AUT-66 (P1 Urgent, Safety):** AUT-66 hat formell hoechsten Impact, aber 5 Sub-Issues + offenes verify-plan-Gate (AUT-119) + 5 SP + Cross-Layer (ESP32+Server+MQTT) sprengen den kontrollierten Rahmen. AUT-119 muss vor Dispatch abgenommen werden — das waere ein eigener separater Lauf.

**Warum NICHT AUT-72/AUT-71 Last-Mile:** Code-Arbeit ist dort abgeschlossen. Was fehlt, ist Lockfile-Sync + Linear-Status-Update — das ist kein voller Workflow-Durchlauf, sondern Close-Out, und passt nicht zum Pflichtablauf §3.

**Warum NICHT AUT-62:** 3 SP, TM-Schaerfung vom 17.04. verlangt zusaetzliche AC (correlation_id/generation/epoch-Konsistenz-Schluesselraum), Code lokal auf master nicht-committed — zu komplexe Gemengelage fuer kontrollierten Durchlauf.

**Warum NICHT AUT-64:** 3 SP, Frontend-only, aber Working-Tree auf `auto-debugger/work` hat ~80 uncommitted FE-Modifikationen. Risiko Scope-Vermischung zu hoch.

### Parallele Begleit-Aktion (nicht Fokus, aber TM-Empfehlung)

Nach Abschluss des AUT-68-Durchlaufs sollte die **Status-Drift-Bereinigung** als Folge-Task ausgefuehrt werden:

- AUT-72 → "In Review" setzen, `poetry lock --no-update` ausfuehren, Lockfile separat committen
- AUT-71 → "In Review" oder "Done" setzen (nach Live-Screenshot durch User)
- AUT-69 → "In Review" setzen (Live-Verify 20.04. dokumentiert), Poetry-Test-Collection-Konflikt als eigenes Follow-up-Issue

Das ist aber explizit **Folge-Issue-Material**, nicht Teil dieses Durchlaufs.

### BLOCKER-Report (falls Fokus nicht startbar gewesen waere)

Nicht anwendbar — AUT-68 Phase 1 ist startbar.

---

## 4. Abnahmekriterium Schritt A/B

- [x] Alle 22 MQTT-Issues des INC-EA5484-Streams gesichtet und in Tabelle 1.1 annotiert
- [x] Pro Issue Status, Blocker-Lage, naechste Aktion, Risiko dokumentiert
- [x] Startreihenfolge mit max. 3 Kandidaten erstellt (Abschnitt 2)
- [x] Genau ein Fokus-Issue gewaehlt (AUT-68 Phase 1 Iteration 1) mit nachvollziehbarer Begruendung nach Impact/Blocker/Scope
- [x] Drift-Befunde explizit markiert (Drift-1 Linear-Status, Drift-2 Lockfile, Drift-3 AUT-68-Body)

---

## 5. Uebergang in Schritt C

Der Durchlauf-Bericht fuer das Fokus-Issue (Schritt C1–C5 + Lieferobjekt 5.2) wird in

`docs/analysen/TM-MQTT-FOCUS-ISSUE-DURCHLAUF-2026-04-22.md`

gefuehrt. Linear-Abschlusskommentar auf AUT-68 (Lieferobjekt 5.3) folgt nach Abschluss von Schritt C.

---

*Erstellt: 2026-04-22 Nachmittag. Basis: Linear-Snapshot 22.04. ~07:46 UTC + Repo-Scan `auto-debugger/work` + TECHNICAL_MANAGER.md.*
