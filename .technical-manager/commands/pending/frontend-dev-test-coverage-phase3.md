# Auftrag an @frontend-dev
Datum: 2026-02-11 22:00

## Context

Die Frontend Test-Infrastruktur ist vollständig eingerichtet und funktional:

- **package.json:** Dependencies vorhanden (vitest 3.0+, @vue/test-utils, jsdom, msw, @vitest/coverage-v8)
- **vitest.config.ts:** Konfiguriert (jsdom, v8 coverage, @-Alias, pool:forks)
- **tests/setup.ts:** MSW Server, Pinia fresh-per-test, jsdom-Mocks (matchMedia, ResizeObserver, Canvas)
- **MSW Handlers:** ~80 Handler in tests/mocks/handlers.ts (~80% API Coverage)
- **Aktueller Stand:** 5 Test-Files, 250 Tests, alle PASSED (7.77s)

Existierende Tests (exzellente Qualität, als Referenz-Pattern nutzen):
- `tests/unit/stores/auth.test.ts` (520 Zeilen, 37 Tests)
- `tests/unit/stores/esp.test.ts` (989 Zeilen, 40 Tests)
- `tests/unit/composables/useToast.test.ts` (378 Zeilen, 27 Tests)
- `tests/unit/composables/useWebSocket.test.ts` (943 Zeilen, 55 Tests)
- `tests/unit/utils/formatters.test.ts` (65 Tests)

### CI-Bug identifiziert

`.github/workflows/frontend-tests.yml` Zeile 64 ruft `npm run test:unit` auf.
`package.json` hat dieses Script NICHT. Vorhanden sind nur: `test`, `test:watch`, `test:coverage`.
→ CI Unit-Test-Job schlägt fehl wenn getriggert.

### Coverage-Lücken (nach Priorität)

| Kategorie | Getestet | Vorhanden | Coverage |
|-----------|----------|-----------|----------|
| Stores | 2 (auth, esp) | 5 total | 40% |
| Composables | 2 (useToast, useWebSocket) | 7 real | 29% |
| Utils | 1 (formatters) | 15+ Files | ~7% |
| Components | 0 | 67 .vue Files | 0% |
| Views | 0 | 11 Views | 0% |
| Router Guards | 0 | Auth-Guard in router/index.ts | 0% |

## Focus

Drei Bereiche, in dieser Reihenfolge:

### 1. CI-Bug Fix (package.json + Workflow-Konsistenz)
### 2. Utils-Tests (Pure Logic, höchster ROI, kein Mocking nötig)
### 3. Restliche Store-Tests (database, logic, dragState)

Components und Views sind NICHT im Scope dieses Auftrags.

## Goal

### Teil 1: CI-Bug Fix

**package.json** – fehlende Scripts ergänzen die der CI-Workflow erwartet:

```json
"scripts": {
  "test": "vitest run",
  "test:unit": "vitest run tests/unit",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

Prüfe zusätzlich ob der CI-Workflow (`frontend-tests.yml`) mit den tatsächlichen Scripts konsistent ist. Wenn der Workflow weitere Scripts referenziert die fehlen, ergänze sie. Ändere aber NICHT den Workflow selbst – nur package.json.

### Teil 2: Utils-Tests

Schreibe Tests für ALLE untesteten Utils in `src/utils/`. Jede Datei bekommt ein eigenes Test-File unter `tests/unit/utils/`.

**Zu testende Utils (prüfe jede Datei, passe Liste an falls sich Inhalte geändert haben):**

| Source-File | Test-File | Was testen |
|-------------|-----------|------------|
| `errorCodeTranslator.ts` | `errorCodeTranslator.test.ts` | Severity-Labels, Category-Labels, Icon-Mappings, Category-Detection Fallback, Edge Cases (unbekannte Codes) |
| `eventGrouper.ts` | `eventGrouper.test.ts` | Gruppierung nach Zeitfenster, leere Arrays, einzelne Events, Grenzfälle |
| `eventTransformer.ts` | `eventTransformer.test.ts` | Transformation aller Event-Typen, fehlende Felder, Null-Handling |
| `logMessageTranslator.ts` | `logMessageTranslator.test.ts` | Alle Log-Level-Übersetzungen, unbekannte Messages, Sonderzeichen |
| `logSummaryGenerator.ts` | `logSummaryGenerator.test.ts` | Zusammenfassungen für verschiedene Log-Mengen, leere Eingaben |
| `wifiStrength.ts` | `wifiStrength.test.ts` | RSSI-Bereiche → Labels, Grenzwerte (-30, -50, -70, -90), Edge Cases |
| `zoneColors.ts` | `zoneColors.test.ts` | Farb-Zuordnung, Index-Overflow/Wraparound, konsistente Rückgabe |
| `labels.ts` | `labels.test.ts` | Alle Label-Mappings, unbekannte Keys, Vollständigkeit |
| `databaseColumnTranslator.ts` | `databaseColumnTranslator.test.ts` | Spalten-Übersetzungen, unbekannte Spalten, Tabellen-Kontext |
| `actuatorDefaults.ts` | `actuatorDefaults.test.ts` | Default-Werte für jeden Actuator-Typ, Vollständigkeit |
| `sensorDefaults.ts` | `sensorDefaults.test.ts` | Default-Werte für jeden Sensor-Typ, Vollständigkeit |
| `gpioConfig.ts` | `gpioConfig.test.ts` | GPIO-Pin-Validierung, Board-Configs, reservierte Pins |
| `eventTypeIcons.ts` | `eventTypeIcons.test.ts` | Icon-Zuordnung für alle Event-Typen |

**WICHTIG für Utils:**
- Das sind reine Funktionen. Kein Store-Mocking, kein API-Mocking, kein DOM nötig.
- Pattern von `formatters.test.ts` übernehmen: Import → describe → Testfälle pro exportierte Funktion.
- Edge Cases testen: leere Eingaben, undefined, unbekannte Werte, Grenzwerte.
- Wenn eine Utils-Datei nur Re-Exports oder Typen enthält (z.B. `index.ts`), KEINEN Test schreiben.
- `logger.ts` NICHT testen (Wrapper um console, nicht sinnvoll unit-testbar).

### Teil 3: Store-Tests

Schreibe Tests für die drei untesteten Stores. Nutze das Pattern der existierenden auth.test.ts und esp.test.ts als Vorlage.

**database.ts → `tests/unit/stores/database.test.ts`**

Prüfe den Store-Code und teste:
- Initial State (alle Refs auf Default-Werte)
- Computed Getters (falls vorhanden)
- Alle Actions: API-Calls mit MSW-Mock-Responses
- Error-Handling: API-Fehler, Netzwerk-Fehler
- Loading-States: isLoading Flags korrekt gesetzt/zurückgesetzt

**logic.ts → `tests/unit/stores/logic.test.ts`**

Das ist der komplexeste untestete Store (Cross-ESP Automation, WebSocket-Events). Teste:
- Initial State
- CRUD-Operationen für Logic-Rules (fetchRules, createRule, updateRule, deleteRule)
- WebSocket-Event-Handling (logic_execution Events)
- Connection-Extraction (extractConnections)
- Computed Getters
- Error-States

Für WebSocket-Events: Der MSW-Setup in setup.ts handled HTTP. Für WebSocket nutze das Pattern aus useWebSocket.test.ts (custom Mock in tests/mocks/websocket.ts).

**dragState.ts → `tests/unit/stores/dragState.test.ts`**

Einfachster Store. Teste:
- Initial State (nichts wird gedraggt)
- Start/Stop Drag
- Drag-Payload korrekt gesetzt/zurückgesetzt
- Edge Cases (stop ohne start, doppelter start)

### MSW-Handler-Ergänzungen

Wenn Store-Tests API-Endpoints aufrufen für die KEIN MSW-Handler existiert, ergänze die fehlenden Handler in `tests/mocks/handlers.ts`. Bekannte Lücken laut Analyse:
- Logic-Rules CRUD (falls nicht vorhanden)
- Database Explorer Endpoints (falls nicht vorhanden)

Füge neue Handler **am Ende** der bestehenden Handler-Liste hinzu, mit einem Kommentar-Block der kennzeichnet was neu ist. Bestehende Handler NICHT ändern.

## Qualitätsanforderungen

### Pattern-Konsistenz
- **Exakt** das gleiche Pattern wie die existierenden Tests nutzen (describe-Nesting, Assertion-Style, Setup/Teardown)
- Lies die existierenden Tests BEVOR du neue schreibst. Die Qualität dort ist der Standard.
- Pinia: `setActivePinia(createPinia())` kommt über setup.ts beforeEach – NICHT nochmal in Tests.
- MSW: `server.resetHandlers()` kommt über setup.ts afterEach – NICHT nochmal in Tests.

### Test-Qualität
- Jeder Test testet EINE Sache (Single Assertion Principle wo sinnvoll)
- describe-Blöcke pro exportierte Funktion/Feature
- Happy Path + Error Cases + Edge Cases
- Keine Snapshot-Tests für Utils (zu fragil)
- Keine Test-Duplikation zwischen Utils und Stores

### Was NICHT tun
- KEINE Component-Tests (.vue Files) schreiben
- KEINE View-Tests schreiben
- KEINE E2E-Tests schreiben oder ändern
- KEINE existierenden Tests ändern (auth, esp, useToast, useWebSocket, formatters)
- KEINE vitest.config.ts ändern
- KEINE setup.ts ändern
- KEIN playwright.config.ts anfassen
- NICHT den CI-Workflow (.github/workflows/frontend-tests.yml) ändern
- NICHT die API-Layer-Dateien (src/api/*.ts) ändern

### Reihenfolge einhalten
1. Erst CI-Bug fixen (package.json)
2. Dann Utils-Tests schreiben
3. Dann Store-Tests schreiben
4. Am Ende: `npm test` – ALLES muss grün sein
5. Am Ende: `npm run test:coverage` – Coverage-Report generieren

## Success Criterion

### Minimum (MUSS erfüllt sein):

```
npm run test:unit → PASSED (neues Script funktioniert)
npm test → ALL PASSED (alte + neue Tests)
```

- CI-Bug gefixt: `test:unit` Script existiert in package.json
- Mindestens 10 neue Utils-Test-Files erstellt
- Alle 3 Store-Tests erstellt (database, logic, dragState)
- 0 Test-Failures
- Keine Regression: Die 250 existierenden Tests laufen weiterhin durch

### Stretch (SOLL erfüllt sein):

- Coverage-Report generiert (`npm run test:coverage`)
- Gesamte Utils-Coverage > 80%
- Gesamte Store-Coverage > 80%

### Output-Format für Report

Am Ende bitte eine Tabelle mit:

| File | Tests | Status | Anmerkungen |
|------|-------|--------|-------------|
| (jedes neue Test-File) | (Anzahl) | PASS/FAIL | (ggf. Besonderheiten) |

Plus: Gesamt-Coverage-Zahlen aus `npm run test:coverage` (Statements, Branches, Functions, Lines).

## Report zurück an
`.technical-manager/inbox/agent-reports/frontend-dev-test-coverage-phase3-2026-02-11.md`

Inhalt:
1. CI-Bug Fix: Was genau geändert wurde in package.json
2. Neue Test-Files: Liste mit Pfad, Anzahl Tests pro File
3. MSW-Handler-Ergänzungen: Was hinzugefügt wurde
4. Test-Ergebnis: Vollständiger Output von `npm test`
5. Coverage-Report: Output von `npm run test:coverage`
6. Offene Punkte: Was nicht testbar war und warum, empfohlene nächste Schritte
