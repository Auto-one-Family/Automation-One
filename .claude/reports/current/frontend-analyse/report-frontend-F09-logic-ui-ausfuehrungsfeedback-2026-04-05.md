# Report F09: Logic UI, Regelmodell und Ausfuehrungsfeedback

Datum: 2026-04-05  
Scope: `El Frontend/src/views/LogicView.vue`, `El Frontend/src/components/rules/**`, `El Frontend/src/shared/stores/logic.store.ts`, `El Frontend/src/types/logic.ts`, `El Frontend/src/shared/stores/actuator.store.ts`, `El Frontend/src/shared/stores/intentSignals.store.ts`

## 1) Ergebnisbild (kurz)

- Rule-CRUD und Graph-Editor sind stabil, aber das fachlich relevante Regelmodell ist nicht durchgaengig konsistent.
- Kritischer Bruch: `priority` und `cooldown_seconds` gehen im Save-Pfad verloren.
- Ausfuehrungsfeedback ist nur teilweise zweistufig: "angenommen" (HTTP/Toast) und "wirksam" (WS/History) sind nicht als zusammenhaengender Zustand pro Regelinstanz modelliert.
- Konflikt-/Arbitrationsfaelle sind nicht als explizite Endzustaende im Logic-UI sichtbar.
- Validierungsfehler werden global angezeigt, nicht feld-/knotenpraezise zur Ursache gemappt.

---

## 2) Feldflussmatrix (`Template -> Editor -> Payload -> Persistenz -> Sichtbarkeit`)

| Feld | Template | Editor-State | Save-Payload | Persistenz | UI-Sichtbarkeit | Befund |
|---|---|---|---|---|---|---|
| `name` | vorhanden | `newRuleName` / `selectedRule.name` | Create: ja, Update: nein | meist erhalten (serverabhaengig) | Toolbar/RuleCard | **P1** (Update sendet Name nicht explizit) |
| `description` | vorhanden | `newRuleDescription` / `selectedRule.description` | Create: ja, Update: nein | meist erhalten (serverabhaengig) | nicht prominent | **P1** |
| `conditions` | vorhanden | Graph-Nodes | ja | ja | RuleCard + Editor + History | ok |
| `logic_operator` | vorhanden | Logic-Node | ja | ja | RuleCard + Editor | ok |
| `actions` | vorhanden | Graph-Nodes | ja | ja | RuleCard + History | ok |
| `priority` | vorhanden (`rule-templates.ts`) | nur bei `loadFromRuleData()`, nicht im editierbaren State | nein | faellt auf Default/altwert | nirgends explizit | **P0 kritisch** |
| `cooldown_seconds` | vorhanden (`rule-templates.ts`) | nur bei `loadFromRuleData()`, nicht im editierbaren State | nein | faellt auf Default/altwert | nirgends explizit | **P0 kritisch** |
| `max_executions_per_hour` | teils vorhanden | kein Editor-Feld | nein | faellt auf Default/altwert | nicht sichtbar | **P1** |

Kerngap: `graphToRuleData()` liefert nur `conditions`, `actions`, `logic_operator`; `saveRule()` uebernimmt exakt nur diese Felder fuer Create/Update.

---

## 3) Nachweis: verlorene Metadaten (Pflichtbeleg)

Belegfall "Template mit Cooldown/Priority":

1. Template enthaelt Metadaten (z. B. `priority: 5`, `cooldown_seconds: 300`).
2. `LogicView.useTemplate()` uebergibt diese an `RuleFlowEditor.loadFromRuleData(...)`.
3. `RuleFlowEditor.graphToRuleData()` gibt Metadaten nicht zurueck.
4. `LogicView.saveRule()` sendet beim Speichern nur Conditions/Operator/Actions.
5. Server speichert daher nicht den Template-Wert, sondern Default oder alten Wert.

Fazit: Metadatenverlust ist deterministisch reproduzierbar im aktuellen Frontend-Save-Fluss.

---

## 4) Luecken im Rule-Metadatenpfad (isoliert und priorisiert)

## P0

1. **Persistenzbruch fuer `priority`/`cooldown_seconds`:** fachlich konfliktrelevant, aber nicht im Save-Payload.

## P1

2. **Unscharfer Update-Contract:** `updateRule()` nutzt `PUT` mit partiellem Body; langfristig riskant, falls Backend Full-Replace semantisch strikt wird.
3. **Metadaten nicht sichtbar/editierbar im Logic-UI:** Operator kann Konfliktverhalten nicht beurteilen.
4. **Undo/Redo ohne Metadaten:** Historie deckt nur Graph ab, nicht Regelparameter.

## P2

5. **Validation-Feedback global statt zielgenau:** Feldlisten werden nicht auf Node/Feld gemappt.
6. **Typdrift-Risiko bei `logic_execution`:** dediziertes Eventmodell im Store und in `types/websocket-events.ts` laufen auseinander.

---

## 5) ACK- und terminale Wirksamkeitssignale (Pflichtnachweis je Pfad)

## 5.1 Regel-Konfiguration (Create/Update/Toggle)

- **ACK-Signal vorhanden:** HTTP-Response + Erfolgstoast in `LogicView.saveRule()` / `toggleRule()`.
- **Terminale Wirksamkeit fehlt:** kein korrelierter Zustand "wirksam" pro konkreter Save-/Toggle-Aktion.
- **Heutiger Ersatz:** spaeteres `logic_execution` Event, aber ohne Bindung an den ausloesenden Save-/Toggle-Schritt.

## 5.2 Regel-Ausfuehrung (runtime)

- **Pending-Signal fehlt im Logic-UI:** kein explizites "in Pruefung"/"in Ausfuehrung" pro Regelinstanz.
- **Terminal-Signal vorhanden (teilweise):**
  - `logic_execution.success` (pro Action-Event) in `logic.store`.
  - REST `execution_history` mit `success/error_message`.
- **Luecke:** Konflikt-/Arbitrationsgruende werden nicht als eigener Endzustand abgebildet.

## 5.3 Sequence-/Intent-Pfade (systemweit vorhanden, Logic-UI nutzt sie nicht)

- **Infrastruktur vorhanden:** `actuator.store` modelliert `created -> pending -> terminal` fuer `actuator/config/sequence`.
- **Logic-UI-Nutzung fehlt:** `LogicView` bindet diese Signalschicht nicht ein.
- **Auswirkung:** zweistufige Finalitaet existiert technisch systemweit, aber nicht in der Rule-Operatoransicht.

---

## 6) Ziel-Finalitaetsmodell fuer Regelaktivierung und Ausfuehrung

## 6.1 Vorgeschlagenes Zustandsmodell (pro Regelinstanz)

1. `accepted` - Regelkonfiguration/trigger wurde vom Server angenommen.  
2. `pending` - Ausfuehrung laeuft bzw. wartet auf nachgelagerte Signale.  
3. `effective_success` - Wirkung bestaetigt (terminal).  
4. `effective_failed` - Ausfuehrung fehlgeschlagen (terminal).  
5. `effective_conflict` - wegen Arbitration/Konflikt unterdrueckt (terminal).  
6. `effective_cancelled` - abgebrochen/safety-stop (terminal).  
7. `effective_integration_issue` - Contract-/Signalinkonsistenz (terminal).

## 6.2 Signalmapping

- `accepted`: HTTP 2xx aus Save/Toggle/Test.
- `pending`: Sequence/Actuator/Config-Startsignale oder Rule-internal "evaluation in progress".
- `terminal`: `logic_execution` + ggf. sequence/intent terminale Events.
- Korrelation ueber `correlation_id` (oder explizites Rule-Execution-Intent-ID Feld).

---

## 7) Konflikt-/Arbitrationsfaelle als explizite UI-Endzustaende

Vorgeschlagene terminale Konfliktcodes (sichtbar auf RuleCard + History + Detailpanel):

1. `conflict_priority_preempted` - durch hoehere Prioritaet verdraengt.
2. `conflict_cooldown_active` - Cooldown sperrt erneute Ausfuehrung.
3. `conflict_target_busy` - Zielaktor/sequence blockiert.
4. `conflict_safety_block` - Safety/Policy hat Aktion unterbunden.
5. `conflict_state_mismatch` - erwarteter Vorzustand nicht erfuellt.

Darstellungsvorschlag:

- Badge "Konflikt" + reason_code + kurzer Operator-Hinweis.
- Kein roher Fehler-Toast als einziges Signal; Konflikt ist eigener fachlicher Endzustand.

---

## 8) Validation-Mapping: global -> feld-/knotenpraezise

IST:

- `extractErrorMessage()` erzeugt Strings wie `conditions.0.value: ...`.
- `LogicView` zeigt nur globalen Toast.

SOLL:

1. `loc`-Pfade auf Node-ID + Feld-ID mappen (`conditions[i]`/`actions[i]` -> Graph-Node).
2. Betroffene Nodes markieren (error ring + icon).
3. In `RuleConfigPanel` betroffene Inputs mit Inline-Meldung kennzeichnen.
4. Optional: klickbare Fehlerliste "Springe zu Node".

---

## 9) Test-/Nachweisabdeckung gegen Auftrag

## 9.1 Bereits vorhanden

- Unit fuer `logic.store` (Fetch, Toggle, WS `logic_execution`, Undo/Redo).
- E2E fuer Rule-CRUD/Canvas/History.
- E2E fuer Hysterese-Flow serverseitig.

## 9.2 Fehlende Pflichttests aus F09

1. **Unit: Rule payload mapping**
   - sicherstellen, dass `priority`, `cooldown_seconds`, `max_executions_per_hour` aus Editor-State in Create/Update-Payload landen.
2. **E2E: template -> save -> reload -> execution feedback parity**
   - Template mit Metadaten speichern, neu laden, Metadaten unveraendert nachweisen.
   - danach Ausfuehrungsfeedback mit klarer Pending->Terminal-Transition verifizieren.
3. **E2E: Konflikt-Endzustand**
   - gezielt Arbitrationfall erzeugen und `effective_conflict` inkl. reason_code im UI pruefen.

---

## 10) Akzeptanzkriterien-Check (F09 Auftrag)

- `priority`/`cooldown_seconds` durchgaengig persistiert: **nicht erfuellt** (P0-Luecke).
- Operator sieht eindeutig angenommen/pending/wirksam/fehlgeschlagen: **teilweise** (ACK + terminal indirekt, kein klares Pending-Modell).
- Konfliktgruende nachvollziehbar: **nicht erfuellt** (keine dedizierten Konflikt-Endzustaende).

---

## 11) Konkrete Folgeauftraege

1. **F09-R1 (P0):** Rule-Metadatenstate in `LogicView`/`RuleFlowEditor` einfuehren und in `createRule`/`updateRule` persistieren.
2. **F09-R2 (P1):** Rule-Intent-State im Frontend (`accepted/pending/terminal`) pro Regelinstanz modellieren.
3. **F09-R3 (P1):** Konfliktcodes als first-class terminale Zustaende in RuleCard/History/Details.
4. **F09-R4 (P2):** Validation-loc auf Node/Feld mappen und inline visualisieren.
5. **F09-R5 (P2):** `logic_execution`-Contract als SSOT in Typen/Store/Tests vereinheitlichen.
