# Report F09: Logic UI, Regelmodell, Ausfuehrungsfeedback

Datum: 2026-04-05  
Scope: `El Frontend/src/views/LogicView.vue`, `El Frontend/src/components/rules/**`, `El Frontend/src/shared/stores/logic.store.ts`, `El Frontend/src/types/logic.ts`

## 1) Executive Result

- Der Rule-Lifecycle ist funktional durchgaengig fuer CRUD, Aktivierung, Test und visuelles Live-Feedback.
- Annahme-Signale (HTTP-ACK via Toast) und Wirksamkeits-Signale (WS/History) existieren technisch getrennt, aber nicht operatorisch klar getrennt.
- Es gibt kritische Konsistenzluecken bei Prioritaet/Konfliktabbildung: Template-Prioritaet/Cooldown werden im Editorfluss nicht in API-Payloads uebernommen.
- WS-Ausfuehrungsfeedback im Logic-UI reduziert auf `logic_execution`; Konflikt-/Mehrstufenfaelle sind nur indirekt oder gar nicht sichtbar.
- Korrigierbarkeit bei Fehlern ist vorhanden (kein Dead-End), aber UX bleibt grobkoernig (Toast statt feld-/knotenbezogener Fuehrung).

---

## 2) Rule-Lifecycle-Karte (CRUD, Validierung, Aktivierung, Undo, Historie)

## 2.1 CRUD + Aktivierung

1. **Laden:** `onMounted()` in `LogicView` -> `logicStore.fetchRules()`.
2. **Erstellen:** `saveRule()` (Create-Zweig) -> `logicStore.createRule(...)` -> Rule in Store pushen -> Erfolgstoast.
3. **Aktualisieren:** `saveRule()` (Update-Zweig) -> `logicStore.updateRule(...)` -> Rule im Store ersetzen -> Erfolgstoast.
4. **Loeschen:** ConfirmDialog -> `logicStore.deleteRule(...)` -> Rule aus Store entfernen.
5. **Aktivieren/Deaktivieren:** `toggleRule()` -> `logicStore.toggleRule(...)` -> `enabled` sofort im Store aktualisiert.

## 2.2 Validierung

- **Client-seitig (vor Save):**
  - Mindestens eine Bedingung.
  - Mindestens eine Aktion.
  - Bei Neuanlage: Name erforderlich.
- **Editor-seitig (Graph):**
  - Verbindungsvalidierung (`isValidConnection`) verhindert unzulaessige Kanten (z. B. Action als Source, Self-Loops).
- **Server-seitig:**
  - Fehler werden ueber `extractErrorMessage()` aus `detail` (auch Feldlisten) gelesen.
  - UI zeigt aktuell primar Toast-Fehler (keine direkte Feldmarkierung im Editor/Toolbar).

## 2.3 Undo/Redo

- Implementiert als Graph-Snapshot-Historie (Nodes/Edges) im `logic.store`.
- Trigger bei Node-Drop, Connect, DragStop, Duplicate/Delete.
- Keyboard (`Ctrl+Z`, `Ctrl+Y`/`Ctrl+Shift+Z`) und Toolbar vorhanden.
- **Einschraenkung:** Historie betrifft nur Canvas-Graph, nicht Rule-Metadaten (Name/Beschreibung/Enabled/Priority/Cooldown).

## 2.4 Historie + Live-Ausfuehrung

- **Live:** WS-Subscription auf `logic_execution` setzt kurzfristig `activeExecutions` (2s Flash) und aktualisiert `last_triggered`, `execution_count`, `last_execution_success`.
- **Historie:** Bottom Panel laedt REST `execution_history` und filtert nach Regel/Status.
- **Merge:** WS-Events werden optional in die History injiziert (wenn bereits geladen).

---

## 3) Trennung: angenommen vs. final wirksam

## 3.1 Was heute als "angenommen" signalisiert wird

- Save/Create/Update/Toggle zeigen direkt Erfolgstoasts nach HTTP-Response.
- Das signalisiert faktisch: **Konfiguration angenommen** (API-ACK).

## 3.2 Was heute als "final wirksam" signalisiert wird

- `logic_execution` (WS) + Execution-History zeigen: Regel wurde ausgefuehrt, Erfolg/Fehlschlag.
- RuleCard-Status (`last_execution_success === false`) visualisiert letzten Fehlschlag.

## 3.3 Hauptluecke (Finalitaetskommunikation)

- Zwischen "Regel aktiviert" (ACK) und "Regel hat tatsaechlich wirksam geschaltet" (Execution) gibt es keine explizite Operator-Bruecke.
- Es existiert kein Pending/Final-Badge pro Aktivierungsaktion und keine Korrelation des Aktivierungszeitpunkts mit der naechsten Ausfuehrung.

Prioritaet: **hoch** (betrifft Operator-Verstaendnis von Wirksamkeit).

---

## 4) WS-Execution-Feedback inkl. Fehler-/Konfliktfaelle

## 4.1 Abgedeckte Happy-/Fehlerfaelle

- Erfolg/Fehlschlag in `logic_execution.success` wird verarbeitet.
- Historie kann Fehlerdetails (`error_message`) anzeigen, sofern vom REST-Historyeintrag geliefert.
- RuleCard reflektiert letzten Misserfolg visuell.

## 4.2 Nicht oder nur indirekt abgedeckte Faelle

- Keine dedizierte Behandlung fuer Konflikt-/Arbitrationsfaelle im Logic-UI (z. B. "Konflikt erkannt, Aktion verworfen").
- Kein separates UI fuer mehrstufige Sequenz-Endzustaende in `LogicView` (zwar systemweit vorhanden, aber nicht als Logic-Feedbackpfad genutzt).
- WS-Payloadmodell fuer `logic_execution` ist im Logic-Store spezifisch (trigger/action/timestamp); typisches Eventmodell in `websocket-events.ts` weicht davon ab -> Drift-Risiko.

Prioritaet: **hoch** fuer Konflikt-/Finalitaetsdiagnose, **mittel** fuer Typdrift.

---

## 5) Prioritaets-/Konfliktdarstellung: Konsistenzbewertung

## 5.1 Kritische Inkonsistenz

- Templates enthalten `priority` und teils `cooldown_seconds`.
- `useTemplate()` uebergibt diese zwar an `loadFromRuleData(...)`.
- `graphToRuleData()` gibt aber nur `conditions`, `actions`, `logic_operator` zurueck.
- `saveRule()` sendet beim Create/Update ebenfalls nur diese drei Felder.

**Folge:** Template-Prioritaet/Cooldown werden im Editorfluss nicht persistiert.  
**Auswirkung:** Konfliktauflosung/Arbitration kann im Backend anders laufen als im UI durch Template suggeriert.

Prioritaet: **kritisch** (direkt gegen "Konsistenz von Prioritaets-/Konfliktdarstellung").

## 5.2 Weitere Konsistenzluecken

- RuleCard/LogicView zeigen keine Prioritaets-/Cooldown-Information zur Laufzeit.
- Kein Konfliktindikator je Regel (z. B. "letzte Ausfuehrung wegen Konflikt unterdrueckt").

Prioritaet: **mittel**.

---

## 6) Pflichtnachweis A: Rule Edit -> API Save -> Execution Feedback -> UI-State

Happy Path (belegt):

1. Node-/Graph-Aenderung setzt `hasUnsavedChanges`.
2. `saveRule()` validiert minimal und sendet Create/Update via Store/API.
3. Bei Erfolg: Toast + Rule im Store aktualisiert/angelegt.
4. Bei Ausfuehrung: `logic_execution` triggert Live-Flash und aktualisiert Rule-Metriken.
5. Bei geoeffneter Historie: REST+WS-History zeigt Ereigniszeile mit Trigger/Action-Summary.

Bewertung: **funktional vorhanden**, aber ohne explizite Operator-Phase "Pending bis wirksam".

---

## 7) Pflichtnachweis B: Error/Validation -> Nutzerfuehrung -> korrigierbarer Endzustand

Stoerfallpfade (belegt):

- Save ohne Bedingungen/Aktionen/Name -> lokale Fehlertoasts, Save stoppt.
- API 4xx/5xx (inkl. 422 Feldfehler) -> Store `error` gesetzt, View zeigt Toast.
- Editor-Verbindungsfehler -> sofortige Warnung, kein invalider Kantenzustand.

Korrigierbarkeit:

- Nutzer kann direkt weitereditieren, erneut speichern, Regel umschalten oder verwerfen.
- Kein harter Dead-End-State festgestellt.

Luecke:

- Keine feld-/nodegenaue Rueckfuehrung aus Server-Validierung in die entsprechende UI-Stelle.

Bewertung: **korrigierbar ja**, **Nutzerfuehrung mittel**.

---

## 8) Priorisierte Finalitaetsluecken

## P0 (kritisch)

1. **Template-Priority/Cooldown gehen im Save-Fluss verloren.**

## P1 (hoch)

2. **ACK vs. wirksam nicht klar operatorisch getrennt** (kein Pending->Final je Aktion/Regel).
3. **Konflikt-/Arbitrationsfeedback nicht als dedizierter Logic-UI-Endzustand.**

## P2 (mittel)

4. **Validation-Feedback nicht feld/knoten-spezifisch im Editor verankert.**
5. **Typdrift bei `logic_execution`-Payloadmodell (Store vs. Eventtypen).**
6. **Undo/Redo-Scope nur Graph, nicht Rule-Metadaten.**

---

## 9) Akzeptanzkriterien-Check

- "Finalitaetsluecken exakt benannt und priorisiert": **erfuellt** (P0-P2 mit Wirkfolge).
- "Jeder kritische Regelpfad mit Happy-/Stoerfallbeleg": **erfuellt** (Abschnitte 6 und 7).

---

## 10) Konkrete Folgeauftraege (umsetzbar)

1. **F09-A (P0):** `priority`/`cooldown_seconds` als Rule-Metadaten im Editor-State fuehren und in Create/Update-Payload persistieren.
2. **F09-B (P1):** In `LogicView` ein zweistufiges Feedbackmodell einbauen: "Konfiguration angenommen" vs. "Regel wirksam ausgefuehrt" (inkl. Pending/Fallback-Hinweis).
3. **F09-C (P1):** Konflikt-/Abbruchgruende als explizite Endzustaende im Logic-History/RuleCard anzeigen.
4. **F09-D (P2):** Server-Validierungsfehler auf konkrete Nodes/Felder mappen statt nur globalem Toast.
5. **F09-E (P2):** `logic_execution` Eventtyp/Schema als SSOT vereinheitlichen (Store, `websocket-events.ts`, Tests).
