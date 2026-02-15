# Frontend Inspection Report

**Datum:** 2026-02-15T12:44 UTC
**Systemstatus:** critical (debug-status.ps1)
**Frontend-URL:** http://localhost:5173
**Login-Status:** Login API funktioniert (admin/Admin123#)

---

## Systemstatus-Zusammenfassung

| Service | Status | Bemerkung |
|---------|--------|-----------|
| Frontend (Vite) | OK | Port 5173, HTTP 200 |
| Server API | OK | Login 200, /esp/devices 401 ohne Auth (erwartet) |
| Loki | error | Fallback: docker logs |

---

## Browser-Befunde

**Playwright MCP nicht verfuegbar** – manuelle Browser-Inspektion empfohlen. User hat angekuendigt: "ich logge im webportal ein wenn es soweit ist".

### API-Checks (Stellvertreter fuer Browser-Network)

| # | URL | Status | Typ |
|---|-----|--------|-----|
| 1 | http://localhost:5173/ | 200 | GET |
| 2 | POST /api/v1/auth/login | 200 | POST |
| 3 | GET /api/v1/esp/devices (ohne Auth) | 401 | GET |

---

## Frontend-Container-Logs

```
VITE v6.4.1 ready
Local: http://localhost:5173/
Frueher: [vite] http proxy error: /api/v1/auth/status - ECONNREFUSED 172.18.0.12:8000
```

**Hinweis:** ECONNREFUSED deutet auf kurzfristigen Server-Ausfall beim Frontend-Start hin. Aktuell antworten beide Services.

---

## DB-Konsistenz (Abgleich Frontend-Anzeige)

| Tabelle | Inhalt | Frontend erwartet |
|---------|--------|-------------------|
| esp_devices | MOCK_E1BD1447 (pending_approval) | Pending-Panel, nach Approval Dashboard |
| sensor_configs | 0 | Keine Sensor-Cards |
| sensor_data | 0 | Keine Live-Daten |

---

## Cross-Layer-Befunde

| # | Frontend-Symptom | Server/DB-Ursache | Korrelation |
|---|-----------------|-------------------|-------------|
| 1 | Leeres Dashboard | esp_devices nur MOCK, pending | User muss Devices approven |
| 2 | Keine Sensor-Daten | sensor_data=0 nach Cleanup | ESP verbinden + Sensoren konfigurieren |
| 3 | Proxy ECONNREFUSED (historisch) | Server evtl. noch nicht bereit | Beide laufen jetzt |

---

## Empfehlungen

1. **Login durchfuehren** (admin / Admin123#) – User hat signalisiert, dass er einloggt wenn bereit.
2. **Pending Devices approven:** MOCK_E1BD1447 oder ESP_472204 (sobald sichtbar) im Setup/Dashboard approven.
3. **SHT31 konfigurieren:** Nach ESP-Verbindung Sensor GPIO 21 (temperature + humidity) ueber UI hinzufuegen.
4. **Playwright/Browser:** Fuer detaillierte UI-Checks Playwright MCP nutzen (cursor-ide-browser).

---

*Report gemaess frontend-inspector Agent. Browser-Steps ohne Playwright; API + Logs als Fallback.*
