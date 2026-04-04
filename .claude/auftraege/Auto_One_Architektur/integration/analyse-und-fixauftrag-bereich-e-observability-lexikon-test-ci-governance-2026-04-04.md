# Analyse- und Fixauftrag Bereich E: Observability, Lexikon, Tests und CI-Governance

**Stand:** 2026-04-04  
**Prioritaet:** P0  
**Typ:** Cross-layer Governance (Metriken + Wissen + Gates)

---

## Hauptauftragsdokument (verbindliche Referenz)

- `/.claude/reports/current/auftragsserie-config-korrelation-restgaps-2026-04-04.md`
- Serienindex: `/.claude/auftraege/Auto_One_Architektur/integration/auftragsserie-config-korrelation-restgaps-2026-04-04.md`
- Bereiche A-D sind Pflichtvoraussetzung.

---

## Spezifischer Bereich dieses Auftrags

Dieser Auftrag stellt sicher, dass Contract-Faelle nicht nur "gefuehlt", sondern **messbar, dokumentiert und gate-gesichert** sind.

Ziel: Keine semantische Regression mehr unbemerkt in PRs oder Betrieb.

---

## Scope (muss erledigt werden)

1. Contract-Metriken als first-class Counter/Gauges.
2. Lexikon-Anbindung neuer Contract-Codes mit Pflichtattributen.
3. Testabdeckung fuer Contract-Randfaelle (Backend + Frontend + ggf. Firmware).
4. CI-Gates gegen unvollstaendiges Contract-Wissen.
5. Operator-Runbook fuer konkrete Sofortaktionen.

---

## Relevante Module und Artefakte

- **Server Metriken/Errors:** `El Servador/god_kaiser_server/src/core/metrics.py`, `El Servador/god_kaiser_server/src/core/error_codes.py`
- **Server Tests:** `El Servador/god_kaiser_server/tests/unit/`, `El Servador/god_kaiser_server/tests/integration/`
- **Frontend Mapping/Anzeige:** `El Frontend/src/utils/errorCodeTranslator.ts`, `El Frontend/src/components/system-monitor/`
- **Firmware Fehlercodes:** `El Trabajante/src/models/error_codes.h`
- **Kanonisches Lexikon:** `/.claude/reference/errors/ERROR_CODES.md`
- **CI-Workflows:** `/.github/workflows/`

---

## Konsistenz- und Pattern-Regeln (verbindlich)

- Kein neuer Contract-Code ohne Lexikon-Eintrag mit Pflichtattributen.
- Kein neuer Drift-Fallback ohne Contract-Signal.
- Kein Merge ohne Tests fuer neue Contract-Regeln.
- Dashboards/Logs muessen Domain-Fehler und Contract-Fehler trennen.
- Operator-Aktionen muessen eindeutig und ausfuehrbar sein.

---

## Umsetzungsauftrag (konkret)

1. Metriken einfuehren/erweitern fuer:
   - missing correlation
   - envelope/data divergence
   - contract mismatch / unknown contract event
   - blocked terminalization due to contract violation
2. Lexikon erweitern:
   - Domain, Severity, Terminality, Retry-Policy, Operator-Action verpflichtend.
3. Testpaket erweitern:
   - deterministische Injektionsfaelle fuer Contract-Verletzungen.
4. CI-Gates:
   - neuer Contract-Code ohne Lexikon -> fail
   - fehlender Test fuer neue Contract-Regel -> fail
   - neue Fallback-Heilung ohne Contract-Signal -> fail
5. Operator-Runbook:
   - pro Contract-Fall klare Diagnose und Sofortschritt.

---

## Deliverables (pflichtig)

- Metrik-Inventar inkl. Trigger und Zielpanel
- Lexikon-Diff mit neuen/angepassten Contract-Codes
- Testreport fuer Contract-Randfaelle
- CI-Gate-Dokumentation inkl. Negativtest
- Operator-Runbook "Contract-Faelle"

---

## Testmatrix (Mindestumfang)

- T1: Metrikzaehler steigen deterministisch bei injizierten Contract-Verletzungen.
- T2: Jeder neue Contract-Code hat vollstaendige Lexikonattribute.
- T3: CI blockiert PRs mit unvollstaendigem Contract-Wissen.
- T4: UI/Logs trennen Domain-Fehler und Contract-Fehler klar.

---

## Abnahmekriterien

- [ ] Contract-Risiken sind in Monitoring und Reporting explizit sichtbar.
- [ ] Neue Codes koennen nicht ohne Lexikon- und Testanbindung eingefuehrt werden.
- [ ] CI verhindert semantische Drift automatisch.
- [ ] Operatoren erhalten konkrete, nicht-generische Handlungsanweisungen.

Wenn Contract-Verletzungen im Betrieb nicht eindeutig gezaehlt und in CI nicht gate-gesichert sind, gilt Bereich E als nicht bestanden.
