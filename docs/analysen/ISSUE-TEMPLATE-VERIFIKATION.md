# ISSUE-TEMPLATE — VERIFIKATION

> Zweck: Testsystem, CI oder Live-Check fahren, um Regel- oder Code-Aenderung gegen Realitaet zu pruefen. Keine Code-Aenderung ausserhalb von Test-Fixtures.
> Basis: `docs/analysen/ANALYSE-tm-issue-orchestrierung-linear-agenten-autoone-2026-04-26.md` Abschnitt 4.1/4.2.
> `code_change=false` fuer Produktcode, aber `code_change=true` wenn Testfixtures / Messskripte committed werden -> Gate 2/3 entsprechend anwenden.

---

**Titel-Schema (verbindlich):** `test: [<Schicht>] <Kurzaktion> — <Objekt>`
**Beispiele:** `test: [Cross-Layer] 4h-Live-Stresstest Night-Rule-Alarm`, `test: [Server] Rule-Skip-Counter CI-Fixture Green-Path`, `test: [ESP32] Publish-Queue Overflow bei Broker-Loss`.
**<Schicht>:** ESP32 | Server | MQTT | Frontend | Cross-Layer | Infra.

---

## 0. Pflichtkopf
- **Owner:** <Person, Standard: Robin Herbig>
- **Ausfuehrer:** <`test-log-analyst` | `hardware-test` | Dev-Agent bei Fixture-Erstellung>
- **Deadline:** <YYYY-MM-DD>
- **Done-Kriterium:** <1 Satz, messbar — z.B. "Test `tests/rules/test_night_rule_skip.py::test_alarm_after_4h` laeuft ueber 4h gruen und emittet genau 1 Notification; Artefakt `<Pfad>` existiert mit Log-Auszug.">
- **Blocker:** <Keine | AUT-IDs — insbesondere der IMPLEMENTIERUNG-Issue, der das zu pruefende Feature liefert>

## 1. Issue-Typ
VERIFIKATION

## 2. Scope
- **In-Scope:** <konkrete Testdatei-Pfade, Test-Kommandos, Hardware-Bereich (Brett-ID / MAC), Live-System-Identifier>
- **Out-of-Scope:** <explizit ausgeschlossen — "kein Bugfix", "keine Feature-Erweiterung", "keine Refactors in `src/…`">
- **Betroffene Schichten:** <ESP32 | Server | MQTT | Frontend | Cross-Layer>
- **Abhaengigkeiten:**
  - `parent`: <AUT-ID oder None — meistens der korrespondierende IMPLEMENTIERUNG-Issue>
  - `blocks`: <AUT-IDs oder None>
  - `blockedBy`: <AUT-IDs — Pflicht: korrespondierender IMPLEMENTIERUNG-Issue auf `Done`>
  - `relatedTo`: <AUT-IDs oder None>

## 3. DoR (Definition of Ready)
- [ ] Scope klar und Test-Pfade konkret benannt
- [ ] Korrespondierender IMPLEMENTIERUNG-Issue ist auf `Done` (`blockedBy` aufgeloest)
- [ ] Test-Plan vorhanden: <Pre-Conditions, Schritte, Erwartungswerte>
- [ ] Erwartete Metriken oder Logs definiert: <Metrik-Namen, Log-Pattern, Schwellwerte>
- [ ] Erfolgs-SLO: <z.B. "4h kontinuierlich ohne Crash", "95 % der Messungen innerhalb Toleranz", "Latenz p50 < 200 ms">
- [ ] Rollback-Plan: <was tun, wenn Test rot ist — Revert-Hash, Feature-Toggle, DB-Restore-Pfad>
- [ ] Agent-Zuweisung passt: `test-log-analyst` fuer Log/CI; `hardware-test` + schicht-Debug-Agent fuer Live-Test
- [ ] Gate-1-Entscheidung dokumentiert: verify-plan <an|aus>; bei Fixture-Aenderung empfohlen `an`

## 4. Arbeitskette
1. **Pre-Check:** Umgebung verifizieren — Testsystem up, Hardware verbunden (MAC, GPIO, Seriennummer), Daten-Baseline vorhanden
2. **(optional) verify-plan (Gate 1):** Skill `verify-plan` wenn Testfixture-Code committed wird
3. **Test-Run:** <Kommandos, Dauer, Protokoll-Datei-Pfad>
4. **Auswertung:** Metriken / Logs gegen SLOs halten; Agent liefert Auswertung als Artefakt (`.claude/reports/current/…/VERIFY-<name>-<date>.md`)
5. **Ampel:** gruen = DoD, gelb = ambivalent (Folge-Issue fuer Nachmessung), rot = Rollback ausloesen + Root-Cause-Issue anlegen
6. **(Gate 2, falls Fixtures committed):** Build- und CI-Lauf gruen
7. **(Gate 3):** Doku-Pfade aktualisieren wenn Test-Ergebnis SOLL- oder Referenzwerte aendert

## 5. DoD (Definition of Done)
- [ ] Test-Run-Artefakt existiert (`.claude/reports/current/<kontext>/VERIFY-<name>-<date>.md`) und ist im Linear-Kommentar verlinkt
- [ ] Alle Erfolgs-SLOs erreicht — **keine** unbelegten "looks good"-Urteile; harte Kennzahl oder Log-Evidenz
- [ ] Testausgabe / Log-Auszug im Kommentar oder als Anhang (Kommentar <= 1500 Zeichen, Rest im Artefakt)
- [ ] Risiko-Status nach Test: `low | medium | high` + Restrisiko-Begruendung
- [ ] Bei rotem Test: Rollback ausgefuehrt, Root-Cause-Issue angelegt mit AUT-ID, Kommentar verweist darauf
- [ ] Linear-Status: `Done` nur bei gruener Ampel; gelb = `Done` mit Follow-up-Issue; rot = zurueck auf `In Progress` + Rollback

## 6. /updatedocs (Pflicht wenn code_change=true)
- **Trigger:** `code_change=<true|false>` — `true` wenn Test-Fixtures, Messskripte oder SLO-Werte im Repo committed wurden
- **Pflicht-Checkliste bei `true`:**
  - [ ] `/updatedocs` ausgefuehrt fuer geaenderte Test-/Referenz-Artefakte
  - [ ] Aktualisierte Pfade: <z.B. `reference/testing/TEST_WORKFLOW.md`, `reference/debugging/LOG_LOCATIONS.md`>
  - [ ] Pro Pfad: was + warum
- **Empfehlung auch bei `false`:** Referenz-Abgleich im `reference/testing/*` falls SLO-Werte neu sind.

## 7. Follow-up-Tracking
- **Verantwortlich:** <Person | TM>
- **Restpunkte:** <Liste offener Folge-Issues — Rollback-Fixes, Nachmessungen, Alerting-Tuning>
- **Check-Termin:** <YYYY-MM-DD — typisch 1 Woche nach Live-Test fuer Regressions-Kontrolle>
- **Monitoring-Follow-up:** <Dashboard / Alert-Regel, die Erfolgskennzahl in Prometheus / Grafana haelt>

---

### Typ-spezifische Pflichtfelder (VERIFIKATION)
- **Test-Plan:** Schritt-fuer-Schritt mit Pre- und Post-Conditions.
- **Erwartete Metriken:** Name, Quelle (Log/Prometheus/DB), Schwellwert.
- **Erfolgs-SLO:** eindeutig, messbar, ohne Weichmacher.
- **Rollback-Plan:** Git-Commit-Hash zum Zurueckrollen **oder** Feature-Toggle-Name **oder** DB-Restore-Schritt.
- **Live-Test-Dauer:** fuer P0-Risk-Features mindestens 4h; fuer P1 mindestens 1h; fuer P2 CI-Run reicht.

### Gate-Hinweise
- **Gate 0 (Intake):** Hard — Pflichtkopf, Scope, DoR komplett.
- **Gate 1 (verify-plan):** **Hard** wenn Testfixture-Code committed wird; sonst Soft.
- **Gate 2 (Tech-Verifikation):** **Hard** — Test selbst ist das Gate; `Done` nur bei gruener Ampel.
- **Gate 3 (Wissensintegration):** **Hard** wenn Test-Ergebnis Referenzwerte oder SLOs aendert; sonst Soft.
