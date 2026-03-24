# Screenshots T18-V5 Logic-Vollcheck (2026-03-11)

Screenshots aus dem Layout-Vollcheck der Logic Engine. Namenskonvention: `NN-kurzbeschreibung.png`.

## Empfohlene Screenshots (manuell oder per Playwright)

| Nr | Dateiname | Inhalt |
|----|-----------|--------|
| 01 | `01-logic-landing.png` | Route `/logic` — Landing: Regelliste oder Empty State (Illustration + „Neue Regel erstellen“) |
| 02 | `02-logic-landing-mit-regeln.png` | Landing mit vorhandenen Regeln (RuleCards, „Meine Regeln“, Vorlagen eingeklappt) |
| 03 | `03-editor-canvas-leer.png` | Editor: leeres Canvas + Node-Palette links (Bausteine), keine Regel geladen |
| 04 | `04-editor-mit-regel.png` | Editor: eine Regel geöffnet (z. B. Luftbefeuchter), Nodes sichtbar, Edges verbunden |
| 05 | `05-rule-card-toggle.png` | RuleCard auf Landing: Toggle An/Aus, Status, letzte Ausführung |
| 06 | `06-rule-config-panel-sensor.png` | RuleConfigPanel rechts: Sensor-Node ausgewählt (ESP, GPIO, Typ, Operator, Wert) |
| 07 | `07-rule-config-panel-actuator.png` | RuleConfigPanel: Aktor-Node (ESP, GPIO, Befehl, Auto-Abschaltung Sek.) |
| 08 | `08-toolbar-actions.png` | Toolbar: Neu, Speichern, Test, Toggle, Löschen, Historie, Fit View |
| 09 | `09-execution-history.png` | Unterer Bereich: Execution History geöffnet, Filter, Liste |
| 10 | `10-monitor-l1-rules.png` | Monitor L1: Abschnitt „Aktive Automatisierungen“ (ActiveAutomationsSection) |
| 11 | `11-monitor-l2-zone-rules.png` | Monitor L2: Zone gewählt, „Regeln für diese Zone“ (ZoneRulesSection) |
| 12 | `12-actuator-config-linked-rules.png` | HardwareView L2: ActuatorConfigPanel, Bereich „Verlinkte Regeln“ (LinkedRulesSection) |
| 13 | `13-sensor-config-linked-rules.png` | HardwareView L2: SensorConfigPanel, „Verlinkte Regeln“ |

## Erstellt per Playwright (2026-03-11)

| Datei | Inhalt |
|-------|--------|
| `01-logic-landing.png` | `/logic` — Landing mit Regelliste (TimmsRegen), Vorlagen, Toolbar |
| `02-logic-landing-mit-regeln.png` | Editor-Viewport (Regel „TimmsRegen“ geöffnet, Palette + Canvas) |
| `04-editor-mit-regel.png` | Editor Full-Page: Regel TimmsRegen, Nodes (Sensor, AND, Aktor, E-Mail), Palette |
| `06-rule-config-panel-sensor.png` | RuleConfigPanel: Sensor-Node (ESP, Sensor, Operator, Schwellwert 40) |
| `07-rule-config-panel-actuator.png` | RuleConfigPanel: Aktor-Node (Luftbefeuchter, ON, Auto-Abschaltung 15 s) |
| `08-toolbar-actions.png` | Toolbar: Neu, Speichern, Test, Toggle, Löschen, Historie, Fit View |
| `09-execution-history.png` | Execution History geöffnet, Filter, Einträge TimmsRegen |
| `10-monitor-l1-rules.png` | Monitor L1: „Aktive Automatisierungen (1)“, RuleCardCompact TimmsRegen |
| `11-monitor-l2-zone-rules.png` | Monitor L2 Zone „Zelt Wohnzimmer“: „Regeln für diese Zone (1)“ |
| `12-actuator-config-linked-rules.png` | ActuatorConfigPanel „Luftbefeuchter“: Verknüpfte Regeln → TimmsRegen |
| `13-sensor-config-linked-rules.png` | SensorConfigPanel „sht31_humidity“: Verknüpfte Regeln → TimmsRegen |

Nicht erstellt: `03-editor-canvas-leer.png`, `05-rule-card-toggle.png` (optional nachträglich).

Screenshots können nachträglich ergänzt werden. Playwright-E2E kann erweitert werden, um unter `tests/e2e/scenarios/` einen Flow für `/logic` auszuführen und Screenshots zu speichern.
