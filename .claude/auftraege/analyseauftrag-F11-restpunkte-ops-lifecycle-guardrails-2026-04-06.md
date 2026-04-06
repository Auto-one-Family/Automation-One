# Analyseauftrag F11-Restpunkte - Ops Lifecycle, Guardrails, Contracts

> **Typ:** Reiner Analyseauftrag (kein Implementierungsauftrag)  
> **Datum:** 2026-04-06  
> **Prioritaet:** P0 zuerst, danach P1  
> **Ziel:** Verbleibende offene Punkte nach F11-Fixstand praezise belegen, eingrenzen und fuer Folgefixes spezifizieren.

---

## 1) Ausgangslage (bereits umgesetzt, hier nicht erneut bauen)

Folgendes gilt als vorhanden und ist nur gegenzupruefen, nicht neu zu implementieren:
- Shared Ops-Lifecycle (`initiated/running/partial/success/failed`) inkl. zentralem Store.
- Plugin-Lifecycle mit Execution-ID-Handling, Timeout-Guard und Reconciliation-Ansatz.
- Guardrail-Flow fuer Loadtest und SystemConfig (Preflight/Confirm/Tracking/Summary).
- Globales Ops-Banner im SystemMonitor.
- Legacy-Redirect-Telemetrie im Router.

Der Fokus dieses Auftrags liegt ausschliesslich auf **Restluecken, Contract-Risiken und Testnachweisen**.

---

## 2) Analyseziele (verbleibende offene Punkte)

## P0-A: Plugin-Statusvertrag mit echtem Backend verifizieren

Pruefe, ob der produktive Statuskanal fuer Plugins den erwarteten Vertrag stabil liefert:
- `plugin_execution_status`
- Pflichtfelder: `execution_id`, `plugin_id`, `status`, `updated_at`
- Statusabfolge unter Realbetrieb: `initiated -> running -> partial|success|failed`

Nachzuweisen:
1. Wo der Contract heute vollstaendig ist.
2. Wo Felder/Status fehlen oder semantisch abweichen.
3. Welche UI/Store-Folgen bei fehlenden Feldern auftreten (Fallback, Timeout, falsche Finalitaet).

## P0-B: Timeout- und Reconciliation-Robustheit unter Realbedingungen

Analysiere drei Realfaelle:
1. Running-ACK kommt rechtzeitig.
2. Running-ACK kommt verspaetet (nach Timeout).
3. Running-ACK kommt gar nicht.

Und zwei Reload-Faelle:
1. Laufende Ausfuehrung wird korrekt ueber Reconciliation wiederhergestellt.
2. API liefert unvollstaendige Daten (z. B. ohne `execution_id`) -> Verhalten dokumentieren.

Ergebnis: klare Fehlermatrix `Szenario -> Ist-Verhalten -> Risiko -> noetiger Folgefix`.

## P0-C: SystemConfig-Finalitaet (`saved` vs `applied`) vertraglich absichern

Pruefe den realen API-Vertrag fuer Config-Aenderungen:
- Welche Felder signalisieren nur Persistenz?
- Welche Felder signalisieren echte Runtime-Anwendung?
- Gibt es explizite Apply-Bestaetigung oder nur indirekte Heuristik?

Ergebnis:
- Finalitaetsmatrix `API-Response -> erlaubter UI-Zustand`.
- Liste der Ambiguitaeten, die zu falscher Operator-Sicherheit fuehren koennen.

## P0-D: E2E-Nachweisluecken schliessen (Analyse der Testabdeckung, kein Coding)

Bewerte, welche E2E-Szenarien fuer F11 zwingend fehlen:
1. Plugin-End-to-End-Lifecycle inkl. `partial`.
2. Timeout-Fall ohne Running-ACK gegen reales Verhalten.
3. Reload-Reconciliation gegen `/plugins/executions` inkl. Negativfall.
4. Loadtest-Guardrail komplett (Preflight -> typed confirm -> tracking -> summary).
5. SystemConfig-`saved_only` inkl. Operator-Hinweis.
6. Ops-Banner bei mehreren parallelen High-Risk-Jobs.

Erstelle pro Szenario:
- Testziel
- Mindest-Assertions
- benoetigte Testdaten/Mocks
- Risiko bei fehlendem Test

## P1-E: DB-Export Sensitivitaet als verbleibender Guardrail-Hotspot

Analysiere den DB-Export-Flow im SystemMonitor:
- Ist vor Export klar erkennbar, welcher Datenumfang exportiert wird?
- Gibt es Hinweis auf Sensitivitaet/Datenschutz/Scope?
- Gibt es Schutz gegen versehentlichen Massenexport?

Ergebnis:
- Gap-Befund mit Prioritaet.
- Minimaler Guardrail-Sollzustand (nur Analyse, kein UI-Bau).

## P1-F: Redirect-Decommission auf realen Nutzungsdaten vorbereiten

Pruefe Telemetriequalitaet der Legacy-Redirect-Erfassung:
- Datenstruktur robust gegen lokale Manipulation/Reset?
- Auswertbarkeit pro Altpfad und Zielroute ausreichend?
- Eignung fuer Decommission-Gates (P3 -> P2 -> P1) gegeben?

Ergebnis:
- Messqualitaet bewerten.
- Decommission-Readiness pro Prioritaetsklasse mit klaren Schwellwertvorschlaegen.

---

## 3) Verbindlicher Analysescope (Dateien)

- `El Frontend/src/api/plugins.ts`
- `El Frontend/src/shared/stores/plugins.store.ts`
- `El Frontend/src/views/PluginsView.vue`
- `El Frontend/src/api/loadtest.ts`
- `El Frontend/src/views/LoadTestView.vue`
- `El Frontend/src/views/SystemConfigView.vue`
- `El Frontend/src/views/SystemMonitorView.vue`
- `El Frontend/src/components/system-monitor/*`
- `El Frontend/src/router/index.ts`
- relevante Testdateien unter `El Frontend/tests/`

Falls benoetigt zusaetzlich:
- Backend-Endpoints/Contracts fuer Plugin-Execution und SystemConfig-Apply.

---

## 4) Pflicht-Artefakte der Lieferung

Lieferung muss exakt diese Bloecke enthalten:

1. **Contract-Befund Plugins**
   - Feldvollstaendigkeit
   - Statusabfolge
   - Drift/Inkonsistenzen

2. **Timeout- und Reconciliation-Fehlermatrix**
   - reale Szenarien, beobachtetes Verhalten, Risikograd

3. **Finalitaetsmatrix SystemConfig**
   - `saved` vs `applied` eindeutig gemappt
   - Ambiguitaeten und Auswirkungen

4. **E2E-Gap-Katalog**
   - priorisiert, mit Mindest-Assertions

5. **DB-Export-Guardrail-Befund**
   - Ist/Soll mit minimalem Folgeauftragsvorschlag

6. **Redirect-Decommission-Readiness**
   - Datenqualitaet
   - Schwellwertvorschlaege fuer P3/P2/P1-Abbau

---

## 5) Strenge Abgrenzung (wichtig)

- **Keine Implementierung in diesem Auftrag.**
- Keine grossflaechigen Refactors.
- Keine kosmetischen UI-Vorschlaege ohne Ops-Relevanz.
- Keine Erfolgsaussagen ohne reproduzierbaren Nachweis.

---

## 6) Abnahmekriterien fuer diesen Analyseauftrag

1. Jeder Restpunkt ist mit reproduzierbarer Evidenz bewertet.
2. ACK-vs-terminal ist fuer Plugins und SystemConfig eindeutig getrennt.
3. E2E-Luecken sind testtechnisch konkret und unmittelbar umsetzbar beschrieben.
4. DB-Export und Redirect-Decommission sind mit klarer Priorisierung einordenbar.
5. Ergebnis ist direkt als Folge-Fixauftrag nutzbar, ohne weitere Kontextdateien.

---

## 7) Ausgabeformat (verbindlich)

Gib die Analyse in dieser Reihenfolge aus:
1. Executive Delta (Was ist offen, was ist kritisch)
2. Detailbefunde P0-A bis P0-D
3. Detailbefunde P1-E bis P1-F
4. Priorisierte Folgeauftraege (max. 3 Pakete)
5. Testplan fuer die offenen E2E-Nachweise

