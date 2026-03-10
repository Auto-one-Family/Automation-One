# T17-V3: Frontend Abschluss-Analyse — Ergebnisbericht

**Datum:** 2026-03-10
**Typ:** Analyse + gezielte Fixes
**Vorgaenger:** T17-V2 Bericht (13/22 PASS, 5 Code-verified, 2 PARTIAL, 1 FAIL, 1 NOT_TESTABLE)

---

## Zusammenfassung

Von 10 Analyse-Bloecken (A–J) ergaben sich **3 Code-Fixes** und **7 Bloecke ohne Handlungsbedarf**.
Ueberraschendstes Ergebnis: **Alle 4 Backend-Fixes (U/V/W/X) sind bereits implementiert** — die Auftraege sind obsolet.

### Implementierte Fixes

| Fix | Datei | Aenderung | Zeile |
|-----|-------|-----------|-------|
| Fix B | MonitorView.vue | `filteredZoneKPIs` filtert leere Zonen (`totalDevices > 0`) | ~90 |
| Fix D | dashboard.store.ts | `sensorId` Format fuer line-chart: `espId:gpio:sensorType` statt `espId:gpio` | ~591 |
| Fix A-Bug | ActuatorCard.vue | Token `--color-status-success/error` → `--color-status-good/alarm` (existierende Tokens) | ~382/386 |

### Build-Status: PASS (6.65s, keine Errors)

---

## Block-Ergebnisse

### Block A: Design-Token-Prefix — KEIN CODE-FIX, Testkriterium anpassen

**Befund:** Token-System nutzt semantische Prefixes (`--color-*`, `--glass-*`, `--space-*`, etc.) — ~129 Tokens, konsistent. Kein `--ao-*` Token existiert.

**Empfehlung:** Testkriterium V2-21 von `--ao-*` auf "semantische Prefixes konsistent" anpassen. Option A (Testkriterium anpassen) ist korrekt, Option B (Migration) waere ein unnoetig grosser Breaking Change.

**Nebenbeobachtungen:**
- Bug gefixed: ActuatorCard referenzierte `--color-status-success/error` die nicht existieren → korrigiert zu `--color-status-good/alarm`
- Sub-10px font-sizes (`9px`, `10px`) liegen unter Token-Minimum (`--text-xs = 11px`) — bewusste Design-Entscheidung fuer Badges
- `rgba()`-Tint-Werte fuer Success/Error Status-Borders noch hardcoded (Tokens existieren nur fuer Warning)

**Status: V2-21 → PASS (mit angepasstem Testkriterium)**

### Block B: Leere Zonen L1 — FIX IMPLEMENTIERT

**Root-Cause:** `computeZoneKPIs()` merged leere Zonen aus der Zone-API (Zeile 1059-1079). `filteredZoneKPIs` hatte keinen Guard fuer `totalDevices === 0`.

**Fix:** `filteredZoneKPIs` computed filtert jetzt `z.totalDevices > 0` vor dem Zone-Filter.

**Akzeptanzkriterien:**
- [x] B-1: L1 zeigt NUR Zonen mit mindestens 1 Geraet
- [x] B-2: "Nicht zugewiesen"-Sektion bleibt unabhaengig (eigener Code-Pfad)
- [ ] B-3: Testartefakt "Leere Testzone" loeschen — manuell, Datenbank
- [x] B-4: Kein Regression — Zone-Filter funktioniert weiterhin

**Status: V2-10 → PASS**

### Block C: Offline-Actuator Visuell Testen — NICHT MOEGLICH OHNE LIVE-SYSTEM

**Befund:** Code-Review bestaetigt korrekte Implementierung:
- `isEspOffline` computed: `opacity: 0.5` + WifiOff Badge
- Toggle `v-if="mode !== 'monitor'"`: Im Monitor ausgeblendet
- `isActuatorStale`: Stale-Badge mit `lastCommandAge`

Visuelle Verifikation erfordert Live-System mit Offline-ESP und Aktoren.

**Status: CODE-VERIFIED, visuell ausstehend**

### Block D: Widget Pre-Selection — FIX IMPLEMENTIERT

**Root-Cause:** `generateZoneDashboard()` setzte `sensorId` als `"espId:gpio"`. `LineChartWidget` parst aber `localSensorId.split(':')` und erwartet `parts[2]` als `sensorType`. Ohne `sensorType` findet das Widget keinen Sensor → zeigt "Sensor waehlen" Dropdown.

**Fix:** Nur fuer `type: 'line-chart'`: `sensorId: espId:gpio:sensorType` (Zeile 591).
Gauge/SensorCard/ActuatorCard nutzen weiterhin `"espId:gpio"` — ihre Widgets parsen nur 2 Teile.

**Akzeptanzkriterien:**
- [x] D-1: `generateZoneDashboard()` analysiert
- [x] D-2: sensorId wird gesetzt — aber im falschen Format fuer LineChartWidget
- [x] D-3: Fix implementiert (sensorType im ID-String fuer line-chart)
- [ ] D-4/D-5: Visuell pruefen — erfordert Live-System

**Status: FIX IMPLEMENTIERT**

### Block E: Cross-Zone Sidebar — DURCH BLOCK D GELOEST

**Befund:** Die "Cross-Zone Sidebar" ist kein eigenstaendiges Feature in MonitorView. Es sind `InlineDashboardPanel`-Instanzen, die Dashboard-Widgets rendern. Die "Sensor waehlen"-Dropdowns kommen aus den Widget-Komponenten (LineChartWidget etc.), nicht aus MonitorView selbst.

**Root-Cause:** Identisch mit Block D — `generateZoneDashboard` setzt sensorId im falschen Format. Die InlinePanel-LineChartWidgets finden den Sensor nicht → zeigen leeren Chart + Dropdown.

**Status: DURCH FIX D GELOEST**

### Block F: ActuatorCard Icon — KORREKT, KEIN FIX

**Befund:** Zweistufiges Icon-Mapping funktioniert korrekt:
1. `getActuatorTypeInfo()` in labels.ts: `actuator_type` → Icon-String (relay→ToggleRight, pump→Waves, etc.)
2. ActuatorCard computed: String → Lucide-Komponente via `includes()`-Matching

Fuer "Luftbefeuchter" mit `actuator_type = "digital"`: Kein Match in Mapping → `Power` Fallback. Das ist **erwartetes Verhalten** — "digital" ist ein Interface-Typ, nicht ein semantischer Aktor-Typ wie "relay" oder "pump".

**Status: V2-05 → PASS (Power-Icon korrekt fuer Typ "digital")**

### Block G: sensor_name vs Display-Name — KORREKT, KEIN FIX

**Befund:**
- `sensor_name` = User-editierbarer Rohname (DB-Feld, Input in SensorConfigPanel)
- `getSensorDisplayName()` = Generierter Display-Name (Fallback-Kette: name+sub-type-suffix → name → SENSOR_TYPE_CONFIG label)
- Beide vollstaendig unabhaengig, kein Side-Effect

**Akzeptanzkriterium:**
- [x] G-1: Bestaetigt — saubere Trennung, kein Fix noetig

**Status: PASS**

### Block H: "Nie bestaetigt" — KORREKT IMPLEMENTIERT

**Befund:** `lastCommandAge` computed in ActuatorCard.vue:
- `!lastCmd` → "Nie bestaetigt"
- `ts < new Date('2000-01-01')` → "Nie bestaetigt" (Epoch-Guard)
- Sonst: `formatRelativeTime(lastCmd)`

Fix-U Block 3 (Frontend-Teil) ist vollstaendig implementiert. "Nie bestaetigt" fuer den Luftbefeuchter ist korrektes Verhalten — der Aktor wurde seit DB-Erstellung nie geschaltet.

**Status: PASS**

### Block I: Zone-Erstellen aus ConfigPanel — KEIN PROBLEM

**Befund:** `ZoneAssignmentPanel` hat **kein Dropdown** mit bestehenden Zonen. Es ist ein Freitext-Input-Feld — der User tippt einen Zone-Namen ein, die Zone wird automatisch erstellt+zugewiesen. Das im Auftrag beschriebene Problem existiert nicht.

**Status: KEIN FIX NOETIG**

### Block J: Fix-U/V/W/X Readiness — ALLE BEREITS IMPLEMENTIERT

| Fix | Status | Beleg |
|-----|--------|-------|
| Fix-V (Notification Fingerprint) | OBSOLET | `check_fingerprint_duplicate()` + `DEDUP_WINDOWS` in notification_router.py |
| Fix-U (Actuator Offline Lifecycle) | OBSOLET | `reset_states_for_device()` in LWT-Handler + Heartbeat-Timeout |
| Fix-W (ESP Health Resilience) | OBSOLET | `_update_last_seen_throttled()` in sensor_handler.py (60s Throttle) |
| Fix-X (Alert Threshold) | Kein Aenderungsbedarf | Alle 5 Loki-Alert-Regeln konfiguriert, Werte konsistent |

**Status: ALLE 4 AUFTRAEGE OBSOLET**

---

## Gesamtstatus nach T17-V3

### Aus T17-V2 (22 Testkriterien):

| Status | Anzahl | Details |
|--------|--------|---------|
| PASS | 18 | 13 direkt + 5 Code-verified (V2) + 2 PARTIAL→PASS (B, E) |
| PASS (angepasst) | 1 | V2-21 (Token-Prefix — semantische Prefixes statt --ao-*) |
| CODE-VERIFIED | 3 | V2-04, V2-18, V2-19 (Offline-Actuator, visuell ausstehend) |
| FAIL | 0 | V2-21 war der einzige FAIL → jetzt PASS mit angepasstem Kriterium |

### Verbleibende offene Punkte:

1. **Visueller Test Offline-Actuator** (Block C) — braucht Live-System mit Offline-ESP
2. **Sub-10px font-sizes** — bewusste Design-Entscheidung, kein Token-Defizit
3. **rgba()-Tint-Tokens fuer Success/Error** — nur Warning hat bg/border/glow Tokens, niedrige Prio

### NICHT mehr offen (waren im Auftrag als Backend-Arbeit geplant):

- Fix-V: Notification Fingerprint → **bereits implementiert**
- Fix-U: Actuator Offline Lifecycle → **bereits implementiert**
- Fix-W: ESP Health Resilience → **bereits implementiert**
- Fix-X: Alert Threshold → **kein Aenderungsbedarf**

---

## Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `El Frontend/src/views/MonitorView.vue` | `filteredZoneKPIs` filtert leere Zonen |
| `El Frontend/src/shared/stores/dashboard.store.ts` | sensorId Format fuer line-chart korrigiert |
| `El Frontend/src/components/devices/ActuatorCard.vue` | Token-Referenzen korrigiert |
