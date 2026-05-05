# TASK-PACKAGES — Run `problemcluster-obs-2026-04-09`

**Quelle:** Steuerdatei `.claude/auftraege/auto-debugger/inbox/STEUER-problemcluster-orchestration-observability-2026-04-09.md`  
**Modus:** `artefact_improvement` — Pakete für **nachgelagerte** Umsetzung; **kein** Start ohne vorheriges **`VERIFY-PLAN-REPORT.md`** (Skill `verify-plan`).

**Git-Akzeptanzkriterium (alle Code-Pakete):** Alle Commits dieses Pakets ausschließlich auf Branch **`auto-debugger/work`**; vor erster Änderung `git branch --show-current` = `auto-debugger/work`.

---

## PKG-01 — Server: JSON-Parse-Fehler vor MQTT-CID

- **Owner:** server-dev  
- **Risiko:** niedrig (nur Logging/Kontext, kein Handler vor Parse)  
- **IST:** `subscriber._route_message` bricht bei `JSONDecodeError` ab, bevor synthetische CID gesetzt wird (siehe IST-Observability P0).  
- **SOLL:** Logzeile mit Topic + stabile Parse-Fail-Kennung (z. B. `parse-fail:…` oder Broker-Meta falls verfügbar).  
- **Tests:** Erweiterung `El Servador/god_kaiser_server/tests/unit/test_mqtt_correlation.py` (ggf. ergänzend Subscriber-spezifische Tests im gleichen Baum).  
- **Nicht-Ziele:** Keine MQTT-Schema-Pflichtfelder; kein Handler-Lauf vor erfolgreichem Parse.  
- **Git-AK:** wie oben.

---

## PKG-02 — Frontend: sichtbare Finalität Ack/Resolve

- **Owner:** frontend-dev  
- **Risiko:** niedrig  
- **IST:** `acknowledgeAlert` / `resolveAlert` können `false` liefern ohne zentrales Drawer-Feedback (Konzept §5.1).  
- **SOLL:** Toast oder gleichwertiges Error-Pattern bei Fehlschlag/Timeout; optional `x-request-id` aus Response.  
- **Tests:** Vitest (Store) und/oder Playwright sobald `data-testid` vorhanden.  
- **Nicht-Ziele:** Keine REST-Response-Schema-Änderung ohne separates Gate.  
- **Git-AK:** wie oben.

---

## PKG-03 — Frontend: `data-testid` + Referenz-Flow Alert-Center

- **Owner:** frontend-dev (+ test-log-analyst bei CI-Integration)  
- **Risiko:** niedrig  
- **IST:** Keine stabilen Test-IDs im Notification-UI (Konzept Quick Win).  
- **SOLL:** Additive `data-testid` auf Drawer, Tabs, Ack/Resolve; ein Playwright-Szenario unter `El Frontend/tests/e2e/…`.  
- **Tests:** `npx playwright test …` lokal/CI.  
- **Nicht-Ziele:** Kein UX-Redesign.  
- **Git-AK:** wie oben.

---

## PKG-04 — Observability: Korrelations-Playbook (Doku)

- **Owner:** beliebig (Doku-only, kein Produktcode zwingend)  
- **Risiko:** keins  
- **SOLL:** Kurzdokument oder Erweiterung `docs/debugging/logql-queries.md` mit REST vs. MQTT-CID und drei Copy-Paste-LogQL-Szenarien.  
- **Git-AK:** Commits nur auf `auto-debugger/work` wenn im gleichen Release-Branch gebündelt.

---

## PKG-05 — Firmware / Alert-Pfad (nur mit Hardware-Gate)

- **Owner:** esp32-dev  
- **Risiko:** mittel (safety-relevant je nach Änderung)  
- **IST:** `ErrorTracker`/MQTT-Pfade timing-/hardwareabhängig; Wokwi allein reicht nicht für kritische Abnahme.  
- **SOLL:** Nur nach `VERIFY-PLAN-REPORT` und Checkliste Konzept §7.4.  
- **Git-AK:** wie oben; **kein** „verifiziert“ ohne Referenz-ESP-Lauf wenn I/O/NVS betroffen.

---

*Ende TASK-PACKAGES.*
