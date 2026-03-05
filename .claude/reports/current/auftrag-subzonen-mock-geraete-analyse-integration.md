# Auftrag: Analyse und Integration — Subzonen fuer Mock-Geraete und einheitliches Verhalten mit echten ESPs

> **Erstellt:** 2026-03-03  
> **Erstellt von:** Automation-Experte (Life-Repo)  
> **Ziel-Repo:** AutomationOne (El Servador, El Frontend)  
> **Kontext:** Drei getrennte Analyse- und Fix-Auftraege; hier: Subzonen fuer Mock-ESPs ermoeglichen und mit echten ESPs konsistent halten.  
> **Prioritaet:** Mittel (Feature-Erweiterung / Test-Unterstuetzung)  
> **Kernursache:** Frontend blockiert Mock explizit; Backend lehnt Mock-IDs per Path-Pattern ab; keine Subzone-Logik fuer Mock-Runtime.

---

## Ist-Zustand / Befund

### Frontend

- **SubzoneAssignmentSection.vue** (`El Frontend/src/components/devices/SubzoneAssignmentSection.vue`):
  - In `loadSubzones()` (Zeilen 66–70): Wenn `espApi.isMockEsp(props.espId)` → sofort `availableSubzones = []`, **kein API-Call** (Aufruf von `subzonesApi.getSubzones()` wird uebersprungen).
  - In `confirmCreateSubzone()` (Zeilen 91–94): Wenn Mock → Toast „Subzones sind für simulierte Geräte nicht verfügbar“ und **Abbruch** (kein `subzonesApi.assignSubzone()`).
- **esp.ts** (`El Frontend/src/api/esp.ts`, Zeilen 174–177): `isMockEsp()`: `espId.startsWith('ESP_MOCK_') || espId.startsWith('MOCK_')`.
- **subzones.ts** (`El Frontend/src/api/subzones.ts`): Client fuer Subzone-REST-Calls (`getSubzones` → GET, `assignSubzone` → POST); nutzt Pfade `/subzone/devices/${deviceId}/subzones/assign` bzw. `.../subzones` (Basis: `/api/v1`).

### Backend

- **El Servador** `El Servador/god_kaiser_server/src/api/v1/subzone.py`: Alle Subzone-Routen (assign, remove, get_subzones, get_subzone, safe-mode) nutzen fuer `esp_id` **Path(pattern=`r"^ESP_[A-F0-9]{6,8}$"`)**. Ausnahme: **`/devices/{esp_id}/subzones/{subzone_id}/metadata`** hat fuer `esp_id` *kein* Pattern (nur Description) → dieser Endpoint akzeptiert bereits Mock-IDs.
- IDs wie `MOCK_95A49FCB` oder `ESP_MOCK_*` erfuellen das Haupt-Pattern **nicht** → **422 Unprocessable Entity**, noch bevor die fachliche Logik laeuft.
- Es gibt keine explizite Pruefung auf „Mock“ im Subzone-Service; der Ausschluss entsteht durch die **Route-Constraint**. Mock-ESPs existieren in `esp_devices` (esp_repo: `get_mock_device`, `create_mock_device`); SubzoneConfig hat FK auf `esp_devices.device_id` → Option DB (Option A) ist schema-seitig moeglich.

### Konsistenz mit echten ESPs

- Fuer echte ESPs (`ESP_XXXXXXXX`) sind Subzone-Assign und -Abfrage ueber die gleiche API und MQTT (`kaiser/+/esp/{esp_id}/subzone/assign`, `subzone/ack`) vorgesehen; ACK wird von `subzone_ack_handler.py` verarbeitet.
- Mock-ESPs werden vom Server ueber den SimulationScheduler gesteuert; eine Subzone-Zuordnung fuer Mock-ESPs existiert im Backend derzeit **nicht** (kein Subzone-ACK von Mock-Geraeten, keine Persistenz fuer Mock-Subzones in subzone_configs trotz vorhandener DB-Struktur).

---

## Ziel

Mock-Geraete koennen **optional** Subzonen zugewiesen werden (z. B. fuer Tests und kontextsensitive Features). Gleiche Logik/API wo sinnvoll fuer echte ESPs; Unterschied nur im Transport (MQTT vs. In-Memory/Runtime).

---

## Vorgehen (technische Schritte)

### 0. Produktentscheidung

- **Sollen** Mock-ESPs Subzonen unterstuetzen? Wenn **ja** → Schritte 1–3. Wenn **nein** → Auftrag auf „Dokumentation des aktuellen Verhaltens“ reduzieren.

### 1. Backend: Route und Logik fuer Mock-IDs

- **Subzone-Route** so erweitern, dass auch Mock-IDs erlaubt sind:
  - **Empfehlung:** Einheitliches Path-Pattern fuer `esp_id` in allen betroffenen Routen (assign, remove, get_subzones, get_subzone, safe-mode), z. B. **`pattern=r"^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+|ESP_MOCK_[A-Z0-9]+)$"`** – konsistent mit `El Servador/god_kaiser_server/src/db/models/logic_validation.py` (dort bereits `ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+`).
  - Vollstaendige REST-Pfade (Basis `/api/v1`): `POST /subzone/devices/{esp_id}/subzones/assign`, `GET /subzone/devices/{esp_id}/subzones`, `GET/DELETE /subzone/devices/{esp_id}/subzones/{subzone_id}`, `POST/DELETE .../safe-mode`. Router-Prefix in `subzone.py`: `prefix="/v1/subzone"`.
- **Fuer Mock:** Subzone-Zuordnung entweder:
  - **Option A:** In DB (gleiche Tabelle `subzone_configs`, FK `esp_id` → `esp_devices.device_id`; Mock-ESPs sind bereits in `esp_devices` mit `device_id` z. B. `MOCK_95A49FCB`). SubzoneService nutzt `esp_repo.get_by_device_id()` → Mock wird gefunden. Fuer Mock: MQTT-Publish optional weglassen, nur DB-Upsert; kein subzone/ack von Hardware → ggf. sofortigen „virtuellen“ ACK oder WebSocket-Event ausloesen.
- **Option B:** Nur im SimulationScheduler-Runtime speichern (z. B. Dictionary pro Mock-ESP). Scheduler kennt bereits `subzone_id` in Sensor/Actuator-Config (`El Servador/god_kaiser_server/src/services/simulation/scheduler.py`, actuator_handler).
- Bei Runtime-Loesung: Abgleich mit Zone/Subzone-Konzept (Hierarchy, Zone-Context) dokumentieren und bei Scheduler-Neustart/Orphan-Cleanup beruecksichtigen.

### 2. Frontend: Mock-Ausnahme entfernen oder konfigurierbar machen

- **SubzoneAssignmentSection.vue:**
  - In `loadSubzones()`: Mock-Ausnahme entfernen oder per Feature-Flag „Subzones fuer Mocks“ steuerbar machen → auch fuer Mock `loadSubzones()` (API-Call) ausfuehren, sofern Backend es unterstuetzt.
  - In `confirmCreateSubzone()`: Fuer Mock erlauben (Toast und Abbruch entfernen), sofern Backend Mock-IDs akzeptiert.
- Optional: Feature-Flag (z. B. in Settings oder ENV), um Subzonen fuer Mocks ein-/auszuschalten.

### 3. Echte ESPs: Bestehenden Flow beibehalten und dokumentieren

- Bestehenden Flow (Assign → MQTT → ESP → ACK → DB/WebSocket) **unveraendert** lassen und in der Doku festhalten, dass Subzonen fuer echte ESPs ueber MQTT laufen.
- Klaeren: Sollen Mock dieselbe REST-API nutzen und nur das Transportmedium (MQTT vs. In-Memory) unterschiedlich sein? Wenn ja, im Auftrag und in der API-Doku festhalten.

---

## Akzeptanzkriterien

- [x] Produktentscheidung dokumentiert (Subzonen fuer Mock ja/nein). — **Ja:** Subzonen fuer Mock implementiert (Auftrag umgesetzt).
- [x] **Falls ja:** Backend akzeptiert Mock-IDs bei Subzone-Assign (keine 422 durch Path-Pattern); Zuordnung wird persistiert (DB oder Runtime).
- [x] **Falls ja:** Frontend erlaubt Subzone-Zuweisung fuer Mock-ESPs (kein pauschaler Block in SubzoneAssignmentSection); Anzeige und Abfrage konsistent mit echten ESPs, wo sinnvoll.
- [x] Echte ESPs: Unveraendert ueber MQTT (subzone/assign, subzone/ack); Doku beschreibt Mock vs. Echt-ESP-Unterschied (Transport, ggf. Persistenz).

---

## Vorbedingungen (fuer Implementierung)

- [ ] Produktentscheidung: Subzonen fuer Mock erlaubt (ja/nein).
- [ ] Mock-ESP muss in `esp_devices` existieren (device_id z. B. `MOCK_*` oder `ESP_MOCK_*`); wird u. a. ueber Debug-API oder Mock-Erstellung angelegt.
- [ ] Mock-ESP muss einer **Zone** zugewiesen sein; SubzoneService prueft `device.zone_id` vor Assign („Assign a zone before creating subzones“).

---

## Referenzen (Codebase)

| Bereich | Datei / Ort |
|--------|-------------|
| Frontend | `El Frontend/src/components/devices/SubzoneAssignmentSection.vue` (loadSubzones, confirmCreateSubzone), `El Frontend/src/api/esp.ts` (isMockEsp), `El Frontend/src/api/subzones.ts` (assignSubzone, getSubzones) |
| Backend | `El Servador/god_kaiser_server/src/api/v1/subzone.py` (Path pattern esp_id), `src/services/subzone_service.py`, `src/db/repositories/subzone_repo.py`, `src/db/models/subzone.py` (SubzoneConfig), `src/mqtt/handlers/subzone_ack_handler.py` (subzone/ack); SimulationScheduler: `src/services/simulation/scheduler.py`, `src/services/simulation/actuator_handler.py` (subzone_id in Config). Alle Pfade relativ zu `El Servador/god_kaiser_server/`. |
| Doku | `.claude/reference/api/MQTT_TOPICS.md` (subzone/assign, subzone/ack), `.claude/reference/api/REST_ENDPOINTS.md` (Subzones), `El Frontend/Docs/System Flows/10-subzone-safemode-pin-assignment-flow-server-frontend.md` |

**Implementierung (Agents/Skills):** Backend-Aenderungen (Route-Pattern, ggf. Mock-Branch im SubzoneService) ueber **server-dev** bzw. Skill **server-development**; Frontend-Aenderungen (SubzoneAssignmentSection.vue) ueber **frontend-dev** bzw. Skill **frontend-development**. Reihenfolge: zuerst Backend (Route + Logik), dann Frontend (Block entfernen/anpassen).

---

## Kurzuebersicht

| # | Thema | Kernursache |
|---|--------|-------------|
| 2 | Subzonen fuer Mock | Frontend blockiert Mock explizit; Backend lehnt Mock-IDs per Path-Pattern ab; keine Subzone-Logik fuer Mock-Runtime. |

---

## Implementierung (2026-03-03)

### Backend (El Servador)

- **`src/api/v1/subzone.py`**: Path-Pattern fuer `esp_id` auf alle Subzone-Routen vereinheitlicht: `ESP_ID_PATH_PATTERN = r"^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+|ESP_MOCK_[A-Z0-9]+)$"`. Betroffen: assign, remove, get_subzones, get_subzone, update_subzone_metadata, enable_safe_mode, disable_safe_mode. Keine 422 mehr fuer Mock-IDs.
- **`src/services/subzone_service.py`**: Hilfsfunktion `_is_mock_esp(device_id)` ergaenzt (konsistent mit zone_service). Mock-Branch in `assign_subzone`: kein MQTT, nur DB-Upsert via `_upsert_subzone_config`, Response mit `mqtt_sent=False`. Mock-Branch in `remove_subzone`: nur `_delete_subzone_config`. Mock-Branch in `enable_safe_mode` / `disable_safe_mode`: nur `_update_subzone_safe_mode(device_id, subzone_id, active)`. Echte ESPs unveraendert (MQTT wie zuvor).

### Frontend (El Frontend)

- **`src/components/devices/SubzoneAssignmentSection.vue`**: Mock-Ausnahme in `loadSubzones()` entfernt — API-Aufruf `subzonesApi.getSubzones(props.espId)` wird auch fuer Mock ausgefuehrt. Mock-Check und Abbruch in `confirmCreateSubzone()` entfernt — Subzone-Erstellung fuer Mock erlaubt. Ungenutzter Import `espApi` entfernt.

### Mock vs. Echt-ESP (Doku)

- **Echte ESPs:** Unveraendert: Assign/Remove/Safe-Mode laufen ueber MQTT (subzone/assign, subzone/remove, subzone/safe); Bestaetigung via subzone/ack.
- **Mock-ESPs:** Kein MQTT; Zuordnung und Safe-Mode werden nur in der DB (Tabelle `subzone_configs`) persistiert. Response-Feld `mqtt_sent=False` kennzeichnet Mock-Operationen.
