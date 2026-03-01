# Monitor Ebene 1 — Verifikationsbericht

## Zusammenfassung
- **Datum/Uhrzeit:** 2026-03-01, 15:37–15:48 UTC
- **Stack-Status:** ALL UP (el-frontend, el-servador, mqtt-broker, postgres + 8 weitere Services)
- **Datenbestand:** 4 Devices, 2 Zonen, 3 Sensoren (DB), 0 Aktuatoren (DB), 3 Sim-Aktuatoren
- **Gesamtergebnis:** **PARTIAL** — Layout und Design-Tokens einwandfrei, aber 2 Daten-Bugs gefunden

---

## Detailergebnisse

### Phase 1: Datengrundlage

**Devices (4 total):**
| Device ID | Status | Zone | Sensors | Actuators | Last Seen |
|-----------|--------|------|---------|-----------|-----------|
| MOCK_95A49FCB | online | Test | 1 (SHT31) | 2 (pump sim) | 2026-03-01T15:36:25Z |
| MOCK_0CBACD10 | offline | Test | 2 (DS18B20, SHT31) | 0 | 2026-02-27T18:40:11Z |
| MOCK_98D427EA | online | Testneu | 0 | 1 (pump sim) | 2026-03-01T15:36:25Z |
| MOCK_57A7B22F | online | Testneu | 0 | 0 | 2026-03-01T15:36:25Z |

**Zones (2):**
- **Test:** 2 Devices, 3 Sensoren (1 online, 1 offline Device), 2 Sim-Aktoren
- **Testneu:** 2 Devices, 0 Sensoren, 1 Sim-Aktor

**Sensoren (DB):**
| Sensor | ESP | Type | raw_value (DB) | quality (DB) | last_read (DB) |
|--------|-----|------|----------------|--------------|----------------|
| SHT31_0 | MOCK_95A49FCB | sht31 | None | None | N/A |
| SHT31_0 | MOCK_0CBACD10 | sht31 | None | None | N/A |
| Temp 0C79 | MOCK_0CBACD10 | ds18b20 | None | None | N/A |

**Frontend Store-Daten (via Pinia):**
- MOCK_95A49FCB/SHT31: raw_value=22, quality="good", **last_read="+058134-06-23T18:29:37.000Z"** ← BUG
- MOCK_0CBACD10/DS18B20: raw_value=0, quality="good", last_read=null
- MOCK_0CBACD10/SHT31: raw_value=22, quality="good", last_read=null

**Dashboard-Store:** Keine Cross-Zone-Dashboards vorhanden.

---

### Phase 2: System-Summary-Header

| Prüfpunkt | Erwartet | Tatsächlich | Status |
|-----------|----------|-------------|--------|
| Summary-Text | "2 Zonen · 3/3 Sensoren online" | "2 Zonen · 3/3 Sensoren online" | ✅ PASS |
| Alarm-Text | Nicht sichtbar (keine Alarme) | Nicht sichtbar | ✅ PASS |
| Font-Size | var(--text-sm) = 12px | 12px | ✅ PASS |
| Color | var(--color-text-secondary) = #8585a0 | rgb(133,133,160) = #8585a0 | ✅ PASS |

### Phase 2: ViewTabBar

| Prüfpunkt | Erwartet | Tatsächlich | Status |
|-----------|----------|-------------|--------|
| Tab-Count | 3 | 3 | ✅ PASS |
| Tab-Labels | Übersicht, Monitor, Editor | Übersicht, Monitor, Editor | ✅ PASS |
| Monitor aktiv | isActive=true | isActive=true | ✅ PASS |
| Alter Titel entfernt | Kein "Sensor & Aktor Monitoring" | Nicht vorhanden | ✅ PASS |
| Alter Subtitle entfernt | Kein "Echtzeit-Daten aller Zonen" | Nicht vorhanden | ✅ PASS |

### Phase 2: Zone-Tiles

#### Zone "Test"

| Prüfpunkt | Erwartet | Tatsächlich | Status |
|-----------|----------|-------------|--------|
| CSS-Klasse | monitor-zone-tile--ok | monitor-zone-tile--ok | ✅ PASS |
| Border-left | var(--color-success) = #34d399 | rgb(52,211,153) | ✅ PASS |
| Background | var(--color-bg-tertiary) = #15151f | rgb(21,21,31) | ✅ PASS |
| Border-radius | var(--radius-md) = 10px | 10px | ✅ PASS |
| Zone-Name | "Test" | "Test" | ✅ PASS |
| Name font-size | var(--text-base) = 14px | 14px | ✅ PASS |
| Name color | var(--color-text-primary) = #eaeaf2 | rgb(234,234,242) | ✅ PASS |
| Status-Text | "Alles OK" | "Alles OK" | ✅ PASS |
| Status-Klasse | zone-status--ok | zone-status--ok | ✅ PASS |
| Status-Farbe | var(--color-success) | rgb(52,211,153) | ✅ PASS |
| KPI-Label | "Temperatur" (uppercase) | "Temperatur" | ✅ PASS |
| KPI-Label Size | 10px | 10px | ✅ PASS |
| KPI-Label Transform | uppercase | uppercase | ✅ PASS |
| KPI-Value | Ø mit korrektem Durchschnitt | "Ø 0.0°C" | ⚠️ BUG (siehe #2) |
| KPI-Value Font | var(--font-mono) = JetBrains Mono | JetBrains Mono | ✅ PASS |
| KPI-Value Size | var(--text-lg) = 16px | 16px | ✅ PASS |
| Sensor-Count | 3/3 Sensoren | "3/3 Sensoren" | ✅ PASS |
| Sensor-Count-Klasse | --ok (grün) | monitor-zone-tile__count--ok | ✅ PASS |
| Aktor-Count | 0/2 Aktoren | "0/2 Aktoren" | ✅ PASS |
| Aktor-Count-Klasse | muted (keine aktiven) | muted | ✅ PASS |
| Footer border-top | var(--glass-border) | rgba(255,255,255,0.06) | ✅ PASS |
| Letzte Aktivität | Relatives Format | "25.06.58134, 22:29" | ❌ BUG (siehe #1) |
| Clock-Icon | Vorhanden | w-3 h-3 lucide-clock | ✅ PASS |
| Cursor | pointer | pointer | ✅ PASS |
| Klick-Navigation | /monitor/test | /monitor/test ✓ | ✅ PASS |

#### Zone "Testneu"

| Prüfpunkt | Erwartet | Tatsächlich | Status |
|-----------|----------|-------------|--------|
| CSS-Klasse | monitor-zone-tile--ok | monitor-zone-tile--ok | ✅ PASS |
| Border-left | var(--color-success) = #34d399 | rgb(52,211,153) | ✅ PASS |
| Zone-Name | "Testneu" | "Testneu" | ✅ PASS |
| Status-Text | "Alles OK" | "Alles OK" | ✅ PASS |
| Empty-State | "Keine Sensordaten" | "Keine Sensordaten" | ✅ PASS |
| Sensor-Count | 0/0 Sensoren (muted) | "0/0 Sensoren" (muted) | ✅ PASS |
| Aktor-Count | 0/1 Aktoren (muted) | "0/1 Aktoren" (muted) | ✅ PASS |
| Letzte Aktivität | "Gerade eben" | "Gerade eben" / "vor 30 Sekunden" | ✅ PASS |
| Klick-Navigation | /monitor/testneu | /monitor/testneu ✓ | ✅ PASS |

### Phase 2: Cross-Zone-Dashboards

| Prüfpunkt | Erwartet | Tatsächlich | Status |
|-----------|----------|-------------|--------|
| Sektion sichtbar | Nein (0 Dashboards) | Nicht im DOM | ✅ PASS |

### Phase 2: Logic Rules Platzhalter

| Prüfpunkt | Erwartet | Tatsächlich | Status |
|-----------|----------|-------------|--------|
| HTML-Kommentar | "Logic Rules" im HTML | Vorhanden | ✅ PASS |
| Kein UI-Element | Nicht sichtbar | Nicht sichtbar | ✅ PASS |

### Phase 2: Breadcrumb

| Route | Erwartet | Tatsächlich | Status |
|-------|----------|-------------|--------|
| /monitor | "Monitor" | "Monitor" | ✅ PASS |
| /monitor/test | "Monitor > Test" | "Monitor > › > test" | ⚠️ MINOR: zone_id statt zone_name |

---

### Phase 3: Responsive

| Viewport | Columns | Grid-Breite | Screenshot | Status |
|----------|---------|-------------|------------|--------|
| Mobile 375×667 | 1 (343px) | 343px | monitor-l1-mobile.png | ✅ PASS |
| Tablet 768×1024 | 1 (480px)* | 480px | monitor-l1-tablet.png | ✅ PASS* |
| Desktop 1280×800 | 3 (320px ea.) | 992px | monitor-l1-desktop.png | ✅ PASS |
| Widescreen 1920×1080 | 5 (314px ea.) | 1632px | monitor-l1-widescreen.png | ✅ PASS |

*Tablet zeigt 1 Spalte weil Sidebar ~230px Content-Breite reduziert. Mit eingeklappter Sidebar wären 2 Spalten möglich. Kein Bug.

---

### Phase 4: Live-Daten (T=0 vs T=60)

**T=0 (15:43:30 UTC):**
| Zone | KPI | Status | Activity |
|------|-----|--------|----------|
| Test | Ø 0.0°C | Alles OK | 25.06.58134, 05:49 |
| Testneu | Keine Sensordaten | Alles OK | Gerade eben |
| Summary | 2 Zonen · 3/3 Sensoren online | - | - |

**T=60 (15:44:37 UTC):**
| Zone | KPI | Status | Activity |
|------|-----|--------|----------|
| Test | Ø 0.0°C | Alles OK | 25.06.58134, 22:29 |
| Testneu | Keine Sensordaten | Alles OK | Gerade eben |
| Summary | 2 Zonen · 3/3 Sensoren online | - | - |

**Befunde:**
- KPI-Werte **unverändert** (Ø 0.0°C bleibt stabil) — bedingt durch Bug #2
- Activity-Timestamp für "Test" ändert sich (neuer korrupter Timestamp) — Bug #1
- Activity für "Testneu" bleibt frisch ("Gerade eben") dank Heartbeat-Updates ✅
- WebSocket verbunden ✅, Heartbeat-Events alle 60s ✅
- Keine `sensor_data` WebSocket-Events sichtbar — Daten kommen nur per API-Refresh
- Stale-Detection: `activityStale=false` für Test weil korrupter Timestamp in Zukunft liegt

---

### Phase 5: Design-Token-Konformität

| CSS-Eigenschaft | Erwartet | Tatsächlich | Status |
|-----------------|----------|-------------|--------|
| .monitor-zone-tile background | var(--color-bg-tertiary) = #15151f | rgb(21,21,31) ✓ | ✅ PASS |
| .monitor-zone-tile border | var(--glass-border) | rgba(255,255,255,0.06) ✓ | ✅ PASS |
| .monitor-zone-tile border-radius | var(--radius-md) = 10px | 10px ✓ | ✅ PASS |
| .monitor-zone-tile__name font-size | var(--text-base) = 14px | 14px ✓ | ✅ PASS |
| .monitor-zone-tile__name color | var(--color-text-primary) = #eaeaf2 | rgb(234,234,242) ✓ | ✅ PASS |
| .monitor-zone-tile__kpi-value font | var(--font-mono) = JetBrains Mono | "JetBrains Mono" ✓ | ✅ PASS |
| .monitor-zone-tile__kpi-value size | var(--text-lg) | 16px ✓ | ✅ PASS |
| .monitor-zone-tile__kpi-label size | 10px, uppercase, muted | 10px, uppercase, rgb(72,72,96) ✓ | ✅ PASS |
| .monitor-zone-tile__footer border-top | var(--glass-border) | rgba(255,255,255,0.06) ✓ | ✅ PASS |
| Summary font-size | var(--text-sm) | 12px ✓ | ✅ PASS |
| Summary color | var(--color-text-secondary) = #8585a0 | rgb(133,133,160) ✓ | ✅ PASS |
| Status success | #34d399 | rgb(52,211,153) ✓ | ✅ PASS |
| Hardcoded Hex-Werte | Keine | Keine gefunden ✓ | ✅ PASS |
| Dark-Theme-Only | Keine light Styles | Keine gefunden ✓ | ✅ PASS |
| Glassmorphism | --color-bg-tertiary, kein glass-panel | bg-tertiary ✓ | ✅ PASS |

**Ergebnis: 100% Design-Token-Konformität. Alle Styles nutzen CSS-Variablen.**

---

### Phase 6: Pattern-Konsistenz (Cross-View-Vergleich)

| Aspekt | MonitorView | HardwareView | Konsistent? |
|--------|-------------|--------------|-------------|
| getESPStatus() | ✅ Verwendet | ✅ Verwendet | ✅ JA |
| aggregateZoneSensors() | ✅ Verwendet | Nicht verwendet (eigene Zone-Summary) | N/A |
| Zone "Test" Temp-Display | Ø 0.0°C | Ø 0.0°C | ✅ JA |
| Zone "Testneu" Warning-Badge | Nicht vorhanden | ⚠ 1 sichtbar | ⚠️ Inkonsistenz |
| Farb-Kodierung (grün/gelb/rot) | success/warning/error | success/warning/error | ✅ JA |
| Font-Sizes | text-base, text-lg, text-xs | text-base, text-lg, text-xs | ✅ JA |

**Hinweis:** HardwareView zeigt "⚠ 1" Warning-Badge für Zone "Testneu" (ohne Sensoren), MonitorView zeigt "Alles OK". Die Logik unterscheidet sich in der Berechnung der Warnungen.

---

### Phase 7: Edge Cases

| Edge Case | Vorhanden? | Befund | Status |
|-----------|------------|--------|--------|
| Zone nur Aktoren (Testneu) | Ja | "Keine Sensordaten", Aktor-Count korrekt (0/1), Status "Alles OK" | ✅ PASS |
| Zone mit offline Device (Test) | Ja | Offline-Device-Sensoren werden aggregiert (quality="good") | ⚠️ Fraglich |
| >6 Zonen | Nein (2 Zonen) | Nicht testbar | ⏭️ SKIP |
| Langer Zone-Name | Nein (kurze Namen) | Nicht testbar | ⏭️ SKIP |
| Empty State (0 Zonen) | Nein (2 Zonen) | Nicht testbar | ⏭️ SKIP |

---

## Gefundene Probleme

| # | Schwere | Beschreibung | Root Cause | Betroffene Stelle |
|---|---------|--------------|------------|-------------------|
| 1 | **HOCH** | Letzte Aktivität zeigt korrupten Timestamp "25.06.58134, 22:29" statt relativem Format | Sensor `last_read` im Frontend Store enthält `"+058134-06-23T18:29:37.000Z"` — Server generiert falschen ISO-Timestamp für Sensor-Data-Events (vermutlich Unix-Seconds als Milliseconds interpretiert) | Server: sensor_data Event-Handler → Frontend Store: `device.sensors[].last_read` → [MonitorView.vue:392](El Frontend/src/views/MonitorView.vue#L392) |
| 2 | **MITTEL** | KPI zeigt "Ø 0.0°C" — SHT31-Sensoren werden aus Aggregation ausgeschlossen | `getSensorAggCategory("SHT31")` → `"sht31".includes('temp')` = false → return 'other' → Skip. Nur DS18B20 (raw=0) wird gezählt. SHT31 Base-Type ist kein erkannter Kategorie-Name. | [sensorDefaults.ts:1041-1054](El Frontend/src/utils/sensorDefaults.ts#L1041-L1054) |
| 3 | **NIEDRIG** | Breadcrumb auf L2 zeigt zone_id ("test") statt zone_name ("Test") | Router übergibt `zoneId` an Breadcrumb, aber kein Lookup auf `zoneName` | [MonitorView.vue](El Frontend/src/views/MonitorView.vue) L2-Breadcrumb + TopBar |
| 4 | **NIEDRIG** | Stale-Detection für Zone "Test" inaktiv obwohl Daten de facto stale | `isZoneStale()` berechnet negative Age (Zukunfts-Timestamp) → false. Folgebug von #1. | [MonitorView.vue:429-432](El Frontend/src/views/MonitorView.vue#L429-L432) |
| 5 | **INFO** | HardwareView zeigt ⚠ für Testneu, MonitorView zeigt "Alles OK" | Unterschiedliche Warning-Logik zwischen Views | Cross-View Inkonsistenz |

### Fix-Vorschläge

**Bug #1 (Server-Timestamp):**
- Server prüfen: `sensor_handler.py` — wie wird `last_read` / `last_reading_at` generiert?
- Vermutlich: Unix-Timestamp in Sekunden (1772379xxx) wird direkt in `datetime.fromtimestamp()` übergeben, aber der Wert ist in Millisekunden → Division durch 1000 fehlt

**Bug #2 (SHT31-Aggregation):**
```typescript
// Fix in sensorDefaults.ts:getSensorAggCategory()
function getSensorAggCategory(sensorType: string): AggCategory {
  const lower = sensorType.toLowerCase()
  if (lower.includes('temp') || lower === 'ds18b20') return 'temperature'
  if (lower.includes('humid')) return 'humidity'
  // ADD: Multi-value sensor base types
  if (lower === 'sht31' || lower === 'bme280' || lower === 'dht22') return 'temperature'
  // ...
}
```

---

## Screenshots

| Datei | Beschreibung |
|-------|-------------|
| monitor-l1-desktop-initial.png | Desktop 1280×800, Initial-Ansicht nach Login |
| monitor-l1-mobile.png | Mobile 375×667, volle Seite |
| monitor-l1-tablet.png | Tablet 768×1024 |
| monitor-l1-desktop.png | Desktop 1280×800 (T=0) |
| monitor-l1-widescreen.png | Widescreen 1920×1080 |
| monitor-l1-t0.png | T=0 Messung (Baseline) |

---

## Gesamtbewertung

### Bestanden (PASS)
- ✅ ViewTabBar korrekt, alte Titel entfernt
- ✅ System-Summary-Header Format und Zählung korrekt
- ✅ Zone-Tile Grundstruktur, CSS-Klassen, Border-Farben
- ✅ Status-Ampel korrekte Farben und Texte
- ✅ Zone-Tile Klick-Navigation (L1 → L2 → L1)
- ✅ Cross-Zone-Dashboard Sektion korrekt ausgeblendet (0 Dashboards)
- ✅ Logic Rules Platzhalter vorhanden
- ✅ Responsive Grid (1/3/5 Spalten korrekt)
- ✅ 100% CSS-Variable-Nutzung, keine Hardcoded Hex-Werte
- ✅ Dark-Theme-Only, keine Light-Mode Styles
- ✅ JetBrains Mono Font für KPI-Values
- ✅ Clock-Icon, Cursor-Pointer, Hover-Transition
- ✅ Empty-State "Keine Sensordaten" für Zone ohne Sensoren
- ✅ Heartbeat-Updates über WebSocket fließen korrekt

### Nicht bestanden (FAIL)
- ❌ Timestamp-Korruption in `last_read` (Server-Bug, High)
- ❌ SHT31 aus KPI-Aggregation ausgeschlossen (Frontend-Bug, Medium)

### Weitere Befunde
- ⚠️ Breadcrumb zeigt zone_id statt zone_name auf L2
- ⚠️ Stale-Detection durch korrupten Timestamp ausgehebelt
- ⚠️ Cross-View Warning-Inkonsistenz (HardwareView vs MonitorView)
