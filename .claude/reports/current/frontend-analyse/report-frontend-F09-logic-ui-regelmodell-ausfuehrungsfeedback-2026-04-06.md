# Report Frontend F09: Logic UI, Regelmodell und Ausfuehrungsfeedback

Datum: 2026-04-06  
Scope: `El Frontend/src/views/LogicView.vue`, `El Frontend/src/components/rules/RuleFlowEditor.vue`, `El Frontend/src/components/rules/RuleConfigPanel.vue`, `El Frontend/src/shared/stores/logic.store.ts`, `El Frontend/src/types/logic.ts`, `El Frontend/src/api/logic.ts`, `El Frontend/src/components/rules/RuleCard.vue`, `El Frontend/src/components/logic/RuleCardCompact.vue`

## 1) Feldflussmatrix `Template -> Editor -> Payload -> Persistenz -> Sichtbarkeit`

| Feld/Signal | Template | Editor | Payload (Save) | Persistenz/Reload | Sichtbarkeit im UI | Befund |
|---|---|---|---|---|---|---|
| `priority` | In Templates vorhanden (`rule-templates.ts`) | Beim Template-Load in `loadFromRuleData(...)` angenommen | **Fehlt** in `LogicView.saveRule()` bei `createRule` und `updateRule` | Serverwert bleibt/Default greift, Template-Wert wird nicht durchgereicht | Nur indirekt (Sortierung in `ActiveAutomationsSection`/`getRulesForZone`) | **P0-Luecke: Feldverlust im Save-Pfad** |
| `cooldown_seconds` | In Templates vorhanden | Beim Template-Load angenommen | **Fehlt** in `saveRule()` bei Create/Update | Nicht verlässlich fortgeschrieben, nach Reload nicht parity-sicher | In Logic-UI nicht sichtbar | **P0-Luecke: Feldverlust + keine Transparenz** |
| `logic_operator` | Vorhanden | In Graph-Node gepflegt | Wird gespeichert | Persistiert sauber | Sichtbar in Cards/Canvas | OK |
| `conditions` / `actions` | Vorhanden | In Graph gepflegt | Werden gespeichert | Persistiert/reloadbar | Sichtbar in Cards/Canvas | OK |
| Rule-Validierung | N/A | Lokale Mindestchecks (mind. 1 Bedingung/Aktion) | Keine feld-/node-scharfe Zuordnung aus 422 | Globaler Fehlertext via Toast/Store-Error | Keine Markierung am konkreten Knoten/Feld | **P1-Luecke: globale statt praezise Rueckmeldung** |
| Save-ACK (Konfiguration angenommen) | N/A | Trigger via Save-Button | HTTP-Response von `createRule`/`updateRule` | Regel wird in Store ersetzt/angelegt | Toast "Regel gespeichert/erstellt" | ACK vorhanden, aber nicht als expliziter Status je Regelinstanz modelliert |
| Runtime-Wirksamkeit | N/A | Keine Pending-Modellierung | WS `logic_execution` mit `success` bool | `recentExecutions` + `executionHistory` | "LIVE"-Flash + Historie Erfolg/Fehler | **Einstufig: kein `accepted -> pending -> terminal`** |
| Konflikt/Arbitration-Endlage | N/A | Nicht modelliert | Kein dediziertes Konfliktfeld | Kein dediziertes Konflikt-Event in Logic-Store | Kein expliziter Konflikt-Endzustand pro Regel | **P0-Luecke: Konflikt als Fachendzustand fehlt** |

## 2) Nachweise (Codebasiert)

### N1: Verlorene Metadaten (`priority`/`cooldown_seconds`)

Belegkette:
1. Templates definieren beide Felder in `rule-templates.ts`.
2. `LogicView.useTemplate(...)` uebergibt `priority` und `cooldown_seconds` an `RuleFlowEditor.loadFromRuleData(...)`.
3. `RuleFlowEditor.graphToRuleData()` liefert nur `{ conditions, actions, logic_operator }`.
4. `LogicView.saveRule()` sendet bei `createRule(...)` und `updateRule(...)` ebenfalls nur Conditions/Actions/Operator.

Wirkung:
- Template-/Editor-Metadaten sind im Save-Pfad nicht durchgaengig.
- Mindestens `cooldown_seconds` kann nach Save/Reload nicht mehr den im Editor erwarteten Wert abbilden.

### N2: ACK-Signal vs terminales Wirksamkeitssignal (pro Pfad)

**Pfad A - Regel speichern (CRUD):**
- ACK: HTTP Success von `logicApi.createRule`/`logicApi.updateRule` (Store wird aktualisiert, Toast erfolgt).
- Terminales Wirksamkeitssignal: **fehlt als separates Modell**. Nach Save gibt es kein explizites Signal "Regel wirksam im Scheduler angenommen", nur indirekte Annahme durch API-OK.

**Pfad B - Regelausfuehrung:**
- ACK/Pending-Stufe: **nicht modelliert**.
- Terminalsignal: WS `logic_execution.success` + Historieneintrag (`executionHistory.success/error_message`).
- Problem: Kein korrelierbarer Lifecycle (`accepted/pending/terminal`) je Ausfuehrungsinstanz.

**Pfad C - Konflikt/Arbitration:**
- ACK/Pending/Terminal: **nicht als Rule-spezifischer Lifecycle verfuegbar**.
- Aktuator-Intent-Finalitaet ist vorhanden (`actuator.store`: `accepted/pending/terminal_*`), wird aber in Logic-UI nicht auf Regelinstanzen gemappt.

## 3) Lueckenanalyse und Priorisierung

### P0
1. **Metadatenpersistenz defekt:** `priority`/`cooldown_seconds` werden im zentralen Save-Pfad nicht gesendet.
2. **Kein zweistufiges Finalitaetsmodell fuer Logic:** User sieht nicht sauber "angenommen" vs "wirksam/fehlgeschlagen".
3. **Keine explizite Konflikt-Endlage:** Arbitration-Konflikte erscheinen nicht als eigener terminaler Zustand pro Regel.

### P1
4. **Validation nicht feld-/knotenpraezise:** 422-Fehler landen global (Toast/error), nicht am betroffenen Node/Feld.
5. **Metadaten-Transparenz gering:** `cooldown_seconds` gar nicht sichtbar/editierbar im Editor, `priority` nur indirekt.

### P2
6. **Undo/Redo deckt nur Graph ab:** Regelmetadaten sind nicht Teil des Command-History-Snapshots.

## 4) SOLL-Finalitaetsmodell fuer Regelaktivierung/-ausfuehrung

Empfohlenes Rule-Intent-Modell analog zur bereits robusten Aktor-Finalitaet:

- `accepted`: Save/Enable wurde serverseitig angenommen (HTTP ACK).
- `pending_activation`: Regel ist gespeichert, aber Wirksamkeit noch nicht bestaetigt (z. B. bis erstes Scheduler/Engine-Lifecycle-Signal).
- `pending_execution`: Trigger erkannt, Ausfuehrung laeuft.
- `terminal_success`: Ausfuehrung erfolgreich abgeschlossen.
- `terminal_failed`: Ausfuehrung fehlgeschlagen.
- `terminal_conflict`: Ausfuehrung wegen Arbitration/Konflikt nicht ausgefuehrt.
- `terminal_integration_issue`: Contract-/Korrelationsproblem, Endlage fachlich nicht beweisbar.

Mindestdaten pro Instanz:
- `rule_id`, `intent_id`/`correlation_id`
- `state`, `terminal_reason_code`, `terminal_reason_text`
- `updated_at`, optional `action_outcomes[]`

## 5) Konflikt-/Arbitrationsfaelle als explizite UI-Endzustaende

Fachliche Endzustaende (nicht als "nur Fehler"):
- `Konflikt - Prioritaet verloren`
- `Konflikt - Cooldown blockiert`
- `Konflikt - Safety-Interlock`
- `Konflikt - Target bereits durch hoeher priorisierte Regel belegt`

UI-Anforderungen:
- Pro Regelkarte ein klarer Terminal-Status-Badge (inkl. Konfliktgrund).
- Historie mit filterbarem `terminal_reason_code`.
- Keine Vermischung von Integrationsproblem und Betriebskonflikt.

## 6) Validation-Mapping (Knoten/Feld statt global)

SOLL:
- Mapping von Backend-Fehlern (z. B. `loc`) auf `nodeId` + Feldkey im Editor.
- Fehlermarkierung am betroffenen Node (`sensor/operator/value`, `actuator/gpio/command`, Rule-Metadaten).
- Globaler Toast nur als Summary, nicht als einzige Quelle.

IST:
- `logic.store`/`LogicView` behandelt Fehler vorwiegend global (`error`, Toast).
- Keine node-spezifische Error-Map im Editor-State.

## 7) Test-/Nachweislage (Gap gegen Akzeptanzkriterien)

Vorhanden:
- Umfangreiche Store- und E2E-Tests fuer Rule-CRUD/Execution.
- Tests pruefen Prioritaeten oft nur in Mockdaten, nicht den UI-Save-Mapping-Pfad.

Fehlend (kritisch):
1. **Unit:** `Template -> graphToRuleData -> create/update payload` muss `priority`/`cooldown_seconds` enthalten.
2. **E2E:** `template -> save -> reload` Parity fuer Metadaten.
3. **E2E/Integration:** Sichtbare Sequenz `accepted -> pending -> terminal_*` je Regelinstanz.
4. **E2E:** Konfliktfall liefert expliziten `terminal_conflict` inkl. Grundtext.

## 8) Abgleich mit Akzeptanzkriterien

- `priority`/`cooldown_seconds` durchgaengig persistiert: **nicht erfuellt**.
- Operator sieht eindeutig `angenommen`, `pending`, `wirksam/fehlgeschlagen`: **nicht erfuellt**.
- Konfliktgruende im UI nachvollziehbar: **nicht erfuellt**.

## 9) Konkrete Umsetzungsreihenfolge (empfohlen)

1. **P0-A:** Save-Payload sofort auf vollstaendiges Regelmodell erweitern (`priority`, `cooldown_seconds`, optional `max_executions_per_hour`).
2. **P0-B:** Rule-Intent-Store einfuehren (oder in `logic.store`) mit `accepted/pending/terminal_*`.
3. **P0-C:** Konflikt-/Arbitration-Endzustand als eigenes terminales Outcome plus Reason-Code.
4. **P1-A:** Validation-Mapper `backend loc -> node/field`.
5. **P1-B:** Metadaten im Editor sichtbar/editierbar machen und in Undo/Redo-Snapshot aufnehmen.

## 10) Umsetzungsstand (Update 2026-04-06)

Status nach Implementierung in `El Frontend`:

- **P0-A umgesetzt:** `priority` und `cooldown_seconds` werden im Save-Pfad (`createRule`/`updateRule`) durchgaengig uebernommen.
- **P0-B umgesetzt:** Rule-Lifecycle im Store eingefuehrt (`accepted`, `pending_activation`, `pending_execution`, `terminal_*`) inkl. Korrelation (`intent_id`/`correlation_id`/`request_id`) und Uebergangsverfolgung.
- **P0-C umgesetzt:** Konfliktfaelle werden als `terminal_conflict` mit `terminal_reason_code`/`terminal_reason_text` in Karten und Historie sichtbar.
- **P1-A umgesetzt:** Backend-Validierungsfehler (`loc`) werden auf `nodeId + field` gemappt; Node- und Feldmarkierung in Editor/Config-Panel aktiv.
- **P1-B umgesetzt:** Metadaten sind im Logic-UI editierbar und Teil von Undo/Redo-Snapshots.
- **P2 umgesetzt:** `terminal_integration_issue` als eigener Endzustand fuer nicht beweisbare Contract-Endlagen integriert.

Verifikation:

- **Gruen:** `npx vue-tsc --noEmit`
- **Gruen (fokussiert):**
  - `npx vitest run tests/unit/stores/logic.test.ts`
  - `npx vitest run tests/unit/utils/ruleValidationMapper.test.ts`
  - `npx vitest run tests/unit/components/RuleCard.test.ts`

Restpunkt aus Testpflicht:

- Integration/E2E- und Regression-Tests sind als naechste Stufe offen und noch nicht im vollen Umfang nachgewiesen.
