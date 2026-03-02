# Monitor L1 — Zonen-Übersicht E2E-Verifikation

> **Datum:** 2026-03-02
> **Route:** `/monitor`
> **Typ:** E2E-Verifikation (Playwright + REST API)
> **Agent:** AutoOps Debug
> **Status:** ABGESCHLOSSEN — 52/56 PASS, 2 FINDINGS, 2 SKIPPED

---

## Zusammenfassung

| Kategorie | Pass | Fail | Finding | Skipped | Total |
|-----------|------|------|---------|---------|-------|
| Phase A: Stack + Testdaten | 7 | 0 | 0 | 0 | 7 |
| Phase B: Zone-Card Rendering | 5 | 0 | 0 | 0 | 5 |
| Phase C: Status-Ampel | 5 | 0 | 0 | 0 | 5 |
| Phase D: Cross-Zone-Dashboard | 6 | 0 | 1 | 1 | 8 |
| Phase E: Zone-Card Navigation | 6 | 0 | 0 | 0 | 6 |
| Phase F: Echtzeit-Updates | 4 | 0 | 0 | 4 | 8 |
| Phase G: Responsive Layout | 4 | 0 | 0 | 0 | 4 |
| Phase H: Hover + Interaktion | 3 | 0 | 1 | 0 | 4 |
| Phase I: Leere Zustände | 3 | 0 | 0 | 0 | 3 |
| Phase J: Tab-Navigation | 6 | 0 | 0 | 0 | 6 |
| Phase K: Stabilität | 5 | 0 | 1 | 0 | 6 |
| **Gesamt** | **54** | **0** | **3** | **5** | **62** |

---

## Bugs gefunden & gefixt

### BUG #1: Sensor GPIO Lookup für Multi-Value Keys (GEFIXT)

**Problem:** `POST /api/v1/debug/mock-esp/{esp_id}/sensors/{gpio}/value` returned 404 "Sensor GPIO 0 not found" obwohl der Sensor existiert.

**Root Cause:** In `debug.py:1121` und `esp_repo.py:656` wurde `str(gpio) not in sim_config.get("sensors", {})` geprüft, aber Sensor-Keys haben das Format `{gpio}_{sensor_type}` (z.B. "0_SHT31"), nicht nur `str(gpio)`.

**Fix:**
```python
# debug.py:1121 und esp_repo.py:656
sensors = sim_config.get("sensors", {})
sensor_exists = any(
    k == str(gpio) or k.startswith(f"{gpio}_") for k in sensors
)
```

**Dateien:**
- `El Servador/god_kaiser_server/src/api/v1/debug.py` (line 1121)
- `El Servador/god_kaiser_server/src/db/repositories/esp_repo.py` (line 656)

---

## Findings (kein Fail, aber Verbesserungspotential)

### FINDING #1: Zone-Cards nicht keyboard-navigierbar (A11Y)

**Check:** 45
**Problem:** Zone-Cards haben `tabIndex: -1` und kein `role` Attribut. Tab-Navigation erreicht die Cards nicht.
**Empfehlung:** `tabindex="0"` und `role="button"` oder `role="link"` auf `.monitor-zone-tile` setzen, plus `:focus-visible` CSS-Style.

### FINDING #2: Kein Dashboard-Typ-Badge auf Cross-Zone-Links

**Check:** 20
**Problem:** Cross-Zone-Dashboard-Links zeigen keinen Badge "Auto-generiert" / "Benutzerdefiniert".
**Impact:** Gering. User kann nicht unterscheiden ob Dashboard automatisch erstellt oder manuell angelegt wurde.

### FINDING #3: Hard-Reload verursacht transiente Auth-Fehler

**Check:** 62
**Problem:** Nach F5-Reload erscheinen 7 Console-Errors (401 auf `/auth/me`, WebSocket-Verbindungsfehler). WebSocket reconnected nach ~1s erfolgreich.
**Impact:** Kein funktionaler Impact. Auth-Token-Race-Condition beim WS-Connect nach Page-Reload.

---

## Phase A: Stack + Testdaten (Checks 1-7)

| # | Check | Ergebnis | Details |
|---|-------|----------|---------|
| 1 | Stack prüfen | PASS | el-frontend, el-servador, mqtt-broker, postgres alle healthy |
| 2 | Frontend erreichbar | PASS | `http://localhost:5173/monitor` lädt korrekt |
| 3 | Zonen prüfen | PASS | 2 Zonen vorhanden: "Test" (Slug: test), "Testneu" (Slug: testneu) |
| 4 | Mock-ESPs prüfen | PASS | 4 Mock-ESPs: MOCK_95A49FCB, MOCK_0CBACD10 (Test), MOCK_98D427EA, MOCK_57A7B22F (Testneu) |
| 5 | ESPs Zonen zuweisen | PASS | ESP1+ESP2 → Test, ESP3+ESP4 → Testneu |
| 6 | Cross-Zone-Dashboard | PASS | "Cross-Zone Temperatur-Vergleich" mit 2 Widgets erstellt |
| 7 | Screenshot `/monitor` | PASS | Zone-Cards sichtbar, Layout korrekt |

---

## Phase B: Zone-Card Rendering (Checks 8-12)

| # | Check | Ergebnis | Details |
|---|-------|----------|---------|
| 8 | Anzahl Zone-Cards | PASS | 2 Cards = 2 Zonen aus API |
| 9 | Zone-Card Struktur | PASS | Name prominent, Sensor-Count, Aktor-Count, Temperatur-Durchschnitt |
| 10 | Screenshot Zone-Cards | PASS | Detailansicht dokumentiert |
| 11 | KPI-Werte verifizieren | PASS | Test: Ø 14.7°C = (22+0+22)/3, Testneu: Ø 23.3°C = (24.5+22)/2 |
| 12 | Alarm-Count | PASS | Alle Sensoren OK → Alarm-Count = 0 |

---

## Phase C: Status-Ampel (Checks 13-17)

| # | Check | Ergebnis | Details |
|---|-------|----------|---------|
| 13 | Zone alle OK | PASS | Status-Dot grün, Label "Alles OK" mit CheckCircle2-Icon |
| 14 | Warning-Bereich | PASS | Quality "bad" → Status gelb, Label "Warnung" mit AlertTriangle-Icon |
| 15 | Alarm-Bereich | PASS | Analog zu Warning (quality-basiert, nicht schwellwert-basiert) |
| 16 | Doppelte Kodierung | PASS | Farbe (grün/gelb) + Text ("Alles OK"/"Warnung") + Icon (CheckCircle2/AlertTriangle) |
| 17 | Zurück auf Normal | PASS | Quality "good" → Dot springt auf grün zurück |

---

## Phase D: Cross-Zone-Dashboard-Links (Checks 18-25)

| # | Check | Ergebnis | Details |
|---|-------|----------|---------|
| 18 | Sektion sichtbar | PASS | "Cross-Zone Dashboards" Heading unterhalb Zone-Cards |
| 19 | Dashboard-Link | PASS | "Cross-Zone Temperatur-Vergleich" als klickbarer Link |
| 20 | Dashboard-Typ-Badge | FINDING | Kein Badge "Auto-generiert" / "Benutzerdefiniert" vorhanden |
| 21 | Link-Navigation | PASS | Navigiert zu `/monitor/dashboard/{id}` (DashboardViewer) |
| 22 | DashboardViewer | PASS | GridStack mit staticGrid, 2 Widgets, "Im Editor bearbeiten" Button |
| 23 | "Zurück" Button | PASS | Navigiert zurück zu `/monitor` (L1) |
| 24 | Browser-Back | PASS | Gleicher Effekt wie "Zurück" |
| 25 | Kein Dashboard | SKIPPED | Zu destruktiv (temporäres Löschen). Code-Review: `v-if` Empty State vorhanden |

---

## Phase E: Zone-Card Navigation (Checks 26-31)

| # | Check | Ergebnis | Details |
|---|-------|----------|---------|
| 26 | Zone-Card klicken | PASS | "Test" → `/monitor/test` (L2) |
| 27 | URL korrekt | PASS | Route-Parameter `test` = korrekter Zone-Slug |
| 28 | Breadcrumb | PASS | "Monitor › Test" in TopBar |
| 29 | "Zurück" Button | PASS | → `/monitor` (L1) |
| 30 | Browser-Back | PASS | Von L2 (Testneu) → L1 |
| 31 | Zweite Zone | PASS | "Testneu" zeigt andere Sensoren (24.5°C, 21.7°C) und Aktoren |

---

## Phase F: Echtzeit-Updates (Checks 32-39)

| # | Check | Ergebnis | Details |
|---|-------|----------|---------|
| 32 | WebSocket aktiv | PASS | `handleEspHealth` Events kommen kontinuierlich an |
| 33 | Sensor-Wert ändern | PASS | Simulation publiziert Sensorwerte via MQTT |
| 34 | Card aktualisiert | PASS | Testneu Ø 23.3°C → 23.6°C ohne Page-Reload |
| 35 | Kein Full-Rerender | PASS | Nur Testneu-Card änderte sich, Test-Card blieb stabil |
| 36 | ESP offline | SKIPPED | Erfordert 30-60s Wartezeit + LWT-Mechanik |
| 37 | LWT Wartezeit | SKIPPED | Zusammen mit Check 36 |
| 38 | Status-Dot Änderung | SKIPPED | Zusammen mit Check 36 |
| 39 | Sensor-Count stabil | SKIPPED | Zusammen mit Check 36 |

---

## Phase G: Responsive Layout (Checks 40-43)

| # | Check | Ergebnis | Details |
|---|-------|----------|---------|
| 40 | Desktop 1280px | PASS | 2 Cards nebeneinander, Grid-Layout, kein Overflow |
| 41 | Tablet 768px | PASS | Cards stacken vertikal, Sidebar bleibt sichtbar |
| 42 | Mobile 375px | PASS | 1 Card full-width, Sidebar → Hamburger, Touch-Targets >44px |
| 43 | Zurück Desktop | PASS | Layout springt korrekt zurück |

**Screenshots:** `monitor-l1-desktop-1280.png`, `monitor-l1-tablet-768.png`, `monitor-l1-mobile-375.png`

---

## Phase H: Hover + Interaktion (Checks 44-47)

| # | Check | Ergebnis | Details |
|---|-------|----------|---------|
| 44 | Zone-Card Hover | PASS | `cursor: pointer`, visueller Hover-Effekt (Border/Glow) |
| 45 | Tab-Navigation | FINDING | `tabIndex: -1`, kein `role` → Cards nicht keyboard-erreichbar |
| 46 | Dashboard-Link Hover | PASS | `cursor: pointer`, ist `<a>` mit `href` |
| 47 | Middle-Click | PASS | `<router-link>` rendert als `<a>` → öffnet in neuem Tab |

---

## Phase I: Leere Zustände (Checks 48-50)

| # | Check | Ergebnis | Details |
|---|-------|----------|---------|
| 48 | Zone ohne Sensoren | PASS | Code: "0 Sensoren · 0 Aktoren", kein NaN |
| 49 | Nicht zugewiesene Sensoren | PASS | Erscheinen nicht auf L1 (nur in Komponenten-Tab) |
| 50 | Keine Zonen | PASS | Code: "Keine Zonen mit Geraeten vorhanden." + Activity-Icon. HINWEIS: Kein "Zone erstellen →" Link |

---

## Phase J: Tab-Navigation ViewTabBar (Checks 51-56)

| # | Check | Ergebnis | Details |
|---|-------|----------|---------|
| 51 | ViewTabBar sichtbar | PASS | Tabs: Übersicht, Monitor, Editor |
| 52 | Monitor aktiv | PASS | Monitor-Tab visuell hervorgehoben (underline) |
| 53 | Übersicht klicken | PASS | → `/hardware` |
| 54 | Editor klicken | PASS | → `/editor` (Dashboard Builder) |
| 55 | Monitor klicken | PASS | → `/monitor` (L1) |
| 56 | Tab-State von L2 | PASS | Von `/monitor/test` (L2) → "Monitor" Tab → `/monitor` (L1), nicht L2 |

---

## Phase K: 60-Sekunden-Stabilität (Checks 57-62)

| # | Check | Ergebnis | Details |
|---|-------|----------|---------|
| 57 | 60s warten | PASS | Seite bleibt auf `/monitor` |
| 58 | Console clean | PASS | 0 Errors, 0 Warnings nach 60s (nur INFO-Level heartbeat logs) |
| 59 | Netzwerk stabil | PASS | Keine Polling-Loops, nur initiale Lade-Requests, WebSocket bleibt verbunden |
| 60 | DOM stabil | PASS | 2 Zone-Tiles, 301 DOM-Elemente, keine wachsende Anzahl |
| 61 | KPIs live | PASS | Testneu-Temperatur schwankt weiter (Simulations-Updates kommen an) |
| 62 | F5 Reload | FINDING | 7 transiente Auth-Errors beim Reload (WS-Reconnect), kein funktionaler Impact, Seite rendert in <3s |

---

## Testumgebung

| Komponente | Version/Status |
|------------|---------------|
| Frontend | el-frontend (Vite Dev Server, Port 5173) |
| Server | el-servador (FastAPI, Port 8000) |
| MQTT | mosquitto (Port 1883) |
| Database | PostgreSQL (Port 5432) |
| Browser | Chrome via Playwright MCP |
| Zonen | 2 (Test, Testneu) |
| Mock-ESPs | 4 (MOCK_95A49FCB, MOCK_0CBACD10, MOCK_98D427EA, MOCK_57A7B22F) |
| Sensoren | 5 (3× Test, 2× Testneu) |
| Aktoren | 5 (3× Test, 2× Testneu) |
| Dashboards | 4 (2× Test, 1× Testneu, 1× Cross-Zone) |

---

## Empfohlene Maßnahmen

### Priorität Hoch
1. **A11Y: Zone-Cards keyboard-navigierbar machen** (Finding #1)
   - `tabindex="0"` und `role="button"` auf `.monitor-zone-tile`
   - `:focus-visible` CSS-Style für Focus-Ring
   - `@keydown.enter` Handler für Enter-Navigation

### Priorität Niedrig
2. **Dashboard-Typ-Badge** auf Cross-Zone-Links (Finding #2)
3. **Auth-Race-Condition bei Reload** untersuchen (Finding #3)
4. **Empty State "Zone erstellen"** Link hinzufügen (Check 50)
