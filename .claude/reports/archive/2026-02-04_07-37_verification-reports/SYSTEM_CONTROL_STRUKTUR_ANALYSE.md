# system-control Struktur-Analyse

**Datum:** 2026-02-04
**Analysierte Dateien:**
- `.claude/agents/system-control.md` (488 Zeilen)
- `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` (1138 Zeilen)

---

## 1. Ist-Zustand

### 1.1 system-control.md Sections

| # | Section | Zeilen | Zeilen-Nr | Typ | Bewertung |
|---|---------|--------|-----------|-----|-----------|
| 0 | YAML Frontmatter | 11 | 1-11 | Meta | ✅ Gehört in Agent |
| 1 | Referenz-Dokument | 12 | 19-30 | Verweis | ✅ Gehört in Agent |
| 1.1 | Authentifizierung | 22 | 32-53 | Credentials + Befehle | ❌ → Reference |
| 2 | Deine Fähigkeiten | 68 | 56-123 | Übersicht + Befehle | ⚠️ Kürzen (nur Übersicht) |
| 3 | Arbeitsweise | 18 | 126-143 | Workflow | ✅ Gehört in Agent |
| 4 | Quick Reference | 77 | 146-222 | Befehls-Liste | ❌ → Reference (Duplikat) |
| 5 | Sicherheitsregeln | 22 | 225-246 | Hinweise + Befehle | ⚠️ Kürzen (Befehle raus) |
| 6 | Standard-Workflows | 46 | 249-294 | Befehls-Liste | ❌ → Reference (Duplikat) |
| 7 | Flow-Verifikation | 115 | 298-412 | Detaillierte Flows | ❌ → Reference (NEU) |
| 8 | Antwort-Format | 40 | 415-454 | Template | ✅ Gehört in Agent |
| 9 | Einschränkungen | 32 | 457-488 | Delegation | ✅ Gehört in Agent |

**Zusammenfassung:**
- **488 Zeilen** total
- **~113 Zeilen** gehören definitiv in Agent (23%)
- **~260 Zeilen** sind Duplikate oder gehören in Reference (53%)
- **~115 Zeilen** sind neuer Content für Reference (24%)

### 1.2 SYSTEM_OPERATIONS_REFERENCE.md Sections

| # | Section | Zeilen | Zeilen-Nr | Vollständig? |
|---|---------|--------|-----------|--------------|
| 1 | Datenbank | 288 | 8-295 | ✅ Sehr vollständig |
| 2 | Server | 134 | 297-432 | ✅ Start/Stop/Health/Logs |
| 3 | REST-API | 270 | 434-703 | ✅ Alle Endpoints |
| 4 | MQTT | 156 | 705-864 | ✅ Monitor/Simulation/Commands |
| 5 | ESP32-Hardware | 62 | 868-936 | ✅ Flash/Monitor/Wokwi |
| 6 | Kombinierte Workflows | 128 | 940-1083 | ✅ Debug-Session, etc. |
| 7 | Troubleshooting | 30 | 1087-1119 | ⚠️ Nur Basics |
| 8 | Wichtige Pfade | 16 | 1121-1138 | ✅ Komplett |

**Reference ist bereits sehr vollständig!**

---

## 2. Duplikate

### 2.1 curl-Befehle (35 im Agent, 77 in Reference)

| Befehl | Agent Zeile | Reference Zeile | Aktion |
|--------|-------------|-----------------|--------|
| `curl health` | 66, 174, 238, 255 | 344 | ❌ Entfernen aus Agent |
| `curl /esp/devices` | 79, 184 | 440 | ❌ Entfernen aus Agent |
| `curl /esp/.../approve` | 187-189, 271-273 | 449-451 | ❌ Entfernen aus Agent |
| `curl DELETE /esp/devices` | 191 | 459 | ❌ Entfernen aus Agent |
| `curl /actuators/.../command` | 211-221 | 539-563 | ❌ Entfernen aus Agent |
| `curl /actuators/emergency_stop` | 219-221 | 559-562 | ❌ Entfernen aus Agent |
| `curl /sensors/...` | 280-283 | 493-516 | ❌ Entfernen aus Agent |
| `curl /zone/devices/.../assign` | 275-278, 385-387 | 570-573 | ❌ Entfernen aus Agent |
| `curl /auth/login` | 39-41 | 681-688 | ❌ Entfernen (aber Credentials NEU) |

**Duplikat-Quote curl:** ~30 von 35 Befehlen (86%)

### 2.2 mosquitto-Befehle (19 im Agent, 33 in Reference)

| Befehl | Agent Zeile | Reference Zeile | Aktion |
|--------|-------------|-----------------|--------|
| `mosquitto_sub kaiser/#` | 94, 198, 258, 308 | 711 | ❌ Entfernen aus Agent |
| `mosquitto_sub heartbeat` | 201, 345 | 714 | ❌ Entfernen aus Agent |
| `mosquitto_sub sensor/data` | 330 | 717 | ❌ Entfernen aus Agent |
| `mosquitto_pub -r -n (cleanup)` | 204, 289, 292-293 | 856-863 | ❌ Entfernen aus Agent |

**Duplikat-Quote mosquitto:** ~15 von 19 Befehlen (79%)

### 2.3 Workflow-Duplikate

| Workflow | Agent Section | Reference Section | Aktion |
|----------|---------------|-------------------|--------|
| Debug-Session starten | 6 (Zeile 252-262) | 6.4 (Zeile 1031-1053) | ❌ Entfernen |
| Neues ESP registrieren | 6 (Zeile 264-283) | 6.1 (Zeile 942-975) | ❌ Entfernen |
| MQTT Cleanup | 6 (Zeile 285-294) | 4.4 (Zeile 852-864) | ❌ Entfernen |

---

## 3. Fehlend in Reference

| Inhalt | Aktuell in Agent | Zeilen | Sollte in Reference | Vorgeschlagene Section |
|--------|------------------|--------|---------------------|------------------------|
| **Standard-Credentials** | 1.1 | 35-48 | ✅ Ja | 3.7 Authentifizierung erweitern |
| **Windows PowerShell JSON-Escaping** | 4 | 150-163 | ✅ Ja | 2.3 Logs (bereits vorhanden, erweitern) |
| **Flow-Verifikation Pattern** | 7.1 | 302-324 | ✅ Ja, NEU | 9. Flow-Verifikation (NEU) |
| **Sensor-Daten Flow** | 7.2 | 327-340 | ✅ Ja, NEU | 9.2 |
| **Heartbeat Flow** | 7.3 | 343-356 | ✅ Ja, NEU | 9.3 |
| **Config-Push Flow** | 7.4 | 358-377 | ✅ Ja, NEU | 9.4 |
| **Zone-Assignment Flow** | 7.5 | 379-396 | ✅ Ja, NEU | 9.5 |
| **Checkliste "Operation vollständig"** | 7.6 | 398-412 | ✅ Ja, NEU | 9.6 |
| **Delegation Matrix** | 9 | 467-472 | ❌ Nein | Bleibt in Agent (Agent-spezifisch) |
| **Kritische Operationen Liste** | 9 | 474-479 | ❌ Nein | Bleibt in Agent |

---

## 4. Migrations-Plan

### Phase 1: SYSTEM_OPERATIONS_REFERENCE.md erweitern

#### 1.1 Section 3.7 Authentifizierung erweitern

**Aktuell (Zeile 677-701):** Generic Beispiel mit `admin/password`

**Hinzufügen nach Zeile 684:**
```markdown
#### Standard-Credentials (Development)

| User | Password | Rolle |
|------|----------|-------|
| Robin | Robin123! | Admin |

```bash
# Development-Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "Robin", "password": "Robin123!"}'

# Token aus Response speichern
TOKEN="<access_token aus Response>"

# Authentifizierte Requests
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/...
```
```

#### 1.2 Section 2.3 Logs erweitern (Windows PowerShell)

**Hinzufügen nach Zeile 429:**
```markdown
#### Windows PowerShell: JSON in curl

```powershell
# JSON-Escaping für PowerShell
curl -X POST http://localhost:8000/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"username\": \"Robin\", \"password\": \"Robin123!\"}'

# Besser: ConvertTo-Json verwenden
$body = @{username="Robin"; password="Robin123!"} | ConvertTo-Json
curl -X POST http://localhost:8000/api/v1/auth/login `
  -H "Content-Type: application/json" -d $body

# MQTT-Tools Pfad (falls nicht im PATH)
& "C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -t "kaiser/#" -v
```
```

#### 1.3 NEUE Section 9: Flow-Verifikation (nach Section 8)

**Komplett neue Section hinzufügen (~115 Zeilen aus Agent Section 7):**

```markdown
---

## 9. Flow-Verifikation

> **Prinzip:** Bei jeder Operation den **kompletten Kommunikationsfluss** verifizieren.

### 9.1 Pattern: Request mit MQTT-Verifikation

```bash
# Terminal 1: MQTT Traffic beobachten (ERST starten!)
mosquitto_sub -h localhost -t "kaiser/#" -v

# Terminal 2: Operation ausführen
curl -X POST http://localhost:8000/api/v1/actuators/ESP_XXXXX/5/command \
  -H "Content-Type: application/json" -d '{"command": "ON"}'
```

**Erwarteter Flow für Actuator-Command:**

```
1. [API]     POST /actuators/.../command      → HTTP 202
2. [MQTT →]  kaiser/god/esp/ESP_XXX/actuator/5/command   {"command":"ON"...}
3. [MQTT ←]  kaiser/god/esp/ESP_XXX/actuator/5/response  {"success":true...}
4. [MQTT ←]  kaiser/god/esp/ESP_XXX/actuator/5/status    {"state":"ON"...}
```

### 9.2 Sensor-Daten Flow

```bash
mosquitto_sub -h localhost -t "kaiser/god/esp/+/sensor/+/data" -v

# Erwarteter Flow (alle 30s bei aktivem Sensor):
# kaiser/god/esp/ESP_XXX/sensor/4/data {"ts":...,"gpio":4,"raw":2048,"raw_mode":true}
```

**Kein Traffic?**
1. ESP online? → `curl http://localhost:8000/api/v1/esp/devices/ESP_XXX`
2. Sensor konfiguriert? → `curl http://localhost:8000/api/v1/sensors/ESP_XXX`

### 9.3 Heartbeat Flow

```bash
mosquitto_sub -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v

# Erwarteter Flow (alle 60s pro ESP):
# kaiser/god/esp/ESP_XXX/system/heartbeat {"ts":...,"uptime":...,"heap_free":...}
```

### 9.4 Config-Push Flow

```bash
# Terminal 1: Config-Topics beobachten
mosquitto_sub -h localhost -t "kaiser/god/esp/+/config*" -v

# Terminal 2: Config pushen
curl -X POST http://localhost:8000/api/v1/sensors/ESP_XXX/4 \
  -H "Content-Type: application/json" \
  -d '{"sensor_type": "DS18B20", "name": "Temp1", "enabled": true}'
```

**Erwarteter Flow:**
```
1. [API]     POST /sensors/ESP_XXX/4           → HTTP 201
2. [MQTT →]  kaiser/god/esp/ESP_XXX/config     {"sensors":[...]...}
3. [MQTT ←]  kaiser/god/esp/ESP_XXX/config_response  {"config_applied":true}
```

### 9.5 Zone-Assignment Flow

```bash
mosquitto_sub -h localhost -t "kaiser/god/esp/+/zone/*" -v

curl -X POST http://localhost:8000/api/v1/zone/devices/ESP_XXX/assign \
  -H "Content-Type: application/json" \
  -d '{"zone_id": "zone_1", "zone_name": "Zone 1"}'
```

**Erwarteter Flow:**
```
1. [API]     POST /zone/devices/.../assign     → HTTP 200
2. [MQTT →]  kaiser/god/esp/ESP_XXX/zone/assign  {"zone_id":"zone_1"...}
3. [MQTT ←]  kaiser/god/esp/ESP_XXX/zone/ack     {"success":true...}
```

### 9.6 Checkliste: Operation vollständig?

| Schritt | Prüfung | Tool |
|---------|---------|------|
| 1. API Response | HTTP 2xx erhalten? | curl Output |
| 2. MQTT Outbound | Server hat Message gesendet? | mosquitto_sub |
| 3. MQTT Inbound | ESP hat geantwortet? | mosquitto_sub |
| 4. State Updated | DB/API zeigt neuen State? | curl GET |

**Fehler-Diagnose:**
- Schritt 2 fehlt → Server-Problem → server-debug
- Schritt 3 fehlt → ESP-Problem → esp32-debug
- Schritt 4 fehlt → DB-Problem → db-inspector
```

---

### Phase 2: system-control.md verschlanken

#### 2.1 Zu entfernende Sections (komplett)

| Section | Zeilen | Grund | Ersatz |
|---------|--------|-------|--------|
| 1.1 Authentifizierung | 32-53 | → Reference 3.7 | Verweis |
| 4 Quick Reference | 146-222 | Duplikat | Verweis auf Reference |
| 6 Standard-Workflows | 249-294 | Duplikat | Verweis auf Reference 6 |
| 7 Flow-Verifikation | 298-412 | → Reference 9 (NEU) | Verweis |

**Entfernt:** ~260 Zeilen

#### 2.2 Zu kürzende Sections

| Section | Aktuell | Änderung | Neu |
|---------|---------|----------|-----|
| 2 Fähigkeiten | 68 Zeilen | Code-Blöcke entfernen, nur Bullet-Liste | ~25 Zeilen |
| 5 Sicherheitsregeln | 22 Zeilen | Befehle entfernen, nur Warnung | ~10 Zeilen |

#### 2.3 Zu behaltende Sections (angepasst)

| Section | Zeilen | Anpassung |
|---------|--------|-----------|
| Frontmatter | 11 | Unverändert |
| 1 Referenz-Dokument | 12 | Erweiterte Verweise hinzufügen |
| 3 Arbeitsweise | 18 | Unverändert |
| 8 Antwort-Format | 40 | Unverändert |
| 9 Einschränkungen | 32 | Unverändert |

---

### Phase 3: Finale Struktur

#### system-control.md (Ziel: ~120 Zeilen)

```
---
[Frontmatter - 11 Zeilen]
---

# System Control Agent

[Intro - 3 Zeilen]

## 1. Referenz-Dokumente (LIES ZUERST)

**Haupt-Referenz:** `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md`

| Thema | Section in Reference |
|-------|---------------------|
| Server Start/Stop/Health | Section 2 |
| REST-API Endpoints | Section 3 |
| MQTT-Operationen | Section 4 |
| ESP32-Hardware | Section 5 |
| Kombinierte Workflows | Section 6 |
| Troubleshooting | Section 7 |
| **Flow-Verifikation** | Section 9 |

**Authentifizierung:** Reference Section 3.7 (Credentials: Robin/Robin123!)

## 2. Deine Fähigkeiten

- **Server-Steuerung:** Start, Stop, Health, Logs
- **REST-API:** ESP-Management, Sensoren, Aktoren, Zonen, Debug
- **MQTT:** Traffic beobachten, Simulation, Commands, Cleanup
- **ESP32-Hardware:** Build, Flash, Monitor, Wokwi

*Details und Befehle → Reference Sections 2-5*

## 3. Arbeitsweise

### Bei Steuerungs-Anfragen:
1. **Lies die Referenz** (Section 2-5)
2. **Prüfe Voraussetzungen** (Server online? MQTT erreichbar?)
3. **Führe Befehl aus** (nutze dokumentierte Commands)
4. **Verifiziere Flow** (Reference Section 9)
5. **Berichte Status**

### Bei Debug-Sessions:
1. Diagnose: Was ist das Problem?
2. Logs prüfen
3. Hypothese bilden
4. Test durchführen
5. Lösung oder Delegation

## 4. Sicherheitsregeln

⚠️ **Kritische Operationen erfordern Bestätigung:**
- Emergency-Stop, ESP löschen, Flash erase, System-Reset

⚠️ **Immer Status prüfen vor Aktionen** (Reference Section 7)

## 5. Antwort-Format

[Template - 40 Zeilen - unverändert]

## 6. Einschränkungen & Delegation

[Delegation Matrix - 32 Zeilen - unverändert]
```

#### SYSTEM_OPERATIONS_REFERENCE.md (erweitert)

```
## 1. Datenbank
## 2. Server
   └─ 2.3 Logs (+ Windows PowerShell erweitert)
## 3. REST-API
   └─ 3.7 Authentifizierung (+ Standard-Credentials)
## 4. MQTT
## 5. ESP32-Hardware
## 6. Kombinierte Workflows
## 7. Troubleshooting
## 8. Wichtige Pfade
## 9. Flow-Verifikation (NEU - ~115 Zeilen)
   └─ 9.1 Pattern: Request mit MQTT-Verifikation
   └─ 9.2 Sensor-Daten Flow
   └─ 9.3 Heartbeat Flow
   └─ 9.4 Config-Push Flow
   └─ 9.5 Zone-Assignment Flow
   └─ 9.6 Checkliste
```

---

## 5. Verifizierung (nach Migration)

- [ ] Agent < 150 Zeilen (Ziel: ~120)
- [ ] Keine Befehls-Duplikate
- [ ] Alle Details in Reference
- [ ] Verweise funktionieren
- [ ] Flow-Verifikation in Reference Section 9
- [ ] Standard-Credentials in Reference Section 3.7
- [ ] Windows PowerShell in Reference Section 2.3

---

## 6. Empfohlene Reihenfolge

1. [ ] **Reference:** Section 3.7 Authentifizierung erweitern (Credentials)
2. [ ] **Reference:** Section 2.3 Logs erweitern (Windows PowerShell)
3. [ ] **Reference:** Section 9 Flow-Verifikation hinzufügen (NEU)
4. [ ] **Agent:** Section 1.1 entfernen, Verweis auf Reference 3.7
5. [ ] **Agent:** Section 4 entfernen, Verweis auf Reference 2-5
6. [ ] **Agent:** Section 6 entfernen, Verweis auf Reference 6
7. [ ] **Agent:** Section 7 entfernen, Verweis auf Reference 9
8. [ ] **Agent:** Section 2 kürzen (nur Bullet-Liste)
9. [ ] **Agent:** Section 5 kürzen (nur Warnungen)
10. [ ] **Verifizieren:** Agent testen mit Verweisen

---

## 7. Risiko-Bewertung

| Änderung | Risiko | Mitigation |
|----------|--------|------------|
| Befehle aus Agent entfernen | Niedrig | Reference enthält alle Befehle |
| Flow-Verifikation verschieben | Niedrig | Neuer Content, kein Verlust |
| Agent-Struktur ändern | Mittel | Schrittweise testen |

---

*Erstellt: 2026-02-04 | system-control Struktur-Analyse*
