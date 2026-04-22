# PILOT-ISSUE V (VERIFIKATION) — Night-Rule-Alarm 4h-Live-Stresstest

> **Zweck dieses Dokuments:** Pilotierung des `ISSUE-TEMPLATE-VERIFIKATION.md` am realen offenen P0-Paket AUT-110 (Night-Rule Alarm bei offline Ziel-ESP). Zeigt Test-Plan + SLO + Rollback-Plan + Gate-3 mit `/updatedocs`-Nachweis.
> **Dieser Entwurf** ist als Vorlage fuer ein neues Linear-Issue gedacht (noch nicht in Linear angelegt — erst nach Robin-Freigabe und nach AUT-110-`Done`).
> **Basis-Template:** `docs/analysen/ISSUE-TEMPLATE-VERIFIKATION.md`.
> **Analyse-Bericht-Bezug:** `docs/analysen/ANALYSE-tm-issue-orchestrierung-linear-agenten-autoone-2026-04-26.md` §4.5 Gate 2 + Gate 3, §4.12 Anti-Stuck.
> **Historische Basis:** INC-2026-04-22 Klima-Forensik `docs/analysen/testfeld-live2-klima-forensik-bericht-2026-04-22.md`.

---

**Vorgeschlagener Linear-Titel:** `test: [Cross-Layer] 4h-Live-Stresstest Night-Rule-Alarm bei Ziel-Offline (AUT-110)`

---

## Intake-Block (V2 §4.8)

```
Intake:
- Problemklasse   = Verifikation (AUT-110-Code liefert Alarm-Event; hier wird gegen Reality geprueft)
- Impactklasse    = P0 (Safety-Luecke -- ohne Alarm bleibt Nacht-Regel-Skip stumm wie am 22.04.)
- Scopeklasse     = Cross-Layer (Server logic_engine + Frontend AlertCenter + MQTT Broker-Log)
- Artefaktlage    = Evidenz vorhanden (Forensik-Bericht + AUT-110-DoD)
- Ausfuehrungsmodus = VERIFIKATION
- Containerwahl   = Einzel-Issue

Begruendung: 1 eng umrissenes Szenario (Nacht-Regel-Skip bei ESP offline), 1 Agenten-
Lauf (test-log-analyst + hardware-test), klare Erfolgs-SLO. Matrix §4.9 -> Einzel-
Issue. P0 erzwingt 4h-Live-Test statt CI-Fixture.
```

---

## 0. Pflichtkopf
- **Owner:** Robin Herbig
- **Ausfuehrer:** `hardware-test` (Live-Stresstest, ESP-Setup + kontrollierte Disconnection) + `test-log-analyst` (Log-Auswertung, Metrik-Pruefung)
- **Deadline:** 2026-05-10 (W19-Ende, nach AUT-110 `Done`)
- **Done-Kriterium:** Test-Artefakt `.claude/reports/current/verifications/VERIFY-night-rule-alarm-4h-2026-05-10.md` existiert; in 4h-Live-Run mit 2 kontrollierten ESP-Offline-Phasen (je 45 Min) wird genau 2× ein `notification`-Event mit Typ `rule.skipped.target_offline` emittiert (nicht mehr, nicht weniger); kein Crash, kein Server-Restart, kein Broker-Log-Error; Frontend AlertCenter zeigt beide Events mit Zeitstempel +/- 5 s.
- **Blocker:**
  - AUT-110 (Night-Rule-Alarm IMPL) MUSS `Done` sein
  - AUT-111 (Critical-Rule Degraded-Handling) MUSS `Done` sein (AUT-110 konsumiert `is_critical`-Flag aus AUT-111)

## 1. Issue-Typ
VERIFIKATION

## 2. Scope
- **In-Scope:**
  - Hardware: ESP_EA5484 (Hauptgeraet) + ESP_6B27C8 (Nachbar-Referenz) — beide im Testfeld Live-System 2
  - Test-Skript: `tests/live/test_night_rule_alarm_4h.py` (neu, als Test-Fixture commitbar)
  - Server-Logs: `god_kaiser.log` im 4h-Fenster
  - Broker-Logs: `automationone-mqtt` Container-Log im 4h-Fenster
  - Frontend-AlertCenter: WebSocket-Event-Stream + Render-Check
  - Metriken: Prometheus `rule_skip_total{reason="target_offline"}`, Grafana-Panel "Night-Rule Alarms"
- **Out-of-Scope:**
  - Kein Code-Fix an `logic_engine.py` oder an `frontend/AlertCenter.vue`
  - Keine Aenderung am Broker-Config (Mosquitto-Konfig bleibt)
  - Kein Last-Test (Parallel-Regeln) — das ist eigene VERIFIKATION-Issue-Kategorie
  - Keine Regression-Suite fuer andere Rules (nur Night-Rule Pfad)
- **Betroffene Schichten:** Cross-Layer (Server, MQTT, Frontend; ESP nur als Test-Triggergerät)
- **Abhaengigkeiten:**
  - `parent`: AUT-110 (IMPL-Issue der zu verifizierenden Funktion)
  - `blocks`: None
  - `blockedBy`: AUT-110 (Done-Pflicht), AUT-111 (Done-Pflicht)
  - `relatedTo`: AUT-109 (RCA Offline-Zyklus — liefert Referenz-Dauer 45 Min pro Offline-Phase), AUT-115 (Cockpit-Kachel — zeigt dieselben Daten, hier nur Alarm-Pfad)

## 3. DoR (Definition of Ready)
- [ ] Scope klar, Test-Pfade konkret benannt (siehe In-Scope)
- [ ] AUT-110 und AUT-111 sind auf `Done` (blockedBy aufgeloest — vor Gate 0 pruefen)
- [ ] Test-Plan vorhanden (siehe Arbeitskette §4)
- [ ] Erwartete Metriken definiert:
  - `notification`-Events: Count = exakt 2 im 4h-Fenster (Typ `rule.skipped.target_offline`)
  - `rule_skip_total{reason="target_offline"}`: Delta = +2 ueber 4h
  - ESP-Offline-Dauer je Phase: 45 Min ± 1 Min (kontrolliert via Disconnect-Script)
  - AlertCenter-Render-Latenz: < 5 s nach Event-Emit
  - Kein Server-Restart, kein unexpected-exception im Log, Broker-Log "clean" (keine Disconnect-Error)
- [ ] Erfolgs-SLO:
  - **Green-Path:** Alle 5 Metrik-Punkte gruen UND 4h ohne Crash UND Frontend rendert beide Events.
  - **Gelb (Folge-Issue):** 4/5 Metrik-Punkte gruen, 1 Render-Latenz > 5s (Alarm kommt an, aber langsam).
  - **Rot (Rollback):** Fehlendes Event, > 2 Events (False-Positive), Server-Crash, Broker-Fehler.
- [ ] Rollback-Plan:
  - Revert-Hash von AUT-110-Merge (aus Linear-Kommentar ziehen)
  - Feature-Toggle `NIGHT_RULE_ALARM_ENABLED=false` in `.env`
  - DB-Restore n/a (kein Schema-Aenderung in AUT-110)
- [ ] Agent-Zuweisung passt: `hardware-test` fuer Live-Pfad (ESP + Broker + Server + Frontend), `test-log-analyst` fuer Log-Auswertung
- [ ] Gate-1-Entscheidung: verify-plan **an** — Test-Fixture wird committed (`tests/live/test_night_rule_alarm_4h.py`); Gate-ID `B-V-NRS-01..05` (B-V-NRS-01 Test-Pfade existieren; -02 Metrik-Namen matchen Prometheus-Export; -03 Disconnect-Script ist idempotent; -04 Rollback-Hash ist auffindbar; -05 SLO-Werte sind numerisch, nicht "looks good")

## 4. Arbeitskette
1. **Pre-Check:**
   - ESP_EA5484 online, `heap_free > 40 kB`, letzter Reboot > 30 Min her
   - ESP_6B27C8 online als Nachbar-Referenz (nicht direkt am Test beteiligt, aber zur Abgrenzung)
   - Server bereit: `god_kaiser.log` rotiert, Broker-Container `healthy`, Frontend deployed
   - Baseline-Werte erheben: `rule_skip_total{reason="target_offline"}` aktueller Zaehler
2. **verify-plan (Gate 1, hard):** Skill `verify-plan` pruefen:
   - Pfad `tests/live/test_night_rule_alarm_4h.py` existiert oder wird in diesem Run neu angelegt (letzteres ok, da Fixture-Commit).
   - Metrik-Name `rule_skip_total{reason="target_offline"}` existiert im Prometheus-Export (siehe `El Servador/god_kaiser_server/src/metrics.py`).
   - Disconnect-Script nutzt stabilen Broker-ACL-Mechanismus (keine Brute-Force-Disconnect, stattdessen ACL-Deny via MCP/CLI).
   - Rollback-Hash aus AUT-110 Linear-Kommentar auffindbar.
   - SLO-Werte sind numerisch (keine Formulierung "gruen = gut").
3. **Test-Run:**
   - T+0: Run-Start, Baseline-Metriken erfassen
   - T+30 Min: Offline-Phase 1 triggern (ACL-Deny fuer ESP_EA5484, 45 Min)
   - T+75 Min: Offline-Phase 1 endet (ACL-Allow), Nacht-Regel wurde zwischen T+45 und T+75 getriggert
   - T+120 Min: Erwartetes Event 1 im AlertCenter sichtbar, Latenz notiert
   - T+180 Min: Offline-Phase 2 triggern (45 Min)
   - T+225 Min: Offline-Phase 2 endet
   - T+270 Min: Erwartetes Event 2 im AlertCenter sichtbar
   - T+240 Min = **4h-Mark**: Run-Ende, Metrik-Erfassung + Log-Konsolidierung (T+240 ist weniger als T+270 — deshalb Run bis T+300 laufen lassen, um beide Events sicher zu erfassen)
   - Protokoll-Datei: `.claude/reports/current/verifications/VERIFY-night-rule-alarm-4h-2026-05-10-run.log`
4. **Auswertung:** `test-log-analyst` produziert Auswertung:
   - Metrik-Tabelle (Soll/Ist/Delta/Verdict)
   - Log-Auszuege (je 20 Zeilen um Event-Timestamps)
   - Frontend-Screenshots (AlertCenter je Event)
   - SLO-Checkliste (green/yellow/red)
   - Artefakt unter `.claude/reports/current/verifications/VERIFY-night-rule-alarm-4h-2026-05-10.md`
5. **Ampel:**
   - **Green:** DoD.
   - **Gelb:** DoD + Folge-Issue "Render-Latenz Night-Rule-Alarm in AlertCenter reduzieren" anlegen.
   - **Rot:** Rollback via Feature-Toggle (schneller als Revert), dann Root-Cause-ANALYSE-Issue anlegen, AUT-110 auf `In Progress` zurueckschicken.
6. **Gate 2 (Fixtures committed):**
   - `pytest tests/live/ --collect-only` laeuft gruen (Test ist discoverable)
   - `ruff check tests/live/` gruen
   - Commit: `test: [Cross-Layer] 4h-live stresstest fixture for night-rule alarm`
7. **Gate 3 (Wissensintegration):**
   - `/updatedocs` ausfuehren: `.claude/reference/testing/TEST_WORKFLOW.md` um Live-Stresstest-Kategorie erweitern; `reference/debugging/LOG_LOCATIONS.md` um neue Run-Log-Pfade.
   - 11-Kategorien-Abgleich: testing + debugging treffen; andere `n/a`.

## 5. DoD (Definition of Done)
- [ ] Test-Artefakt liegt unter `.claude/reports/current/verifications/VERIFY-night-rule-alarm-4h-2026-05-10.md` und ist im Kommentar verlinkt
- [ ] Alle 5 Erfolgs-SLO-Punkte aus DoR §3 sind mit harter Kennzahl belegt (keine "looks good"-Urteile)
- [ ] Metrik-Delta Prometheus: Screenshot oder PromQL-Output im Artefakt
- [ ] Log-Auszug im Kommentar ≤ 1500 Zeichen, Rest im Artefakt (Policy §5 Phase 2 Schritt 2.4)
- [ ] Risiko-Status nach Test: `low` (bei Gruen) / `medium` (Gelb, 1 Follow-up) / `high` (Rot, Rollback ausgefuehrt)
- [ ] Bei rotem Test: Rollback-Hash im Kommentar; Root-Cause-Issue-ID (AUT-XXX); Feature-Toggle-Status (`false`)
- [ ] Linear-Status: `Done` nur bei gruener Ampel; gelb = `Done` + Follow-up; rot = `In Progress` + Rollback

## 6. /updatedocs (Pflicht wenn code_change=true)
- **Trigger:** `code_change=true` (Test-Fixture `tests/live/test_night_rule_alarm_4h.py` committed + SLO-Werte in TEST_WORKFLOW.md ergaenzt)
- **Pflicht-Checkliste:**
  - [ ] `/updatedocs` ausgefuehrt
  - [ ] Aktualisierte Doku-Pfade:
    - `.claude/reference/testing/TEST_WORKFLOW.md` (Live-Stresstest-Protokoll)
    - `.claude/reference/debugging/LOG_LOCATIONS.md` (Run-Log-Pfad)
  - [ ] Pro Pfad: was + warum
  - [ ] 11-Kategorien-Referenz-Abgleich:
    1. API-Refs = n/a (kein neues API)
    2. Error-Codes = n/a
    3. Patterns = n/a
    4. Debugging = **trifft** — LOG_LOCATIONS.md geaendert
    5. Testing = **trifft** — TEST_WORKFLOW.md geaendert
    6. Security = n/a
    7. TM_WORKFLOW.md = n/a (allgemeiner Workflow unveraendert)
    8. CLAUDE.md Router = n/a
    9. agents/* = n/a
    10. skills/* = n/a
    11. rules/* = n/a

## 7. Follow-up-Tracking
- **Verantwortlich:** TM
- **Restpunkte:**
  - (Bei Gelb) Render-Latenz-Tuning Alarm-Pipeline
  - (Immer) Regressions-Run 1 Woche nach Deploy (automatisierter Kurz-Test 30 Min)
- **Check-Termin:** 2026-05-17 (1 Woche nach Test fuer Regressions-Kontrolle)
- **Monitoring-Follow-up:** Grafana-Panel "Night-Rule Alarms" als permanentes Dashboard-Element, Alert-Regel `rule_skip_total{reason="target_offline"} > 5/hour` als Sanity-Check gegen False-Positives

---

### Anti-Stuck-Selbstcheck (V2 §4.12)
- T1 Loop-Signal: Wenn Disconnect-Script 2× nicht wirksam (ESP bleibt "online" in WS-State), stoppen und Broker-ACL-Pfad pruefen — nicht blind wiederholen.
- T2 Scope-Unsicherheit: Wenn Metrik `rule_skip_total` im Prometheus-Export fehlt, sofort stoppen und AUT-110-Kommentar pruefen (Metrik-Emit ist dort versprochen) — kein Test mit improvisierter Metrik.
- T3 Zeitgrenze: 45 Min ohne Pre-Check-Abschluss = Zwischenstand an TM, Gate 0 neu bewerten (ist AUT-110 wirklich `Done`?).
- T4 Pfadkonflikt: Wenn Test-Fixture-Verzeichnis `tests/live/` nicht existiert, stoppen und Repo-Struktur-Frage klaeren — kein blindes `mkdir`, da Linter-Config betroffen sein koennte.

### Pilot-Lernziele
- Ist der 4h-Horizont fuer P0-Verifikation ausreichend, oder muessen wir 8h+ fahren?
- Sind die 5 Erfolgs-SLOs vollstaendig genug, oder fehlt z.B. "keine doppelten WebSocket-Events"?
- Wie gut lassen sich Disconnect-Phasen ACL-basiert ausloesen (reproduzierbar, nicht destruktiv)?
- Wie gut integriert sich `hardware-test` + `test-log-analyst` — Multi-Agent-Koordination via `/collect-reports` oder direkte Uebergabe?
