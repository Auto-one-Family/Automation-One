# AutoOps Debug-Auftrag: Logic Rules Editor E2E-Verifikation

> **Erstellt:** 2026-03-01
> **Ziel-Repo:** auto-one
> **Typ:** E2E-Verifikation (autoops:debug + Playwright)
> **Fokus:** NUR Logic Rules Editor — alle 6 Polishing-Phasen verifizieren
> **Status:** OFFEN
> **Report-Output:** `/reports/current/LOGIC_EDITOR_E2E_VERIFICATION.md`
> **Verify-Plan Update:** 2026-03-01 — Codebase-Review durchgefuehrt, Bugs + UX-Probleme ergaenzt

---

## Kontext

Der Logic Rules Editor wurde in 6 Phasen gepolisht (v9.12). Alle Aenderungen sind rein Frontend — 0 Server-Aenderungen. Build ist gruen, TypeScript fehlerfrei. Jetzt brauchen wir eine vollstaendige E2E-Verifikation aller geaenderten Funktionen.

---

## ⚠️ BUGS & FEHLSTELLEN (aus Codebase-Review)

> Vor jeder E2E-Verifikation muessen diese Probleme bekannt sein.
> Severity: 🔴 Kritisch | 🟠 Mittel | 🟡 Gering | 🔵 UX/Kosmetik

### 🔴 BUG-01: Time-Node Tagesanzeige auf Canvas falsch (RuleFlowEditor.vue:907)

**Problem:** Wochentage werden auf dem Canvas-Node falsch dargestellt.
- `RuleConfigPanel.vue:100` definiert `dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']` → Index 0 = Montag ✅
- `RuleFlowEditor.vue:907` verwendet `['So','Mo','Di','Mi','Do','Fr','Sa'][d]` → Index 0 = **Sonntag** ❌
- `types/logic.ts:51` Kommentar: `0 = Monday, 6 = Sunday (ISO 8601)`

**Auswirkung:** User waehlt "Mo" (Index 0) im ConfigPanel → Node auf Canvas zeigt "So". Server bekommt korrekt 0=Montag, aber visuelles Feedback ist falsch. Vertrauen in die UI wird zerstoert.

**Fix:** `RuleFlowEditor.vue:907` → `['Mo','Di','Mi','Do','Fr','Sa','So'][d]`

**Testschritte:**
- [ ] Montag im ConfigPanel aktivieren (Index 0)
- [ ] Canvas-Node pruefen: Zeigt "Mo" (nicht "So")
- [ ] Alle 7 Tage einzeln durchklicken und Canvas-Darstellung vergleichen

---

### 🔴 BUG-02: Template "Verwendung" laedt keine Nodes auf Canvas (LogicView.vue:168-186)

**Problem:** `useTemplate()` ruft `editorRef.value?.clearCanvas()` auf und setzt `newRuleName`/`newRuleDescription`, aber laedt NICHT die Template-Conditions/Actions auf den Canvas.

**Code:**
```typescript
// LogicView.vue:184 — Canvas wird geleert, aber NICHT mit Template-Daten befuellt
editorRef.value?.clearCanvas()
// FEHLT: editorRef.value?.loadTemplateData(template.rule.conditions, template.rule.actions)
```

**Auswirkung:** User klickt "Verwenden" bei einem Template → Editor oeffnet sich mit leerem Canvas und vorausgefuelltem Name/Beschreibung. Alle Nodes muessen manuell erstellt werden. Template-Feature ist funktional nutzlos.

**Testschritte:**
- [ ] Template "Temperatur-Alarm" klicken
- [ ] Canvas pruefen: Sensor-Node + Logik-Node + Aktor-Node vorhanden? (Erwartet: Ja, Realitaet: Nein)
- [ ] Name "Temperatur-Alarm" im Input-Feld vorhanden? (Erwartet: Ja)
- [ ] Alle 6 Templates testen: Canvas bleibt immer leer

---

### 🔴 BUG-03: RuleCard nicht importiert (LogicView.vue)

**Problem:** `RuleCard` Komponente wird im Template (Zeile ~724) verwendet, aber NIRGENDS in `<script setup>` importiert. Build ist gruen, weil Vue Template-Compiler fehlende Komponenten nicht als TS-Error meldet.

**Imports vorhanden:**
- ✅ `RuleFlowEditor`, `RuleNodePalette`, `RuleConfigPanel`, `RuleTemplateCard`
- ❌ `RuleCard` — fehlt

**Auswirkung:** Haengt vom Build-Setup ab:
- Falls `unplugin-vue-components` aktiv: Auto-Import greift → funktioniert
- Falls KEIN Auto-Import: Vue zeigt Runtime-Warnung, Komponente wird als `<rule-card>` HTML-Element gerendert → Landing-Page kaputt

**Testschritte:**
- [ ] `/logic` oeffnen mit vorhandenen Regeln
- [ ] RuleCards sichtbar? (Falls leer/kaputt → Import fehlt)
- [ ] Browser-Konsole: Vue-Warnung "Failed to resolve component: RuleCard"?

---

### 🟠 BUG-04: Template `soil_moisture` Sensor-Typ existiert nicht (rule-templates.ts:93)

**Problem:** Bewaesserungs-Zeitplan-Template verwendet `sensor_type: 'soil_moisture'`, aber:
- `RuleConfigPanel.vue:80` kennt nur `'moisture'` (nicht `'soil_moisture'`)
- `SENSOR_CONFIG` in `RuleFlowEditor.vue:127` hat keinen Eintrag fuer `'soil_moisture'`

**Auswirkung:** Falls Templates je auf Canvas geladen werden (nach Fix von BUG-02):
- Node zeigt Fallback-Icon (Thermometer statt Waves)
- Node zeigt "soil_moisture" als Label statt "Bodenfeuchte"
- ConfigPanel zeigt `soil_moisture` nicht in Dropdown → User kann Typ nicht korrigieren

**Fix:** `rule-templates.ts:93` → `sensor_type: 'moisture'`

---

### 🟠 BUG-05: Kein Weg zurueck zur Landing-Page vom Editor (UX-Luecke)

**Problem:** Wenn eine Regel im Editor geoeffnet ist, gibt es keinen Button um zur Logic-Landing-Page (RuleCards + Templates) zurueckzukehren.
- `← Back` RouterLink geht zu `/` → redirect zu `/hardware` (andere View!)
- Rule-Selector Dropdown wechselt nur zwischen Regeln, deselektiert nicht
- Landing-Page (`!selectedRule && !isCreatingNew`) ist NUR erreichbar durch manuelles Navigieren zu `/logic`

**Auswirkung:** User ist nach dem Oeffnen einer Regel im Editor "gefangen". Um die Uebersichtsseite mit RuleCards wiederzusehen, muss man in die Browser-URL-Leiste tippen oder via Sidebar navigieren.

**Empfehlung:** "← Zurueck" Button sollte auf `/logic` verlinken (nicht `/`), oder ein dedizierter "Uebersicht" Button in der Toolbar.

**Testschritte:**
- [ ] Regel im Editor oeffnen
- [ ] Versuche zurueck zur Landing-Page zu kommen (mit RuleCards)
- [ ] Dokumentiere alle moeglichen Wege (nur URL-Leiste?)

---

### 🟠 BUG-06: execution_count wird als "24h" angezeigt, ist aber Gesamt-Zaehler (RuleCard.vue:178)

**Problem:** RuleCard Footer zeigt `{{ executionCount }}x/24h`, aber `LogicView.vue:730` uebergibt `rule.execution_count ?? 0` — das ist der **Gesamt**-Zaehler, kein 24h-Fenster.

**Auswirkung:** User sieht "547x/24h" und denkt die Regel hat 547 Mal in den letzten 24 Stunden gefeuert. In Wirklichkeit sind es 547 Ausfuehrungen insgesamt seit Erstellung. Irrefuehrend.

**Fix:** Entweder Label zu `{{ executionCount }}x` aendern, oder Server muss `execution_count_24h` liefern.

---

### 🟠 BUG-07: Compound Conditions verlieren Gruppierung bei Save→Reload

**Problem:**
- `ruleToGraph()` (RuleFlowEditor.vue:418-444) flacht CompoundConditions in einzelne Sensor-Nodes
- `graphToRuleData()` (RuleFlowEditor.vue:552-564) schreibt jede Node als separate `SensorCondition`
- Round-Trip: `{type: "compound", logic: "OR", conditions: [sensor1, sensor2]}` → Save → Reload → `[sensor1, sensor2]` (compound wrapper weg)

**Auswirkung:** Regeln mit Compound-Conditions verlieren nach erneutem Oeffnen + Speichern ihre Verschachtelung. Server-Semantik kann sich aendern (z.B. OR innerhalb eines AND-Blocks geht verloren).

---

### 🟠 BUG-08: Kein `beforeRouteLeave` Guard fuer ungespeicherte Aenderungen

**Problem:** `hasUnsavedChanges` wird geprüft beim Regelwechsel (`selectRule`, `startNewRule`, `useTemplate`), aber NICHT bei Navigation weg von `/logic` (z.B. Sidebar-Click auf "Hardware" oder Browser-Back).

**Auswirkung:** User editiert eine Regel, klickt in der Sidebar auf "Monitor" → alle Aenderungen still verloren, kein Warning.

**Fix:** `onBeforeRouteLeave` Guard in LogicView hinzufuegen:
```typescript
onBeforeRouteLeave((_to, _from, next) => {
  if (hasUnsavedChanges.value) {
    uiStore.confirm({ ... }).then(confirmed => next(confirmed))
  } else {
    next()
  }
})
```

---

### 🟡 BUG-09: History-Panel Titel auf Englisch (LogicView.vue:771)

**Problem:** `<span class="rules-history__title">Execution History</span>` — Rest der UI ist komplett auf Deutsch.

**Fix:** "Ausführungshistorie" oder "Verlauf"

---

### 🟡 BUG-10: WebSocket History-Eintraege haben immer execution_time_ms: 0 (logic.store.ts:382)

**Problem:** Wenn Execution-Events ueber WebSocket reinkommen, wird `execution_time_ms: 0` hardcoded. Die WS-Payload enthaelt kein Timing.

**Auswirkung:** In der History-Liste fehlt bei Live-Events die Timing-Anzeige. Erst nach Page-Reload (REST-Fetch) erscheint die echte Ausfuehrungszeit.

---

### 🟡 BUG-11: Kein Ctrl+S Keyboard Shortcut fuer Speichern

**Problem:** Editor unterstuetzt Ctrl+Z/Y/Shift+Z fuer Undo/Redo, aber keinen Ctrl+S Shortcut. Das ist die gaengigste Erwartung in jedem Editor.

**Testschritte:**
- [ ] Aenderung machen → Ctrl+S druecken → Nichts passiert (Erwartung: Regel gespeichert)

---

### 🟡 BUG-12: Time-Inputs erlauben Werte ausserhalb 0-23 (RuleConfigPanel.vue:371-389)

**Problem:** `min="0" max="23"` auf `type="number"` Input verhindert nicht die manuelle Eingabe von z.B. "25" oder "-1". Kein `@blur` Clamp oder Validierung.

**Auswirkung:** Ungueltige Zeitwerte werden an Server gesendet → Server-Validation-Error oder undefiniertes Verhalten.

---

### 🟡 BUG-13: Sensor `gpio: 0` als Default bei neuem Node (RuleFlowEditor.vue:247)

**Problem:** `getDefaultNodeData('sensor')` setzt `gpio: 0`. GPIO 0 ist ein gueltiger Pin. Wenn User vergisst GPIO zu setzen, wird GPIO 0 an den Server gesendet.

**Auswirkung:** Potentiell falscher GPIO-Pin im Production-Einsatz. Besser: `gpio: undefined` oder `gpio: null` als Pflichtfeld markieren.

---

### 🟡 BUG-14: Notification Template Variable Syntax inkonsistent (rule-templates.ts:185 vs. RuleConfigPanel.vue:574)

**Problem:**
- Template pH-Alarm: `'pH-Wert kritisch: {{value}}'` (doppelte Klammern)
- ConfigPanel Hint: `Variablen: {value}, {sensor_type}...` (einfache Klammern)

**Auswirkung:** User sieht `{value}` als Dokumentation, aber Template verwendet `{{value}}`. Einer von beiden ist falsch.

---

### 🟡 BUG-15: Hysteresis-Conditions nicht konfigurierbar im ConfigPanel

**Problem:** `types/logic.ts` definiert `HysteresisCondition`, `ruleToGraph()` behandelt sie (zeigt als Sensor-Node mit speziellem Flag). Aber `RuleConfigPanel` hat KEIN UI fuer:
- `activate_above` / `deactivate_below`
- `activate_below` / `deactivate_above`

**Auswirkung:** Existierende Regeln mit Hysteresis-Conditions zeigen den Node, aber Config-Panel zeigt nur Standard-Sensor-Felder. Hysteresis-Werte gehen beim Speichern verloren.

**Palette:** `RuleNodePalette` bietet keinen Hysteresis-Baustein an → kein Weg diese per UI zu erstellen.

---

### 🟡 BUG-16: Edge-Verbindungen nicht loeschbar

**Problem:** Es gibt keinen sichtbaren Weg eine existierende Verbindung (Edge) zwischen zwei Nodes zu loeschen. Vue Flow zeigt keine Delete-UI fuer Edges. Es gibt keinen Custom-Edge-Type mit Loeschen-Button.

**Auswirkung:** User muss einen Node loeschen und neu erstellen um eine falsche Verbindung zu korrigieren. Oder die gesamte Regel verwerfen.

---

### 🟡 BUG-17: Connection Validation ignoriert Delay-Node (logic.store.ts:528-551)

**Problem:** `isValidConnection()` prueft:
- Actuator/Notification als Source → blockiert
- Sensor/Time → Actuator/Notification direkt → blockiert

Aber `delay` Node wird nicht als Terminal behandelt. Ein Delay-Node kann theoretisch als Source dienen, obwohl er eine Action ist.

---

### 🔵 UX-01: Landing-Page Scroll bei vielen Regeln

**Problem:** Templates-Grid + RuleCards-Liste untereinander. Bei >10 Regeln muss der User weit scrollen um alle zu sehen. Kein Search/Filter auf der Landing-Page (nur Palette hat Suche).

---

### 🔵 UX-02: Kein visueller Hinweis auf Pflichtfelder in ConfigPanel

**Problem:** ESP-Geraet und Sensor/Aktor sind Pflichtfelder, aber haben keine visuelle Markierung (z.B. Sternchen, roten Rahmen bei Validation). User kann speichern ohne ESP gesetzt zu haben → `esp_id: ""` an Server.

---

### 🔵 UX-03: Delete-Button auf RuleCard ohne Exit-Animation

**Problem:** Beim Loeschen verschwindet die RuleCard abrupt. Keine Slide-Out oder Fade-Transition. Wirkt "ruckelig".

---

### 🔵 UX-04: Redo-Button Tooltip sagt "Ctrl+Shift+Z", Ctrl+Y fehlt (RuleFlowEditor.vue:830)

**Problem:** Tooltip: "Wiederholen (Ctrl+Shift+Z)". Aber `Ctrl+Y` funktioniert ebenfalls (Code Zeile 759). Tooltip sollte beide Shortcuts zeigen.

---

### 🔵 UX-05: History-Panel Status-Filter Label "Alle" statt "Alle Status"

**Problem:** LogicView.vue:789 zeigt `<option value="">Alle</option>` fuer den Status-Filter. Der Report erwartet "Alle Status". Minimal, aber fuer Konsistenz relevant.

---

### 🔵 UX-06: RuleCard Flow-Badges zeigen nur ERSTEN Sensor und ERSTE Aktion

**Problem:** `sensorBadge` (RuleCard.vue:62-77) und `actionBadge` (RuleCard.vue:80-95) verwenden `.find()` — zeigen nur die ERSTE Condition/Action. Bei Regeln mit mehreren Sensoren/Aktoren fehlt ein "+2 more" Hinweis.

---

### 🔵 UX-07: Toggle-Pulse-Animation nur auf Dot, kein Feedback auf gesamter Card

**Problem:** Die Pulse-Animation (dot-pulse) wirkt nur auf den 8px Status-Dot. Bei Touch-Geraeten ist das kaum sichtbar. Ein kurzer Ripple/Highlight auf der gesamten Card waere besser wahrnehmbar.

---

## Geaenderte Bereiche (zu verifizieren)

- **Days-of-Week** — Index 0=Montag (nicht Sonntag) [**⚠️ BUG-01: Canvas zeigt falsch**]
- **Execution History** — REST-Fetch + WebSocket-Merge + Filter + expandierbare Details [**⚠️ BUG-09 Titel, BUG-10 WS Timing**]
- **Undo/Redo** — Buttons + Keyboard-Shortcuts + Snapshot bei Drop/Delete/Duplicate/DragStop
- **RuleCard Landing-Page** — Cards statt Inline-Buttons, Select/Toggle/Delete Events [**⚠️ BUG-03 Import, BUG-06 24h Label**]
- **Status-Label + Error-Styling** — "Aktiv"/"Deaktiviert"/"Fehler", roter Rand, AlertCircle
- **Toggle-Pulse** — Animation beim Klick auf Status-Dot
- **Templates** — 6 Vorlagen auf Landing-Page [**⚠️ BUG-02 Canvas leer, BUG-04 soil_moisture**]
- **Deep-Link** — `/logic/:ruleId` oeffnet Editor direkt [**⚠️ BUG-05 kein Rueckweg**]

---

## Workflow: Schritt fuer Schritt

### Phase A: Vorbereitung (Stack + Testdaten)

1. **Stack pruefen** — `docker ps` bestaetigt: el-frontend, el-servador, mqtt-broker, postgres laufen
2. **Frontend erreichbar** — Playwright navigiert zu `http://localhost:5173/logic`
3. **Mindestens 2 Mock-ESPs existieren** — Pruefe ueber `GET /api/v1/esp/devices` dass min. 2 Devices mit Sensoren + Aktoren vorhanden sind. Falls nicht: `POST /api/v1/debug/mock-esp` mit je 1 Sensor (SHT31) + 1 Aktor (Relay) erstellen
4. **Screenshot der Landing-Page `/logic`** — Bestaetige: Template-Cards sichtbar ODER bereits vorhandene Rules als RuleCards
5. **Browser-Konsole pruefen** — `Failed to resolve component: RuleCard`? → BUG-03 bestaetigen/widerlegen

### Phase B: Rule erstellen mit Time-Condition (Days-of-Week Test)

5. **"Neue Regel" Button klicken** — Editor oeffnet sich
6. **Regel benennen** — "Montag-Test-Regel" eingeben
7. **Sensor-Condition Node aus Palette auf Canvas ziehen** — SHT31 Temperatur, Operator `>`, Wert `25`
8. **Time-Condition Node aus Palette auf Canvas ziehen**
9. **Time-Condition konfigurieren** — Im RuleConfigPanel:
   - `start_hour`: 8
   - `end_hour`: 18
   - Days-of-Week: **NUR Montag (Index 0)** aktivieren
   - **Screenshot des Day-Selector:** Bestaetige dass der ERSTE Chip "Mo" zeigt (nicht "So")
   - **⚠️ BUG-01 Test: Screenshot des Canvas-Nodes:** Zeigt der Time-Node "Mo" oder "So"?
10. **Actuator-Action Node hinzufuegen** — Relay ON
11. **Logic-Node (UND) aus Palette auf Canvas ziehen** — Zwischen Conditions und Action
12. **Nodes verbinden** — Sensor → Logic-Node, Time → Logic-Node, Logic-Node → Actuator
    - **⚠️ Direktverbindung Sensor → Actuator testen:** Muss Toast-Warning zeigen ("Verwende einen Logik-Knoten dazwischen")
13. **Speichern** — Save-Button klicken, Toast "Regel erstellt" abwarten (nicht "gespeichert" — da neue Regel)
14. **Playwright: Pruefe Server-Response** — `GET /api/v1/logic/rules` → Die neue Rule hat `days_of_week: [0]` (Montag, NICHT Sonntag)
15. **DB-Verifikation** — `SELECT trigger_conditions FROM cross_esp_logic WHERE rule_name = 'Montag-Test-Regel'` → JSON enthaelt `"days_of_week": [0]`

### Phase C: Rule Reload + Days-of-Week Persistence

16. **Seite neu laden** (F5 oder Playwright navigation)
17. **"Montag-Test-Regel" RuleCard klicken** — Editor oeffnet sich
18. **Time-Condition Node selektieren** — RuleConfigPanel oeffnet sich
19. **Screenshot Day-Selector** — Bestaetige: NUR "Mo" (erster Chip) ist aktiv-markiert, nicht "So"
20. **⚠️ BUG-01: Canvas-Node pruefen** — Zeigt Time-Node auf Canvas "Mo" oder faelschlich "So"?
21. **Vergleiche Screenshots von Phase B und Phase C** — ConfigPanel identisch

### Phase D: RuleCard Landing-Page Verifikation

22. **Zurueck zur Landing-Page** — ⚠️ **BUG-05:** Wie kommt man zurueck? Direkteingabe `/logic` in URL-Leiste
23. **Screenshot Landing-Page** — Bestaetige: RuleCards sichtbar (nicht alte Inline-Buttons)
24. **Pruefe RuleCard Struktur** (fuer die erstellte Regel):
    - Status-Dot (grau, da `enabled: false` bei neuer Regel — `saveRule` setzt `enabled: false`)
    - Name "Montag-Test-Regel"
    - Status-Label "Deaktiviert" (grau) — NICHT "Aktiv", da neue Regel deaktiviert startet
    - Flow-Badges: Sensor-Badge + Arrow + AND + Arrow + Action-Badge
    - Footer: Clock-Icon + "Noch nie" (noch nicht getriggert)
    - Kein AlertCircle-Icon (kein Fehler)
    - Kein roter Rand (kein Fehler)
    - **⚠️ BUG-06:** Falls `execution_count` angezeigt wird: Pruefen ob "0x/24h" korrekt
25. **Hover ueber RuleCard** — Delete-Button (Trash2) erscheint (opacity 0 → 1)

### Phase E: Toggle + Status-Label + Pulse-Animation

26. **Status-Dot klicken** (auf der RuleCard) — Toggle von disabled → enabled
27. **Beobachte** (innerhalb 1s):
    - Dot-Pulse-Animation (0.8s, opacity blinkt)
    - Toast "Regel aktiviert"
    - Status-Label wechselt von "Deaktiviert" (grau) → "Aktiv" (gruen)
    - RuleCard verliert `opacity: 0.6` (disabled-Klasse entfernt)
    - Status-Dot wechselt von grau → gruen mit Glow
28. **Screenshot** — Bestaetige aktivierten Zustand
29. **Server-Verifikation** — `GET /api/v1/logic/rules/{id}` → `enabled: true`
30. **Status-Dot nochmal klicken** — Toggle zurueck zu disabled
31. **Beobachte:** Toast "Regel deaktiviert", Label → "Deaktiviert" (grau), Dot grau, opacity 0.6
32. **Screenshot** — Bestaetige deaktivierten Zustand

### Phase F: Undo/Redo im Graph-Editor

33. **Rule im Editor oeffnen** (RuleCard klicken)
34. **Einen Node auf dem Canvas verschieben** (Drag + Drop auf neue Position)
35. **Position merken** (x/y Koordinaten im Snapshot)
36. **Undo-Button klicken** (oben links im Graph, Undo2-Icon)
37. **Bestaetige:** Node springt auf alte Position zurueck
38. **Redo-Button klicken** (Redo2-Icon)
39. **Bestaetige:** Node springt auf neue Position vor
40. **Keyboard-Test: Ctrl+Z** — Node geht zurueck
41. **Keyboard-Test: Ctrl+Y** — Node geht vor
42. **Keyboard-Test: Ctrl+Shift+Z** — Node geht vor (alternative Redo-Taste)
43. **Neuen Node hinzufuegen** (Drop aus Palette) → Bestaetige: Redo-Button wird disabled (Future-Stack geleert)
44. **Ctrl+Z** → Node verschwindet (Add rueckgaengig)
45. **Node duplizieren** (Duplizieren-Button im ConfigPanel Footer)
46. **Ctrl+Z** → Duplikat verschwindet
47. **Node loeschen** (Loeschen-Button im ConfigPanel Footer)
48. **Ctrl+Z** → Node kommt zurueck (Snapshot war VOR Loeschung)
49. **⚠️ BUG-11: Ctrl+S testen** — Keine Reaktion erwartet (Shortcut fehlt)
50. **⚠️ BUG-16: Edge loeschen testen** — Gibt es einen Weg eine Verbindung zu entfernen? Rechtsklick? Delete-Taste?
51. **⚠️ Undo/Redo Tooltip pruefen** — Redo-Tooltip zeigt "Ctrl+Shift+Z" (BUG-UX-04: Ctrl+Y fehlt)

### Phase G: Execution History REST + WebSocket

52. **Regel aktivieren** (falls deaktiviert)
53. **History-Panel oeffnen** (History-Button in Toolbar klicken)
54. **⚠️ BUG-09: Panel-Titel pruefen** — Zeigt "Execution History" (englisch) statt "Ausfuehrungshistorie"
55. **Beobachte beim ersten Oeffnen:**
    - Loading-Spinner (Loader2 animate-spin) erscheint kurz
    - REST-Call `GET /api/v1/logic/execution_history` wird gefeuert (Playwright Network-Tab)
    - Spinner verschwindet, Eintraege erscheinen (oder "Keine Ausfuehrungen gefunden" wenn leer)
56. **Screenshot History-Panel** — Bestaetige: Filter-Dropdowns sichtbar
    - **⚠️ BUG-UX-05:** Pruefe Status-Filter Label: "Alle" (Code) vs. "Alle Status" (Report-Erwartung)
57. **Regel manuell triggern** — `POST /api/v1/logic/rules/{id}/test` (dry_run=false fuer echte Ausfuehrung)
    - **Achtung:** `testRule` API hat default `dry_run: true` → Test-Modus, keine echte Ausfuehrung, kein History-Eintrag!
    - Fuer History-Test brauchen wir echte Trigger-Bedingungen oder `dry_run: false`
58. **Warte 2-3 Sekunden** — WebSocket `logic_execution` Event sollte ankommen
59. **Bestaetige in History-Panel:**
    - Neuer Eintrag erscheint OBEN (neueste zuerst)
    - Gruener Dot (success) oder Roter Dot (fail)
    - Zeitstempel (HH:MM:SS Format)
    - Rule-Name prominent sichtbar
    - **⚠️ BUG-10:** Execution-Time bei WS-Events: Zeigt "0ms" oder fehlt ganz
60. **Eintrag klicken** → Detail expandiert:
    - `trigger_reason` Text sichtbar
    - `actions_executed` Zusammenfassung (z.B. "ON")
    - `execution_time_ms` als "XXms" (bei WS-Event: 0)
61. **Nochmal klicken** → Detail klappt zu
62. **Filter testen:** "Nur Erfolg" auswaehlen → Nur gruene Eintraege sichtbar
63. **Filter testen:** "Nur Fehler" auswaehlen → Rote Eintraege oder "Keine Ausfuehrungen gefunden"
64. **Filter testen:** Spezifische Regel auswaehlen → Nur Eintraege dieser Regel
65. **Filter zuruecksetzen:** "Alle Regeln" + "Alle" Status

### Phase H: Error-Styling Verifikation

66. **Regel erstellen die fehlschlagen wird:** Sensor-Condition auf nicht-existierenden ESP, Actuator auf nicht-existierenden GPIO
67. **Regel triggern** — Braucht echte Ausfuehrung (nicht dry_run). Alternativ: Server muss `last_execution_success: false` setzen nach fehlgeschlagenem automatischen Trigger.
68. **Warte bis Server `last_execution_success: false` setzt**
69. **Zurueck zur Landing-Page** (URL `/logic` manuell)
70. **RuleCard pruefen:**
    - Roter Rand (`border-color: rgba(248, 113, 113, 0.4)`) ← Code bestaetigt: `.rule-card--error`
    - Status-Label "Fehler" (rot)
    - AlertCircle-Icon sichtbar (rot)
    - Status-Dot rot mit Glow
71. **Screenshot** — Bestaetige Error-Zustand visuell
72. **Hover ueber AlertCircle** — Title "Letzte Ausfuehrung fehlgeschlagen" (RuleCard.vue:142)
    - **Hinweis:** `:title` Attribut, kein Tooltip-Komponente. Erscheint nur bei Mouse-Hover nach ~1s Delay.
73. **In History-Panel:** Roter Dot + Error-Message sichtbar beim expandierten Eintrag

### Phase I: Delete mit ConfirmDialog

74. **Auf einer RuleCard hovern** → Delete-Button (Trash2) erscheint
75. **Delete-Button klicken**
76. **ConfirmDialog erscheint** — "Regel 'Name' wirklich loeschen?" mit rotem "Loeschen" Button
77. **"Abbrechen" klicken** → Dialog schliesst, Regel existiert noch
78. **Delete-Button nochmal klicken** → "Loeschen" bestaetigen
79. **Bestaetige:** Toast "Regel geloescht", RuleCard verschwindet
    - **⚠️ UX-03:** Keine Exit-Animation? RuleCard verschwindet abrupt?
80. **Server-Verifikation** — `GET /api/v1/logic/rules` → Regel nicht mehr vorhanden
81. **DB-Verifikation** — `SELECT count(*) FROM cross_esp_logic WHERE rule_name = '...'` → 0

### Phase J: Deep-Link Verifikation

82. **Direkt-URL aufrufen:** `http://localhost:5173/logic/{ruleId}` einer existierenden Regel
83. **Bestaetige:** Editor oeffnet sich direkt mit dieser Regel geladen
84. **Breadcrumb pruefen:** `dashStore.breadcrumb.ruleName` gesetzt (TopBar zeigt Rule-Name)
85. **⚠️ BUG-05: "← Zurueck" klicken** → Navigiert zu `/` → redirect zu `/hardware` (NICHT zur Logic-Landing-Page)
86. **Ungueltige Rule-ID testen:** `http://localhost:5173/logic/non-existent-id`
    - Erwartung: Editor oeffnet sich, aber leer (da `logicStore.getRuleById` null zurueckgibt)
    - Besser waere: Redirect zu `/logic` oder Fehlermeldung

### Phase K: Template-Verifikation

87. **Landing-Page `/logic` oeffnen** (keine Regeln selektiert)
88. **Bestaetige 6 Template-Cards sichtbar:**
    - Temperatur-Alarm (Klima)
    - Bewaesserungs-Zeitplan (Bewaesserung)
    - Luftfeuchte-Regelung (Klima)
    - Nacht-Modus (Zeitplan)
    - pH-Alarm (Sicherheit)
    - Notfall-Abschaltung (Sicherheit)
89. **Kategorie-Badges pruefen:** Farbe + Label korrekt (Klima=blau, Bewaesserung=gruen, Sicherheit=rot, Zeitplan=lila)
90. **"Verwenden" Button klicken** auf "Temperatur-Alarm"
91. **⚠️ BUG-02 verifizieren:**
    - Regelname-Input zeigt "Temperatur-Alarm"? ✅
    - Beschreibung zeigt "Automatische Lueftung bei Ueberhitzung"? ✅
    - Canvas hat Nodes? **❌ Erwartet: leer (BUG-02)**
92. **Alle Templates durchklicken** — Dokumentieren ob Canvas jemals befuellt wird

### Phase L: ConfigPanel Edge Cases

93. **Sensor-Node ohne ESP auswaehlen** — Hint "Waehle zuerst ein ESP-Geraet aus" sichtbar?
94. **ESP auswaehlen ohne Sensoren** — Fallback "Keine Sensoren konfiguriert" Hint + manuelle Eingabe sichtbar?
95. **⚠️ BUG-12: Time startHour auf 25 setzen** — Wird akzeptiert? Server-Fehler?
96. **⚠️ BUG-12: Time endHour auf -1 setzen** — Wird akzeptiert?
97. **Between-Operator testen** — Min/Max Felder erscheinen, Schwellwert verschwindet
98. **PWM-Befehl testen** — Slider erscheint, Prozentwert-Anzeige korrekt
99. **Notification-Kanal wechseln** — WebSocket → Email → Webhook, alle Felder korrekt
100. **Delay-Node konfigurieren** — Sekunden-Input, Min/Sek Berechnung im Hint
101. **⚠️ UX-02: Speichern ohne ESP-ID** — Wird `esp_id: ""` an Server gesendet? Server-Validation?

### Phase M: Re-Check nach 60 Sekunden

102. **60 Sekunden warten**
103. **Landing-Page `/logic` neu laden**
104. **Alle RuleCards pruefen:**
    - Status-Labels korrekt (gruen/grau/rot)
    - Execution-Counts stimmen noch
    - "Zuletzt vor X Minuten" Texte aktualisiert
105. **History-Panel oeffnen** — Kein erneuter REST-Call (`historyLoaded` Flag verhindert Doppel-Fetch)
106. **Eine Rule im Editor oeffnen, Time-Condition Node selektieren:**
    - Days-of-Week Auswahl stimmt noch (Montag = Index 0 = erster Chip)
    - **⚠️ BUG-01: Canvas-Node stimmt noch?** (wahrscheinlich immer noch falsch)
107. **Undo/Redo Buttons** — `canUndo`/`canRedo` korrekt (leere Stacks nach frischem Load)

### Phase N: Navigation + Unsaved Changes Guard

108. **Regel im Editor oeffnen**
109. **Node verschieben** (hasUnsavedChanges = true)
110. **Regel im Dropdown wechseln** → ConfirmDialog "Ungespeicherte Aenderungen verwerfen?"
111. **"Abbrechen" klicken** → Bleibt bei aktueller Regel
112. **"OK" klicken** → Wechselt zur neuen Regel, alte Aenderungen verworfen
113. **⚠️ BUG-08: Node verschieben, dann in Sidebar auf "Hardware" klicken**
    - Kein Warning erwartet (Guard fehlt)
    - Aenderungen still verloren → Bug bestaetigen

---

## Erwartete Ergebnisse

| Check | Erwartung | Bug-Referenz |
|-------|-----------|--------------|
| Days-of-Week ConfigPanel | "Mo" ist erster Chip, Index 0 = Montag | — |
| Days-of-Week Canvas-Node | Zeigt "Mo" wenn Index 0 aktiv | **BUG-01** ❌ |
| Days-of-Week Persistence | Save → Reload → gleiche Auswahl | — |
| Days-of-Week Server | `days_of_week: [0]` in DB = Montag | — |
| Template → Canvas | Nodes werden geladen nach "Verwenden" | **BUG-02** ❌ |
| Template soil_moisture | Sensor-Typ korrekt erkannt | **BUG-04** ❌ |
| RuleCard Rendering | Cards mit Dot + Name + Label + Badges + Footer | **BUG-03** pruefen |
| RuleCard Import | Kein Vue-Warning in Konsole | **BUG-03** pruefen |
| RuleCard Execution Count | Label korrekt (total vs. 24h) | **BUG-06** ❌ |
| Status-Label | "Aktiv" (gruen), "Deaktiviert" (grau), "Fehler" (rot) | — |
| Toggle | Dot-Pulse, Toast, Label-Wechsel, Server-Update | — |
| Error-Styling | Roter Rand + AlertCircle bei `last_execution_success === false` | — |
| Undo/Redo Buttons | Enabled/Disabled korrekt, Positions-Reset funktioniert | — |
| Keyboard Shortcuts | Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z alle funktional | — |
| Keyboard Ctrl+S | Save-Shortcut funktioniert | **BUG-11** ❌ |
| History REST | Einmaliger Fetch beim ersten Panel-Oeffnen | — |
| History WS | Live-Events erscheinen oben in der Liste | — |
| History WS Timing | execution_time_ms korrekt | **BUG-10** ❌ (immer 0) |
| History Panel Titel | Deutsch: "Ausfuehrungshistorie" | **BUG-09** ❌ (English) |
| History Filter | Regel-Filter + Status-Filter funktional | — |
| History Details | Expandieren/Kollabieren, Trigger + Actions + Timing sichtbar | — |
| Delete | ConfirmDialog, Cancel = kein Loeschen, Confirm = geloescht + Toast | — |
| Deep-Link | `/logic/{ruleId}` oeffnet direkt den Editor | — |
| Deep-Link zurueck | "← Zurueck" fuehrt zu Logic-Uebersicht | **BUG-05** ❌ (geht zu /hardware) |
| Deep-Link ungueltig | `/logic/fake-id` zeigt Fehler oder Redirect | pruefen |
| Route Guard | Ungespeicherte Aenderungen bei Navigation warnen | **BUG-08** ❌ |
| Time Input Bounds | startHour/endHour nur 0-23 | **BUG-12** ❌ |
| Notification Vars | Syntax konsistent {value} vs {{value}} | **BUG-14** pruefen |
| Edge loeschen | Verbindung zwischen Nodes entfernbar | **BUG-16** ❌ |
| Compound Round-Trip | Compound-Conditions bleiben nach Save→Load erhalten | **BUG-07** ❌ |
| Hysteresis Config | Hysteresis-Felder im ConfigPanel editierbar | **BUG-15** ❌ |

---

## Bug-Severity Zusammenfassung

| Severity | Count | IDs |
|----------|-------|-----|
| 🔴 Kritisch | 3 | BUG-01, BUG-02, BUG-03 |
| 🟠 Mittel | 5 | BUG-04, BUG-05, BUG-06, BUG-07, BUG-08 |
| 🟡 Gering | 8 | BUG-09 bis BUG-17 (inkl. 15, 16, 17) |
| 🔵 UX/Kosmetik | 7 | UX-01 bis UX-07 |
| **Gesamt** | **23** | |

---

## Report-Output

`/reports/current/LOGIC_EDITOR_E2E_VERIFICATION.md` mit:
- Screenshot pro Phase (A-N, jetzt 14 Phasen statt 11)
- Pass/Fail pro Pruefpunkt (113 Checks, vorher 84)
- Bei Fail: Erwartung vs. Realitaet + Screenshot + Netzwerk-Response
- Bug-Referenz pro Fail (BUG-01 bis BUG-17, UX-01 bis UX-07)
- Neue Regel wird deaktiviert erstellt (`enabled: false` in saveRule) — Testschritte entsprechend angepasst
