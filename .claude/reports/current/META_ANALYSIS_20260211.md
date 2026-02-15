# Meta-Analyse: Vollständige Bug-Inventur AutomationOne

**Datum:** 2026-02-11 19:00 UTC
**Analysiert von:** meta-analyst (Cross-Layer Deep-Dive)
**Methode:** Code-Verifizierung aller bekannten Bugs + Tiefensuche nach neuen
**Scope:** ESP32 Firmware, Server, Frontend, MQTT, Docker, Dokumentation

---

## Executive Summary

| Kategorie | Anzahl |
|-----------|--------|
| Bekannte Bugs VERIFIZIERT GEFIXT | 8 |
| Offene Bugs (Code-verifiziert) | 8 |
| Falsche Behauptungen in Reports | 1 |
| Davon: Kritisch | 0 |
| Davon: Medium | 3 |
| Davon: Low | 3 |
| Davon: Info/Doku | 2 |

**Ergebnis:** Alle 5 Bugs aus der Wokwi Live Session (BUG 1-5) und alle 3 Doku/Infrastruktur-Bugs sind GEFIXT. Es verbleiben 8 offene Issues, keines davon kritisch.

---

## TEIL A: GEFIXTE BUGS (Verifiziert im Code)

Diese Bugs sind ERLEDIGT. Hier nur als Nachweis aufgelistet.

| # | Bug | Fix-Location | Verifiziert |
|---|-----|-------------|-------------|
| 1 | set_log_level params ignored | `main.cpp:1233` - params-Fallback implementiert | `doc.containsKey("params")` ✅ |
| 2 | Case-Sensitivity sensor_type | 4 Stellen: `main.cpp:2405`, `config_manager.cpp:1835`, `sensor_manager.cpp:321,592` | `toLowerCase()` an allen Eintrittspunkten ✅ |
| 3 | ZONE_MISMATCH auto-resolve | `heartbeat_handler.py:640-720` - 60s Cooldown, dual detection | `zone_resync_cooldown_seconds = 60` ✅ |
| 4 | SQLAlchemy flag_modified() | `zone_service.py:149,235,316` + `zone_ack_handler.py:140,158` | 5 neue `flag_modified()` ✅ |
| 5 | Retained LWT not cleared | `heartbeat_handler.py:212-225` - Clear bei jedem Heartbeat | `"Cleared retained LWT message"` ✅ |
| 6 | Mqtt_Protocoll.md Feld-Namen | `type`/`name` → `sensor_type`/`sensor_name` | Grep findet keine falschen Felder ✅ |
| 7 | Loki Self-Reference Loop | `promtail/config.yml:141-164` + Dashboard `!= "\|~"` | Promtail Drop + Dashboard Filter ✅ |
| 8 | system/diagnostics "kein Handler" | `diagnostics_handler.py` existiert, `main.py:267-271` registriert | Handler + Registration ✅ |

---

## TEIL B: OFFENE BUGS (Nur diese müssen bearbeitet werden)

### B1. Frontend Token-Refresh Race Condition

**Schwere:** MEDIUM
**Layer:** Frontend
**Location:** [api/index.ts:52-74](El Frontend/src/api/index.ts#L52-L74), [auth.store.ts:108-123](El Frontend/src/shared/stores/auth.store.ts#L108-L123)

**Problem:** Wenn mehrere API-Calls gleichzeitig 401 bekommen (z.B. nach Server-Rebuild), triggert jeder seinen eigenen `refreshTokens()` Call. Kein Mutex/Queue vorhanden. Erster Refresh invalidiert den alten Refresh-Token. Nachfolgende Refreshes schlagen fehl → `clearAuth()` → erzwungener Logout.

**Evidenz (Server-Log 17:03:01-03):**
```
5x JWT "Signature has expired" (parallel 401s)
4x Token-Blacklist duplicate key (parallele Refresh-Versuche)
```

**Fix:** Refresh-Promise cachen - nur 1 Refresh gleichzeitig, alle Wartenden bekommen dasselbe Ergebnis:
```typescript
let refreshPromise: Promise<void> | null = null
async function refreshTokens() {
  if (refreshPromise) return refreshPromise
  refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  return refreshPromise
}
```

**Agent:** frontend-dev

---

### B2. god_kaiser.log Kontamination durch pytest

**Schwere:** MEDIUM
**Layer:** Server (Infrastruktur)
**Location:** [logging.yaml:18](El Servador/god_kaiser_server/config/logging.yaml#L18) → `filename: logs/god_kaiser.log`

**Problem:** pytest nutzt dieselbe Logging-Konfiguration wie der laufende Server. Test-Output (MagicMock-Errors) wird in die Runtime-Log-Datei geschrieben. Jede Debug-Analyse die `logs/god_kaiser.log` als Quelle nutzt, arbeitet mit kontaminierten Daten.

**Evidenz (god_kaiser.log Zeile 4):**
```json
{"level": "WARNING", "message": "ZONE_MISMATCH [ESP_APPROVED]: ... zone_id='<MagicMock ...>'"}
```

**Fix:** In `conftest.py` oder `pyproject.toml` die File-Handler-Konfiguration für Tests überschreiben:
```python
# conftest.py
@pytest.fixture(autouse=True, scope="session")
def disable_file_logging():
    for handler in logging.root.handlers[:]:
        if isinstance(handler, logging.FileHandler):
            logging.root.removeHandler(handler)
```

**Agent:** server-dev

---

### B3. Subzone DB-Orphans bei Zone-Deletion

**Schwere:** MEDIUM
**Layer:** Server (DB)
**Location:** [subzone.py:55-57](El Servador/god_kaiser_server/src/db/models/subzone.py#L55-L57)

**Problem:** `parent_zone_id` hat keinen Foreign Key mit CASCADE. Wenn eine Zone via REST API gelöscht wird, bleiben Subzone-Records als Orphans in der DB. Die ESP32-Firmware macht zwar ein Cascade-Delete im NVS, aber die Server-DB hat keine Referenzintegrität für zone_id.

**Evidenz (subzone.py:55-57):**
```python
esp_id: Mapped[str] = mapped_column(
    ForeignKey("esp_devices.device_id", ondelete="CASCADE"),  # ← Nur bei ESP-Deletion!
)
parent_zone_id: Mapped[str] = mapped_column(String(50), ...)  # ← Kein FK!
```

**Fix:** zone_service.py muss bei Zone-Deletion explizit Subzones löschen:
```python
# In remove_zone():
await subzone_repo.delete_by_zone_id(zone_id)
```

**Agent:** server-dev

---

### B4. Subscriber QoS Inkonsistenz für system/diagnostics

**Schwere:** LOW
**Layer:** Server (MQTT)
**Location:** [subscriber.py:119-124](El Servador/god_kaiser_server/src/mqtt/subscriber.py#L119-L124)

**Problem:** `system/diagnostics` ist non-kritische Telemetrie (wie Heartbeat), bekommt aber QoS 1 statt QoS 0.

**Evidenz:**
```python
if "heartbeat" in pattern:
    qos = 0  # ← Heartbeat korrekt
elif "config_response" in pattern:
    qos = 2
else:
    qos = 1  # ← diagnostics landet hier (sollte QoS 0 sein)
```

**Fix:**
```python
if "heartbeat" in pattern or "diagnostics" in pattern:
    qos = 0
```

**Agent:** server-dev (1 Zeile)

---

### B5. mosquitto-exporter Instabilität

**Schwere:** LOW
**Layer:** Docker/Monitoring
**Location:** `docker-compose.yml` (mosquitto-exporter Service)

**Problem:** Exporter verliert alle ~5 Minuten die Verbindung zum Broker (EOF), DNS-Auflösung schlägt intermittierend fehl. Docker healthcheck: UNHEALTHY.

**Evidenz (mosquitto-exporter logs):**
```
06:50:51: Connected to tcp://mqtt-broker:1883
06:51:20: Error: Connection lost: EOF
06:56:10: Error: Connection lost: EOF
```

**Fix:** Exporter-Image Version prüfen (sapcc/mosquitto-exporter:0.8.0) oder Healthcheck-Toleranz erhöhen.

**Agent:** system-control

---

### B6. 4 ORPHANED MQTT Topics im ESP32 Code

**Schwere:** LOW
**Layer:** ESP32 Firmware
**Location:** [topic_builder.h:17,26,35,42](El Trabajante/src/utils/topic_builder.h#L17) + [topic_builder.cpp:88,147,213,244](El Trabajante/src/utils/topic_builder.cpp#L88)

**Problem:** 4 Topic-Builder-Funktionen haben keinen Server-Counterpart:
- `buildSensorBatchTopic()` - Kein Server-Handler
- `buildActuatorEmergencyTopic()` - Redundant zu `actuator/{gpio}/alert`
- `buildBroadcastEmergencyTopic()` - GHOST: Server→ESP, aber ESP subscribed nicht
- `buildSubzoneStatusTopic()` - Kein Server-Handler

**Status:** Dokumentiert mit `// ORPHANED` Kommentaren. Inventory in Mqtt_Protocoll.md. Wartet auf Cleanup-Freigabe.

**Agent:** esp32-dev (bei Cleanup-Freigabe)

---

### B7. NVS Legacy Keys mit BROKEN Markierung

**Schwere:** INFO
**Layer:** ESP32 Firmware
**Location:** [config_manager.cpp:244-245, 1133, 1395-1403, 1433-1437](El Trabajante/src/services/config/config_manager.cpp#L244)

**Problem:** 12 NVS-Key-Definitionen sind mit `❌ BROKEN` markiert (>15 Zeichen, NVS-Limit). Sie sind NICHT aktiv im Code, nur für Migration-Dokumentation vorhanden. Neue kompakte Keys (≤15 Zeichen) sind in Benutzung.

**Status:** Kein akutes Problem. Können bei nächstem Major-Release entfernt werden.

---

### B8. MQTT_DEBUG_REPORT enthält falsche Behauptung

**Schwere:** INFO/DOC
**Layer:** Dokumentation
**Location:** [MQTT_DEBUG_REPORT.md](../../.claude/reports/current/MQTT_DEBUG_REPORT.md) Abschnitt 3.5

**Problem:** Report behauptet "system/diagnostics hat KEINEN Server-Handler". Das ist FALSCH.

**Realität:**
- `diagnostics_handler.py` existiert mit vollständiger Implementierung
- `main.py:267-271` registriert den Handler korrekt
- `MQTT_TOPICS.md` dokumentiert den Handler korrekt (Zeilen 583-585)

**Fix:** Report als veraltet markieren oder korrigieren.

---

## TEIL C: System-Infrastruktur Status (Snapshot)

| Service | Status | Anmerkung |
|---------|--------|-----------|
| postgres | HEALTHY | 1 Device, 1 User, 11 Sensor-Defaults |
| mqtt-broker | HEALTHY | Port 1883+9001 published |
| el-servador | HEALTHY | Alle Maintenance-Jobs laufen |
| el-frontend | HEALTHY | Port 5173 |
| grafana | HEALTHY | Dashboards mit Loki-Fix |
| prometheus | HEALTHY | Scraping funktioniert |
| loki | HEALTHY | Self-Reference-Loop gefixt |
| promtail | HEALTHY | 5 Pipeline-Stages |
| mosquitto-exporter | **UNHEALTHY** | EOF-Reconnect-Loop (Bug B5) |
| cadvisor | HEALTHY | Container-Metrics OK |
| postgres-exporter | HEALTHY | DB-Metrics OK |
| pgadmin | HEALTHY | Port 5050 |

**ESP_00000001:** In DB (status: online, zone: greenhouse). Letzte MQTT-Verbindung: 17:23 UTC (Timeout nach 95s).

---

## TEIL D: Priorisierte Reihenfolge

| Prio | Bug | Effort | Agent |
|------|-----|--------|-------|
| 1 | B1: Token-Refresh Race | 30 min | frontend-dev |
| 2 | B2: god_kaiser.log Kontamination | 15 min | server-dev |
| 3 | B3: Subzone DB-Orphans | 45 min | server-dev |
| 4 | B4: Subscriber QoS | 5 min | server-dev |
| 5 | B5: mosquitto-exporter | 15 min | system-control |
| 6 | B6: ORPHANED Topics | 30 min | esp32-dev (bei Freigabe) |
| 7 | B7: NVS Legacy Keys | - | Nächstes Major-Release |
| 8 | B8: Report-Korrektur | 5 min | meta-analyst |

**Gesamtaufwand offene Bugs:** ~2.5h (ohne B6, B7)

---

**Report-Ende. 8 Bugs gefixt, 8 offen. Kein kritischer Blocker.**
