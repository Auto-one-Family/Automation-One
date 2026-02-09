# TM-Auftrag 05: Frontend Konsolidierung – Kritische Bewertung & Vollständige Umsetzung

**Verfasser:** Robin (System-Kontext)  
**Format:** Einzelgespräch mit Technical Manager  
**Ziel:** Codestruktur bewerten, Design behalten, modernisieren, robust und wiederverwendbar machen

---

## 0. Referenzdokumente für TM (Robin mitliefern)

**Diese Dateien zuerst lesen – sie liefern die Grundlage für gezielte Analyse.**

| Priorität | Pfad (relativ zu Projektroot) | Inhalt |
|-----------|-------------------------------|--------|
| 1 | `.claude/skills/frontend-development/SKILL.md` | Vue 3, Pinia, Composables, Stores, Views, ESP-Cards |
| 2 | `.claude/skills/frontend-debug/SKILL.md` | Build-Errors, WebSocket, Pinia-State, Log-Pfade |
| 3 | `.claude/reference/api/WEBSOCKET_EVENTS.md` | `sensor_data`, `device_approved` – Frontend nutzt für Echtzeit-Updates |
| 4 | `.claude/reference/api/REST_ENDPOINTS.md` | API-Calls von esp-store, auth-store |
| 5 | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Frontend in Datenflüssen |
| 6 | `El Frontend/src/views/`, `El Frontend/src/stores/` | SensorsView, esp-store, handleSensorData |

**Docs:** `El Frontend/Docs/UI/` – Dashboard, Views, Audit.

---

## 1. Referenzdateien für TM-Session hochladen

| # | Datei | Zweck |
|---|-------|-------|
| 1 | `.claude/skills/frontend-development/SKILL.md` | Frontend-Architektur |
| 2 | `.claude/skills/frontend-debug/SKILL.md` | Log-Analyse |
| 3 | `El Frontend/Docs/UI/` | Dashboard, Views |
| 4 | `El Frontend/src/` | Komponenten, Stores, Views |
| 5 | `El Frontend/src/views/DashboardView.vue` | Dashboard |
| 6 | `El Frontend/src/components/esp/` | ESP-Karten, Satellites |
| 7 | `El Frontend/src/views/SystemMonitorView.vue` | System Health |
| 8 | `.claude/reference/api/WEBSOCKET_EVENTS.md` | Events |
| 9 | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Datenflüsse |

---

## 2. IST-Zustand (Fakten)

### 2.1 Struktur

- **Framework:** Vue 3, TypeScript, Vite, Pinia, Tailwind.
- **Komponenten:** `components/` (common, dashboard, esp, system-monitor, zones, …).
- **Stores:** auth, esp, logic, database, dragState.
- **Views:** Dashboard, Sensors, Logic, SystemMonitor, Login, Settings, etc.
- **Design:** Iridescent, Seiten-Navigation, MainLayout.

### 2.2 Bekannte Themen

- **DB-Konsistenz:** Von ESP nicht akzeptierte Einstellungen wurden in DB übernommen – Frontend zeigt vermeintlich erfolgreiche Konfiguration.
- **Dashboard:** ESP-Orbital-Layout, SensorCards, Drag-Drop, Funktionsketten.
- **Inline-Einstellungen:** Mock/ESP-Cards, Zoneneinstellung, Pending Device Approval, Diagramm in ESP-Card.
- **Toast-System:** Error/Health-Anzeigen; Verknüpfung mit System Health.
- **Zonen/Subzonen:** Sensor-Card mit Zonen/Subzonen auf Dashboard; Production-Ansicht für Actuators und Logiken.

### 2.3 Geräteverwaltung

- Soll alle Sensor- und Aktor-Eigenschaften speichern.
- Geräteinformationen als Hersteller-Dokument: DB vs. eigener Ordner vs. beides (DB + Datei, verlinkt).

---

## 3. Kritische Bewertung (zuerst)

| Frage | Zu klären |
|-------|------------|
| Codestruktur | Ist die aktuelle Struktur gut genug für Weiterentwicklung oder Neuschreiben sinnvoll? |
| Alte Struktur | Dient sie nur als Vorbild oder soll darauf aufgebaut werden? |
| Wiederverwendbarkeit | Wie universell, robust, anpassbar sollen Komponenten sein? |
| Tools | Welche zusätzlichen Tools (Drag-Drop, Charts, etc.) sind sinnvoll? |

---

## 4. Offene Fragen (für TM)

1. **Codestruktur:** Alte Struktur nur als Vorbild oder gezielte Refactorings? Wo liegen die größten Schwachstellen?
2. **Design:** Iridescent, Seiten-Navigation, Layout bleiben – wo genau soll modernisiert werden?
3. **Dashboard:** Wie sollen Zonen-Container, Subzonen, Verbindungslinien mit Info dargestellt werden? Wie integrieren wir Grafana?
4. **Pending/DB-Konsistenz:** Wie soll das Frontend pending/error-States anzeigen? Wann zeigt es „angeschlossen“ vs. „fehlgeschlagen“?
5. **Geräteverwaltung:** DB, Ordner oder beides für Hersteller-Dokumente? Wie verlinken?
6. **System Health:** Wie integrieren wir Grafana? Vollständige Testsuite mit Verlinkung zu Logs, Monitor-Output, Netzwerk?
7. **Filter:** Wie soll Grafana Filter pro Seite übernehmen? Wie orchestrieren wir den Full-Stack?
8. **Tools:** Welche Tools für Drag-Drop, Charts, Layout verbessern die UX? (z.B. VueDraggable, Chart.js, D3)

---

## 5. Bereiche für Detail-Analyse

| Bereich | Dateien | Fokus |
|---------|---------|-------|
| Dashboard | DashboardView.vue, ESPOrbitalLayout, SensorCards | Layout, Drag-Drop |
| ESP-Cards | ESPCard, SensorSatellite, ActuatorSatellite | Inline-Einstellungen |
| Pending | PendingDevicesPanel, esp-store | Approval-Flow |
| Toast/Error | useToast, ErrorState, HealthProblemChip | Error/Health |
| Zonen | ZoneGroup, ZoneAssignmentPanel, Subzones | Darstellung |
| Stores | esp.ts, logic.ts | State, API-Calls |
| System Monitor | SystemMonitorView, HealthTab, EventsTab | Grafana-Integration |

### 5.1 Wo suchen / Was suchen

| Schicht | Wo suchen | Was suchen |
|---------|-----------|------------|
| **Stores** | `El Frontend/src/stores/esp.ts` | `handleSensorData`, `fetchAll`, `devices`, `pending` |
| **WebSocket** | `useWebSocket`, `main.ts` | WS-Subscription, `sensor_data` Handler |
| **Views** | `SensorsView.vue`, `DashboardView.vue` | `raw_value.toFixed(2)`, Device-Cards |
| **API** | `api/` | `POST /debug/mock-esp`, `GET /esp/devices` |
| **Pending** | `PendingDevicesPanel`, `UnassignedDropBar` | Approval-Flow, Zone-Zuordnung |

### 5.2 Agent-Befehle für gezielte Analyse

| Analyse-Ziel | Agent | TM-Befehl (Kern) |
|--------------|-------|------------------|
| Build-Error, TypeScript | frontend-debug | Analysiere Vite-Build, TypeScript-Fehler |
| WebSocket, Pinia-State | frontend-debug | Prüfe `espStore.handleSensorData`, WS-Reconnect |
| DB-Konsistenz in UI | frontend-debug + db-inspector | Wo zeigt Frontend „angeschlossen“ obwohl Backend fehlgeschlagen? |
| Grafana-Integration | frontend-dev | Wo soll Grafana iframe/URL eingebunden werden? |

---

## 6. Empfohlene Agents & Skills

| Zweck | Agent | Skill |
|-------|-------|-------|
| Frontend-Entwicklung | frontend-dev | frontend-development |
| Frontend-Debug | frontend-debug | frontend-debug |
| Flow-Konsistenz | agent-manager | agent-manager |

---

## 7. Verknüpfung mit anderen Punkten

- **Punkt 3 (Datenbank):** Pending State, DB-Konsistenz.
- **Punkt 6 (Test Engine):** Playwright, Vitest, Frontend-Tests.

---

## 8. Randinformationen (Full-Stack-Kontext)

| Kontext | Info |
|---------|------|
| **allSensors** | `SensorsView`: `devices.flatMap(esp => esp.sensors)` – Pending Devices nicht in espStore.devices |
| **WebSocket** | `handleSingleValueSensorData`: „We don't create new sensors here via WebSocket - they must be added via API.“ |
| **E2E** | Playwright sensor-live: `createMockEspWithSensors` → Device + Sensoren via API, dann MQTT für Live-Updates |
