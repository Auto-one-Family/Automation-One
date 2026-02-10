# Auftrag 4.2: Frontend Logging – Verifikation & Implementierungsplan
Datum: 2026-02-09
Typ: Verify → Plan (ein Durchgang)
Priorität: 4 von 4 (unabhängig)

## Context

Erstanalyse abgeschlossen (Report: `frontend-logging-assessment.md`). Report ist umfangreich und detailliert. Dieser Auftrag verifiziert die Kernfakten und erstellt einen exakten Implementierungsplan für Phase 1+2.

Kernfakten aus dem Report:
- 241 console.*-Calls in 33 Dateien (85 error, 67 log, 35 warn, 30 debug, 24 info)
- Top-3 Dateien: stores/esp.ts (52), services/websocket.ts (28), SystemMonitorView.vue (20)
- Globale Handler in main.ts existieren (Vue errorHandler, warnHandler, unhandledrejection) – bereits structured JSON
- Fehlt: window.onerror Handler
- VITE_LOG_LEVEL in docker-compose.yml definiert aber nicht genutzt
- Kein zentraler Logger – alles nackte console.*-Calls
- 6 explizite [DEBUG]-Artefakte in SystemMonitorView.vue (Zeilen 917-989)
- 12 styled %c-Calls in 6 Dateien (nutzlos in Docker-Logs)
- Loki-Pipeline funktioniert bereits (console → Docker → Promtail → Loki)
- Promtail hat keine Frontend-spezifischen Pipeline-Stages
- CORS blockiert Direct-Push an Loki (Port 3100 nicht in allowed_origins)
- Logger-Empfehlung: Custom ~50 LOC, kein externer Package

Entscheidung: Phase 1 (Structured Output + Promtail-Pipeline) und Phase 2 (Level-Gate + Cleanup) zusammen implementieren.

## Aufgabe

Zwei Phasen in einem Durchgang:

### Phase A: Report-Findings verifizieren

1. Prüfe `El Frontend/src/main.ts` – bestätige die 3 globalen Handler (errorHandler, warnHandler, unhandledrejection). Fehlt wirklich window.onerror?
2. Prüfe `docker-compose.yml` – wo genau steht VITE_LOG_LEVEL? Welcher Wert? Wird es als Build-Arg oder Environment übergeben?
3. Prüfe `docker/promtail/config.yml` – aktuelle Pipeline-Stages. Gibt es bereits eine Frontend-spezifische Stage oder nur den generischen health-drop?
4. Prüfe `El Frontend/src/views/SystemMonitorView.vue` Zeilen 917-989 – bestätige die 6 [DEBUG]-Artefakte
5. Prüfe ob es unter `El Frontend/src/utils/` oder `El Frontend/src/services/` bereits eine Logger-Datei gibt (auch auskommentiert oder unbenutzt)
6. Stichprobe: 3-5 der Top-Dateien (esp.ts, websocket.ts, CleanupPanel.vue) – bestätige das console.*-Pattern und die Counts

### Phase B: Exakten Implementierungsplan erstellen

Erstelle einen Plan der Phase 1+2 als zusammenhängende Implementierung behandelt:

**1. Custom Logger (`src/utils/logger.ts`):**
- Exakte Datei mit vollständigem Code
- Nutzt VITE_LOG_LEVEL als Gate
- Bietet createLogger(componentName) Factory
- Output: JSON wenn VITE_LOG_LEVEL != 'debug', Plaintext wenn debug (Entwickler-Lesbarkeit)
- Error-Level loggt IMMER (kein Gate)
- TypeScript-typisiert

**2. Global Handler Update (`main.ts`):**
- window.onerror ergänzen
- Bestehende Handler auf den neuen Logger umstellen (statt direkte console.*)

**3. Migration der 241 Calls:**
- Gruppiere die Migration in logische Batches (nach Kategorie, nicht nach Datei):
  - Batch 1: API-Layer (api/index.ts, api/esp.ts) – zentralster Punkt
  - Batch 2: Services (websocket.ts) – zweitwichtigster
  - Batch 3: Stores (esp.ts, logic.ts, auth.ts, dragState.ts)
  - Batch 4: Views + Components (Rest)
- Pro Batch: Welche Dateien, welche Imports ändern, welche Calls ersetzen
- Für die styled %c-Calls: Was wird das Replacement-Pattern?
- Für die [DEBUG]-Calls: Einfach entfernen oder zu logger.debug() konvertieren?

**4. Promtail Pipeline-Stage:**
- Exakte YAML-Ergänzung für `docker/promtail/config.yml`
- JSON-Parsing für Frontend-Container
- Labels: level, component

**5. Grafana Dashboard-Ergänzung (optional):**
- Soll Panel 4 ("Frontend Log Activity") angepasst werden?
- Neues Panel: Frontend Error Rate by Component?
- Exakte Panel-Definition wenn ja

**6. Verifikation:**
- Wie testet man dass der Logger funktioniert?
- Wie prüft man dass Promtail die JSON-Logs korrekt parst?
- Wie verifiziert man in Grafana dass Level-Labels ankommen?

Der Plan muss so präzise sein, dass ein Dev-Agent die Migration systematisch durchführen kann – Batch für Batch, mit klarem Replacement-Pattern pro Kategorie.

## Agents (der Reihe nach)

/frontend-debug
Verifiziere die Erstanalyse-Findings (Phase A). Erstelle den Logger-Code und das Migration-Pattern für alle 4 Batches. Definiere das exakte Replacement-Pattern pro Call-Kategorie (API-Error, WebSocket-Lifecycle, Store-State, styled %c, [DEBUG]).

/system-control
Prüfe Promtail-Config und docker-compose VITE_LOG_LEVEL. Erstelle die exakte Promtail Pipeline-Stage. Prüfe ob Grafana-Dashboard-Panels angepasst werden sollten.

## Erfolgskriterium

Report enthält:
- Bestätigung oder Korrektur der Erstanalyse-Findings
- Vollständiger Logger-Code (src/utils/logger.ts) – copy-paste-ready
- Migration-Plan in 4 Batches mit exaktem Replacement-Pattern pro Kategorie
- Promtail Pipeline-Stage YAML – copy-paste-ready
- Verifikations-Checkliste
- Aufwandschätzung pro Batch

## Report zurück an
.technical-manager/inbox/agent-reports/frontend-logging-impl-plan.md
