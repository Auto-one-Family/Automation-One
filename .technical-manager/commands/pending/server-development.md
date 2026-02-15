# Auftrag an @server-development
Datum: 2026-02-10 20:00
Modus: Plan Mode – /verify-plan + /do gleichzeitig aktiv
Arbeitsweise: Ohne Pause bis zum fertigen Implementierungsplan

---

## Kontext

Die Zone-Kaiser-Implementierung (WP1-WP9) ist abgeschlossen, alle Bugs gefixt, alle E2E-Szenarien funktionieren auf Code-Ebene. Jetzt brauchen wir eine **vollständige Resilienz-Analyse**: Was passiert mit Device-Daten in JEDEM Zustand und bei JEDER Zustandsänderung? Das Ziel ist ein lückenloser Schutz gegen Datenverlust und inkonsistente Zustände.

**Architektur-Prinzip:** Server-zentrisch. ESP32 = dumme Agenten. Server ist Source-of-Truth für alle persistenten Daten. Alles was auf dem Server in der DB steht, muss jederzeit konsistent und wiederherstellbar sein.

---

## Dein Auftrag

### Vollständige Analyse: Device-Lifecycle-Resilienz

Erstelle einen **vollständigen Fix- und Implementierungsplan** der folgende Frage beantwortet:

> **Funktioniert jedes Gerät in jedem Zustand sauber – und was passiert bei jeder Zustandsänderung mit allen abhängigen Daten?**

---

### Analyse-Bereiche

#### 1. Kaskaden-Effekte bei Löschungen

Was passiert wenn...

- **Zone wird entfernt** → Subzones werden auf ESP kaskadiert gelöscht (WP1). ABER:
  - Was passiert mit Sensor-Konfigurationen die an diese Subzones gebunden waren?
  - Was passiert mit Actuator-Zuweisungen in dieser Zone?
  - Was passiert auf DB-Ebene? Werden SubzoneConfig-Records gelöscht? Sensor-Records? Actuator-Records?
  - Werden GPIO-Zuweisungen auf dem Server nachverfolgt oder nur auf dem ESP?
  - Bleibt die History erhalten (Sensor-Daten, Logs)?

- **Subzone wird entfernt** → GPIOs freigegeben, NVS gelöscht auf ESP. ABER:
  - Was passiert mit Sensoren die an diese Subzone-GPIOs hingen?
  - Werden Sensor-Konfigurationen auf dem Server gelöscht oder verwaist?
  - Kann der User die gleiche Subzone neu zuweisen und bekommt er seine Config zurück?

- **ESP wird rejected/gelöscht** → Was passiert mit Zone-Zuweisungen, Subzone-Records, Sensor-History?

#### 2. Versehentliche Aktionen & Wiederherstellbarkeit

Was passiert wenn ein User...

- Zone löscht und sofort neu zuweist – bekommt er Subzones und Sensor-Configs zurück?
- Einen ESP "rejected" statt nur die Zone ändert – ist alles weg?
- Versehentlich alle Zonen löscht – gibt es ein Undo oder Recovery?
- Einen ESP umbenennt – brechen Referenzen?
- Die Server-Config (Port, Kaiser-ID) ändert – reconnecten alle ESPs?

#### 3. Daten-Ebenen Konsistenz (DB ↔ ESP ↔ Server-State)

Prüfe für JEDE dieser Entitäten:

| Entität | Was wird wo gespeichert? | Was passiert bei Löschung? | Was bleibt erhalten? |
|---------|--------------------------|---------------------------|---------------------|
| Device (ESP) | DB ESPDevice, ESP NVS | ? | ? |
| Device Name | DB ESPDevice.name | ? | ? |
| Zone-Assignment | DB zone_id + ESP NVS | WP1 implementiert | ? |
| Subzone-Assignment | DB SubzoneConfig + ESP NVS | WP8 implementiert | ? |
| Sensor-Config | DB SensorConfig? ESP? | ? | ? |
| Sensor-Data (History) | DB SensorReading? | ? | ? |
| Actuator-Config | DB ActuatorConfig? ESP? | ? | ? |
| Actuator-State | DB? ESP GPIO? | ? | ? |
| GPIO-Zuweisungen | ESP GPIOManager + DB? | ? | ? |
| Kaiser-ID | DB ESPDevice.kaiser_id + ESP NVS | WP2: bleibt bei Zone-Removal | ? |
| IP/MAC/Firmware | DB ESPDevice | ? | ? |
| Device Metadata | DB ESPDevice.device_metadata JSON | ? | ? |

#### 4. Zustandsübergänge

Prüfe JEDEN möglichen Übergang und was mit abhängigen Daten passiert:

```
pending_approval → approved → zone_assigned → subzone_assigned
                                    ↓                ↓
                              zone_removed      subzone_removed
                                    ↓
                             (zurück zu approved, OHNE Zone)
                             
approved → rejected → (re-discoverable?)
approved → offline → (Timeout? Cleanup?)
```

- Gibt es Zustände aus denen ein Device nicht mehr zurückkommen kann?
- Gibt es Zustände die zu Orphaned Records führen?
- Was passiert bei Reboot in jedem Zustand?

#### 5. Server-zentrische Autorität

- Welche Daten existieren NUR auf dem ESP und nirgends auf dem Server?
- Wenn ein ESP kaputt geht – was ist verloren?
- Kann der Server einen ESP komplett neu konfigurieren (Zone, Subzone, Sensoren, Actuators)?
- Gibt es einen "Factory Reset" Flow auf dem Server der alles sauber aufräumt?

---

### Output-Format

Erstelle einen Implementierungsplan mit folgender Struktur:

```markdown
# Device-Lifecycle-Resilienz – Analyse & Implementierungsplan

## 1. IST-Analyse
### 1.1 Daten-Inventar (was wird wo gespeichert)
### 1.2 Kaskaden-Matrix (was passiert bei welcher Löschung)
### 1.3 Zustandsübergänge (komplett mit Seiteneffekten)
### 1.4 Lücken & Risiken

## 2. Gefundene Probleme
### 2.1 Kritisch (Datenverlust möglich)
### 2.2 Hoch (Inkonsistenz möglich)
### 2.3 Mittel (Verbesserungspotential)

## 3. Empfohlene Fixes
### Pro Problem: IST → SOLL → betroffene Dateien → Aufwand

## 4. Zusammenfassung für TM
```

---

## Fokus-Dateien

**Server (DB-Modelle & Services):**
- Alle Modelle in `models/` – ESPDevice, SubzoneConfig, SensorConfig, ActuatorConfig, etc.
- Alle Services in `services/` – ZoneService, SubzoneService, ESPService, SensorService, ActuatorService
- Alle Repositories in `repositories/`
- `zone_service.py` – remove_zone() Kaskaden
- `subzone_service.py` – remove_subzone() Kaskaden
- `esp_service.py` – reject_device(), delete_device() wenn es existiert

**Server (MQTT Handlers):**
- `heartbeat_handler.py` – Device-State-Updates
- `zone_ack_handler.py` – Zone-Removal Bestätigung
- `subzone_ack_handler.py` – Subzone-Removal Bestätigung

**ESP32 (für Verständnis der ESP-seitigen Daten):**
- `config_manager.cpp/h` – NVS-Datenstruktur, was wird gespeichert
- `main.cpp` – Zone/Subzone-Removal Handler, was wird gelöscht
- `gpio_manager.cpp/h` – GPIO-Zuweisungen

**Frontend (für Verständnis der UI-Flows):**
- `esp.ts` – Device-Store, welche Actions gibt es
- API-Routen die Delete/Remove-Operationen anbieten

---

## Erfolgskriterium

1. Vollständige Daten-Inventar-Matrix: Was wird wo gespeichert
2. Vollständige Kaskaden-Matrix: Was passiert bei welcher Löschung mit allen Abhängigkeiten
3. Alle Lücken identifiziert wo Datenverlust oder Inkonsistenz möglich ist
4. Konkrete Fixes mit IST/SOLL für jedes Problem
5. Klare Empfehlung welche Fixes kritisch sind und welche warten können

## Report zurück an

`.technical-manager/inbox/agent-reports/server-development-lifecycle-2026-02-10.md`

**Implementierungsplan nach:**
`.technical-manager/reports/current/DEVICE_LIFECYCLE_RESILIENCE_PLAN.md`
