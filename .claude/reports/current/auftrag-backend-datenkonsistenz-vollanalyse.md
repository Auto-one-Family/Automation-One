# Auftrag: Backend-Datenkonsistenz — Vollanalyse (Zonen, Subzonen, Geräte, System-State)

> **Erstellt:** 2026-03-04  
> **Erstellt von:** Automation-Experte (Life-Repo)  
> **Priorität:** Hoch — Blocker für stabiles Zonen/Subzonen-System  
> **Kontext:** Robin beobachtet: Monitor öffnen → erste Sekunde "Keine Subzone" für alle Sensoren/Aktoren → nächste Sekunde korrekte Anzeige. **Zwei Logiken oder Speicherungen** vermutet. Datenbank-Speicherung und -Verarbeitung sollen verifiziert werden.  
> **Fokus:** **Backend zuerst** — präzise Analyse, dann Frontend-Anpassungen.

---

## 1. Executive Summary

**Ziel:** Eine **vollständige Backend-Analyse** die dokumentiert:
1. **Wo** und **wie** Zone-, Subzone- und Gerätedaten in der Datenbank gespeichert und verarbeitet werden
2. **Welche** REST-Endpoints und MQTT-Handler welche Tabellen lesen/schreiben
3. **Ob** es mehrere Pfade oder Logiken gibt, die zu inkonsistentem Frontend-Verhalten führen können
4. **Wie** ein stabiles System aufgebaut sein muss: DB als Single Source of Truth, Backend als einziger Schreibweg, Frontend mit Ready-Gate oder konsolidiertem Endpoint

**Erwartetes Ergebnis:** Ein **Backend-Analyse-Bericht** mit:
- Inventar aller relevanten Tabellen, Endpoints, Services
- Datenfluss-Diagrammen (Text/ASCII)
- Identifizierten **Bruchstellen** (Race Conditions, doppelte Quellen, fehlende FKs)
- **Priorisierter Fix-Liste** für Backend-Stabilisierung
- Klaren **Empfehlungen** für Frontend-Anpassungen (Ready-Gate, monitor-data Endpoint)

---

## 2. Ausgangsproblem — Robins Beobachtung

**Das konkrete Problem:** Wenn Robin den Monitor öffnet, wo ihm Subzonen und Sensoren darin angezeigt werden, sieht er in der **ersten Sekunde** eine Ansicht, in der alle Sensoren und Aktoren unter „Keine Subzone“ stehen. In der **nächsten Sekunde** erscheinen dann die richtigen Einstellungen — die Geräte sind korrekt ihren Subzonen zugeordnet.

**Robins Vermutung:** Es müssen **zwei Logiken oder Speicherungen** verbaut sein. Warum sonst würde zuerst ein falscher Zustand gezeigt und danach der richtige?

**Weitere Unsicherheiten:**
- Ob Daten wirklich ordentlich in der Datenbank gespeichert und verarbeitet werden
- Ob das Zonen- und Subzonen-System sowie die Geräteorganisation stabil und sicher laufen
- Ob Backend und Frontend vollständig miteinander harmonieren

**Kontext:** Das System ist fast perfekt — es fehlt ein Feinschliff und eine ordentliche Organisation des Backends; das Frontend muss an einigen Stellen noch angepasst werden. Robin will verstehen, wie ein stabiles System aufgebaut sein muss, damit Datenbank, Backend und Frontend vollständig zusammenpassen — für System-State, Sensordatenbank, Ausführungen, Logs, Wissensdatenbank. Der User soll immer tiefer konfigurieren können, ohne eingeschränkt zu sein, wenn er nicht konfiguriert oder Wissen einstellt. Spezieller Fokus: Zone- und Subzone-Einstellung sowie Geräte und deren stabile Konfiguration.

**Dieser Auftrag** analysiert das gesamte System (Datenbank, Backend, Frontend) um diese Fragen zu beantworten und die Ursache des Flackerns zu finden — unabhängig davon, ob sie im Backend, Frontend oder in der Datenablage liegt.

---

## 3. Robins Anforderungen (Kontext)

- **System-State:** Sensordatenbank, Ausführungen (Logic-Engine), Logs, Wissensdatenbank — alles muss **parallel existieren**, sich gegenseitig informieren
- **User kann tiefer konfigurieren** — ohne Einschränkung wenn er nicht konfiguriert oder Wissen einstellt
- **Spezieller Fokus:** Zone- und Subzone-Einstellung, Geräte und deren stabile, ordentliche Konfiguration
- **System ist fast perfekt** — Feinschliff, ordentliche Backend-Organisation, dann Frontend-Anpassungen
- **Start mit Backend-Analyse** — genaue Analyse zuerst

---

## 4. Wissenschaftliche Grundlagen — Optimiert für AutomationOne

### 4.1 Strong Consistency vs. Eventual Consistency (für AutomationOne)

**Strong Consistency** bedeutet: Jede Leseoperation liefert den zuletzt geschriebenen Wert. Alle Replicas sind sofort synchron. **Eventual Consistency** bedeutet: Nach einer endlichen Zeit konvergieren alle Replicas; vorher können temporäre Inkonsistenzen auftreten.

**AutomationOne ist zentralisiert:** Ein El Servador, eine PostgreSQL-Datenbank, ein Kaiser. Keine geo-verteilten Edge-Knoten, keine Replikation über mehrere Standorte. Für ein solches System ist **Strong Consistency die richtige Wahl**. Die Forschung (Stender et al. 2023, Fog/CRDT) zeigt: Eventual Consistency mit CRDTs lohnt sich erst bei geo-verteilten Fog-Systemen mit vielen Edge-Knoten — dort reduziert sie Latenz um bis zu 50%. AutomationOne braucht das nicht. PostgreSQL mit ACID-Transaktionen liefert Strong Consistency. **Fazit:** Die Datenbank ist die einzige autoritative Quelle. Jeder Schreibweg (REST oder MQTT-Handler) schreibt in dieselbe DB. Es gibt keine „zwei Logiken“ im Backend — nur eine DB.

**Datentyp-Unterscheidung (Apache IoTDB, Azure IoT Hub):** Core-Metadaten (Gerätekonfiguration, Zone, Subzone) brauchen Strong Consistency. Time-Series (sensor_data) können Availability priorisieren. AutomationOne trennt das bereits: esp_devices, subzone_configs, sensor_configs = Konfiguration = Strong. sensor_data = Zeitreihen = kann bei Replikation eventual sein; bei einer DB irrelevant.

### 3.2 Root-Cause „Keine Subzone“ — Exakte Erklärung

Das Flackern entsteht **nicht** durch zwei Backend-Logiken, sondern durch eine **Frontend-Race-Condition**:

1. **MonitorView** rendert sofort beim Öffnen. Sie nutzt **useZoneGrouping(zoneId)**, ein Composable das aus **espStore.devices** ableitet: Es iteriert über alle ESPs in der Zone, holt deren Sensoren/Aktoren, und gruppiert sie nach Subzone (über subzone_configs.assigned_gpios oder subzone_id).

2. **espStore.devices** wird aus **mehreren asynchronen Quellen** gefüllt:
   - REST: `GET /esp` oder `GET /zone/{id}/devices` beim ersten Load
   - WebSocket: `zone_assignment` (wenn User Zone zuweist)
   - WebSocket: `subzone_assignment` (wenn Subzone bestätigt)
   - Möglicherweise: `getSubzones(espId)` pro ESP, separat

3. **Ablauf beim Monitor-Öffnen:**
   - t=0ms: MonitorView mountet, useZoneGrouping wird aufgerufen
   - t=0ms: espStore.devices ist noch **leer** oder enthält ESPs **ohne** vollständige Subzone-Daten (getSubzones noch nicht zurück)
   - t=0ms: useZoneGrouping gruppiert: Sensoren ohne subzone_id → „Keine Subzone“
   - t=0ms: **Erste Render-Pass** → User sieht „Keine Subzone“ für alle
   - t=500–1500ms: REST-Response und/oder WebSocket-Events treffen ein
   - t=500–1500ms: espStore wird aktualisiert, useZoneGrouping rechnet neu
   - t=500–1500ms: **Zweite Render-Pass** → User sieht korrekte Subzonen

4. **Warum „zwei Logiken“?** Es sind **zwei Render-Passes** mit unterschiedlichen Datenständen — nicht zwei Speicherorte. Die DB hat von Anfang an die richtigen Daten. Das Frontend rendert nur zu früh.

### 4.3 Ready-Gate — Technische Umsetzung

Ein **Ready-Gate** verhindert, dass UI-Komponenten rendern, bevor alle benötigten Daten geladen sind. Konkret für Monitor L2:

- **State:** `isMonitorDataReady: Ref<boolean>` (initial false)
- **Initial-Load:** Beim Betreten der Monitor-Route: Parallel `GET /esp` (oder /zone/devices) + pro ESP `GET /subzone/devices/{espId}/subzones` — oder besser: ein einziger konsolidierter Call. Erst wenn **alle** Responses da sind: `isMonitorDataReady = true`.
- **Rendering:** `v-if="isMonitorDataReady"` auf dem Zone/Subzone-Gruppierungs-Container. Stattdessen: Skeleton oder Spinner bis ready.
- **WebSocket:** Wenn WS-Events (`zone_assignment`, `subzone_assignment`) **vor** dem REST-Load eintreffen: In eine **Event-Queue** puffern. Nach REST-Load: Queue abarbeiten, dann erst `isMonitorDataReady = true`. Verhindert, dass WS-Teildaten den Store überschreiben und dann REST die „älteren“ Daten liefert.

**State-Maschine für gültige Übergänge:** loading → ready | error. Nie loading + ready gleichzeitig. Feature-Sliced Design und SvelteKit-Literatur empfehlen explizite State-Maschinen (z.B. useReducer) statt verstreuter Booleans.

### 4.4 Konsolidierter Endpoint — Warum er das Problem löst

Statt das Frontend aus **espStore + getSubzones + Hierarchy** clientseitig zu aggregieren, liefert ein **einziger** Backend-Endpoint alles:

- **GET /api/v1/zone/{zone_id}/monitor-data**
- **Response:** Zone + Subzonen (mit subzone_id, subzone_name, assigned_gpios) + pro Subzone: `sensors[]` und `actuators[]` (mit id, name, gpio, current_value, quality, etc.) + Gruppe „Keine Subzone“ für GPIOs die in keiner subzone_configs.assigned_gpios vorkommen.

**Vorteile:**
- **Ein Request** — kein Race zwischen mehreren Calls
- **Serverseitige Auflösung** — Backend liest subzone_configs.assigned_gpios, findet für jeden GPIO den Sensor/Aktor (sensor_configs, actuator_configs), joinet mit sensor_data für letzte Werte
- **Frontend** ruft einmal auf, speichert Ergebnis, rendert. Kein useZoneGrouping aus mehreren Quellen.
- **ThingsBoard-Pattern:** Klare Trennung Config (REST) vs. Live-Telemetrie (WebSocket). Der monitor-data Endpoint liefert den **Konfigurations-Snapshot** inkl. letzter Werte; WebSocket kann danach nur noch Deltas pushen.

### 4.5 Architektur-Prinzip — Übersicht

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STABILES IOT-SYSTEM — Datenfluss                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  POSTGRESQL (19 Tabellen) — Strong Consistency, Single Source of Truth      │
│  • esp_devices (zone_id, zone_name, master_zone_id)                          │
│  • subzone_configs (esp_id, subzone_id, assigned_gpios, ...)                 │
│  • sensor_configs, actuator_configs (esp_id, gpio)                          │
│  • sensor_data, logic_executions, audit_logs, zone_contexts                   │
│                                                                             │
│  EL SERVADOR — Einziger Schreibweg, konsolidierte Lese-Endpoints             │
│  • ZoneService, SubzoneService, KaiserService                                 │
│  • NEU: MonitorDataService → GET /zone/{id}/monitor-data                      │
│                                                                             │
│  EL FRONTEND — Kein Rendern mit leeren Defaults                              │
│  • Option A: Ready-Gate (isMonitorDataReady) + Skeleton bis Load fertig      │
│  • Option B: monitor-data Endpoint → ein Call, direkt rendern                │
│  • Kein clientseitiges Aggregieren aus espStore + getSubzones + Hierarchy   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Block 1: Datenbank-Inventar (PostgreSQL)

**Auftrag an den ausführenden Agenten:** `server-dev` oder `db-inspector` — im **El Servador/god_kaiser_server** alle relevanten Tabellen und deren Beziehungen dokumentieren. Output: `.claude/reports/current/backend-datenkonsistenz-bericht-2026-03-04.md`

### 5.1 Zone / Subzone / Geräte

| # | Tabelle | Relevante Spalten | FK / Beziehungen | Zu dokumentieren |
|---|---------|------------------|------------------|------------------|
| 1.1 | esp_devices | id, zone_id, zone_name, master_zone_id, is_zone_master, ... | — | Wann wird zone_id gesetzt? Durch welchen Pfad? |
| 1.2 | subzone_configs | id, esp_id, subzone_id, subzone_name, parent_zone_id, assigned_gpios (JSONB), safe_mode_active, ... | esp_id → esp_devices | assigned_gpios: Array von GPIOs; Auflösung zu sensor_configs/actuator_configs |
| 1.3 | sensor_configs | id, esp_id, gpio, sensor_type, subzone_id?, ... | esp_id → esp_devices | Hat sensor_configs subzone_id? Oder nur über subzone_configs.assigned_gpios? |
| 1.4 | actuator_configs | id, esp_id, gpio, actuator_type, subzone_id?, ... | esp_id → esp_devices | Analog sensor_configs |
| 1.5 | zones | Existiert? | — | Zonen sind laut Bericht KEINE eigene Tabelle — nur Felder auf esp_devices |

**Frage:** Gibt es `subzone_id` auf sensor_configs/actuator_configs, oder ist die Zuordnung ausschließlich über subzone_configs.assigned_gpios (GPIO-Liste pro Subzone)?

**Zuordnungslogik (assigned_gpios):** subzone_configs.assigned_gpios = [4, 5, 6] bedeutet: Alle Sensoren/Aktoren mit (esp_id, gpio) in {(esp_id, 4), (esp_id, 5), (esp_id, 6)} gehören zu dieser Subzone. Serverseitig: Für jede Subzone assigned_gpios iterieren → sensor_configs/actuator_configs WHERE esp_id=X AND gpio IN assigned_gpios. GPIOs die in keiner Subzone vorkommen → „Keine Subzone“.

### 5.2 Sensordaten / Ausführungen / Logs

| # | Tabelle | Relevante Spalten | Zu dokumentieren |
|---|---------|-------------------|------------------|
| 2.1 | sensor_data | sensor_config_id, value, raw_value, quality, timestamp | FK zu sensor_configs; Schreibpfad (MQTT-Handler) |
| 2.2 | cross_esp_logic, logic_execution_history | rule_id, triggered_at, ... | Ausführungs-Historie; Tabellen: `cross_esp_logic`, `logic_execution_history` |
| 2.3 | audit_logs | request_id, action, ... | Logging; request_id Größe (VARCHAR 255) |
| 2.4 | esp_heartbeat_logs | esp_id, ... | Geräte-Online-Status (Tabelle: `esp_heartbeat_logs`) |

### 5.3 Wissensdatenbank

| # | Tabelle | Relevante Spalten | Zu dokumentieren |
|---|---------|-------------------|------------------|
| 3.1 | zone_contexts | zone_id, variety, substrate, growth_phase, ... | Getrennt von Konfiguration; 404 wenn leer |
| 3.2 | subzone_configs.custom_data | JSONB | Subzone-Wissen optional |

### 5.4 Ausgabe im Bericht

- ER-Diagramm (Text/ASCII) der relevanten Tabellen und FKs
- Klarstellung: subzone_id auf Sensor/Aktor-Config vs. assigned_gpios in subzone_configs
- Welche Tabellen werden von welchen Services geschrieben?

---

## 6. Block 2: REST-Endpoints — Zone, Subzone, Geräte

**Auftrag an den ausführenden Agenten:** `server-dev` — Alle Endpoints die Zone/Subzone/Geräte lesen oder schreiben, mit exaktem Pfad, Handler, Service, DB-Operation. Referenz: `.claude/reference/api/REST_ENDPOINTS.md`

### 6.1 Zone

| Methode | Pfad | Handler | Service | DB-Operation |
|---------|------|---------|---------|--------------|
| POST | /api/v1/zone/devices/{esp_id}/assign | zone.py | ZoneService | esp_devices.zone_id, zone_name, master_zone_id |
| DELETE | /api/v1/zone/devices/{esp_id}/zone | zone.py | ZoneService | zone_id = NULL, Cascade Subzone? |
| GET | /api/v1/zone/devices/{esp_id} | zone.py | ZoneService | SELECT esp_devices |
| GET | /api/v1/zone/{zone_id}/devices | zone.py | ZoneService | SELECT WHERE zone_id |
| GET | /api/v1/zone/unassigned | zone.py | ZoneService | SELECT WHERE zone_id IS NULL |

### 6.2 Subzone

| Methode | Pfad | Handler | Service | DB-Operation |
|---------|------|---------|---------|--------------|
| POST | /api/v1/subzone/devices/{esp_id}/subzones/assign | subzone.py | SubzoneService | INSERT/UPDATE subzone_configs |
| GET | /api/v1/subzone/devices/{esp_id}/subzones | subzone.py | SubzoneService | SELECT subzone_configs |
| GET | /api/v1/subzone/devices/{esp_id}/subzones/{subzone_id} | subzone.py | SubzoneService | SELECT WHERE subzone_id |
| DELETE | /api/v1/subzone/devices/{esp_id}/subzones/{subzone_id} | subzone.py | SubzoneService | DELETE subzone_configs |
| POST | .../safe-mode, DELETE .../safe-mode | subzone.py | SubzoneService | UPDATE safe_mode_active |

### 6.3 Geräte / ESP / Hierarchy

| Methode | Pfad | Handler | Service | DB-Operation |
|---------|------|---------|---------|--------------|
| GET | /api/v1/kaiser/{kaiser_id}/hierarchy | kaiser.py | KaiserService | get_hierarchy() — Zone→Subzone→Devices (ESPs); für god: `/kaiser/god/hierarchy` |
| GET | /api/v1/esp/devices, /api/v1/esp/devices/{esp_id} | esp.py | EspService | esp_devices + sensors + actuators |
| GET | /api/v1/zone/{zone_id}/monitor-data | zone.py | MonitorDataService | **BEREITS IMPLEMENTIERT** — Zone + Subzonen + Sensoren/Aktoren pro Subzone |

**monitor-data Endpoint — Exaktes Schema (bereits implementiert):**

- **Request:** GET /api/v1/zone/{zone_id}/monitor-data
- **Response:** `ZoneMonitorData` mit:
  - `zone_id`, `zone_name`
  - `subzones: SubzoneGroup[]` — jedes SubzoneGroup: `subzone_id` (oder null für „Keine Subzone“), `subzone_name`, `sensors: SubzoneSensorEntry[]`, `actuators: SubzoneActuatorEntry[]`
  - `sensor_count`, `actuator_count`, `alarm_count`
- **Logik serverseitig:** ESPs mit zone_id laden → subzone_configs pro ESP → für jede Subzone: assigned_gpios durchgehen, (esp_id, gpio) → sensor_configs/actuator_configs finden, letzte Werte aus sensor_data/actuator state → Gruppierung. GPIOs die in keiner assigned_gpios vorkommen → SubzoneGroup(subzone_id=null, subzone_name="Keine Subzone").

### 6.4 Ausgabe im Bericht

- Vollständige Tabelle aller Endpoints mit Pfad, Service, DB-Tabelle
- **Bruchstelle:** Hierarchy liefert ESPs pro Subzone, nicht Sensoren/Aktoren. **monitor-data Endpoint existiert bereits** — prüfen ob MonitorView ihn als Primary nutzt oder ob Fallback (useZoneGrouping) die Race verursacht.

---

## 7. Block 3: MQTT-Handler — Schreibpfade in DB

**Auftrag an den ausführenden Agenten:** `server-dev` — Alle MQTT-Handler die in die DB schreiben, dokumentieren. Referenz: `.claude/reference/api/MQTT_TOPICS.md`

| Topic (Pattern) | Handler | DB-Operation | Tabelle |
|-----------------|---------|--------------|---------|
| kaiser/{kaiser_id}/esp/{esp_id}/zone/ack | zone_ack_handler | UPDATE esp_devices (zone_id bestätigt) | esp_devices |
| kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack | subzone_ack_handler | UPDATE subzone_configs, last_ack_at | subzone_configs |
| kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data | sensor_handler | INSERT sensor_data | sensor_data |
| kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status | actuator_handler | UPDATE actuator_configs (state) | actuator_configs |
| kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat | heartbeat_handler | INSERT esp_heartbeat_logs, UPDATE esp_devices (last_seen) | esp_heartbeat_logs, esp_devices |
| kaiser/{kaiser_id}/esp/{esp_id}/config_response | config_handler | UPDATE sensor_configs/actuator_configs | sensor_configs, actuator_configs |

**Frage:** Schreiben zone_ack und subzone_ack in dieselben Tabellen wie die REST-Endpoints? Gibt es Konflikte oder Race Conditions?

---

## 8. Block 4: Service-Layer — Datenfluss

**Auftrag an den ausführenden Agenten:** `server-dev` — Für ZoneService, SubzoneService, KaiserService, MonitorDataService:

1. **ZoneService:** assign_zone, remove_zone — welche Repositories? Cascade bei Zone-Removal (Subzone-Löschung)?
2. **SubzoneService:** assign_subzone — wie wird assigned_gpios validiert? Konflikt mit sensor_configs.gpio?
3. **KaiserService:** get_hierarchy — welche Tabellen werden gelesen? Warum liefert es ESPs pro Subzone statt Sensoren/Aktoren?
4. **MonitorDataService:** Existiert bereits in `src/services/monitor_data_service.py` — liefert ZoneMonitorData für GET /zone/{zone_id}/monitor-data. Frontend-API: `zonesApi.getZoneMonitorData()` in `El Frontend/src/api/zones.ts`.

---

## 9. Block 5: Identifizierte Bruchstellen (Hypothesen)

| ID | Beschreibung | Schicht | Vermutete Ursache | Verifikation im Code |
|----|--------------|---------|-------------------|----------------------|
| BK1 | "Keine Subzone" in erster Sekunde | Frontend | useZoneGrouping berechnet aus espStore.devices bevor Subzone-Daten geladen; espStore aus REST + WS; erste Render-Pass mit leerem/teilleerem Store | MonitorView.vue, useZoneGrouping.ts: Nutzt MonitorView getZoneMonitorData als Primary? Oder nur useZoneGrouping-Fallback? |
| BK2 | Monitor-Endpoint nutzung | Backend/Frontend | monitor-data Endpoint existiert; prüfen ob MonitorView ihn als Primary nutzt. Falls nicht: Umstellung auf getZoneMonitorData vermeidet Race. | MonitorView.vue: Datenquelle für L2 — API vs. useZoneGrouping |
| BK3 | subzone_id vs. assigned_gpios | DB | sensor_configs/actuator_configs haben KEIN subzone_id — nur subzone_configs.assigned_gpios. Keine Divergenz möglich. | db/models/sensor.py, actuator.py, subzone.py — bestätigen |
| BK4 | Subzone Create mit leeren GPIOs | Backend | useSubzoneCRUD sendet assigned_gpios: []; Backend akzeptiert (min_length=0) | subzone.py, SubzoneAssignRequest: Pydantic-Schema |
| BK5 | espWithSubzone-Lookup | Frontend | useSubzoneCRUD nutzt device.subzone_id — ein ESP hat mehrere Subzonen; Lookup falsch | useSubzoneCRUD.ts: saveSubzoneName, deleteSubzone |

**Auftrag:** Jede Hypothese im Backend-Code verifizieren oder widerlegen. BK1/BK2: Backend-Erweiterung (monitor-data) + Frontend Ready-Gate oder Umstellung. BK3: Dokumentation. BK4: Backend-Validierung optional. BK5: Frontend-Fix.

---

## 10. Block 6: Stabilitäts-Anforderungen (Soll-Zustand)

**Wie ein stabiles System gebaut sein muss — für AutomationOne:**

### 10.1 Datenbank

- **Single Source of Truth:** Alle Konfiguration (Zone, Subzone, Geräte) in PostgreSQL. Keine parallelen Caches oder Replicas die sich widersprechen. Strong Consistency durch ACID-Transaktionen.
- **Klare FK-Ketten:** esp_devices → subzone_configs; esp_devices → sensor_configs, actuator_configs. Jeder Sensor/Aktor gehört zu genau einem ESP; jede Subzone zu genau einem ESP.
- **Keine Redundanz bei Subzone-Zuordnung:** Entweder (a) subzone_id auf sensor_configs/actuator_configs ODER (b) ausschließlich subzone_configs.assigned_gpios (GPIO-Liste). Nicht beides parallel ohne automatische Sync — sonst können sie divergieren.
- **Audit:** Konfigurationsänderungen (Zone assign, Subzone assign/remove) in audit_logs. request_id VARCHAR(255) für Correlation-IDs.

### 10.2 Backend

- **Ein Schreibweg pro Entität:** Zone nur über ZoneService; Subzone nur über SubzoneService. MQTT-Handler (zone_ack, subzone_ack) schreiben in dieselben Tabellen — keine separaten „MQTT-Caches“.
- **Konsolidierte Lese-Endpoints:** Wenn das Frontend für eine View mehrere Dinge braucht (Zone + Subzonen + Sensoren/Aktoren pro Subzone), ein Endpoint der alles in einem Response liefert. Kein Frontend-Aggregieren aus 3+ API-Calls.
- **Transaktionen:** Multi-Tabellen-Updates (z.B. Zone assign + Subzone cascade delete) in einer DB-Transaction. Commit erst wenn alles erfolgreich.
- **Validierung:** assigned_gpios nicht leer bei Subzone-Create (wenn aus Sensor/Aktor-Kontext erstellt). Backend kann min_length=1 erzwingen wenn semantisch erforderlich.

### 10.3 Frontend — Keine Race Conditions

- **Option A — Ready-Gate:** `isMonitorDataReady` erst true wenn alle Daten für die Zone geladen (REST + ggf. gepufferte WS-Events). Während loading: Skeleton oder Spinner, kein inhaltliches Rendern. State-Maschine: loading → ready | error.
- **Option B — Konsolidierter Endpoint:** Ein GET /zone/{id}/monitor-data. Frontend ruft einmal auf, speichert Ergebnis, rendert. Kein useZoneGrouping aus espStore. WebSocket kann danach nur Deltas für Live-Werte pushen (sensor_data, actuator_state).
- **Kein paralleles Aggregieren:** Keine Kombination aus espStore.devices + getSubzones(espId) + get_hierarchy in einer Composable die bei jedem Tick neu berechnet.

### 10.4 System-State, Logs, Wissensdatenbank

- **Parallel existieren:** Konfiguration (esp_devices, subzone_configs) und Wissen (zone_contexts, subzone_configs.custom_data) — getrennte Tabellen/Endpoints. Keine Blockade: User kann Gerät ohne Zone betreiben; Wissen optional.
- **Logs:** Correlation-IDs durch alle Schichten; audit_logs für Konfigurationsänderungen.

---

## 11. Block 7: Priorisierte Fix-Liste (Backend zuerst)

| Prio | Fix | Beschreibung | Aufwand |
|------|-----|---------------|---------|
| 1 | **Backend-Analyse-Bericht** | Dieser Auftrag — vollständiger Bericht mit allen Blöcken 1–6. Output: `.claude/reports/current/backend-datenkonsistenz-bericht-2026-03-04.md` | 4–6h |
| 2 | **MonitorView auf monitor-data umstellen** | monitor-data Endpoint existiert bereits. Frontend: MonitorView L2 soll `zonesApi.getZoneMonitorData()` als Primary nutzen statt useZoneGrouping-Fallback. | 2–3h |
| 3 | **DB-Dokumentation** | subzone_id auf sensor_configs/actuator_configs — bestätigen: existiert NICHT; nur assigned_gpios. | 1h |
| 4 | **Subzone Create Validierung** | assigned_gpios min_length=1 wenn Subzone aus Sensor/Aktor-Kontext erstellt? Optional | 1h |
| 5 | **Frontend Ready-Gate** | Falls monitor-data Primary: isLoading bis Response da. Falls weiterhin useZoneGrouping: isMonitorDataReady bis alle Quellen geladen. | 2–3h |

---

## 12. Akzeptanzkriterien für diesen Auftrag

Der Auftrag ist erledigt, wenn:

- [ ] **Block 1:** Datenbank-Inventar — alle relevanten Tabellen (esp_devices, subzone_configs, sensor_configs, actuator_configs, zone_contexts, sensor_data, cross_esp_logic, logic_execution_history, esp_heartbeat_logs, audit_logs) mit Spalten, FKs, Schreibpfaden dokumentiert
- [ ] **Block 2:** REST-Endpoints — vollständige Tabelle mit Pfad, Handler, Service, DB-Operation
- [ ] **Block 3:** MQTT-Handler — alle Handler die in DB schreiben, mit Tabelle
- [ ] **Block 4:** Service-Layer — ZoneService, SubzoneService, KaiserService Datenfluss
- [ ] **Block 5:** Bruchstellen — BK1–BK5 verifiziert oder widerlegt
- [ ] **Block 6:** Stabilitäts-Anforderungen — Soll-Zustand dokumentiert
- [ ] **Ein Bericht** in `.claude/reports/current/backend-datenkonsistenz-bericht-2026-03-04.md` entsteht, der gezielte Backend-Fixes und Frontend-Empfehlungen erlaubt

---

## 13. Kurzübersicht für Robin

| Thema | Inhalt |
|-------|--------|
| **Ziel** | Backend vollständig analysieren — wo und wie Zone/Subzone/Geräte gespeichert und verarbeitet werden |
| **Vermutung** | "Keine Subzone" Flackern = Frontend rendert bevor Daten da; mehrere asynchrone Quellen |
| **Lösung Backend** | Konsolidierter Endpoint GET /zone/{id}/monitor-data als Single Source für Monitor L2 |
| **Lösung Frontend** | Ready-Gate ODER Umstellung auf monitor-data Endpoint |
| **Ergebnis** | Bericht + priorisierte Fix-Liste für stabiles System |

---

## 14. Vorbedingungen & Ausführung

**Vorbedingungen:**
- [ ] El Servador-Codebase zugänglich (`El Servador/god_kaiser_server/`)
- [ ] Referenz-Dateien lesbar: `.claude/reference/api/REST_ENDPOINTS.md`, `MQTT_TOPICS.md`, `.claude/reference/DATABASE_ARCHITECTURE.md`
- [ ] Output-Verzeichnis existiert: `.claude/reports/current/`

**Empfohlener Agent:** `server-dev` (hat Read + Write für Code-Analyse und Report-Erstellung). Alternativ: `db-inspector` für Block 1 (DB-Inventar), dann `server-dev` für Blöcke 2–6.

**Konkrete Code-Pfade für Analyse:**
- Zone/Subzone API: `El Servador/god_kaiser_server/src/api/v1/zone.py`, `subzone.py`
- Services: `src/services/zone_service.py`, `subzone_service.py`, `kaiser_service.py`, `monitor_data_service.py`
- MQTT-Handler: `src/mqtt/handlers/zone_ack_handler.py`, `subzone_ack_handler.py`, `sensor_handler.py`, `actuator_handler.py`, `heartbeat_handler.py`, `config_handler.py`
- DB-Models: `src/db/models/esp.py`, `sensor.py`, `actuator.py`, `subzone.py`, `zone_context.py`, `logic.py`
- Frontend: `El Frontend/src/views/MonitorView.vue`, `src/composables/useZoneGrouping.ts`, `src/composables/useSubzoneCRUD.ts`, `src/api/zones.ts`
