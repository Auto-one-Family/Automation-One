# Monitor L2 Überarbeitung — Session-Briefing

> **Erstellt:** 2026-03-04  
> **Zweck:** Startpunkt für die nächste Session mit dem Automation-Experten zur Monitor L2 Überarbeitung  
> **Status:** Funktional OK, Layout/UX unzufriedenstellend

---

## 1. Robins Kernprobleme (aus dieser Nachricht)

| Problem | Beschreibung |
|---------|--------------|
| **Platz** | Nimmt extrem viel Platz weg |
| **Subzone-Erkennbarkeit** | Subzones im Container nicht ordentlich erkennbar — „wie im Rest“ der App |
| **Gesamtüberblick** | Umständlich, einen Gesamtüberblick zu bekommen |
| **Anforderung** | Verschiedene Subzones mit mehreren Geräten darin müssen klar dargestellt werden |

**Robin:** „Eigentlich funktioniert es schon in Ordnung, aber die Ansicht gefällt mir gar nicht.“

---

## 2. „Wie im Rest“ — Referenz-Views

| View | Subzone-Darstellung | Pattern |
|------|----------------------|---------|
| **HardwareView L1** | ZonePlate mit DeviceMiniCards, Subzone-Gruppierung | Accordion pro Zone, Subzone-Bereiche mit Accent-Border |
| **ZonePlate / ZoneGroup** | SubzoneArea, Subzone-Chips im Header | Glassmorphism, klare visuelle Trennung |
| **SensorsView** | Zone-Accordion mit Subzone-Sections | Accordion > Tabs, kompakte Gruppierung |
| **Monitor L2 (aktuell)** | Subzone-Accordion, aber: unübersichtlich, doppelte Zählung, viel Platz | Abweichend vom Rest |

**Ziel:** Monitor L2 soll sich visuell und strukturell an ZonePlate/SubzoneArea/SensorsView angleichen — gleiche Container-Logik, gleiche Erkennbarkeit.

---

## 3. Bestehende Vorarbeit (vollständig)

| Dokument | Inhalt |
|----------|--------|
| `.claude/reports/current/auftrag-monitor-l2-layout-ux-analyse.md` | Robins Anforderungen, 4 Layout-Varianten (A–D), UX-Prinzipien |
| `.claude/reports/current/auftrag-monitor-l2-layout-integrationsvorschlag-2026-03-04.md` | Konkreter Vorschlag: Accordion pro Subzone, Backend-Endpoint, Zählungsregel |
| `.claude/reports/current/auftrag-monitor-l2-optimiertes-design-implementierung.md` | 5 Phasen (Phase 1 Backend entfällt — bereits implementiert) |
| `.claude/reports/current/auftrag-subzone-funktional-fix.md` | **Voraussetzung:** B2 (Sensoren/Aktoren pro Subzone) muss funktionieren |
| `.claude/reports/current/zonen-subzonen-vollanalyse-bericht-2026-03-04.md` | B2-Beschreibung, useZoneGrouping esp.subzone_id Problem |

---

## 4. Empfohlene Architektur (aus Integrationsvorschlag)

| Aspekt | Entscheidung |
|--------|--------------|
| **Datenquelle** | `GET /api/v1/zone/{zone_id}/monitor-data` — **bereits implementiert** (MonitorDataService, `El Servador/god_kaiser_server/src/services/monitor_data_service.py`) |
| **Fallback** | useZoneGrouping + useSubzoneResolver (GPIO→Subzone Map) — **Problem:** Wird während Loading angezeigt → Race, „Keine Subzone“-Flackern |
| **Layout** | Accordion pro Subzone (Variante A) — verfeinern, nicht ersetzen |
| **Zählung** | Nur Sektionsüberschrift „Sensoren (N)“ — Subzone-Header ohne Count |
| **Subzone-Header** | Name, Status-Dot, KPI-Werte (z.B. „23,5°C · 65%“) — kein Count |
| **„Keine Subzone“** | Eigene Accordion-Gruppe, nur wenn Geräte ohne Subzone existieren |

---

## 5. Datei- und Abhängigkeitsübersicht (aus Robins Kontext)

### Kern
- `El Frontend/src/views/MonitorView.vue` (~3307 Zeilen) — L1 Zone-Tiles, L2 Subzone-Accordion, L3 Sensor-Detail SlideOver

### Kind-Komponenten
- `El Frontend/src/components/devices/SensorCard.vue`, `ActuatorCard.vue`
- `El Frontend/src/shared/design/primitives/SlideOver.vue`, `BaseSkeleton.vue`
- `El Frontend/src/shared/design/patterns/ErrorState.vue`
- `El Frontend/src/components/charts/TimeRangeSelector.vue`, `LiveLineChart.vue`

### Composables
- `El Frontend/src/composables/useZoneGrouping.ts`, `useSubzoneResolver.ts`, `useZoneDragDrop.ts`, `useSwipeNavigation.ts`, `useKeyboardShortcuts.ts`, `useSparklineCache.ts`

### API
- `GET /api/v1/zone/{zoneId}/monitor-data` — Hauptdatenquelle L2 (bereits implementiert, `zonesApi.getZoneMonitorData()` in `El Frontend/src/api/zones.ts`)
- Fallback: useZoneGrouping + useSubzoneResolver; Subzone-API: `GET /api/v1/subzone/devices/{esp_id}/subzones` (nicht `/subzone/{espId}`)

### Design
- `El Frontend/src/styles/tokens.css` (--space-4 = 16px), `El Frontend/src/styles/glass.css` (.glass-panel)
- `El Frontend/src/shared/design/primitives/AccordionSection.vue` — MonitorView nutzt aktuell **eigenes** Accordion-Logik; ZonePlate/HardwareView nutzen AccordionSection
- Referenz-Views: `El Frontend/src/components/zones/SubzoneArea.vue`, `El Frontend/src/components/dashboard/ZonePlate.vue`

---

## 6. Reihenfolge für die Session

1. **Subzone-Funktional-Fix prüfen** — Ist B2 (Sensoren/Aktoren pro Subzone) bereits behoben? Ohne das ist Layout-Optimierung sinnlos. Auftrag: `.claude/reports/current/auftrag-subzone-funktional-fix.md`
2. **Backend:** `GET /zone/{zone_id}/monitor-data` — **bereits implementiert** (MonitorDataService, `El Servador/god_kaiser_server/src/api/v1/zone.py` Zeile 264). Keine Backend-Änderung nötig.
3. **Frontend Ready-Gate (Priorität):** `MonitorView.vue` L2: Während `zoneMonitorLoading` kein Fallback rendern — `v-if="!zoneMonitorLoading"` auf L2-Content ODER Skeleton bis `zoneMonitorData` da ist. Behebt „Keine Subzone“-Flackern (backend-datenkonsistenz-bericht BK2).
4. **Frontend Layout:** MonitorView.vue L2 — Zählung, Subzone-Header kompakter, Design-Angleichung an SubzoneArea/ZonePlate (Accent-Border, Glass-BG).

---

## 7. Konkrete UX-Änderungen (Sofort umsetzbar)

| Änderung | Vorher | Nachher |
|----------|--------|---------|
| Zählung | „Sensoren (5)“ + „5 Sensoren“ in Subzone-Zeile | Nur „Sensoren (5)“ in Sektion |
| Subzone-Header | Name + Count + KPIs | Name + Status-Dot + KPI-Werte („23,5°C · 65%“) — kein Count |
| Abstand | Unklar | 40px zwischen Sektionen (tokens.css --space-10) |
| „Keine Subzone“ | Evtl. redundant | Nur anzeigen wenn Geräte ohne Subzone |
| Accordion | Alle expanded? | ≤4 Subzonen: alle offen; >4: nur erste offen |

---

## 8. Offene Fragen für Robin

1. **Subzone-Funktional-Fix:** Wurde der Auftrag `.claude/reports/current/auftrag-subzone-funktional-fix.md` bereits umgesetzt? (B2: Sensoren/Aktoren pro Subzone)
2. ~~**Backend-Endpoint:**~~ **Erledigt** — `GET /api/v1/zone/{zone_id}/monitor-data` existiert und wird von MonitorView genutzt.
3. **Priorität:** Ready-Gate zuerst (behebt Flackern), dann Layout — empfohlen.

---

## 9. Nächster Schritt

**Option A:** Mit Implementierung starten (auftrag-monitor-l2-optimiertes-design-implementierung.md Phase 1–5)  
**Option B:** Zuerst Subzone-Funktional-Fix verifizieren, dann Layout  
**Option C:** Robin schaut sich ZonePlate/SubzoneArea im Code an und gibt konkrete „so soll es aussehen“-Vorgaben

---

## 10. Ausführbarer Auftrag (Systemkontext)

> **verify-plan:** Korrekturen eingearbeitet. Agent: `frontend-dev` (nicht „automation-experte“ — existiert nicht).

### Vorbedingungen
- [ ] Docker-Stack läuft (`make status` oder `make dev`)
- [ ] `El Frontend` mit `npx vite` oder `npm run dev` erreichbar

### Befehl für frontend-dev (Phase 1: Ready-Gate)

```
KONTEXT: MonitorView L2 zeigt während des Ladens von zoneMonitorData den Fallback (useZoneGrouping + useSubzoneResolver). Der Fallback hat resolverMap leer → alle Sensoren subzone_id=null → "Keine Subzone" flackert. Siehe backend-datenkonsistenz-bericht-2026-03-04.md BK2.

AUFTRAG: Ready-Gate im L2-Bereich implementieren. Während zoneMonitorLoading=true darf KEIN Fallback gerendert werden. Option A: v-if="!zoneMonitorLoading" auf den L2-Content-Container. Option B: Skeleton/Spinner bis zoneMonitorData da ist. Kein Fallback-Rendering während des Ladens.

DATEIEN:
- Lesen: El Frontend/src/views/MonitorView.vue (Zeilen ~1610–1800: L2 Subzone Accordion)
- Lesen: .claude/reports/current/backend-datenkonsistenz-bericht-2026-03-04.md (Abschnitt 7.3, 8.1)
- Referenz: sensorSubzones/actuatorSubzones computed nutzen zoneMonitorData; Fallback-Logik bei zoneMonitorData null prüfen

REGELN: Kein Breaking Change an bestehendem API-Call. Nur Rendering-Logik anpassen.
```

### Befehl für frontend-dev (Phase 2: Layout)

```
KONTEXT: Monitor L2 Layout soll sich an SubzoneArea/ZonePlate angleichen. Siehe Sektion 7 (UX-Änderungen) in diesem Briefing.

AUFTRAG: In MonitorView.vue L2-Bereich: (1) Zählung nur in Sektionsüberschrift "Sensoren (N)", Subzone-Header ohne Count. (2) Subzone-Header: Name + Status-Dot + KPI-Werte ("23,5°C · 65%"). (3) 40px Abstand zwischen Sektionen (var(--space-10)). (4) "Keine Subzone" nur anzeigen wenn Geräte ohne Subzone. (5) Accordion: ≤4 Subzonen alle offen; >4 nur erste offen.

DATEIEN:
- Bearbeiten: El Frontend/src/views/MonitorView.vue
- Referenz: El Frontend/src/components/zones/SubzoneArea.vue, El Frontend/src/components/dashboard/ZonePlate.vue (Design-Pattern)
- Design: El Frontend/src/styles/tokens.css, El Frontend/src/styles/glass.css

REGELN: AccordionSection aus shared/design/primitives prüfen — ob MonitorView darauf umgestellt werden kann (wie ZonePlate).
```

### Verifizierung
- `cd "El Frontend" && npx vue-tsc --noEmit` — muss fehlerfrei sein
- `cd "El Frontend" && npx vite build` — muss erfolgreich bauen

---

**Referenzen:** frontend-dev Agent, `.claude/reports/current/auftrag-monitor-l2-*.md`, `zonen-subzonen-vollanalyse-bericht-2026-03-04.md`, `backend-datenkonsistenz-bericht-2026-03-04.md`
