# Auftrag: Zonen & Subzonen — Vollständige Analyse (ESP, Server, Frontend, Wissens-DB)

> **Erstellt:** 2026-03-04  
> **Erstellt von:** Automation-Experte (Life-Repo)  
> **Ziel-Repo:** AutomationOne (El Trabajante, El Servador, El Frontend)  
> **Priorität:** Hoch (gezielte Eingriffe in das System)  
> **Ergebnis:** Ein vollständiger Bericht, der gezielte Eingriffe an exakten Stellen erlaubt.  
> **Kontext:** Zonen/Subzonen-Einstellungen müssen Ende-zu-Ende verstanden und repariert werden; ESP als Ausgangspunkt, Server zentral, Frontend Dashboard L1 (Zone) + Orbital-Layout L2 (Subzone) + Monitor L2 (Subzone-Anzeige); Wissensdatenbank (Zone/Subzone-Wissen) darf sich nicht mit der Konfiguration behindern.

**Referenz-Dateien (vor Analyse lesen):**
- `.claude/reference/api/MQTT_TOPICS.md` — Topic-Pfade, Payload-Schemata, QoS
- `.claude/reference/api/REST_ENDPOINTS.md` — Zone, Subzone, Zone-Context Endpoints
- `.claude/reference/api/WEBSOCKET_EVENTS.md` — `zone_assignment`, `subzone_assignment`
- `.claude/reference/DATABASE_ARCHITECTURE.md` — esp_devices, subzone_configs, zone_contexts

---

## 1. Executive Summary

**Ziel dieses Auftrags:** Ein **kompletter Analyse-Bericht** wird erstellt, der es erlaubt, **gezielt** in das System einzugreifen — an den Stellen, an denen Zonen- und Subzonen-Einstellungen entstehen, fließen und angezeigt werden.

**Kernannahmen (von Robin):**
- **Vom ESP geht es aus** — Zone/Subzone-Konfiguration wird zum ESP gepusht bzw. vom ESP bestätigt.
- **Server ist zentral** — hat alles genau (DB, API, MQTT).
- **Frontend:**  
  - **Ebene 1 (Dashboard/Übersicht):** Zoneneinstellung des Geräts — **funktioniert gut**, darf nicht kaputt gemacht werden.  
  - **Ebene 2 (Orbital-Layout):** Subzone-Einstellung einzelner Sensoren — **frontend-seitig integriert**, **Kommunikation an Server funktioniert noch nicht richtig**.  
  - **Monitor L2:** Subzone-Aufteilungen anzeigen — Sensoren/Aktoren **sollen** in ihren Subzonen übersichtlich liegen, **klappt noch nicht richtig**.
- **Wissensdatenbank:** Ermöglicht Wissen pro Zone und Subzone. **Beide Prozesse** (Zonen/Subzonen-Konfiguration **und** Wissen pro Zone/Subzone) müssen **nebeneinander laufen**, ohne sich zu behindern. Ein Gerät kann **ohne Zone**, **ohne Subzone** stabil laufen; **kein Wissen** muss daran geknüpft sein — kann aber hinzugefügt, bearbeitet oder gelöscht werden. Das ist an allen möglichen Stellen bereits vorbereitet.

**Erwartetes Ergebnis:** Ein **einziger Bericht** mit:
- Vollständiger Bestandsaufnahme (ESP, Server, Frontend, Wissens-DB),
- Exakten **Bruchstellen** (wo bricht Subzone Frontend→Server, wo bricht Monitor L2 Anzeige),
- **Eingriffspunkten** (Dateien, Endpoints, Komponenten) pro Schicht,
- **Priorisierter Fix-Liste** und klaren Akzeptanzkriterien für spätere Fix-Aufträge.

---

## 2. Architektur-Überblick (Quelle → Zentrum → Darstellung)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ZONEN / SUBZONEN — Datenfluss                                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  EL TRABAJANTE (ESP)                    EL SERVADOR (Server)                     │
│  ───────────────────                   ────────────────────                     │
│  • Zone/Subzone empfangen              • DB: esp_devices (zone_id, zone_name),  │
│    via MQTT (assign/remove/safe)          subzone_configs                        │
│  • ACK zurueck (zone_ack, subzone_ack) • REST: /v1/zone/*, /v1/subzone/*         │
│  • NVS-Persistenz (Konfiguration)       • MQTT: assign → ESP, ack → DB/WS        │
│  • Quelle der Bestaetigung              • zone_context (Wissen, optional)       │
│                                                                                 │
│  EL FRONTEND                                                                     │
│  ────────────                                                                   │
│  • L1 (Dashboard/Übersicht): Gerät → Zone zuweisen ✅ funktioniert               │
│  • L2 (Orbital-Layout):     Sensor/Aktor → Subzone zuweisen ⚠ Frontend ok,       │
│                             Server-Kommunikation noch nicht richtig              │
│  • Monitor L2:              Subzone-Aufteilungen anzeigen ⚠ klappt noch nicht   │
│                             (Sensoren/Aktoren in Subzonen)                       │
│                                                                                 │
│  WISSENSDATENBANK                                                               │
│  ─────────────────                                                                 │
│  • zone_context (pro Zone), ggf. Subzone-Kontext                                 │
│  • Muss parallel zu Zone/Subzone-Konfiguration laufen; optional pro Geraet       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Block 1: ESP (El Trabajante) — Zone/Subzone als Endpunkt

**Auftrag an den ausführenden Agenten:** Bestandsaufnahme im **auto-one Repo** (Firmware). **Verifizieren gegen** `.claude/reference/api/MQTT_TOPICS.md` §5.

### 1.1 Zu ermitteln

| # | Frage | Erwarteter Ort / Hinweis | Tiefenprüfung |
|---|--------|---------------------------|----------------|
| 1.1.1 | Welche MQTT-Topics **empfängt** der ESP für Zone? | Vollständiger Pfad: `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`; unassigned: `kaiser/god/esp/{esp_id}/zone/assign` | Wo wird subscribiert? (main.cpp) — Zeile dokumentieren |
| 1.1.2 | Welche MQTT-Topics **empfängt** der ESP für Subzone? | `subzone/assign`, `subzone/remove`, `subzone/safe` (vollständig: `kaiser/.../esp/.../subzone/assign`) | Prüfen: Wird `subzone/safe` tatsächlich verarbeitet? |
| 1.1.3 | Welche MQTT-Topics **sendet** der ESP (ACK)? | `zone/ack`, `subzone/ack` — Payload-Felder: ts, esp_id, zone_id/subzone_id, success, message, action | Stimmt Payload mit MQTT_TOPICS.md §5.2/5.5 überein? |
| 1.1.4 | Wo wird Zone/Subzone in der Firmware **persistiert** (NVS)? | config_manager / storage_manager, Namenskonvention Keys | Exakte NVS-Key-Strings dokumentieren (z. B. `nvs_zone_id`) |
| 1.1.5 | Wo wird nach Boot die **aktuelle Zone/Subzone** an den Server gemeldet? | Heartbeat-Payload (zone_id, zone_assigned, master_zone_id), ggf. config_response | Enthält Heartbeat subzone_id? Welche Subzones? |
| 1.1.6 | Gibt es **Validierung** auf dem ESP (zone_id Format, subzone_id)? | Handler für zone/subzone Nachrichten | Welche Felder werden geprüft? Was passiert bei ungültigem? |
| 1.1.7 | **Error-Codes** bei Subzone (2500–2506) — wo werden sie gesetzt? | Fehlerbehandlung bei subzone/assign, remove, safe | Gegen `.claude/reference/errors/ERROR_CODES.md` prüfen |

### 1.2 Konkrete Dateien (zu prüfen/zu dokumentieren)

| Datei | Pfad | Erwarteter Inhalt |
|-------|------|-------------------|
| Topic-Builder | `El Trabajante/src/utils/topic_builder.cpp` | `buildZoneAssignTopic()`, `buildSubzoneAssignTopic()`, `buildSubzoneRemoveTopic()`, `buildSubzoneSafeTopic()`, `buildZoneAckTopic()`, `buildSubzoneAckTopic()` |
| Topic-Builder Header | `El Trabajante/src/utils/topic_builder.h` | Deklarationen |
| Zone/Subzone Handler | `El Trabajante/src/main.cpp` | Zeilen ~1329–1562 (Zone), ~1562–1672 (Subzone); Subscription-Zeilen ~1501–1505 |
| NVS/Config | `El Trabajante/src/services/config/` | config_manager, NVS-Keys |

### 1.3 Ausgabe im Bericht

- Tabelle: Topic (ein/aus), Payload-Schema, Handler-Datei/Zeile
- Liste NVS-Keys und Lebenszyklus (wann geschrieben, wann gelesen)
- **Abgleich:** ESP-Payload vs. MQTT_TOPICS.md — Abweichungen dokumentieren
- Lücken: Was fehlt, damit Subzone Ende-zu-Ende stabil ist (z. B. fehlende ACK, falsches Payload-Format)

---

## 4. Block 2: Server (El Servador) — Zentrale Autorität

**Auftrag an den ausführenden Agenten:** Bestandsaufnahme im **auto-one Repo** (Backend).

### 4.1 Zone

| # | Thema | Zu dokumentieren |
|---|--------|-------------------|
| 2.1.1 | REST-Endpoints | GET/POST/DELETE `/v1/zone/*` (assign, remove, get_zone_info, get_zone_devices, get_unassigned) — exakte Pfade, Request/Response-Schema |
| 2.1.2 | DB | `esp_devices`: Felder zone_id, zone_name, master_zone_id, is_zone_master; keine `zones`-Tabelle |
| 2.1.3 | MQTT | Server → ESP: `zone/assign`; ESP → Server: `zone/ack` → welcher Handler, DB-Update, WebSocket `zone_assignment` |
| 2.1.4 | Service-Logik | zone_service: assign_zone, remove_zone, Cascade (Subzone-Löschung bei Zone-Removal) |

**Referenz:** `auftrag-zone-subzone-architektur-analyse.md` (Life-Repo) — bereits detailliert.

### 4.2 Subzone

| # | Thema | Zu dokumentieren | Tiefenprüfung |
|---|--------|-------------------|---------------|
| 2.2.1 | REST-Endpoints | Vollständige Pfade (Basis `/api/v1`): `POST /subzone/devices/{esp_id}/subzones/assign`, `GET /subzone/devices/{esp_id}/subzones`, `GET/DELETE /subzone/devices/{esp_id}/subzones/{subzone_id}`, `POST/DELETE .../safe-mode`, `PATCH .../metadata` | Gegen REST_ENDPOINTS.md prüfen; Request-Body-Schema (SubzoneAssignRequest) dokumentieren |
| 2.2.2 | DB | `subzone_configs`: id, esp_id, subzone_id, subzone_name, parent_zone_id, assigned_gpios (JSON), safe_mode_active, sensor_count, actuator_count, last_ack_at, **custom_data (JSONB)** | Alembic: `add_subzone_configs_table.py`, `add_custom_data_to_subzone_configs.py` |
| 2.2.3 | Path-Validierung | **esp_id** — Pattern in `subzone.py` Zeile 53: `^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+|ESP_MOCK_[A-Z0-9]+)$` — **Mock-IDs werden AKZEPTIERT** (Stand nach auftrag-subzonen-mock-geraete). | Verifizieren: Aktueller Code in `El Servador/god_kaiser_server/src/api/v1/subzone.py` |
| 2.2.4 | MQTT | Server → ESP: `subzone/assign`, `subzone/remove`, `subzone/safe`; ESP → Server: `subzone/ack` → `subzone_ack_handler.py`; WebSocket `subzone_assignment` | Handler-Registrierung in `main.py` Zeile 236; WebSocket-Trigger in WEBSOCKET_EVENTS.md §7.2 |
| 2.2.5 | Subzone-Service | `subzone_service.py`: assign (Payload: assigned_gpios, subzone_id, subzone_name, parent_zone_id), remove, get; MQTT-Publish via topics.py; Abgleich mit ESP (ACK) | Prüfen: Wird bei Mock MQTT weggelassen? DB-Upsert trotzdem? |

### 4.3 Zone-Context (Wissensdatenbank)

| # | Thema | Zu dokumentieren | Tiefenprüfung |
|---|--------|-------------------|---------------|
| 2.3.1 | API | GET/PUT/PATCH `/zone/context/{zone_id}` (Basis `/api/v1`); Router: `zone_context.py`; GET 404 wenn kein Eintrag? | Verhalten: 404 vs. 200 + leerer Body — für Frontend F002 relevant |
| 2.3.2 | DB | Tabelle `zone_contexts` (Alembic: `add_zone_context_table.py`) — Schema: zone_id, variety, substrate, growth_phase, cycle_history, custom_data | DATABASE_ARCHITECTURE.md §1.1 |
| 2.3.3 | Abgrenzung | Zone/Subzone-**Konfiguration** (esp_devices, subzone_configs) vs. **Wissen** (zone_contexts): gleiche zone_id, unterschiedliche Tabellen — keine gegenseitige Blockade | ZoneContextService vs. ZoneService/SubzoneService — getrennte Repos |

### 4.4 Ausgabe im Bericht

- Tabelle aller Zone/Subzone-Endpoints mit Methode, Pfad, Handler-Datei
- Tabelle MQTT-Topics (Richtung, Handler, DB-Write, WS-Event)
- **Bruchstelle 1:** Wo genau schlägt Subzone Frontend→Server fehl? (Path-Pattern Mock? Body-Validierung? Fehlender Endpoint?)
- Empfehlung: 404 für Zone-Context als „kein Kontext“ zurückgeben (oder 200 + leerer Body), damit Frontend nicht fehlerloggt (vgl. Trockentest F002).

---

## 5. Block 3: Frontend (El Frontend) — Ebene 1, Ebene 2, Monitor L2

**Auftrag an den ausführenden Agenten:** Bestandsaufnahme im **auto-one Repo** (Frontend).

### 5.1 Ebene 1 — Zoneneinstellung (Gerät → Zone)

| # | Thema | Zu dokumentieren |
|---|--------|-------------------|
| 3.1.1 | Wo wird die Zoneneinstellung des **Geräts** getroffen? | HardwareView / Dashboard-Übersicht: ZonePlate, Drag-Drop, zonesApi.assignZone(), removeZone() |
| 3.1.2 | Welche API-Calls? | POST `/v1/zone/devices/{esp_id}/assign`, DELETE `.../zone` |
| 3.1.3 | WebSocket | `zone_assignment` → zone.store.handleZoneAssignment() → espStore-Update |
| 3.1.4 | **Nicht kaputt machen** | Liste der Komponenten und Flows, die unverändert bleiben müssen |

### 5.2 Ebene 2 — Subzone-Einstellung (Orbital-Layout, pro Sensor/Aktor)

| # | Thema | Zu dokumentieren | Tiefenprüfung |
|---|--------|-------------------|---------------|
| 3.2.1 | Wo wird Subzone für **einzelne Sensoren/Aktoren** konfiguriert? | `SubzoneAssignmentSection.vue` (in `SensorConfigPanel.vue`, `ActuatorConfigPanel.vue`); `ESPOrbitalLayout.vue` (DeviceDetailView); `ZonePlate.vue` (useSubzoneCRUD) | Welche Komponente ruft subzonesApi auf? Vollständige Kette |
| 3.2.2 | Welche API-Calls? | `subzonesApi.assignSubzone()`, `getSubzones()`, `removeSubzone()` — Pfade: `/subzone/devices/{id}/subzones/assign`, `.../subzones` | `El Frontend/src/api/subzones.ts` — Request-Body (SubzoneAssignRequest) dokumentieren |
| 3.2.3 | **Bruchstelle 2:** Warum „funktioniert Kommunikation an Server noch nicht richtig“? | Mögliche Ursachen: falscher esp_id, falscher Body (parent_zone_id?), CORS, Fehlerbehandlung (Toast/Log), kein subzone_assignment WS-Update, WebSocket-Subscription | Trace: User-Klick → API-Call → Network → Server-Response → Store-Update |
| 3.2.4 | Mock-Unterstützung | **Stand:** Backend akzeptiert Mock-IDs; SubzoneAssignmentSection hat **keinen** expliziten Mock-Block mehr (nach auftrag-subzonen-mock-geraete). | Verifizieren: Gibt es noch isMockEsp-Check in SubzoneAssignmentSection? loadSubzones/confirmCreateSubzone für Mock? |

### 5.3 Monitor L2 — Subzone-Aufteilungen anzeigen

| # | Thema | Zu dokumentieren | Tiefenprüfung |
|---|--------|-------------------|---------------|
| 3.3.1 | Wo werden **Subzone-Aufteilungen** gerendert? | **HierarchyTab.vue** (Tab „Hierarchie“ in SystemMonitorView) — zeigt Kaiser → Zone → Subzone → Device Baum; Daten von `GET /v1/kaiser/god/hierarchy` | `El Frontend/src/components/system-monitor/HierarchyTab.vue`; `El Servador/.../api/v1/kaiser.py` |
| 3.3.2 | Datenquelle | `GET /v1/kaiser/{kaiser_id}/hierarchy` — liefert zones[] mit subzones[] und devices[] pro Subzone; Frontend: `api.get('/kaiser/god/hierarchy')` | Prüfen: Enthält Response Sensoren/Aktoren pro Subzone? Oder nur assigned_gpios? |
| 3.3.3 | **Bruchstelle 3:** Warum „klappt noch nicht richtig“? | Mögliche Ursachen: Hierarchy-API liefert keine Geräte pro Subzone; Frontend gruppiert falsch; espStore vs. Hierarchy-API Inkonsistenz; „Keine Subzone“-Zeile fehlt oder doppelt | Trace: API-Response → HierarchyTab-Rendering → Welche Felder werden für Gruppierung genutzt? |

### 5.4 Ausgabe im Bericht

- Datenfluss: User-Aktion (L1 Zone, L2 Subzone) → API → Store → UI; bei Monitor L2: API/Store → Gruppierung → UI
- **Eingriffspunkte:** Komponenten (mit Pfad/Zeile), API-Client (subzones.ts, zones.ts), Store (zone.store.ts, esp.store.ts)
- Klare Aussage: An welcher Stelle (Komponente, API-Call, Store-Update) bricht Subzone bzw. Monitor L2 Anzeige?

---

## 6. Block 4: Wissensdatenbank (Zone/Subzone-Wissen)

**Auftrag an den ausführenden Agenten:** Sicherstellen, dass **beide Prozesse** nebeneinander laufen.

### 6.1 Anforderungen (von Robin)

- **Prozess A:** Zone/Subzone-**Konfiguration** (Gerät → Zone, Sensor/Aktor → Subzone) — wie bisher.
- **Prozess B:** **Wissen** pro Zone und Subzone (z. B. zone_context: Pflanzen, Substrat, Sorten) — optional, kann hinzugefügt, bearbeitet, gelöscht werden.
- **Keine Abhängigkeit:** Gerät kann ohne Zone, ohne Subzone laufen; Wissen muss nicht an Zone/Subzone geknüpft sein; wenn Zone/Subzone gelöscht wird, soll Wissen optional erhalten bleiben oder mitgelöscht werden (konkrete Regel dokumentieren).

### 6.2 Zu prüfen

| # | Thema | Zu dokumentieren | Tiefenprüfung |
|---|--------|-------------------|---------------|
| 4.1 | Zone-Context API & DB | GET/PUT/PATCH `/zone/context/{zone_id}`; Tabelle `zone_contexts`; GET 404 vs. 200+leer | Frontend: 404 = leerer Kontext (kein Fehlerlog) — F002 Trockentest |
| 4.2 | Subzone-Wissen | **Vorhanden:** `subzone_configs.custom_data` (JSONB) — Subzone-Metadaten; PATCH `/subzone/devices/{esp_id}/subzones/{subzone_id}/metadata` | Keine eigene Tabelle; SubzoneContextEditor.vue nutzt custom_data |
| 4.3 | Konfliktvermeidung | Konfiguration (esp_devices, subzone_configs) vs. Wissen (zone_contexts, custom_data) — getrennte Endpoints/Tabellen; keine gemeinsame Lock-Logik | DATABASE_ARCHITECTURE.md §2.3 |
| 4.4 | UI | ZoneContextEditor, SubzoneContextEditor, DeviceDetailPanel — wo wird Zone/Subzone-Kontext geladen? 404-Handling | `El Frontend/src/components/inventory/ZoneContextEditor.vue`, `SubzoneContextEditor.vue` |

### 6.3 Ausgabe im Bericht

- Kurzbeschreibung: Prozess A (Konfiguration) vs. Prozess B (Wissen); getrennte Ressourcen (Tabellen, Endpoints).
- Empfehlung: 404 für fehlenden Zone-Context als 200 + leeres Objekt oder explizit im Frontend 404 als „kein Kontext“ behandeln.

---

## 7. Block 5: Bruchstellen & Datenfluss (Konsolidation)

**Auftrag an den ausführenden Agenten:** Alle Erkenntnisse aus Block 1–4 in **eine** Übersicht bringen.

### 7.1 Bruchstellen-Tabelle

| ID | Beschreibung | Schicht | Vermutete Ursache | Konkreter Ort (Datei, Endpoint, Zeile) |
|----|----------------|--------|--------------------|----------------------------------------|
| B1 | Subzone Frontend → Server „funktioniert noch nicht richtig“ | Backend / Frontend | (aus Block 2 + 3 eintragen) | subzone.py, SubzoneAssignmentSection, subzones.ts |
| B2 | Monitor L2 (HierarchyTab): Sensoren/Aktoren nicht korrekt in Subzonen | Frontend / Backend | (aus Block 3 eintragen) | HierarchyTab.vue, kaiser.py get_hierarchy |
| B3 | Zone-Context 404 führt zu Frontend-Fehlerlog | Backend + Frontend | 404 statt 200+leer | zone_context.py, ZoneContextEditor (F002) |
| B4 | Mock-ESP Subzone | Beide | **Stand:** Backend akzeptiert Mock; Frontend-Block ggf. entfernt (auftrag-subzonen-mock-geraete umgesetzt) | Verifizieren: Noch Blockade? |
| B5 | (weitere aus Analyse) | | | |

### 7.2 Datenfluss-Diagramm (Text/ASCII)

- **Zone:** User (L1) → zonesApi.assignZone(esp_id, payload) → POST `/zone/devices/{id}/assign` → ZoneService → DB + MQTT zone/assign → ESP → zone/ack → zone_ack_handler → WS `zone_assignment` → Frontend.
- **Subzone:** User (L2) → subzonesApi.assignSubzone(esp_id, payload) → POST `/subzone/devices/{id}/subzones/assign` → ??? (B1) → SubzoneService → DB + MQTT subzone/assign → ESP → subzone/ack → subzone_ack_handler → WS `subzone_assignment` → Frontend.
- **Monitor L2 (Hierarchy):** GET `/kaiser/god/hierarchy` → HierarchyTab.vue → Baum Zone→Subzone→Device. Bruchstelle B2: Enthält API Geräte pro Subzone? Wie wird gruppiert?

---

## 8. Block 6: Konkrete Eingriffspunkte (Checkliste für Fix-Aufträge)

**Auftrag an den ausführenden Agenten:** Pro Schicht eine **liste von Eingriffspunkten** erstellen, an denen gezielt geändert werden kann.

### 8.1 ESP (El Trabajante)

- [ ] Dateien: (aus Block 1 eintragen)
- [ ] MQTT-Payload-Schema: (Referenz für Server/Frontend)
- [ ] NVS-Keys: (Dokumentation für Konsistenz)

### 8.2 Server (El Servador)

- [ ] `El Servador/god_kaiser_server/src/api/v1/zone.py` — Endpoints, keine Änderung an L1-Zone-Logik
- [ ] `El Servador/god_kaiser_server/src/api/v1/subzone.py` — Path-Pattern esp_id (Mock bereits erlaubt), Request-Validierung
- [ ] `El Servador/god_kaiser_server/src/services/subzone_service.py` — Assign-Logik, MQTT-Publish, Mock-Behandlung
- [ ] `El Servador/god_kaiser_server/src/mqtt/handlers/subzone_ack_handler.py` — DB-Update, WS subzone_assignment
- [ ] `El Servador/god_kaiser_server/src/api/v1/zone_context.py` — 404 vs. 200 leer
- [ ] `El Servador/god_kaiser_server/src/api/v1/kaiser.py` — get_hierarchy: Liefert Subzone→Devices?

### 8.3 Frontend (El Frontend)

- [ ] **L1 (nicht kaputt machen):** HardwareView, ZonePlate, useZoneDragDrop, zonesApi, zone.store (handleZoneAssignment)
- [ ] **L2 Subzone:** `SubzoneAssignmentSection.vue`, `SensorConfigPanel.vue`, `ActuatorConfigPanel.vue`, `subzones.ts`, `useSubzoneCRUD.ts`; loadSubzones, confirmCreateSubzone
- [ ] **Monitor L2:** `HierarchyTab.vue` — GET `/kaiser/god/hierarchy`, Baum-Rendering; `SystemMonitorView.vue` (Tab-Container)
- [ ] **Wissen:** ZoneContextEditor, SubzoneContextEditor, DeviceDetailPanel — GET zone/context, PATCH subzone metadata, 404-Handling

### 8.4 Wissensdatenbank

- [ ] zone_context Tabelle & API — nur lesend/schreibend; keine Blockade mit Zone/Subzone-Konfiguration
- [ ] (Optional) subzone_context — wenn vorgesehen, Endpoint und Schema dokumentieren

---

## 9. Block 7: Priorisierte Fix-Liste & Empfehlungen

**Auftrag an den ausführenden Agenten:** Nach Abschluss der Analyse eine **priorisierte Liste** von Fix-Aufträgen bzw. Empfehlungen formulieren.

### 9.1 Priorität

1. **Kritisch:** Subzone Frontend→Server (B1) — Nutzer können Subzone konfigurieren, Änderung kommt am Server/ESP an.
2. **Hoch:** Monitor L2 Anzeige (B2) — Sensoren/Aktoren in Subzone-Zeilen korrekt darstellen.
3. **Hoch:** Zone-Context 404 (B3) — Frontend 404 als „kein Kontext“ behandeln; optional Backend 200 + leer.
4. **Mittel:** Mock Subzone (B4) — optional, siehe `auftrag-subzonen-mock-geraete-analyse-integration.md`.
5. **Niedrig:** Layout/UX (doppelte Zählung, Reihenfolge) — siehe `auftrag-layout-monitor-seite-ueberschriften-reihenfolge.md`.

### 9.2 Abhängigkeiten

- Subzone-Fix (B1) kann Voraussetzung für sinnvolle Monitor L2 Anzeige (B2) sein (Daten müssen erst vom Server kommen).
- Zone-Context (B3) und Wissensdatenbank (Block 4) unabhängig von Subzone-Konfiguration; können parallel umgesetzt werden.

### 9.3 Referenz-Aufträge (bereits vorhanden)

| Auftrag | Inhalt |
|---------|--------|
| `auftrag-zone-subzone-architektur-analyse.md` | DB, API, MQTT, Frontend-Gruppierung (Stand 2026-02-26) |
| `auftrag-subzonen-mock-geraete-analyse-integration.md` | Mock Subzone: Backend Path, Frontend Block entfernen |
| `auftrag-layout-monitor-seite-ueberschriften-reihenfolge.md` | Monitor L2 Überschriften, Zählung, Reihenfolge |
| `trockentest-bericht-layout-zonen-komponenten-2026-03-03.md` | F002 Zone-Context 404, F003 WebSocket 403, F004 doppelte Dashboard-Namen |
| `frontend-konsolidierung/auftrag-komponenten-tab-wissensinfrastruktur.md` | Zone-Context (K3), Inventar, Schema |

---

## 10. Akzeptanzkriterien für diesen Analyseauftrag

Der Auftrag ist erledigt, wenn:

- [ ] **Block 1:** ESP — alle MQTT-Topics (Zone/Subzone), NVS, Handler und Payload-Schemata dokumentiert sind; **Abgleich mit MQTT_TOPICS.md**; Lücken genannt.
- [ ] **Block 2:** Server — alle Zone/Subzone-Endpoints, MQTT-Handler, Path-Validierung (esp_id, inkl. Mock), Zone-Context API/404 dokumentiert sind; Bruchstelle B1 konkret benannt (Datei, Zeile).
- [ ] **Block 3:** Frontend — L1 (Zone) als „funktioniert, nicht kaputt machen“ beschrieben; L2 (Subzone) und Monitor L2 (HierarchyTab) mit genauen Komponenten, API-Calls und Bruchstellen B1/B2 beschrieben sind.
- [ ] **Block 4:** Wissensdatenbank — Zone-Context und Subzone custom_data; Koexistenz ohne Blockade bestätigt.
- [ ] **Block 5:** Bruchstellen-Tabelle mit **konkreten Orten** (Datei, Zeile, Endpoint); Datenfluss vollständig.
- [ ] **Block 6:** Eingriffspunkte pro Schicht mit **vollständigen Pfaden** als Checkliste.
- [ ] **Block 7:** Priorisierte Fix-Liste und Verweise auf bestehende Aufträge.
- [ ] **Ein einziger Bericht** (z. B. `.claude/reports/current/zonen-subzonen-vollanalyse-bericht-YYYY-MM-DD.md`) entsteht.

### Verifikations-Checkliste (vor Bericht-Abgabe)

- [ ] Alle referenzierten Dateien existieren (Glob/Read)
- [ ] API-Pfade gegen REST_ENDPOINTS.md geprüft
- [ ] MQTT-Topics gegen MQTT_TOPICS.md geprüft
- [ ] WebSocket-Events gegen WEBSOCKET_EVENTS.md geprüft

---

## 11. Tiefenanalyse-Fragen (für vollständigen Bericht beantworten)

Diese Fragen sollen **tiefgründige** Ergebnisse liefern — nicht nur „wo steht es“, sondern „wie hängt es zusammen“ und „wo genau bricht es“.

| Bereich | Frage | Erwartete Antwort-Tiefe |
|---------|-------|------------------------|
| **ESP↔Server** | Wie kommt der Server von `zone/ack` zu einem DB-Update? | Vollständige Kette: Handler → Service → Repo → Tabelle; Zeilennummern |
| **ESP↔Server** | Wie kommt der Server von `subzone/ack` zu einem DB-Update und WebSocket-Broadcast? | subzone_ack_handler.py → welcher Service? → websocket_utils? |
| **Frontend→Server** | Bei Subzone-Assign: Welcher Request-Body wird gesendet? Stimmt er mit SubzoneAssignRequest überein? | Pydantic-Schema vs. subzones.ts Aufruf |
| **Frontend→Server** | Welche WebSocket-Events werden für zone_assignment/subzone_assignment abonniert? Wo wird der Handler registriert? | useWebSocket, useEspStore, Event-Namen |
| **Monitor L2** | Was liefert `GET /kaiser/god/hierarchy` genau? Welche Felder pro Subzone (devices, assigned_gpios)? | Response-Schema aus kaiser_service.get_hierarchy |
| **Monitor L2** | Wie mappt HierarchyTab die API Response auf die UI? Sensoren/Aktoren pro Subzone — woher? | HierarchySubzone.devices vs. assigned_gpios |
| **Bruchstelle B1** | Wenn Subzone „nicht richtig funktioniert“: 422? 404? 500? CORS? Timeout? | Konkrete Fehlerszenarien mit HTTP-Code |
| **Bruchstelle B2** | Fehlt die Hierarchy-API? Oder liefert sie falsche Daten? Oder rendert das Frontend falsch? | Drei Schichten prüfen |

---

## 12. Referenzen

| Dokument | Pfad | Inhalt |
|----------|------|--------|
| Zone-Subzone-Architektur | `.claude/reports/current/analyse-zone-subzone-architektur.md` | DB, API, MQTT, Frontend |
| Mock Subzone | `.claude/reports/current/auftrag-subzonen-mock-geraete-analyse-integration.md` | Mock Subzone (umgesetzt) |
| Monitor Layout | `.claude/reports/current/auftrag-layout-monitor-seite-ueberschriften-reihenfolge.md` | Monitor L2 Überschriften, Zählung |
| Trockentest | `.claude/reports/current/trockentest-bericht-layout-zonen-komponenten-2026-03-03.md` | F002 Zone-Context 404, F003, F004 |
| API-Referenz | `.claude/reference/api/MQTT_TOPICS.md`, `REST_ENDPOINTS.md`, `WEBSOCKET_EVENTS.md` | Pflicht vor Analyse |
| DB-Architektur | `.claude/reference/DATABASE_ARCHITECTURE.md` | zone_contexts, subzone_configs |

**Ziel-Repo (auto-one) — exakte Pfade:**
- **El Trabajante:** `src/utils/topic_builder.cpp`, `src/main.cpp` (Zone/Subzone Handler), `src/services/config/`
- **El Servador:** `src/api/v1/zone.py`, `subzone.py`, `zone_context.py`, `kaiser.py`; `src/services/zone_service.py`, `subzone_service.py`, `zone_context_service.py`; `src/mqtt/handlers/zone_ack_handler.py`, `subzone_ack_handler.py`; `src/db/models/`
- **El Frontend:** `src/views/HardwareView.vue`, `SystemMonitorView.vue`; `src/components/dashboard/ZonePlate.vue`, `esp/ESPOrbitalLayout.vue`, `devices/SubzoneAssignmentSection.vue`, `system-monitor/HierarchyTab.vue`; `src/api/zones.ts`, `subzones.ts`; `src/stores/esp.ts`

---

## 13. Kurzübersicht (für Robin)

| Thema | Inhalt |
|--------|--------|
| **Ziel** | Vollständiger Analyse-Bericht für Zonen/Subzonen (ESP, Server, Frontend, Wissens-DB) mit gezielten Eingriffspunkten. |
| **L1 Zone** | Funktioniert; darf nicht kaputt gemacht werden. |
| **L2 Subzone** | Frontend integriert; Kommunikation an Server „noch nicht richtig“ → Bruchstelle identifizieren und dokumentieren. |
| **Monitor L2** | Subzone-Aufteilungen anzeigen — „klappt noch nicht richtig“ → Datenquelle und Gruppierung prüfen. |
| **Wissens-DB** | Wissen pro Zone/Subzone; läuft parallel zur Konfiguration; optional; 404 Zone-Context sauber behandeln. |
| **Ergebnis** | Ein Bericht + Checkliste Eingriffspunkte + priorisierte Fix-Liste für spätere Fix-Aufträge. |
