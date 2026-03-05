# Auftrag: Subzone-Funktionalität — Analyse & Fix (Funktional zuerst)

> **Erstellt:** 2026-03-04  
> **Basis:** `zonen-subzonen-vollanalyse-bericht-2026-03-04.md`  
> **Priorität:** Hoch (Blocker für Layout-Auftrag)  
> **Ziel:** Das **jetztige Funktional** muss zuverlässig arbeiten. Alle Fehler aus dem Bericht werden behoben; bestehende Struktur und Patterns werden vollständig genutzt und verbessert.

---

## 1. Robins Anforderungen (Kontext)

- **Subzone-Zuordnung gilt für Sensoren** — Sensoren sind ESPs und einer Zone zugeordnet.
- **Flexibel:** Eine Subzone kann **mehrere**, **kein** oder **nur ein** Gerät (Sensor/Aktor) fassen; umstellbar.
- **Vorhandene Struktur:** Komplett ausnutzen und verbessern — **alle Patterns im Code sind bereits vorhanden**.
- **Backend:** Ansatz muss **super funktionieren** mit dem Backend.
- **Keine Subzone:** Ist nicht schlimm — Geräte ohne Subzone müssen stabil laufen.

---

## 2. Fehler aus dem Bericht — Detaillierte Erklärung

### 2.1 B1: useSubzoneCRUD — Create mit leeren GPIOs

**Was passiert:**
- `useSubzoneCRUD.confirmCreateSubzone` sendet `assigned_gpios: []` an die API.
- Der Server akzeptiert das (min_length=0) und erstellt eine Subzone **ohne zugewiesene GPIOs**.
- Der ESP erhält eine leere Liste; die Subzone ist leer und hat keine Sensoren/Aktoren.

**Warum falsch:**
- Subzonen werden über **GPIOs** definiert — welche Sensoren/Aktoren (an welchem GPIO) gehören zu welcher Subzone.
- Ohne GPIOs ist die Subzone semantisch nutzlos; der User erwartet, dass der gerade konfigurierte Sensor/Aktor in der Subzone landet.

**Wo im Code:**
- `El Frontend/src/composables/useSubzoneCRUD.ts` — `confirmCreateSubzone` (Zeilen 38–62)
- Der Kontext (welcher Sensor/Aktor, welches GPIO) wird nicht an die Create-Funktion übergeben — ZonePlate ruft `confirmCreateSubzone(zoneId)` ohne GPIO-Kontext auf.

**Robins Anforderung:** Beim Erstellen einer Subzone müssen die **gewählten Sensoren/Aktoren** (bzw. deren GPIOs) mitgeschickt werden. SubzoneAssignmentSection sendet korrekt `assigned_gpios: [props.gpio]` — useSubzoneCRUD muss dasselbe tun oder den gleichen Flow nutzen.

---

### 2.2 B1/B5: useSubzoneCRUD — espWithSubzone-Lookup falsch

**Was passiert:**
- `useSubzoneCRUD.saveSubzoneName` und `deleteSubzone` nutzen:
  ```ts
  espWithSubzone = espStore.devices.find(d => d.subzone_id === subzoneId)
  ```
- Ein **ESP** hat **mehrere Subzonen** — `subzone_id` auf dem Device ist optional und semantisch unklar (ein ESP kann nicht „eine“ Subzone haben, er hat viele).
- Der Lookup findet oft **nichts** oder den **falschen ESP**.

**Warum falsch:**
- Subzonen gehören zu einem ESP; die Zuordnung ist `esp_id` → `subzone_configs[]`.
- Um den ESP für eine Subzone zu finden, muss man: Alle ESPs durchgehen, `subzonesApi.getSubzones(espId)` aufrufen (oder bereits geladene Subzone-Daten nutzen) und prüfen, ob `subzone_id` in der Liste ist.
- Oder: Die Hierarchy-API (`GET /kaiser/god/hierarchy`) nutzen — sie liefert Zone → Subzone → Devices (ESPs).

**Wo im Code:**
- `El Frontend/src/composables/useSubzoneCRUD.ts` — Zeilen 79–102 (saveSubzoneName), 109–122 (deleteSubzone)

**Robins Anforderung:** Der richtige ESP muss zuverlässig gefunden werden. Bestehende API (`subzonesApi.getSubzones(espId)`) oder Hierarchy (`GET /api/v1/kaiser/god/hierarchy`) nutzen; kein Lookup über `device.subzone_id` (ESPDevice hat optionales subzone_id, aber semantisch unklar bei mehreren Subzonen pro ESP).

---

### 2.3 B2: Monitor L2 — Hierarchy zeigt ESPs, nicht Sensoren/Aktoren pro Subzone

**Was passiert:**
- Die Hierarchy-API (`GET /kaiser/god/hierarchy`) liefert pro Subzone eine Liste von **ESPs** (devices).
- Die Subzone hat `assigned_gpios` (z. B. [4, 5, 6]) — das sind die GPIOs der Sensoren/Aktoren.
- **Es fehlt die Auflösung:** Welcher Sensor auf GPIO 4, welcher Aktor auf GPIO 5 gehört zu dieser Subzone?
- Der User erwartet: **Sensoren und Aktoren nach Subzone geordnet** — nicht ESPs.

**Warum falsch:**
- Semantik: Subzone = Gruppe von **Sensoren/Aktoren** (über GPIO), nicht von ESPs.
- Ein ESP kann mehrere Subzonen haben; jede Subzone enthält bestimmte GPIOs → bestimmte Sensoren/Aktoren.
- Die Anzeige muss also: Subzone A → [Sensor GPIO 4, Aktor GPIO 5], Subzone B → [Sensor GPIO 6], „Keine Subzone“ → [Sensor GPIO 7].

**Wo im Code:**
- Backend: `El Servador/god_kaiser_server/src/services/kaiser_service.py` — `get_hierarchy` (Zeilen 105–193), Struktur `subzones[].devices` = ESP-Liste (nicht Sensoren/Aktoren)
- Frontend: `El Frontend/src/components/system-monitor/HierarchyTab.vue` — rendert Zone → Subzone → Devices (ESPs), nutzt `GET /kaiser/god/hierarchy` (Base: `/api/v1`)

**Robins Anforderung:** In Monitor L2 müssen **Sensoren und Aktoren nach ihren Subzonen geordnet** sein. Die Datenquelle (Hierarchy oder alternative API) muss Sensoren/Aktoren pro Subzone liefern — nicht nur ESPs.

---

### 2.4 B3: Zone-Context 404

**Was passiert:**
- `GET /api/v1/zone/context/{zone_id}` liefert **404**, wenn kein Eintrag in `zone_contexts` existiert.
- `ZoneContextEditor` (in `El Frontend/src/components/inventory/ZoneContextEditor.vue`) fängt 404 ab (Zeilen 86–91): `contextExists.value = false`, kein Fehlerlog. Nutzt `inventoryApi.getZoneContext(zoneId)`.
- **Funktional OK** — Frontend behandelt 404 korrekt.

**Robins Anforderung:** Kann so bleiben. Optional: Backend könnte 200 + leeres Objekt zurückgeben — niedrige Priorität.

---

### 2.5 B4: subzone/safe — ESP subscribt nicht

**Was passiert:**
- Der Server kann Safe-Mode per MQTT an den ESP senden (`subzone/safe`).
- Der ESP subscribt **nicht** zu diesem Topic — nur zu `subzone/assign` und `subzone/remove`.
- Safe-Mode-Befehle vom Server kommen beim ESP nicht an.

**Wo im Code:**
- `El Trabajante/src/main.cpp` Zeilen 825–828 — nur `buildSubzoneAssignTopic()` und `buildSubzoneRemoveTopic()` werden für Subscribe genutzt.
- `El Trabajante/src/utils/topic_builder.cpp` Zeile 257 — `buildSubzoneSafeTopic()` existiert, wird aber nicht für Subscribe verwendet.

**Robins Anforderung:** Falls Safe-Mode per MQTT genutzt werden soll: ESP-Subscribe zu `subzone/safe` hinzufügen und Handler implementieren. Sonst: dokumentieren, dass Safe-Mode nur über REST/DB läuft.

---

## 3. Technische Fix-Strategie (bestehende Patterns nutzen)

### 3.1 SubzoneAssignmentSection vs. useSubzoneCRUD

- **SubzoneAssignmentSection** (`El Frontend/src/components/devices/SubzoneAssignmentSection.vue`) sendet korrekt `assigned_gpios: [props.gpio]` bei Create — wird in SensorConfigPanel/ActuatorConfigPanel genutzt.
- **useSubzoneCRUD** wird in **ZonePlate** genutzt (`El Frontend/src/components/dashboard/ZonePlate.vue` Zeilen 479, 482) — dort gibt es keinen Sensor/Aktor-Kontext, daher `assigned_gpios: []`.
- **Fix:** (a) `confirmCreateSubzone` erweitern um optionalen Parameter `assignedGpios?: number[]`; ZonePlate ruft mit `[]` auf → Toast „Subzone ohne Geräte erstellt. Zuweisung über Sensor/Aktor-Konfiguration.“ ODER (b) ZonePlate-Create deaktivieren und nur SubzoneAssignmentSection als Create-Quelle nutzen. Empfehlung: (a) mit klarer UX — leere Subzone erlaubt, User weist später zu.

### 3.2 ESP-Lookup für Rename/Delete

- **Option A:** Beim Öffnen des Subzone-Editors den `esp_id` bereits kennen (aus Props/Route) und durchreichen.
- **Option B:** Über `subzonesApi.getSubzones(espId)` für jeden ESP prüfen, ob `subzone_id` in der Antwort ist — erste Treffer = richtiger ESP. API: `GET /api/v1/subzone/devices/{esp_id}/subzones`.
- **Option C:** Hierarchy-API nutzen — `GET /api/v1/kaiser/god/hierarchy` enthält Zone → Subzone → ESP-Zuordnung; Frontend kann daraus esp_id für subzone_id ableiten.
- **Empfehlung:** Option A oder B; Hierarchy nur wenn keine andere Quelle. Bestehende `subzonesApi.getSubzones`-Calls nutzen.
- **WICHTIG Rename:** `saveSubzoneName` sendet aktuell `assigned_gpios: []` an `assignSubzone` — der Server/ESP würde die Subzone mit leeren GPIOs überschreiben! Vor dem Rename müssen die bestehenden `assigned_gpios` aus `getSubzone(espId, subzoneId)` geladen und mitgeschickt werden.

### 3.3 Monitor L2 — Sensoren/Aktoren pro Subzone

- **Datenmodell:** `subzone_configs.assigned_gpios` = [4, 5, 6]. Sensor/Aktor hat `gpio` in `sensor_configs` / `actuator_configs`.
- **Zuordnung:** Für jede Subzone: `assigned_gpios` durchgehen, für jeden GPIO den Sensor/Aktor des ESPs finden (esp_id + gpio → sensor_config / actuator_config).
- **Backend-Erweiterung:** `get_hierarchy` oder neuer Endpoint könnte pro Subzone `sensors[]` und `actuators[]` zurückgeben (mit id, name, gpio, current_value, etc.).
- **Frontend:** HierarchyTab oder Monitor L2 Komponente gruppiert nach Subzone und rendert Sensor-/Aktor-Karten statt ESP-Karten.

---

## 4. Betroffene Dateien (Eingriffspunkte)

| Schicht | Datei | Änderung |
|---------|-------|----------|
| Frontend | `El Frontend/src/composables/useSubzoneCRUD.ts` | confirmCreateSubzone: assigned_gpios aus Kontext (oder ZonePlate-Create deaktivieren/umbauen); saveSubzoneName: esp-Lookup korrigieren + bestehende assigned_gpios vor Rename laden; deleteSubzone: esp-Lookup korrigieren |
| Frontend | `El Frontend/src/components/devices/SubzoneAssignmentSection.vue` | Bereits korrekt: sendet `assigned_gpios: [props.gpio]` bei Create. Als Referenz für useSubzoneCRUD nutzen. |
| Backend | `El Servador/god_kaiser_server/src/services/kaiser_service.py` | get_hierarchy: Pro Subzone sensors[] und actuators[] aus assigned_gpios + sensor_configs/actuator_configs des ESP auflösen |
| Frontend | `El Frontend/src/components/system-monitor/HierarchyTab.vue` | Rendern von Sensoren/Aktoren pro Subzone statt ESPs; „Keine Subzone“-Gruppe für GPIOs ohne Subzone |
| ESP (optional) | `El Trabajante/src/main.cpp` | Subscribe zu `kaiser/god/esp/{esp_id}/subzone/safe` + Handler (falls Safe-Mode per MQTT gewünscht). TopicBuilder: `buildSubzoneSafeTopic()` |

---

## 5. Akzeptanzkriterien

- [ ] **Create Subzone:** Beim Erstellen einer Subzone werden die GPIOs der gewählten Sensoren/Aktoren mitgeschickt; Subzone enthält nach Create die erwarteten Geräte.
- [ ] **Rename/Delete Subzone:** Der richtige ESP wird gefunden; Rename und Delete funktionieren zuverlässig.
- [ ] **Monitor L2:** Sensoren und Aktoren sind nach Subzone gruppiert; „Keine Subzone“ zeigt Geräte ohne Subzone-Zuordnung; Anzeige ist konsistent mit Backend-Daten.
- [ ] **Keine Regression:** L1 Zone-Zuweisung, ZonePlate, useZoneDragDrop bleiben unverändert funktionsfähig.
- [ ] **Rename:** Bestehende assigned_gpios werden beim Umbenennen nicht gelöscht (subzonesApi.getSubzone vor assignSubzone aufrufen).
- [ ] **Bestehende Patterns:** Keine neuen parallelen Flows; SubzoneAssignmentSection, subzonesApi, zone.store werden genutzt und ggf. erweitert.

---

## 6. Vorbedingungen (für Ausführung)

- [ ] El Servador läuft (Port 8000), El Frontend (Port 5173)
- [ ] Mindestens ein ESP (Mock oder real) mit Zone-Zuweisung vorhanden
- [ ] PostgreSQL + MQTT-Broker laufen (Docker: `make up` oder `docker compose up -d postgres mqtt-broker`)

---

## 7. Referenzen

| Dokument | Inhalt |
|----------|--------|
| `.claude/reports/current/zonen-subzonen-vollanalyse-bericht-2026-03-04.md` | Vollständige Analyse, Bruchstellen B1–B5 |
| `.claude/reports/auftrag-zonen-subzonen-esp-server-frontend-vollanalyse.md` | Analyseauftrag (Quelle des Berichts) |
| `.claude/reference/api/REST_ENDPOINTS.md` | Subzone: `/subzone/devices/{esp_id}/subzones/*`, Zone Context: `/zone/context/{zone_id}` |
| `.claude/reference/api/MQTT_TOPICS.md` | subzone/assign, subzone/remove, subzone/safe (Phase 9) |
