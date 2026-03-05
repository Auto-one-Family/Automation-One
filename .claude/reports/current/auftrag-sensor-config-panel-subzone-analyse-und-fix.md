# Auftrag: Sensor-Konfigurationspanel Subzone — Analyse und Fix (vollständige Verknüpfung)

> **Erstellt:** 2026-03-05  
> **Verifiziert:** 2026-03-05 (verify-plan + Codebase-Check)  
> **Rolle:** Automation-Experte  
> **Basis:** SENSOR-CONFIG-PANEL-DATENFLUSS-DETAILANALYSE.md, roadmap-sensor-konfig-panel-fixes-2026-03-04.md, VOLLANALYSE, zonen-subzonen-vollanalyse-bericht-2026-03-04.md  
> **Ziel-Repo:** auto-one (El Frontend + El Servador)  
> **Prinzip:** System komplett ordentlich verknüpft — Single Source of Truth (DB), ein konsistenter Datenfluss für Real- und Mock-ESP.  
> **Monitor:** Nur Anzeige — Subzone-Edit-Logik ausschließlich im SensorConfigPanel; Monitor L2 bezieht Daten aus `zonesApi.getZoneMonitorData()` (Backend subzone_configs).

---

## 1. Bug-Analyse (exakt)

### 1.1 Was der User sieht

| Aktion | Erwartung | Ist (verifiziert) |
|--------|-----------|-------------------|
| Bestehende Subzone im Dropdown wählen → **Speichern** | Subzone wird gespeichert; Monitor L2 und DB zeigen Sensor in gewählter Subzone | **Subzone wird nicht persistiert** (Playwright E2E 2026-03-05: Sensor bleibt in alter Subzone) |
| „+ Neue Subzone erstellen…“ → Name → **Haken** | Subzone angelegt/zugewiesen, Sensor erscheint in der Subzone | **Funktioniert** |
| Panel öffnen (Sensor hat Subzone) | Dropdown zeigt aktuelle Subzone vorausgewählt | Abhängig: Backend liefert subzone_id; Frontend muss sie übernehmen |

### 1.2 Root Cause (technisch)

Es gibt **zwei** getrennte Ursachen, die das System „unordentlich“ machen:

**Ursache A — Mock-ESP: Haupt-Save sendet keinen Request**

- **Ort:** `El Frontend/src/components/esp/SensorConfigPanel.vue`, **handleSave()**
- **Logik:** Wenn `isMockEsp(espId)` (oder vergleichbar): Es wird **kein** `sensorsApi.createOrUpdate(...)` aufgerufen, sondern nur ein Toast („Sensor-Konfiguration gespeichert“) und ggf. lokaler Store-Update.
- **Folge:** Bei Mock-ESP werden **keine** Änderungen (Name, Schwellwerte, **Subzone**, …) an das Backend geschickt. Die Subzone-Zuordnung liegt ausschließlich in **subzone_configs** (DB); ohne POST findet keine Backend-Aktualisierung statt.
- **Warum „Neue Subzone + Haken“ trotzdem funktioniert:** Dieser Pfad ruft **direkt** `subzonesApi.assignSubzone(espId, { subzone_id, subzone_name, parent_zone_id, assigned_gpios: [gpio] })` auf — also **POST /api/v1/subzone/devices/{esp_id}/subzones/assign**. Das Backend akzeptiert Mock-IDs (laut Zonen/Subzonen-Vollanalyse); die DB wird geschrieben.

**Ursache B — Semantik subzone_id („Keine Subzone“)**

- **Frontend:** SubzoneAssignmentSection nutzt für „Keine Subzone“ den Sentinel **NONE_OPTION = `"__none__"`**. Beim Speichern setzt SensorConfigPanel `config.subzone_id = subzoneId.value || null` (Zeile 303). Wenn der User „Keine Subzone“ wählt, kann je nach Setter/Laufzeit **`"__none__"`** (String) oder **null** an die API gehen.
- **Backend:** Erwartet für „GPIO aus allen Subzonen entfernen“ typischerweise **leer/null**. Wenn das Backend nur auf `if request.subzone_id` prüft, wird **`"__none__"`** als gesetzter Wert behandelt und könnte zu ungültiger Subzone-Validierung oder falscher Logik führen.
- **Soll:** Einheitlich **null** (oder fehlendes Feld) für „Keine Subzone“ senden; Backend behandelt nur echte Subzone-IDs oder null.

### 1.3 Datenfluss (Soll vs. Ist)

**Single Source of Truth (Wissen:** `iot-datenkonsistenz-backend-frontend-zone-subzone-2026.md`):  
Die **Datenbank** ist die autoritative Quelle. Subzone-Zuordnung lebt in **subzone_configs** (assigned_gpios pro esp_id, subzone_id). Es gibt **kein** subzone_id-Feld in sensor_configs; die Zuordnung erfolgt ausschließlich über **subzone_configs**.

| Schritt | Soll | Ist (Stand Analyse) |
|---------|------|----------------------|
| 1. User wählt Subzone im Dropdown | selectedValue = subzone_id (z.B. `reihe_1`) oder null für „Keine Subzone“ | Sentinel `"__none__"` für Keine; sonst subzone_id |
| 2. User klickt Speichern | handleSave() baut config inkl. **subzone_id** (null oder ID), ruft **POST /sensors/{esp_id}/{gpio}** für **jeden** ESP (Real + Mock) auf | **Nur bei Real-ESP:** POST wird ausgeführt. **Bei Mock:** kein POST, nur Toast |
| 3. Backend empfängt POST | SensorConfigCreate mit subzone_id; nach DB-Commit SubzoneService.assign_subzone bzw. remove_gpio_from_all_subzones | Backend ist implementiert (Schema, SubzoneService-Aufruf). Erhält bei Mock aber **keinen** Request |
| 4. GET /sensors/{esp_id}/{gpio} | Response enthält **subzone_id** (via get_subzone_by_gpio) | Backend liefert subzone_id (laut Codebase-Verifikation) |
| 5. Panel lädt Config | subzoneId = response.subzone_id; Dropdown zeigt korrekte Subzone | Frontend muss bei Load subzone_id aus Response übernehmen (Zeile 150, 188); „Keine Subzone“ als Anzeige wenn null |

### 1.4 Warum das System „nicht ordentlich verknüpft“ ist

- **Zwei getrennte Pfade für Subzone:** (1) Haupt-Save (createOrUpdate mit subzone_id) und (2) direkter Aufruf assignSubzone („Neue Subzone erstellen“). Beide müssen dieselbe Backend-Logik (SubzoneService, subzone_configs) nutzen — das tun sie. **Aber:** Bei Mock wird Pfad (1) gar nicht ausgeführt → Inkonsistenz zwischen Real und Mock.
- **Mock = „halber“ Roundtrip:** Für Mock wird beim Speichern nichts persistiert; die einzige Möglichkeit, die Subzone zu ändern, ist der direkte assignSubzone-Pfad. Das ist für Nutzer verwirrend (Speichern suggeriert Erfolg, Monitor zeigt alte Subzone).
- **Sentinel „__none__“:** Kann Backend und Frontend inkonsistent machen, wenn nicht explizit auf null normalisiert wird.

---

## 2. Ziele (vollständige Verknüpfung)

1. **Ein einheitlicher Speicherpfad:** Ein Klick auf „Speichern“ soll für **Real- und Mock-ESP** die komplette Config (inkl. Subzone) an das Backend senden und in der DB persistieren. Backend akzeptiert bereits MOCK_* (Subzone-Routen, Sensor-Routen). Frontend muss bei Mock ebenfalls **POST /api/v1/sensors/{esp_id}/{gpio}** aufrufen.
2. **Eindeutige Semantik „Keine Subzone“:** Überall **null** (oder fehlendes Feld) an Backend senden; Backend entfernt GPIO aus allen Subzonen. Frontend zeigt „Keine Subzone“ nur in der UI (Dropdown-Label), nicht als Wert in der API.
3. **Laden:** GET liefert subzone_id; Frontend setzt beim Öffnen des Panels subzoneId korrekt (inkl. Fallback für Mock/Store, wo nötig).
4. **Keine Doppel-Logik:** „Neue Subzone erstellen“ bleibt als direkter Aufruf assignSubzone (schneller Flow); Haupt-Save bleibt die zentrale Stelle für alle anderen Felder **und** für Subzone-Änderung (Dropdown bestehende Subzone / Keine Subzone). Beide Pfade schreiben in dieselbe subzone_configs-Tabelle (Single Source of Truth).

---

## 3. Fix-Auftrag (konkret, abarbeitbar)

### Block A: Frontend — Mock-ESP ebenfalls über Backend persistieren (KRITISCH)

**Ziel:** handleSave() soll für **Mock-ESP** genauso **POST /api/v1/sensors/{esp_id}/{gpio}** mit dem vollen config (inkl. subzone_id) aufrufen wie für Real-ESP. Kein „nur Toast“ ohne Request.

| Nr | Aufgabe | Datei / Ort | Details |
|----|---------|--------------|---------|
| A1 | **Bedingung für API-Aufruf anpassen** | `SensorConfigPanel.vue`, handleSave() | Aktuell: Bei Mock wird createOrUpdate übersprungen. **Änderung:** createOrUpdate für **alle** ESPs aufrufen (Real + Mock). Toast weiterhin anzeigen bei Erfolg. |
| A2 | **Fehlerbehandlung** | handleSave() | Bei 4xx/5xx vom Backend: Toast mit Fehlermeldung (nicht nur bei Real). Mock-Backend kann z.B. 404 liefern wenn Sensor noch nicht existiert — ggf. Create-Flow prüfen. |
| A3 | **Optional: Backend prüfen** | `El Servador/god_kaiser_server/src/api/v1/sensors.py` | **Verifiziert:** SensorConfigCreate.esp_id Pattern `^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+)$`; esp_repo.get_by_device_id findet Mock-ESPs in DB. Keine Änderung nötig. |

**Verifikation:** Mit Mock-ESP Subzone im Dropdown auf „Reihe 2“ ändern → Speichern → Monitor L2 neu laden → Sensor erscheint unter „Reihe 2“. DB: subzone_configs.assigned_gpios für die gewählte Subzone enthält den GPIO.

---

### Block B: Frontend — subzone_id-Semantik „Keine Subzone“ (HOCH)

**Ziel:** An die API wird für „Keine Subzone“ ausschließlich **null** (oder kein Feld) gesendet, nie der String `"__none__"`.

| Nr | Aufgabe | Datei / Ort | Details |
|----|---------|--------------|---------|
| B1 | **Normalisierung vor dem Senden** | SensorConfigPanel.vue, handleSave(), config-Bau | Vor createOrUpdate: `config.subzone_id = (subzoneId.value === '__none__' || subzoneId.value === null || subzoneId.value === undefined) ? null : subzoneId.value`. So wird „Keine Subzone“ immer als null ans Backend geschickt. |
| B2 | **SubzoneAssignmentSection** | `El Frontend/src/components/devices/SubzoneAssignmentSection.vue` | **Verifiziert:** Emittiert bereits `null` bei NONE_OPTION (Zeile 54–55: `emitted = v === NONE_OPTION ? null : String(v)`). Keine Änderung nötig; B1-Normalisierung im Parent reicht. |
| B3 | **Backend (optional)** | `El Servador/god_kaiser_server/src/api/v1/sensors.py` create_or_update_sensor | Falls request.subzone_id in (`"__none__"`, `""`): Als None behandeln, remove_gpio_from_all_subzones aufrufen. (Defensiv; Zeile 803/604: `if request.subzone_id` — `"__none__"` ist truthy!) |

**Verifikation:** „Keine Subzone“ wählen → Speichern → Request-Body in DevTools: subzone_id ist null oder fehlt. Backend entfernt GPIO aus allen Subzonen (DB prüfen).

---

### Block C: Frontend — Laden der Subzone beim Öffnen (HOCH)

**Ziel:** Beim Öffnen des Panels wird die aktuelle Subzone aus der GET-Response übernommen und im Dropdown angezeigt.

| Nr | Aufgabe | Datei / Ort | Details |
|----|---------|--------------|---------|
| C1 | **subzone_id aus GET übernehmen** | SensorConfigPanel.vue, Load-Pfad (z.B. nach sensorsApi.get() oder beim Setzen von config) | Wenn response.subzone_id vorhanden: `subzoneId.value = response.subzone_id`. Wenn null/fehlt: `subzoneId.value = null` (Dropdown zeigt „Keine Subzone“). Kein Überschreiben durch Fallback, wenn die API bereits subzone_id liefert. |
| C2 | **Fallback für Mock/Store** | SensorConfigPanel.vue onMounted | Wenn Config aus device.sensors (Mock) geladen wird: subzone_id pro Sensor nutzen (Zeile 188). **Optional nach Block A:** Auch für Mock `sensorsApi.get()` versuchen; bei 404 Fallback auf device.sensors — verbessert Roundtrip (subzone_id aus DB). |
| C3 | **Dropdown-Anzeige** | `SubzoneAssignmentSection.vue` (devices/) | **Verifiziert:** selectedValue getter mappt `null` → NONE_OPTION; setter emittiert `null` bei NONE_OPTION. Keine Änderung nötig. |

**Verifikation:** Sensor mit Subzone „Reihe 1“ in DB → Panel öffnen → Dropdown zeigt „Reihe 1“. Sensor ohne Subzone → Dropdown zeigt „Keine Subzone“.

---

### Block D: Backend — Absichern und dokumentieren (MITTEL)

| Nr | Aufgabe | Datei / Ort | Details |
|----|---------|--------------|---------|
| D1 | **SubzoneService bei Fehler** | `El Servador/god_kaiser_server/src/api/v1/sensors.py` create_or_update_sensor | Wenn SubzoneService fehlschlägt: ValidationException (400) werfen, **nicht** still rollback. Aktuell: ValueError → ValidationException; andere Exception → rollback + warning (Zeile 816–824). Prüfen ob alle Fehlerpfade 400 liefern. |
| D2 | **Normalisierung __none__** | create_or_update_sensor (Multi-Value + Single-Value Pfade) | Vor Subzone-Branch: `subzone_id_val = None if (request.subzone_id in ("__none__", "") or not request.subzone_id) else request.subzone_id`. Dann `if subzone_id_val:` statt `if request.subzone_id:`. |
| D3 | **Tests** | tests/ (sensors, subzone) | Unit-Test: POST /sensors mit subzone_id → subzone_configs enthält GPIO in gewählter Subzone. POST mit subzone_id=null → GPIO in keiner Subzone. Optional: Mock-esp_id (MOCK_*) für POST /sensors. |

---

### Block E: Typen und Konsistenz (NIEDRIG)

| Nr | Aufgabe | Datei / Ort | Details |
|----|---------|--------------|---------|
| E1 | **SensorConfigCreate (Frontend)** | `El Frontend/src/types/index.ts` | **Erledigt:** Feld `subzone_id?: string | null` bereits vorhanden (Zeile 637). |
| E2 | **Dokumentation** | SENSOR-CONFIG-PANEL-DATENFLUSS-DETAILANALYSE / Roadmap | Nach Umsetzung: Tabelle „Was funktioniert“ aktualisieren (Dropdown + Speichern für Real und Mock), Abschnitt 4 (Vergleich) auf „Subzone-Verarbeitung: Ja“ für Haupt-Save stellen, Checkliste abhaken. |

---

## 4. Abhängigkeiten und Reihenfolge

```
Block A (Mock auch POST) ──┬──► sofort sichtbar: Dropdown + Speichern funktioniert für Mock
                          │
Block B (null für Keine) ─┼──► saubere API-Semantik, Backend kann zuverlässig „entfernen“
                          │
Block C (Laden) ──────────┴──► Roundtrip komplett: Speichern + erneutes Öffnen zeigt richtige Subzone

Block D (Backend) parallel oder nach A/B
Block E (Typen/Doku) jederzeit
```

**Empfohlene Reihenfolge:** A → B → C → D → E (oder A und B parallel, dann C, D, E).

---

## 5. Verifikation (Endzustand)

- [ ] **Real-ESP:** Subzone im Dropdown wählen → Speichern → Monitor L2 und DB zeigen gewählte Subzone; Panel erneut öffnen → Subzone vorausgewählt.
- [ ] **Mock-ESP:** Subzone im Dropdown wählen → Speichern → **POST /sensors** wird ausgeführt (Network-Tab); Monitor L2 und DB zeigen gewählte Subzone; Panel erneut öffnen → Subzone vorausgewählt.
- [ ] **Keine Subzone:** „Keine Subzone“ wählen → Speichern → Request body subzone_id = null; GPIO in keiner Subzone (DB); Panel erneut öffnen → „Keine Subzone“ ausgewählt.
- [ ] **Neue Subzone erstellen + Haken:** Unverändert funktionsfähig (assignSubzone direkt).
- [ ] Keine doppelte oder widersprüchliche Logik: Subzone-Zuordnung nur über Backend (subzone_configs); Frontend sendet subzone_id einmalig über Haupt-Save oder über assignSubzone.

---

## 6. Referenzen

| Dokument | Pfad | Inhalt |
|----------|------|--------|
| SENSOR-CONFIG-PANEL-DATENFLUSS-DETAILANALYSE | `.claude/reports/current/SENSOR-CONFIG-PANEL-DATENFLUSS-DETAILANALYSE.md` | Datenfluss Speichern/Laden, Codebase-Verifikation Backend |
| roadmap-sensor-konfig-panel-fixes | `.claude/reports/current/roadmap-sensor-konfig-panel-fixes-2026-03-04.md` | Code-Pfade SubzoneAssignmentSection, create_or_update_sensor, Phasen S1–S4 |
| zonen-subzonen-vollanalyse-bericht | `.claude/reports/current/zonen-subzonen-vollanalyse-bericht-2026-03-04.md` | Mock von Backend akzeptiert (Path-Pattern), assign_subzone DB-Upsert für Mock |
| REST_ENDPOINTS | `.claude/reference/api/REST_ENDPOINTS.md` | POST `/sensors/{esp_id}/{gpio}`, POST `/subzone/devices/{esp_id}/subzones/assign` |

---

**Ende des Auftrags.** Dieser Auftrag kann 1:1 im auto-one Repo abgearbeitet werden; alle Pfade und Prinzipien sind auf dein System (AutomationOne, El Frontend, El Servador, subzone_configs als Single Source of Truth) optimiert.
