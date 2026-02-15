# Auftrag an @esp32-dev + @test-log-analyst
Datum: 2026-02-10 04:30
**Status: ERLEDIGT** (2026-02-10)
**Report:** `.technical-manager/inbox/agent-reports/wokwi-analysis-2026-02-10.md`

## Context

Phase 2A: ESP32 Debug-Infrastruktur. Wokwi ist einer von drei geplanten Debug-Kanälen (Wokwi-Simulation, MQTT Debug-Topic, ser2net Hardware-Bridge).

**Aktueller Zustand Wokwi:**
- 163 aktive YAML-Szenarien über 13 Kategorien (Stand letzter Bericht)
- Wokwi wird aktuell IMMER MANUELL gestartet – Frage: geht das auch automatisiert?
- Wokwi-Szenarien können KEINE Verbindung zum laufenden Server (El Servador) aufnehmen
- Vermutete Ursache: Der "Pending Approval Flow" funktioniert nicht in Wokwi, weil Wokwi keine HTTP-Requests an den Server machen kann (HTTP API Limitation der Simulation). ESP32 Devices müssen sich beim Server registrieren/approved werden bevor sie voll funktionieren – dieser Schritt schlägt in Wokwi fehl.
- Bisheriger Workaround: Seed-Daten in der Datenbank, die Devices als "bereits approved" eintragen. Das umgeht den Flow aber testet ihn nicht wirklich.

**Architektur-Kontext:**
- AutomationOne ist server-zentrisch: ESP32 = dumme Agenten, ALLE Logik auf Server
- Kommunikation: ESP32 ↔ MQTT ↔ Server, ESP32 → HTTP → Server (für Registration/Approval)
- Docker Stack: PostgreSQL, Mosquitto MQTT, El Servador (FastAPI), El Frontend (Vue 3)

## Aufgabe

**Vollständige Codebase-Analyse in drei Teilbereichen:**

### Teil 1: Wokwi-Setup & Automatisierung
- Wie ist Wokwi aktuell konfiguriert? (wokwi.toml, diagram.json, Szenarien-Struktur)
- Welche CI-Integration existiert bereits? (GitHub Actions Workflow `wokwi-tests.yml`)
- Kann der manuelle Start automatisiert werden? Welche Optionen gibt es? (CLI, CI-Trigger, VS Code Extension API)
- Welche Wokwi-Plan-Limits gelten? (Hobby: 200 min/Monat)

### Teil 2: Pending Approval Flow & Wokwi-Limitation
- Den kompletten Device-Registration- und Approval-Flow nachvollziehen: ESP32-seitig UND Server-seitig
- Exakt identifizieren: Welche Schritte nutzen HTTP, welche MQTT? An welchem Punkt scheitert Wokwi?
- Ist es wirklich eine HTTP-Limitation? Oder gibt es andere Gründe? (Netzwerk, DNS, Firewall, Wokwi-Gateway)
- Wie funktioniert MQTT-Konnektivität in Wokwi? Kann Wokwi MQTT an einen externen Broker senden?
- Gibt es einen Weg den Approval-Flow komplett über MQTT abzubilden (statt HTTP)?

### Teil 3: Seed-Strategie bewerten & Alternativen
- Wie funktionieren die aktuellen Seeds? Welche Daten werden geseedet? (Tabellen, Device-States, Approval-Status)
- Reichen die Seeds für realistische Tests oder umgehen sie zu viel?
- Alternativen bewerten:
  - Seeds optimieren (realistischere Testdaten, verschiedene Device-States)
  - Server-seitiger "Wokwi-Mode" oder "Test-Mode" der den Approval-Flow vereinfacht
  - MQTT-basierter Approval-Flow als permanente Alternative
  - Pre-approved Device-Tokens die Wokwi nutzen kann
- Empfehlung: Was ist der beste Weg für systemechte Tests in Wokwi?

## Erfolgskriterium
- Vollständiger Überblick über Wokwi-Konfiguration und Szenarien-Struktur
- Der Approval-Flow ist Schritt für Schritt dokumentiert mit exakter Stelle wo Wokwi scheitert
- Klare Aussage ob/wie der manuelle Start automatisiert werden kann
- Seed-Strategie ist bewertet mit Pro/Contra
- Mindestens 2-3 konkrete Lösungsvorschläge für das Approval-Problem, bewertet nach Aufwand und Systemtreue
- Alle Findings mit Code-Referenzen belegt (Datei + Funktion/Klasse)

## Report zurück an
.technical-manager/inbox/agent-reports/wokwi-analysis-2026-02-10.md

---

## Ergebnis-Zusammenfassung (2026-02-10)

### ⚠️ KORREKTUR: Approval-Flow EXISTIERT (MQTT-basiert)!
- **URSPRÜNGLICHE ANNAHME WAR FALSCH**: Approval-Flow ist implementiert und funktioniert
- Discovery-Handler (DEPRECATED): Neue Devices → `"pending_approval"` (discovery_handler.py:126)
- **Heartbeat-Handler (PRIMARY)**: Neue Devices → `"pending_approval"` via Auto-Discovery (heartbeat_handler.py:124-142)
- **Approval über REST-API**: Admin approved Device via `/api/v1/esp/{id}/approve`
- **Status-Übergang**: `pending_approval` → (Admin Approval) → `approved` → (nächster Heartbeat) → `online`
- **Heartbeat-ACK**: ESP erhält Status-Info via MQTT ACK (heartbeat_handler.py:174-180)
- ESP32 nutzt **ausschliesslich MQTT** nach Provisioning - kein HTTP nötig
- **HTTP-Limitation ist irrelevant** - Approval läuft komplett über MQTT + REST-API (vom Admin, nicht vom ESP)

### Wokwi-Setup: Vollstaendig fuer MQTT-Tests
- **163 YAML-Szenarien** in 13 Kategorien (verifiziert: `find . -name "*.yaml" | wc -l`)
- `gateway = true` erlaubt MQTT an externen Broker (wokwi.toml:35)
- **WOKWI_ESP_ID**: Firmware nutzt hardcoded `ESP_00000001` (platformio.ini:153)
- **Seed-Integration**: `seed_wokwi_esp.py` erstellt ESP_00000001 in DB mit Status `"offline"`
- CI: 12 parallele Test-Jobs, aber nur ~24/163 Szenarien in CI (~15% Coverage)
- **Makefile-Targets fuer Wokwi fehlen KOMPLETT** (verifiziert: `grep wokwi Makefile` → keine Treffer)

### ⚠️ KORRIGIERTE Empfohlene Massnahmen (priorisiert)
1. **SOFORT:** Seed-Script korrigieren - ESP_00000001 mit Status `"approved"` statt `"offline"` erstellen (15min)
   - **Problem:** Aktuell erstellt `seed_wokwi_esp.py` ESP mit Status "offline"
   - **Folge:** Wokwi-ESP sendet Heartbeats, bleibt aber "offline" (nicht in approved/online Liste)
   - **Fix:** Zeile 61 ändern: `status="approved"` statt `status="offline"`
2. **Kurzfristig:** Seeds erweitern - Sensors/Actuators für ESP_00000001 vorregistrieren (2-4h)
   - Vermeidet Discovery-Flow während Wokwi-Tests
3. **Kurzfristig:** Makefile-Targets implementieren (1-2h)
   - `make wokwi-build`, `make wokwi-run`, `make wokwi-test-quick`, `make wokwi-test-full`
4. **Mittelfristig:** CI-Coverage von 15% auf 80%+ erhöhen (4-6h)
   - Aktuell nur ~24/163 Szenarien in CI
5. **Dokumentation:** Report korrigieren - Approval-Flow ist implementiert (30min)
   - Beschreibung des MQTT-basierten Approval-Flows ergänzen

---

## ERGÄNZUNG: Seed-Mechanismus & WOKWI_ESP_ID Integration

### Wie Seed und Firmware zusammenspielen

**1. Firmware-Konfiguration (platformio.ini:153)**
```cpp
-D WOKWI_ESP_ID=\"ESP_00000001\"
```
- Hardcoded ESP ID für Wokwi-Simulation
- ESP nutzt diese ID statt MAC-basierter Generation
- Ermöglicht reproduzierbare Tests

**2. Database Seed (seed_wokwi_esp.py)**
```python
WOKWI_ESP_ID = "ESP_00000001"

wokwi_esp = ESPDevice(
    device_id=WOKWI_ESP_ID,
    status="offline",  # ⚠️ PROBLEM: Sollte "approved" sein
    capabilities={
        "max_sensors": 20,
        "max_actuators": 12,
        "features": ["heartbeat", "sensors", "actuators", "wokwi_simulation"],
        "wokwi": True,
    },
)
```

**3. Aktueller Flow (BROKEN)**
```
Wokwi startet
  → ESP_00000001 sendet Heartbeat
  → Heartbeat Handler: ESP existiert in DB (via Seed)
  → Status = "offline"
  → Zeile 182-185: Status-Check für "approved" → FAILED
  → ESP bleibt "offline"
  → ❌ Tests scheitern weil ESP nicht "online" ist
```

**4. Korrigierter Flow (WORKING)**
```
seed_wokwi_esp.py mit status="approved" ausführen
  → ESP_00000001 in DB mit Status "approved"
Wokwi startet
  → ESP_00000001 sendet Heartbeat
  → Heartbeat Handler: ESP existiert, Status = "approved"
  → Zeile 182-185: approved → online Transition
  → ESP geht "online"
  → ✅ Tests funktionieren
```

### Warum "approved" statt "offline"?

**Heartbeat Handler Logic (heartbeat_handler.py:182-185)**:
```python
if status == "approved":
    # First heartbeat after approval -> set to online
    esp_device.status = "online"
    logger.info(f"✅ Device {esp_id_str} now online after approval")
```

**Ohne "approved" Status**:
- Existing Device Flow prüft nur: `pending_approval`, `rejected`, `approved`, `online`
- "offline" hat **keine spezielle Behandlung** → bleibt offline
- ESP sendet Heartbeats ins Leere

**Mit "approved" Status**:
- Erster Heartbeat triggert approved → online Transition
- ESP wird sofort einsatzbereit

### Alternative: Auto-Approval für Wokwi

Statt Seed-Status zu ändern, könnte man auch:

**Option A: Wokwi-Detection im Heartbeat Handler**
```python
# In _discover_new_device() oder handle_heartbeat()
if payload.get("capabilities", {}).get("wokwi"):
    # Auto-approve Wokwi devices
    new_esp.status = "approved"
```

**Option B: Capabilities-basiertes Auto-Approval**
```python
# In device_metadata prüfen
if device.device_metadata.get("source") == "wokwi_simulation":
    # Skip pending_approval for simulation devices
    new_esp.status = "approved"
```

**Empfehlung**: **Option Seed-Script ändern** (einfachste Lösung)
- Keine Code-Änderungen nötig
- Klar dokumentiert im Seed-Script
- Keine Seiteneffekte auf Production-Flow

---

## REALITY-CHECK: Warum der ursprüngliche Report falsch lag

### Fehlerquelle 1: Oberflächliche Code-Analyse
**Original-Behauptung**: "DB-Felder `pending_approval`, `approved_at`, `approved_by` existieren aber werden NICHT genutzt"

**Reality**:
- `pending_approval` wird aktiv genutzt: heartbeat_handler.py:139, 168-180
- `approved_at` wird gesetzt bei Admin-Approval via REST-API
- `approved_by` wird gesetzt bei Admin-Approval
- Status-Übergänge: `pending_approval` → `approved` → `online` funktionieren

**Fehler**: Nur Discovery Handler gelesen (DEPRECATED), Heartbeat Handler (PRIMARY) übersehen

### Fehlerquelle 2: Discovery Handler vs. Heartbeat Handler
**Original-Behauptung**: "Discovery Handler setzt Status direkt auf 'online'"

**Reality**:
- Discovery Handler (Zeile 109-110): Setzt nur auf "online" **wenn bereits approved/online**
- Discovery Handler (Zeile 126): Neue Devices → `"pending_approval"`
- Heartbeat Handler: Gleiche Logic, aber als PRIMARY Mechanismus

**Fehler**: Zeile 109-110 isoliert betrachtet, Kontext (if-Bedingung) übersehen

### Fehlerquelle 3: Seed-Funktion missverstanden
**Original-Behauptung**: "Seed-Daten umgehen den Approval-Flow"

**Reality**:
- Seed erstellt ESP mit Status `"offline"` (nicht "approved" oder "online")
- ESP muss trotzdem durch Approval-Flow (oder Seed-Status muss korrigiert werden)
- Seed ist **kein Workaround** sondern **Vorbedingung** für Tests

**Fehler**: Annahme statt Code-Verifikation

### Fehlerquelle 4: MQTT-basierte Approval übersehen
**Original-Behauptung**: "HTTP-Limitation blockiert Approval"

**Reality**:
- Approval-Flow nutzt **MQTT** für ESP-seitige Kommunikation (Heartbeat ACK)
- Admin-Approval via **REST-API** (vom Admin, nicht vom ESP)
- ESP sendet Heartbeat → Server ACK mit Status → ESP weiß Bescheid
- **Kein HTTP vom ESP nötig** → Wokwi-Limitation ist irrelevant

**Fehler**: Annahme dass Approval HTTP vom ESP erfordert (tut es nicht)

### Lessons Learned
1. **PRIMARY vs. DEPRECATED** Code-Paths identifizieren
2. **Vollständige Flows tracen**: Von Trigger bis Completion
3. **Status-Maschinen dokumentieren**: Alle Übergänge prüfen
4. **Code vs. Annahmen**: Immer verifizieren, nie raten
5. **Test-Integration prüfen**: Wie Seeds/Fixtures mit Production-Code zusammenspielen

---

## Zusammenfassung für Technical Manager

### Was funktioniert
✅ Wokwi-Integration vollständig (163 Szenarien, gateway=true, MQTT-fähig)
✅ Approval-Flow implementiert und funktional (MQTT-basiert)
✅ CI-Pipeline mit 12 parallelen Jobs
✅ Auto-Discovery via Heartbeat

### Was kaputt ist
❌ **Seed-Script**: Erstellt ESP_00000001 mit Status "offline" statt "approved"
❌ **Folge**: Wokwi-ESP geht nicht online, Tests können nicht gegen Server laufen
❌ **Makefile**: Keine Wokwi-Targets vorhanden
❌ **CI-Coverage**: Nur 15% der Szenarien getestet

### Sofort-Fix (15 Minuten)
```python
# El Servador/god_kaiser_server/scripts/seed_wokwi_esp.py:61
status="approved",  # ← Ändere von "offline"
```

Dann: `docker exec automationone-server poetry run python scripts/seed_wokwi_esp.py`

### Next Steps
1. Seed fixen → Wokwi-Tests funktionieren sofort
2. Makefile-Targets hinzufügen → Developer-Experience
3. CI-Coverage erhöhen → Mehr Szenarien in Pipeline
4. Sensor/Actuator-Seeds → Realistische Test-Daten
