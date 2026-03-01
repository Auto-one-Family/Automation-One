# AutoOps Debug-Auftrag: Logic Rules Editor E2E-Verifikation

> **Erstellt:** 2026-03-01
> **Ziel-Repo:** auto-one
> **Typ:** E2E-Verifikation (autoops:debug + Playwright)
> **Fokus:** NUR Logic Rules Editor — alle 6 Polishing-Phasen verifizieren
> **Status:** OFFEN
> **Report-Output:** `/reports/current/LOGIC_EDITOR_E2E_VERIFICATION.md`

---

## Kontext

Der Logic Rules Editor wurde in 6 Phasen gepolisht (v9.12). Alle Aenderungen sind rein Frontend — 0 Server-Aenderungen. Build ist gruen, TypeScript fehlerfrei. Jetzt brauchen wir eine vollstaendige E2E-Verifikation aller geaenderten Funktionen.

## Geaenderte Bereiche (zu verifizieren)

- **Days-of-Week** — Index 0=Montag (nicht Sonntag)
- **Execution History** — REST-Fetch + WebSocket-Merge + Filter + expandierbare Details
- **Undo/Redo** — Buttons + Keyboard-Shortcuts + Snapshot bei Drop/Delete/Duplicate/DragStop
- **RuleCard Landing-Page** — Cards statt Inline-Buttons, Select/Toggle/Delete Events
- **Status-Label + Error-Styling** — "Aktiv"/"Deaktiviert"/"Fehler", roter Rand, AlertCircle
- **Toggle-Pulse** — Animation beim Klick auf Status-Dot

---

## Workflow: Schritt fuer Schritt

### Phase A: Vorbereitung (Stack + Testdaten)

1. **Stack pruefen** — `docker ps` bestaetigt: el-frontend, el-servador, mqtt-broker, postgres laufen
2. **Frontend erreichbar** — Playwright navigiert zu `http://localhost:5173/logic`
3. **Mindestens 2 Mock-ESPs existieren** — Pruefe ueber `GET /api/v1/esp/devices` dass min. 2 Devices mit Sensoren + Aktoren vorhanden sind. Falls nicht: `POST /api/v1/debug/mock-esp` mit je 1 Sensor (SHT31) + 1 Aktor (Relay) erstellen
4. **Screenshot der Landing-Page `/logic`** — Bestaetige: Template-Cards sichtbar ODER bereits vorhandene Rules als RuleCards

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
10. **Actuator-Action Node hinzufuegen** — Relay ON
11. **Nodes verbinden** — Sensor → Logic-Node, Time → Logic-Node, Logic-Node → Actuator
12. **Speichern** — Save-Button klicken, Toast "Regel gespeichert" abwarten
13. **Playwright: Pruefe Server-Response** — `GET /api/v1/logic/rules` → Die neue Rule hat `days_of_week: [0]` (Montag, NICHT Sonntag)
14. **DB-Verifikation** — `SELECT trigger_conditions FROM cross_esp_logic WHERE rule_name = 'Montag-Test-Regel'` → JSON enthaelt `"days_of_week": [0]`

### Phase C: Rule Reload + Days-of-Week Persistence

15. **Seite neu laden** (F5 oder Playwright navigation)
16. **"Montag-Test-Regel" RuleCard klicken** — Editor oeffnet sich
17. **Time-Condition Node selektieren** — RuleConfigPanel oeffnet sich
18. **Screenshot Day-Selector** — Bestaetige: NUR "Mo" (erster Chip) ist aktiv-markiert, nicht "So"
19. **Vergleiche Screenshot von Schritt 9 mit Schritt 18** — identisch

### Phase D: RuleCard Landing-Page Verifikation

20. **Zurueck zur Landing-Page** — "← Zurueck" oder Deselect
21. **Screenshot Landing-Page** — Bestaetige: RuleCards sichtbar (nicht alte Inline-Buttons)
22. **Pruefe RuleCard Struktur** (fuer die erstellte Regel):
    - Status-Dot (gruen, da enabled)
    - Name "Montag-Test-Regel"
    - Status-Label "Aktiv" (gruener Text)
    - Flow-Badges: `[SHT31 > 25]` → `[AND]` → `[ON]`
    - Footer: Clock-Icon + "Noch nie" (noch nicht getriggert)
    - Kein AlertCircle-Icon (kein Fehler)
    - Kein roter Rand (kein Fehler)
23. **Hover ueber RuleCard** — Delete-Button (Trash2) erscheint (opacity 0 → 1)

### Phase E: Toggle + Status-Label + Pulse-Animation

24. **Status-Dot klicken** (auf der RuleCard) — Toggle von enabled → disabled
25. **Beobachte** (innerhalb 1s):
    - Dot-Pulse-Animation (0.8s, opacity blinkt)
    - Toast "Regel deaktiviert"
    - Status-Label wechselt von "Aktiv" (gruen) → "Deaktiviert" (grau)
    - RuleCard bekommt `opacity: 0.6` (disabled-Klasse)
    - Status-Dot wechselt von gruen → grau
26. **Screenshot** — Bestaetige deaktivierten Zustand
27. **Server-Verifikation** — `GET /api/v1/logic/rules/{id}` → `enabled: false`
28. **Status-Dot nochmal klicken** — Toggle zurueck zu enabled
29. **Beobachte:** Toast "Regel aktiviert", Label → "Aktiv" (gruen), Dot gruen, opacity 1.0
30. **Screenshot** — Bestaetige reaktivierten Zustand

### Phase F: Undo/Redo im Graph-Editor

31. **Rule im Editor oeffnen** (RuleCard klicken)
32. **Einen Node auf dem Canvas verschieben** (Drag + Drop auf neue Position)
33. **Position merken** (x/y Koordinaten im Snapshot)
34. **Undo-Button klicken** (oben links im Graph, Undo2-Icon)
35. **Bestaetige:** Node springt auf alte Position zurueck
36. **Redo-Button klicken** (Redo2-Icon)
37. **Bestaetige:** Node springt auf neue Position vor
38. **Keyboard-Test: Ctrl+Z** — Node geht zurueck
39. **Keyboard-Test: Ctrl+Y** — Node geht vor
40. **Keyboard-Test: Ctrl+Shift+Z** — Node geht vor (alternative Redo-Taste)
41. **Neuen Node hinzufuegen** (Drop aus Palette) → Bestaetige: Redo-Button wird disabled (Future-Stack geleert)
42. **Ctrl+Z** → Node verschwindet (Add rueckgaengig)
43. **Node duplizieren** (Rechtsklick → Duplizieren oder Palette-Aktion)
44. **Ctrl+Z** → Duplikat verschwindet
45. **Node loeschen** (Delete-Button im ConfigPanel)
46. **Ctrl+Z** → Node kommt zurueck (Snapshot war VOR Loeschung)

### Phase G: Execution History REST + WebSocket

47. **Zweite Regel erstellen:** "Sofort-Test-Regel" — Sensor > 0 (immer wahr), Actuator ON, enabled
48. **History-Panel oeffnen** (History-Button in Toolbar klicken)
49. **Beobachte beim ersten Oeffnen:**
    - Loading-Spinner (Loader2 animate-spin) erscheint kurz
    - REST-Call `GET /api/v1/logic/execution_history` wird gefeuert (Playwright Network-Tab)
    - Spinner verschwindet, Eintraege erscheinen (oder "Keine Eintraege" wenn leer)
50. **Screenshot History-Panel** — Bestaetige: Filter-Dropdowns ("Alle Regeln", "Alle Status") sichtbar
51. **Regel manuell triggern** — `POST /api/v1/logic/rules/{id}/test`
52. **Warte 2-3 Sekunden** — WebSocket `logic_execution` Event sollte ankommen
53. **Bestaetige in History-Panel:**
    - Neuer Eintrag erscheint OBEN (neueste zuerst)
    - Gruener Dot (success)
    - Zeitstempel (HH:MM:SS Format)
    - Rule-Name prominent sichtbar
    - Execution-Time in ms
54. **Eintrag klicken** → Detail expandiert:
    - `trigger_reason` Text sichtbar
    - `actions_executed` Zusammenfassung (z.B. "ON")
    - `execution_time_ms` als "XXms"
55. **Nochmal klicken** → Detail klappt zu
56. **Filter testen:** "Nur Erfolg" auswaehlen → Nur gruene Eintraege sichtbar
57. **Filter testen:** "Nur Fehler" auswaehlen → Rote Eintraege oder "Keine Eintraege"
58. **Filter testen:** Spezifische Regel auswaehlen → Nur Eintraege dieser Regel
59. **Filter zuruecksetzen:** "Alle Regeln" + "Alle Status"

### Phase H: Error-Styling Verifikation

60. **Regel erstellen die fehlschlagen wird:** Sensor-Condition auf nicht-existierenden ESP, Actuator auf nicht-existierenden GPIO
61. **Regel triggern** — `POST /api/v1/logic/rules/{id}/test`
62. **Warte bis Server `last_execution_success: false` setzt**
63. **Zurueck zur Landing-Page** — RuleCard pruefen:
    - Roter Rand (`border-color: rgba(248, 113, 113, 0.4)`)
    - Status-Label "Fehler" (rot)
    - AlertCircle-Icon sichtbar (rot)
    - Status-Dot rot mit Glow
64. **Screenshot** — Bestaetige Error-Zustand visuell
65. **Hover ueber AlertCircle** — Tooltip "Letzte Ausfuehrung fehlgeschlagen"
66. **In History-Panel:** Roter Dot + Error-Message sichtbar beim expandierten Eintrag

### Phase I: Delete mit ConfirmDialog

67. **Auf einer RuleCard hovern** → Delete-Button (Trash2) erscheint
68. **Delete-Button klicken**
69. **ConfirmDialog erscheint** — "Regel 'Name' wirklich loeschen?" mit rotem "Loeschen" Button
70. **"Abbrechen" klicken** → Dialog schliesst, Regel existiert noch
71. **Delete-Button nochmal klicken** → "Loeschen" bestaetigen
72. **Bestaetige:** Toast "Regel geloescht", RuleCard verschwindet
73. **Server-Verifikation** — `GET /api/v1/logic/rules` → Regel nicht mehr vorhanden
74. **DB-Verifikation** — `SELECT count(*) FROM cross_esp_logic WHERE rule_name = '...'` → 0

### Phase J: Deep-Link Verifikation

75. **Direkt-URL aufrufen:** `http://localhost:5173/logic/{ruleId}` einer existierenden Regel
76. **Bestaetige:** Editor oeffnet sich direkt mit dieser Regel geladen
77. **Breadcrumb pruefen:** TopBar zeigt Rule-Name
78. **"← Zurueck" klicken** → Landing-Page, URL wird `/logic`

### Phase K: Re-Check nach 60 Sekunden

79. **60 Sekunden warten**
80. **Landing-Page `/logic` neu laden**
81. **Alle RuleCards pruefen:**
    - Status-Labels korrekt (gruen/grau/rot)
    - Execution-Counts stimmen noch
    - "Zuletzt vor X Minuten" Texte aktualisiert
82. **History-Panel oeffnen** — Kein erneuter REST-Call (`historyLoaded` Flag verhindert Doppel-Fetch)
83. **Eine Rule im Editor oeffnen, Time-Condition Node selektieren:**
    - Days-of-Week Auswahl stimmt noch (Montag = Index 0 = erster Chip)
84. **Undo/Redo Buttons** — `canUndo`/`canRedo` korrekt (leere Stacks nach frischem Load)

---

## Erwartete Ergebnisse

| Check | Erwartung |
|-------|-----------|
| Days-of-Week UI | "Mo" ist erster Chip, Index 0 = Montag |
| Days-of-Week Persistence | Save → Reload → gleiche Auswahl |
| Days-of-Week Server | `days_of_week: [0]` in DB = Montag |
| RuleCard Rendering | Cards mit Dot + Name + Label + Badges + Footer |
| Status-Label | "Aktiv" (gruen), "Deaktiviert" (grau), "Fehler" (rot) |
| Toggle | Dot-Pulse, Toast, Label-Wechsel, Server-Update |
| Error-Styling | Roter Rand + AlertCircle bei `last_execution_success === false` |
| Undo/Redo Buttons | Enabled/Disabled korrekt, Positions-Reset funktioniert |
| Keyboard Shortcuts | Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z alle funktional |
| History REST | Einmaliger Fetch beim ersten Panel-Oeffnen |
| History WS | Live-Events erscheinen oben in der Liste |
| History Filter | Regel-Filter + Status-Filter funktional |
| History Details | Expandieren/Kollabieren, Trigger + Actions + Timing sichtbar |
| Delete | ConfirmDialog, Cancel = kein Loeschen, Confirm = geloescht + Toast |
| Deep-Link | `/logic/{ruleId}` oeffnet direkt den Editor |

---

## Report-Output

`/reports/current/LOGIC_EDITOR_E2E_VERIFICATION.md` mit:
- Screenshot pro Phase (A-K)
- Pass/Fail pro Pruefpunkt (84 Checks)
- Bei Fail: Erwartung vs. Realitaet + Screenshot + Netzwerk-Response
