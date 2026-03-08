# Auftrag T01: Ghost-Mock Bug-Fix + HardwareView L1 Layout-Optimierung

> **Erstellt:** 2026-03-07
> **Ziel-Repo:** auto-one
> **Typ:** Bug-Fix (Backend, 5 Fixes in 2 Bug-Ketten + 2 Einzel-Bugs) + Layout-Optimierung (Frontend, Command Strip + Empty State + Modal)
> **Prioritaet:** KRITISCH — Bugs blockieren jeden weiteren Trockentest
> **Aufwand:** ~6-8h (Teil 1: ~4h Bug-Fix, Teil 2: ~2-4h Layout)
> **Voraussetzung:** Docker-Stack laeuft, frische DB (nur admin-User), Playwright MCP verfuegbar
> **Kontext:** Erster Trockentest (T01) der systematischen View-Verifikation. Frische DB, nur User konfiguriert. Das System zeigt trotzdem einen Pending Device und einen Alert.

---

## Ausgangslage

Nach einem DB-Cleanup (Backup: `backups/automationone_pre_cleanup_20260307_114106.sql.gz`) zeigt das Frontend auf `/hardware`:

- Header: `0 Online`, `0 Offline`, `Alle 0`, `Mock 0`
- ABER: Alert-Badge zeigt `1` (Grafana: "Sensordaten veraltet")
- ABER: Geraete-Button zeigt `1 offen` statt `Geraete`
- Im Geraete-Dialog Tab "Wartend": 1 Device `MOCK_3410D29D` mit Status "Gut"

**Das ist falsch.** Bei einer frischen DB darf KEIN Device existieren.

---

## TEIL 1: Bug-Analyse und Fix (Backend)

### Bug 1 — Ghost-Mock durch 2-Bug-Kette: SimulationScheduler + heartbeat_handler (KRITISCH)

**Was passiert ist:**
Ein Mock-ESP `MOCK_3410D29D` tauchte immer wieder als "Pending Device" im Frontend auf, obwohl niemand ihn erstellt hat und die DB bereinigt wurde.

**Ursache — 2-Bug-Kette:**

**Bug 1a: SimulationScheduler ueberlebt DB-Cleanup.**
Der SimulationScheduler laeuft in-memory im Server-Prozess. Als die DB bereinigt wurde, wurden die Mock-ESP-Eintraege aus PostgreSQL geloescht — aber der Scheduler wusste davon nichts und sendete weiterhin Heartbeats fuer seine Mocks ueber MQTT.

**Bug 1b: heartbeat_handler registriert mit falschem hardware_type.**
In `heartbeat_handler.py`, Methode `_auto_register_esp()`:
```python
new_esp = ESPDevice(
    device_id=esp_id,
    hardware_type="ESP32_WROOM",  # ← Hardcoded, ignoriert MOCK_ Prefix
    status="pending_approval",
    ...
)
```
Der Handler erkennt einen Heartbeat von einem unbekannten Device und registriert es automatisch neu — aber mit `hardware_type="ESP32_WROOM"` statt `"MOCK_ESP32"`. Dadurch wird der Mock als echtes Pending Device angezeigt (die Mock-API filtert nach `hardware_type=MOCK_ESP32` und findet ihn nicht).

**Chronologischer Ablauf des Bugs:**
1. Mock `MOCK_3410D29D` wurde per Debug-API erstellt (11:01:24)
2. SimulationScheduler startet Heartbeat-Simulation (60s Intervall)
3. User loescht alle DB-Daten (Cleanup ~12:00)
4. SimulationScheduler laeuft WEITER (In-Memory, kennt keinen DB-Zustand)
5. Naechster Heartbeat (12:42:24) → heartbeat_handler findet kein Device in DB
6. `_auto_register_esp()` erstellt neuen DB-Eintrag mit `hardware_type="ESP32_WROOM"` (falsch!)
7. Ghost hat `status=pending_approval` → Frontend zeigt "1 offen"
8. Grafana feuert Alert "Sensordaten veraltet" (Alert-Badge zeigt 1)
9. **Server-Restart → Scheduler recovered Mocks aus DB → Schleife beginnt von vorn**

Punkt 9 ist besonders kritisch: Selbst ein Server-Neustart loest das Problem nicht, weil der Scheduler die (jetzt falsch kategorisierten) Mocks aus der DB wiederherstellt und erneut Heartbeats sendet.

**Beweis aus Loki-Logs:**
```
{compose_service="el-servador"} |~ "MOCK_3410D29D"
```
Zeigt: `[AUTO-HB] MOCK_3410D29D heartbeat published (state=SAFE_MODE)` alle 60 Sekunden + `Sensor 0_sht31 not in config` und `Sensor 4_DS18B20 not in config` alle ~30 Sekunden.

**Beweis aus DB:**
```sql
SELECT device_id, hardware_type, status, zone_id FROM esp_devices;
-- MOCK_3410D29D | ESP32_WROOM | pending_approval | NULL
```

**Bisheriger Workaround (manuell, nicht permanent):**
1. Simulation gestoppt via `POST /api/v1/debug/load-test/stop` — damit sendet der Scheduler keine Heartbeats mehr
2. Ghost-Eintrag manuell aus `esp_devices` geloescht
3. Nach 30 Sekunden verifiziert — kein neuer Ghost erschienen

Dieser Workaround ist NICHT nachhaltig. Beim naechsten Mal, wenn ein Mock aus der DB geloescht wird ohne vorher die Simulation zu stoppen, passiert dasselbe wieder.

**SOLL — 3 Fixes (alle noetig, keiner allein reicht):**

**Fix 1a: SimulationScheduler Cleanup bei Device-Delete.**
Wenn ein Mock-Device ueber die Debug-API geloescht wird (`DELETE /debug/mock-esp/{id}`), MUSS der SimulationScheduler die In-Memory-Simulation fuer dieses Device ebenfalls stoppen.

**Wo suchen:** Die Debug-API-Route fuer `DELETE /debug/mock-esp/{id}` (wahrscheinlich in `api/v1/debug.py` oder `api/debug.py`). Der Handler muss nach dem DB-Delete auch den Scheduler informieren. Der Scheduler hat vermutlich eine Methode wie `stop_simulation(esp_id)` oder `remove_device(esp_id)` — wenn nicht, muss eine erstellt werden.

**Fix 1b: DB-Abgleich bei Server-Start.**
Beim Server-Start sollte der SimulationScheduler pruefen ob seine In-Memory-Devices noch in der DB existieren. Devices die in der DB nicht (mehr) vorhanden sind, muessen aus dem Scheduler entfernt werden. Das verhindert Ghosts nach DB-Restores, manuellen Cleanups und Backup-Wiederherstellungen.

**Fix 1c: `_auto_register_esp()` — MOCK-Prefix-Erkennung.**
Wenn `_auto_register_esp()` ein Device mit `MOCK_` oder `ESP_MOCK_` Prefix registriert, muss:
- `hardware_type` auf `"MOCK_ESP32"` gesetzt werden (nicht `"ESP32_WROOM"`)
- `status` auf `"online"` oder `"approved"` gesetzt werden (nicht `"pending_approval"`)

Mocks sind per Definition vertrauenswuerdig — der Pending-Approval-Flow ist ein Sicherheits-Gate fuer echte Hardware (nur genehmigte ESP32-Geraete duerfen ins Netzwerk). Mocks brauchen dieses Gate nicht.

**Warum alle 3 Fixes noetig sind:**
- Nur Fix 1a → Hilft nicht bei DB-Restore/manuellem Cleanup
- Nur Fix 1b → Hilft nicht wenn Mock waehrend Laufzeit geloescht wird
- Nur Fix 1c → Ghost wird immer noch erstellt, nur mit korrektem Typ (besser, aber Symptombehandlung)
- Alle 3 zusammen → Kein Ghost-Mock mehr moeglich, egal wie DB bereinigt wird

**Loki-Query zur Verifikation nach Fix:**
```
{compose_service="el-servador"} |~ "MOCK_3410D29D" | json | level="WARNING"
```
→ Muss LEER sein nach Fix (keine Heartbeats, keine "not in config" Warnungen).

---

### Bug 2 — Falscher hardware_type bei Auto-Discovery (in Fix 1c integriert)

> **Hinweis:** Dieser Bug ist der zweite Teil der Ghost-Mock-Kette und wird durch Fix 1c adressiert. Hier nochmal die Details zur Frontend-Auswirkung.

**IST-Zustand:**
Die Mock-API (`list_mock_esps` / `esp_repo.get_all_mock_devices()`) filtert nach `hardware_type = 'MOCK_ESP32'`. Wenn ein Ghost-Mock mit `hardware_type = 'ESP32_WROOM'` in der DB steht, findet die Mock-API ihn NICHT. Konsequenz:

- Frontend zeigt `Mock 0` (Mock-Filter findet nichts)
- Frontend zeigt `1 offen` im Geraete-Button (Pending-Devices-API findet ihn als "echtes" Pending Device)
- Der Ghost erscheint im "Wartend"-Tab als wuerde ein echtes ESP32-Geraet auf Genehmigung warten

**SOLL (Pseudocode fuer Fix 1c):**
```python
def _auto_register_esp(esp_id, payload, ...):
    is_mock = esp_id.startswith("MOCK_") or esp_id.startswith("ESP_MOCK_")

    new_esp = ESPDevice(
        device_id=esp_id,
        hardware_type="MOCK_ESP32" if is_mock else payload.get("hardware_type", "ESP32_WROOM"),
        status="online" if is_mock else "pending_approval",
        ...
    )
```

**Akzeptanzkriterium:** Nach Fix darf kein Mock-Device mehr mit `hardware_type=ESP32_WROOM` in der DB stehen. Loki-Query:
```
{compose_service="el-servador"} |~ "auto_register" |~ "MOCK_" | json
```
→ Muss `hardware_type=MOCK_ESP32` zeigen.

---

### Bug 3 — MissingGreenlet bei Zone-Endpoint (HOCH)

**IST-Zustand:**
Drei MissingGreenlet-Errors auf `GET /api/v1/zone/zones`:
- 11:03:52, 12:24:01, 12:27:54

Der Fehler bedeutet: SQLAlchemy versucht eine lazy-loaded Relationship ausserhalb des async Greenlet-Kontexts zu laden. Das passiert typischerweise wenn ein ORM-Model ein Relationship-Feld hat (z.B. `zone.devices`) das erst beim Zugriff die DB abfragt — aber der Zugriff passiert nachdem die async Session schon geschlossen ist (z.B. in einem Pydantic-Serializer oder einem Response-Model).

**Wo suchen:**
1. `api/v1/zone.py` (oder `api/v1/zones.py`) — der GET /zones Endpoint
2. `db/models/zone.py` — Zone Model, Relationship-Definitionen
3. `schemas/zone.py` — Pydantic Response-Schema

**Typisches Pattern:**
```python
# PROBLEM: lazy load ausserhalb Session
@router.get("/zones")
async def list_zones(db: AsyncSession):
    zones = await zone_repo.get_all(db)
    return zones  # <-- Hier greift Pydantic auf zone.devices zu → MissingGreenlet

# LOESUNG: eager load ODER selectinload in der Query
zones = await db.execute(
    select(Zone).options(selectinload(Zone.devices))
)
```

**SOLL:** Alle Relationships die im Response-Schema vorkommen muessen via `selectinload()` oder `joinedload()` explizit in der Query geladen werden. KEIN lazy loading bei async SQLAlchemy.

**Loki-Query zur Verifikation:**
```
{compose_service="el-servador"} |~ "MissingGreenlet"
```
→ Muss LEER sein nach Fix.

---

### Bug 4 — God-Kaiser Init Timezone-Fehler (MITTEL)

**IST-Zustand:**
Beim Server-Start (11:00:00):
```
God-Kaiser init failed: can't subtract offset-naive and offset-aware datetimes
```

Irgendwo in der God-Kaiser-Initialisierung wird ein `datetime.now()` (naive, ohne Timezone) mit einem `datetime` aus der DB oder einer Config verglichen/subtrahiert der eine Timezone hat (offset-aware). Python 3 verbietet das Mischen.

**Wo suchen:** Die God-Kaiser Init-Funktion (wahrscheinlich `services/god_kaiser.py` oder `god_kaiser/init.py`). Suche nach:
- `datetime.now()` → sollte `datetime.now(timezone.utc)` sein
- `datetime.utcnow()` → deprecated, ersetzen durch `datetime.now(timezone.utc)`
- Vergleiche/Subtraktionen zwischen zwei datetime-Objekten

**SOLL:** Alle datetime-Operationen im God-Kaiser-Modul muessen timezone-aware sein. `datetime.now(timezone.utc)` statt `datetime.now()`.

**Loki-Query zur Verifikation:**
```
{compose_service="el-servador"} |~ "God-Kaiser" |~ "failed"
```
→ Muss LEER sein nach Fix.

---

### Zusammenfassung Bug-Fixes

| Bug | Datei(en) | Fix | Schwere |
|-----|-----------|-----|---------|
| 1a | Debug-API DELETE + SimulationScheduler | Scheduler-Stop bei Device-Delete | KRITISCH |
| 1b | SimulationScheduler Init | DB-Abgleich bei Server-Start (verwaiste In-Memory-Devices entfernen) | KRITISCH |
| 1c | heartbeat_handler.py `_auto_register_esp()` | MOCK-Prefix → `hardware_type=MOCK_ESP32` + `status=online` (Auto-Approve) | KRITISCH |
| 3 | Zone-API + Zone-Model | selectinload statt lazy load | HOCH |
| 4 | God-Kaiser Init | datetime.now(timezone.utc) | MITTEL |

**Alle 3 Ghost-Mock-Fixes (1a + 1b + 1c) sind noetig.** Keiner allein verhindert das Problem in allen Szenarien (Device-Delete, DB-Restore, Server-Restart). Zusammen bilden sie eine lueckenlose Absicherung.

### Analyse-Workflow (mit Loki)

**VOR dem Fix — IST dokumentieren:**
```bash
# 1. Ghost-Mock in DB finden
docker exec automationone-postgres psql -U autoone -c \
  "SELECT device_id, hardware_type, status, zone_id, created_at FROM esp_devices;"

# 2. SimulationScheduler-Aktivitaet in Loki
# Query: {compose_service="el-servador"} |~ "AUTO-HB|auto_register|Sensor.*not in config"
# Zeitraum: letzte 2 Stunden

# 3. MissingGreenlet Haeufigkeit
# Query: {compose_service="el-servador"} |~ "MissingGreenlet"

# 4. God-Kaiser Init
# Query: {compose_service="el-servador"} |~ "God-Kaiser" | json | level="ERROR"

# 5. Alle ERROR-Level Logs (Gesamtbild)
# Query: {compose_service="el-servador"} | json | level="ERROR"
```

**NACH dem Fix — Verifikation:**
```bash
# 1. Frische DB: keine esp_devices
docker exec automationone-postgres psql -U autoone -c \
  "SELECT COUNT(*) FROM esp_devices;"
# Erwartung: 0

# 2. Mock erstellen via UI → DB pruefen
docker exec automationone-postgres psql -U autoone -c \
  "SELECT device_id, hardware_type, status FROM esp_devices;"
# Erwartung: hardware_type=MOCK_ESP32, status=online (auto-approved)

# 3. Mock loeschen via UI → Scheduler pruefen
# Query: {compose_service="el-servador"} |~ "MOCK_" |~ "heartbeat"
# Erwartung: Keine Heartbeats mehr nach Delete

# 4. Keine MissingGreenlet
# Query: {compose_service="el-servador"} |~ "MissingGreenlet"
# Erwartung: 0 Ergebnisse

# 5. God-Kaiser startet fehlerfrei
# Query: {compose_service="el-servador"} |~ "God-Kaiser"
# Erwartung: Nur "init success" oder aehnlich, kein "failed"
```

---

## TEIL 2: Layout-Optimierung (Frontend)

### Kontext: Was ist der Command Strip?

Der Command Strip ist die obere Leiste der HardwareView (56px Hoehe). Er enthaelt aktuell ALLES in einer einzigen Zeile:

```
[Breadcrumb: Hardware] [0 Online] [0 Offline] [Alle 0] [Mock 0] [Real 0] [Mock+] [Geraete] [Farb-Legende] [?] [Alert 1] [Bell] [NOT-AUS] [Server verbunden] [Avatar]
```

Das sind **14 Elemente** in einer Zeile. Bei normaler Bildschirmbreite (1920px) ist das gerade noch lesbar, aber nicht gut organisiert. Die Elemente haben keine visuelle Gruppierung — Status-Infos, Filter, Actions und System-Controls stehen gleichberechtigt nebeneinander.

### Design-Prinzipien fuer die Optimierung

1. **Visuelle Gruppierung:** Zusammengehoerige Elemente in logische Gruppen (Status | Filter | Actions | System). Gruppen durch Spacing oder subtile Divider trennen.

2. **Informationshierarchie:** Das Wichtigste zuerst (von links nach rechts): Navigation → Status → Actions → System. NOT-AUS bleibt immer rechts aussen (Sicherheitskonvention: Emergency-Controls am Rand, nicht zwischen normalen Buttons).

3. **Iridescent fuer primaere Aktionen:** Der iridescent Gradient (`#60a5fa → #818cf8 → #a78bfa → #c084fc`) ist das visuelle Highlight des Systems. Er wird AUSSCHLIESSLICH fuer die wichtigste Aktion auf der Seite verwendet (z.B. "Mock erstellen"). Sekundaere Buttons bekommen subtilere Styles (glass, outline, ghost).

4. **Reduzierte Cognitive Load:** Nicht alles was moeglich ist muss immer sichtbar sein. Filter-Counts `Alle 0`, `Mock 0`, `Real 0` sind bei 0 Devices nutzlos — sie koennten erst erscheinen wenn >0 Devices existieren.

5. **Dark Theme Kontrast:** Status-Dots (gruen/rot fuer Online/Offline) muessen gegen den dunklen Hintergrund (`#0f0f1a`) genug Kontrast haben. Aktuell sind die `0 Online`/`0 Offline` Texte etwas verloren.

### 2.1 Command Strip Redesign

**IST (14 Elemente in einer Zeile):**
```
[Hardware] [0 Online] [0 Offline] [Alle 0] [Mock 0] [Real 0] [Mock+] [Geraete] [Legende] [?] [Alert] [Bell] [NOT-AUS] [Server]
```

**SOLL (3 logische Gruppen + System-Controls):**

```
LINKS (Navigation + Status):
  [Hardware]  ·  [0 Online · 0 Offline]

MITTE (Filter — nur sichtbar wenn >0 Devices):
  [Alle X] [Mock X] [Real X]

RECHTS (Actions + System):
  [Legende] [Geraete ▾] [Mock +]  |  [Alert] [Bell]  |  [NOT-AUS]  [Server · Avatar]
```

**Konkrete Aenderungen:**

| Element | IST | SOLL | Begruendung |
|---------|-----|------|-------------|
| Online/Offline Counts | Zwei separate Badges | Ein kompakter Status-Chip `0/0 Online` | Weniger visuelles Rauschen |
| Filter-Chips (Alle/Mock/Real) | Immer sichtbar, auch bei 0 | `v-if="totalDevices > 0"` — nur anzeigen wenn Devices existieren | 0-Counts sind nutzlose Information |
| "Mock+" Button | Eigener Button neben Geraete | In Geraete-Dialog integrieren ODER als primaerer iridescent-Button | Zwei Buttons fuer Device-Management sind redundant wenn der Geraete-Dialog bereits einen Create-Tab hat |
| Farb-Legende | Eigener Button | Icon-Only (Palette-Icon), Tooltip "Farb-Legende" | Spart Platz, Legende ist sekundaer |
| Hilfe "?" | Eigener Button | Entfernen oder in Einstellungen verschieben | Bei leerem Dashboard nicht hilfreich, belegt Platz |
| NOT-AUS | Roter Button mittig | Bleibt rechts aussen, immer sichtbar, groesster Klick-Target | Sicherheitskonvention |
| Server-Status | Text "Server verbunden" | Nur Dot (gruen/rot) + Tooltip | Text belegt zu viel Platz |

### 2.2 Empty State Optimierung

**IST:**
- Grosses Plus-Icon (grau, ~64px)
- Heading: "Keine ESP-Geraete"
- Text: "Erstellen Sie Ihr erstes Mock-ESP32-Geraet, um mit dem Testen zu beginnen."
- Button: "Geraet erstellen" (glass-style, kein iridescent)

**SOLL:**
- Plus-Icon bleibt, aber mit subtiler `pulse-glow` Animation (einladend, nicht ablenkend)
- Heading: "Keine ESP-Geraete" → **"Willkommen bei AutomationOne"** (erster Besuch) ODER **"Keine Geraete konfiguriert"** (nach Cleanup)
- Subtext: Statt formeller Anrede ("Erstellen Sie...") → **"Erstelle dein erstes Mock-ESP, um das System zu testen."** (Du-Anrede, konsistent mit Rest der App die "du" verwendet)
- Button: **Iridescent Gradient** (`btn-primary` mit dem vollen `--gradient-iridescent`), nicht glass
- **Zweiter Link** darunter: "Oder verbinde ein echtes ESP32" → `/hardware` Anleitung-Tab (fuer wenn echte Hardware da ist)

### 2.3 Mock-Dialog Optimierung

**IST:**
- "Erstellen" Button hat iridescent Gradient — aber **blass/washed-out** (opacity scheint reduziert oder der Gradient ist zu hell gegen den dunklen Modal-Hintergrund)
- "Abbrechen" Button ist transparent/ghost — ok
- Kein visueller Hinweis dass ESP-ID auto-generiert wurde

**SOLL:**
- "Erstellen" Button: **Voller iridescent Gradient mit hover:brightness(1.15)** und `box-shadow: 0 0 20px rgba(168,139,250,0.3)` fuer Glow-Effekt. Der Button muss als die EINDEUTIGE primaere Aktion hervorstechen
- ESP-ID Feld: Subtiler Hinweis dass die ID automatisch generiert wurde (z.B. kleines `auto` Badge rechts neben dem Refresh-Icon, oder der Refresh-Icon pulsiert einmal beim Oeffnen)
- "Zone-Name" Feld: Placeholder bleibt, aber ein Info-Icon (i) mit Tooltip: "Die Zone wird automatisch erstellt wenn sie noch nicht existiert"
- Checkbox "Auto-Heartbeat": Klarerer Text → **"Automatisch Lebenszeichen senden"** mit kleinem `(empfohlen)` Suffix

### 2.4 Design-Token-Compliance

Alle Aenderungen MUESSEN die bestehenden Design-Tokens aus `tokens.css` verwenden:

```css
/* Farben — NUR diese Variablen verwenden */
--color-bg-primary: #07070d;
--color-bg-secondary: #0f0f1a;
--color-bg-tertiary: #171727;
--color-bg-quaternary: #1d1d2a;
--color-text-primary: #eaeaf2;
--color-text-secondary: #9c9cb8;
--color-text-muted: #484860;
--color-accent-bright: #60a5fa;
--color-accent: #3b82f6;
--gradient-iridescent: linear-gradient(135deg, #60a5fa, #818cf8, #a78bfa, #c084fc);
--color-success: #34d399;
--color-warning: #fbbf24;
--color-error: #f87171;

/* Spacing */
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
--space-6: 24px; --space-8: 32px;

/* Radius */
--radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;

/* Elevation */
--shadow-raised: 0 2px 8px rgba(0,0,0,0.3);
--shadow-floating: 0 8px 32px rgba(0,0,0,0.5);

/* Transitions */
--transition-fast: 120ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
```

**KEINE neuen Farben erfinden.** Keine hardcoded `#hex`-Werte in Komponenten. Alles ueber CSS Custom Properties.

---

## Was NICHT gemacht wird

- [ ] Keine Aenderungen an MonitorView oder EditorView (kommen in spaeeteren Trockentests)
- [ ] Keine neuen Komponenten erstellen (nur bestehende anpassen)
- [ ] Keine Backend-API-Aenderungen ausser den 4 Bug-Fixes
- [ ] Keine Sidebar-Aenderungen (ist bereits gut strukturiert)
- [ ] Kein Responsive-Design (kommt spaeter)
- [ ] Keine neuen CSS-Dateien (alles in bestehende tokens.css/glass.css/forms.css integrieren)
- [ ] Keine Aenderungen am QuickActionBall (kommt in Phase 8)
- [ ] Kein ViewTabBar-Redesign (Uebersicht/Monitor/Editor Tabs sind ok)

---

## Playwright-Verifikation

Nach allen Fixes den folgenden E2E-Flow mit Playwright durchfuehren:

```
SCHRITT 1: Frische DB (oder Ghost-Device manuell loeschen)
├── GET /hardware → Screenshot
├── Console: 0 Errors, 0 Warnings
├── Network: Alle API-Calls 200 OK
├── DB: 0 Rows in esp_devices
└── Erwartung: Empty State, Alert-Badge 0, "Geraete" statt "1 offen"

SCHRITT 2: Mock erstellen
├── Click "Geraet erstellen" oder "Mock +" → Screenshot Modal
├── ESP-ID ist auto-generiert (MOCK_XXXXXXXX)
├── "Erstellen" klicken
├── DB: 1 Row, hardware_type=MOCK_ESP32, status != pending_approval
├── Frontend: 1 Online, Mock 1
├── Loki: Kein "not in config" Warning
└── Erwartung: Mock erscheint in Zone-Accordion

SCHRITT 3: Mock loeschen
├── Mock via UI oder API loeschen
├── DB: 0 Rows in esp_devices
├── Warten 120 Sekunden (2x Heartbeat-Intervall)
├── Loki: Keine Heartbeats fuer geloeschtes Device
├── Frontend: Zurueck auf Empty State
└── Erwartung: KEIN Ghost-Mock taucht auf

SCHRITT 4: Server-Errors
├── Loki: {compose_service="el-servador"} | json | level="ERROR"
├── Erwartung: 0 MissingGreenlet, 0 God-Kaiser init failed
└── /api/v1/zone/zones aufrufen: 200 OK, kein Error
```

---

## Akzeptanzkriterien

### Bug-Fixes
- [ ] Frische DB + Server-Start = 0 Devices in esp_devices
- [ ] Mock erstellen → `hardware_type=MOCK_ESP32` (nie `ESP32_WROOM` fuer MOCK_ Prefix)
- [ ] Mock erstellen mit MOCK_ Prefix → KEIN `pending_approval` Status (auto-approved)
- [ ] Mock loeschen → SimulationScheduler stoppt Heartbeats innerhalb von 5 Sekunden
- [ ] Server-Neustart mit verwaisten Scheduler-Eintraegen → Scheduler bereinigt sich gegen DB
- [ ] `GET /api/v1/zone/zones` → 200 OK, kein MissingGreenlet
- [ ] Server-Start → kein "God-Kaiser init failed" in Logs
- [ ] Loki-Query `|~ "MissingGreenlet"` → 0 Treffer nach Fix
- [ ] Loki-Query `|~ "God-Kaiser.*failed"` → 0 Treffer nach Fix

### Layout
- [ ] Command Strip: 3 visuelle Gruppen (Links/Mitte/Rechts) erkennbar
- [ ] Filter-Chips (Alle/Mock/Real) nur sichtbar wenn `totalDevices > 0`
- [ ] Server-Status: Nur Dot + Tooltip, kein Text
- [ ] Empty State: Iridescent-Button statt Glass-Button fuer primaere Aktion
- [ ] Empty State: Du-Anrede ("Erstelle dein erstes...")
- [ ] Mock-Dialog: "Erstellen" Button hat vollen iridescent Gradient mit Glow
- [ ] Alle Farben ueber CSS Custom Properties, keine hardcoded Hex-Werte
- [ ] Kein Element im Command Strip hat weniger als 32px Touch-Target (Accessibility)

### Gesamt
- [ ] Playwright E2E: Schritte 1-4 bestanden
- [ ] `vue-tsc --noEmit` clean (keine TypeScript-Fehler)
- [ ] Vite Build erfolgreich
- [ ] Docker-Stack healthy (alle Container)

---

## Referenz: Dateien die wahrscheinlich betroffen sind

### Backend (Bug-Fixes)
| Datei (geschaetzt) | Aenderung |
|---------------------|-----------|
| `api/v1/debug.py` oder `api/debug.py` | DELETE-Route: Scheduler-Stop ergaenzen |
| `simulation/scheduler.py` | `stop_simulation(esp_id)` + DB-Abgleich bei Init |
| `mqtt/handlers/heartbeat_handler.py` | `_auto_register_esp()`: MOCK-Prefix-Erkennung + Auto-Approve |
| `api/v1/zone.py` oder `api/v1/zones.py` | selectinload fuer Zone-Relationships |
| `db/models/zone.py` | Relationship-Definitionen pruefen |
| `services/god_kaiser.py` | `datetime.now(timezone.utc)` statt `datetime.now()` |

### Frontend (Layout)
| Datei (geschaetzt) | Aenderung |
|---------------------|-----------|
| `components/CommandStrip.vue` oder Bereich in `HardwareView.vue` | Gruppierung, Filter-Visibility, Server-Status |
| `components/EmptyState.vue` oder Template in `HardwareView.vue` | Text, Button-Style, zweiter Link |
| `components/modals/CreateMockEspModal.vue` | Button-Gradient, Checkbox-Text, Info-Tooltips |
| `assets/css/tokens.css` | Ggf. neue Utility-Klasse fuer Glow-Shadow |

---

## Ergebnis-Report

Nach Abschluss Report schreiben nach: `.claude/reports/current/T01-ghost-mock-layout-2026-03-07.md`

| Sektion | Inhalt |
|---------|--------|
| Bug-Fixes | Welche Dateien geaendert, was war der genaue Root Cause |
| Layout | Screenshots vorher/nachher, welche Elemente verschoben |
| Loki-Verifikation | Alle 5 Queries mit Ergebnis |
| DB-Verifikation | esp_devices vor/nach Fix |
| Playwright | E2E-Ergebnis (4 Schritte) |
| Offene Punkte | Falls etwas nicht gefixt werden konnte |
