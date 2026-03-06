# Komponenten-Tab — IST-Analyse

**Erstellt:** 2026-03-06  
**Ziel-Repo:** auto-one  
**Kontext:** Roadmap Monitor-Editor; Komponenten-Tab = Wissensdatenbank  
**Typ:** Bestandsaufnahme (kein Code)

---

## 1. Zusammenfassung

Der Komponenten-Tab (SensorsView, Route `/sensors`) ist klar als **Wissensdatenbank/Inventar** umgesetzt. Es gibt **keine Monitoring-Elemente** (Sparklines, Live-Charts). Die Trennung zu Monitor und HardwareView ist konsistent. **Keine Übernahmen für Monitor/Editor empfohlen.**

---

## 2. SensorsView — Struktur

| Aspekt | Wert |
|--------|------|
| **Datei** | `El Frontend/src/views/SensorsView.vue` |
| **Zeilenzahl** | ~424 (inkl. Scoped CSS) |
| **Route** | `/sensors` |
| **Komponenten** | InventoryTable, DeviceDetailPanel, SlideOver, EmergencyStopButton |

### 2.1 Elemente (kein Monitoring)

- **Header:** Titel „Komponenten-Inventar“, EmergencyStopButton
- **Toolbar:** Suche (debounced), Typ-Filter (Alle/Sensoren/Aktoren), Filter-Toggle (Zone, Status), Spalten-Auswahl
- **Tabelle:** InventoryTable — flache Liste aller Sensoren/Aktoren
- **Detail:** DeviceDetailPanel im SlideOver bei Zeilenklick

### 2.2 Was SensorsView NICHT enthält

- Kein SensorConfigPanel, kein ActuatorConfigPanel (laut Header-Kommentar)
- Keine Sparklines, keine Live-Charts
- Keine Zone-Gruppierung (flache Tabelle statt Accordion)
- Keine Quality-Dots, keine Stale-Indikatoren

### 2.3 Datenquelle

- `espStore.devices` über `useZoneGrouping` + `inventory.store`
- `currentValue` in der Tabelle: letzter Wert aus espStore (WebSocket-synced) — nur als Text, kein Chart

---

## 3. Vergleich SensorsView vs. MonitorView

| Aspekt | SensorsView (Komponenten) | MonitorView |
|--------|---------------------------|-------------|
| **Layout** | Flache Tabelle | Zone → Subzone → Cards |
| **Daten** | espStore + useZoneGrouping | zonesApi.getZoneMonitorData + Fallback useZoneGrouping |
| **Cards** | — | SensorCard, ActuatorCard |
| **Charts** | — | 1h-Chart, L3 Multi-Sensor-Overlay |
| **Detail** | DeviceDetailPanel (Metadaten, Schema, Links) | L3 SlideOver (Zeitreihe, Overlays) |
| **CRUD** | Kein CRUD | Kein CRUD |

---

## 4. Geteilte vs. spezifische Komponenten

### 4.1 Geteilt (beide Views)

| Ressource | Verwendung |
|-----------|------------|
| `useZoneGrouping` | inventory.store + MonitorView (Fallback) |
| `espStore` | Beide |
| `formatters`, `sensorDefaults`, `labels` | Beide |
| `getESPStatus` | inventory.store (Status-Spalte), MonitorView |

### 4.2 Nur Komponenten-Tab

| Komponente | Zweck |
|------------|-------|
| InventoryTable | Flache Tabelle mit Sortierung, Pagination, Spalten |
| DeviceDetailPanel | Metadaten, SchemaForm, ZoneContextEditor, LinkedRulesSection |
| inventory.store | Filter, Pagination, Column Visibility, Detail-State |
| SchemaForm, ZoneContextEditor | Wissensdatenbank-Features |

### 4.3 Nur MonitorView

| Komponente | Zweck |
|------------|-------|
| SensorCard, ActuatorCard | Live-Anzeige mit Charts |
| InlineDashboardPanel, DashboardViewer | Dashboards |
| useSubzoneResolver, useSparklineCache | L2/L3-Features |

---

## 5. Antworten auf Analyse-Fragen

| # | Frage | Ergebnis |
|---|-------|----------|
| 3.1 | Was zeigt SensorsView? | Flache Tabelle (Zone/Subzone über Spalten), Filter, DeviceDetailPanel. Kein ConfigPanel. |
| 3.2 | Monitoring-Elemente? | **Nein.** Keine Sparklines, keine Live-Charts. Nur `currentValue` als Text (letzter Wert). |
| 3.3 | Geteilte Komponenten? | useZoneGrouping, espStore, formatters, sensorDefaults. **Nicht** SensorCard/ActuatorCard. |
| 3.4 | Fehlende Elemente in Monitor? | DeviceDetailPanel (Schema, Zone-Kontext) ist Inventar-spezifisch. L3 hat andere Fokussierung (Zeitreihen). |
| 3.5 | Wissensdatenbank-Rolle erkennbar? | **Ja.** InventoryTable + DeviceDetailPanel, Titel „Komponenten-Inventar“, Cross-Links zu Monitor/Hardware. |

---

## 6. Empfehlung

**Keine Übernahmen für Monitor/Editor.**

- Monitor = Live-Daten, Zeitreihen, Charts
- Komponenten = Inventar, Metadaten, Schema, Zone-Kontext
- HardwareView = CRUD, SensorConfigPanel, ActuatorConfigPanel

Die Trennung ist klar und konsistent. DeviceDetailPanel ist bewusst auf Wissensdatenbank ausgerichtet; Monitor L3 deckt andere Anforderungen ab (Zeitreihen, Overlays).

---

## 7. Offene Punkte

| Punkt | Priorität | Hinweis |
|-------|-----------|---------|
| `currentValue` in Tabelle | Niedrig | Letzter Wert aus espStore. Kein Chart, nur Text. Für Inventar-Kontext ausreichend. |
| DeviceDetailPanel in Monitor? | Keine | L3 hat eigenes Layout; Schema/Zone-Kontext sind Inventar-Features. |
| Duplikate | Keine | Keine identifiziert. |

---

## 8. Abgrenzung (wie im Auftrag)

- **Fokus Roadmap:** Monitor + Editor
- **Komponenten-Tab:** Nur für vollständigen Überblick analysiert
- **Keine tiefe Analyse** — nur das Nötige für den Überblick
