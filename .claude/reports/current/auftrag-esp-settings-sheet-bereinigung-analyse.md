# Auftrag: ESPSettingsSheet — Bereinigung (Analyse)

**Ziel-Repo:** auto-one (El Frontend)  
**Erstellt:** 2026-03-05  
**Priorität:** HOCH  
**Typ:** Analyse (Ergebnis = konkreter Umsetzungsauftrag)

**Agent:** `frontend-dev` (Modus A: Analyse & Plan)  
**Skill:** `.claude/skills/frontend-development/SKILL.md` vor Analyse laden  
**Report-Output:** `.claude/reports/current/FRONTEND_DEV_REPORT.md` (oder explizit: `ESPSettingsSheet-Bereinigung-Analyse.md` — im Bericht klar als „ESPSettingsSheet Bereinigung“ kennzeichnen, damit Du es wiederfindest)

---

## Kontext

Das ESPSettingsSheet öffnet sich seitlich, wenn der User auf „Einstellungen“ einer ESP-Card klickt (Level 1, Übersicht). Aktuell zeigt es vermutlich mehr als gewünscht: Sensor-/Aktor-Konfigurationen, Deep-Links zum SensorConfigPanel usw.

**Ziel:** Das ESPSettingsSheet soll **keine** Konfiguration mehr anbieten. Es ist ein reines **Informations-Panel** — maximal eine Übersicht, welche Sensoren und Aktoren angebunden sind.

**Der eigentliche Weg zur Konfiguration:** User klickt auf die ESP-Card → Level 2 (Orbital-Layout) → dort Drag & Drop, AddSensorModal/AddActuatorModal für neue Geräte, SensorConfigPanel/ActuatorConfigPanel für bestehende (Klick auf Sensor-/Aktor-Card).

---

## Aufgabe

### Teil 1: IST-Zustand erfassen

**Zu analysierende Dateien (vollständige Pfade):**
- **Hauptkomponente:** `El Frontend/src/components/esp/ESPSettingsSheet.vue`
- **Parent (Event-Handler, muss angepasst werden):** `El Frontend/src/views/HardwareView.vue`
- **Kontext (Konfig-Ort Level 2):** `El Frontend/src/components/esp/ESPOrbitalLayout.vue` (emittiert ebenfalls an HardwareView → SensorConfigPanel/ActuatorConfigPanel; Konfig bleibt dort)
- **Referenz Subzone-Gruppierung:** `El Frontend/src/components/dashboard/ZonePlate.vue` (zeigt `subzone_id`/`subzone_name`-Gruppierung; Pattern für SOLL-Liste)
- **Datenquelle Device/Sensoren/Aktoren:** `El Frontend/src/stores/esp.ts` (espStore); Device kommt als Prop von HardwareView

1. **ESPSettingsSheet.vue** vollständig analysieren:
   - Welche Sektionen/Blöcke gibt es? (IST: IDENTIFICATION, STATUS, ZONE, SENSOR LIST, ACTUATOR LIST, MOCK CONTROLS, DANGER ZONE — **keine** eigene Subzone-Sektion; Subzones werden aktuell **nicht** im Sheet angezeigt, nur flache Sensor-/Aktor-Listen.)
   - Wo werden Sensor-/Aktor-Konfigurationen angezeigt oder verlinkt? (Konkret: Klick auf Sensor-/Aktor-Zeile → `openSensorConfig`/`openActuatorConfig` → Emits `open-sensor-config`/`open-actuator-config`; Zeilen ~645 und ~679; Emits definiert Zeilen 63–64, ausgelöst Zeilen 218, 227.)
   - Gibt es Buttons/Links die zum SensorConfigPanel oder ActuatorConfigPanel führen? Ja: die Sensor-/Aktor-Listen-Items sind klickbar und öffnen die Panels im SlideOver (HardwareView handhabt das).
   - Gibt es „Einstellungen“- oder „Konfigurieren“-Buttons pro Sensor/Aktor? Die gesamte Zeile ist ein Button (`config-list-item` mit ChevronRight) — funktional gleichbedeutend.
   - Wie ist die Zone dargestellt? ZoneAssignmentPanel (Zeilen 616–625), Anzeige + Bearbeitung — **soll bleiben**.
   - Wie sind Subzones dargestellt? **IST: gar nicht.** Nur flache Listen `sensors`/`actuators` aus `props.device`. Für SOLL prüfen: Haben Sensor/Aktor im Device-Modell `subzone_id`/`subzone_name`? (SensorConfigPanel und ZonePlate nutzen das; ggf. API-Typen prüfen.)

2. **Datenfluss:** Woher kommen die Daten? Device (inkl. `sensors`, `actuators`) kommt als **Prop** von HardwareView; espStore wird für `updateDevice`, `triggerHeartbeat`, `deleteDevice`, `setAutoHeartbeat` genutzt. Beim reinen Öffnen des Sheets keine zusätzlichen API-Calls — Daten sind bereits im Device-Objekt. Prüfen: Welche API liefert Device mit Sensoren/Aktoren (z. B. GET Device by ID)?

3. **Event-Kette:** Welche Events werden emittiert? Definiert in ESPSettingsSheet: `close`, `update:isOpen`, `name-updated`, `zone-updated`, `deleted`, `heartbeat-triggered`, **`open-sensor-config`**, **`open-actuator-config`**. HardwareView lauscht auf `@open-sensor-config="handleSensorConfigFromSheet"` und `@open-actuator-config="handleActuatorConfigFromSheet"` (Zeilen 970–971) — diese Handler und ggf. die Bindung müssen in der Gap-Analyse erfasst werden.

---

### Teil 2: SOLL-Zustand definieren

**Ziel-Design:**

| Element | SOLL |
|---------|------|
| **Zone** | Bleibt. Anzeige + Einstellbar (ist korrekt). |
| **Subzones** | Sensoren und Aktoren **zusammen** nach Subzone gruppiert. Pro Subzone: Überschrift + Liste der Geräte (Name, Typ, ggf. GPIO). Keine Konfig-Buttons. |
| **Sensor-/Aktor-Konfiguration** | **WEG.** Keine Links zum SensorConfigPanel, keine „Einstellungen“-Buttons pro Sensor/Aktor. |
| **Deep-Links** | **WEG.** Keine Navigation zu SensorConfigPanel oder ActuatorConfigPanel. |
| **Inhalt** | Maximal: Übersicht welche Sensoren/Aktoren angebunden sind, gruppiert nach Subzone (oder „Keine Subzone“). Zone-Info. |

**Beispiel SOLL-Layout:**
```
ESP: [Name] Zone: [Zone-Name] (editierbar)

Subzone: Becken Ost
  - sht31_temp (Temperatur)
  - sht31_humidity (Feuchtigkeit)
  - Pumpe 1 (Relay)

Subzone: Vorraum
  - ds18b20_1 (Temperatur)

Keine Subzone
  - pump_aux (Relay)
```

Keine Buttons, keine Links. Reine Anzeige.

---

### Teil 3: Gap-Analyse

1. **Was muss entfernt werden?** Liste aller Stellen mit **Datei + Zeilen**: Buttons (z. B. Sensor-/Aktor-`config-list-item`-Buttons in ESPSettingsSheet), Links, Event-Handler (`openSensorConfig`/`openActuatorConfig`), Emits `open-sensor-config`/`open-actuator-config` (Definition + Aufrufe). Sektionen die Konfiguration anbieten: SENSOR LIST und ACTUATOR LIST so umbauen, dass keine Klicks mehr zu Config-Panels führen.
2. **Was muss umgebaut werden?** Subzone-Darstellung: **IST:** Keine Subzone-Anzeige im Sheet, nur flache Listen. **SOLL:** Neue Darstellung: Sensoren und Aktoren **zusammen** nach Subzone gruppieren (Subzone-Name/ID aus Device-Daten; Pattern z. B. aus ZonePlate.vue für Gruppierung). Pro Subzone: Überschrift + reine Liste (Name, Typ, ggf. GPIO) — keine Buttons.
3. **Abhängigkeiten:** **HardwareView.vue** rendert ESPSettingsSheet und bindet `@open-sensor-config` und `@open-actuator-config`. Diese beiden Listener und die zugehörigen Handler (`handleSensorConfigFromSheet`, `handleActuatorConfigFromSheet`) müssen in der Gap-Analyse erfasst werden — entweder entfernen oder nur noch für andere Quellen (z. B. ESPOrbitalLayout) beibehalten. Prüfen: Wird das Sheet nur von HardwareView verwendet?

---

### Teil 4: Umsetzungsauftrag (Ergebnis)

Am Ende ein **konkreter Umsetzungsauftrag** mit:
- **Datei(en) und Zeilen** (z. B. `ESPSettingsSheet.vue` Zeilen 634–665, 668–701, 218–230; `HardwareView.vue` Zeilen 970–971 und Handler-Definitionen).
- **Schritt-für-Schritt:** Entfernen X, Y, Z; Ersetzen A durch B; Neue Komponente/Sektion für Subzone-Gruppierung (inkl. Datenquelle für `subzone_id`/`subzone_name` — Device-Typen oder API prüfen).
- **Design-System:** Nur Primitives aus `El Frontend/src/shared/design/` verwenden (z. B. keine neuen Buttons für Sensor/Aktor-Zeilen; nur Text/Listen).

---

## Hinweise

- **Keine Implementierung in diesem Auftrag.** Nur Analyse. Ergebnis = strukturierter Bericht + Umsetzungsauftrag.
- **HardwareView** (`El Frontend/src/views/HardwareView.vue`) ist der Parent, der ESPSettingsSheet rendert und `@open-sensor-config` sowie `@open-actuator-config` handhabt. Diese Bindung und die zugehörigen Handler müssen in der Analyse erfasst werden (entfernen oder nur für andere Aufrufer beibehalten).
- **Report-Format:** Der Agent soll den Bericht so strukturieren, dass Du (Robin) alle Infos hast: 1) IST (Sektionen, Events, Datenfluss), 2) SOLL (wie oben), 3) Gap (konkrete Zeilen/Stellen), 4) Umsetzungsauftrag (Schritte mit Dateipfaden). Optional: Ergebnis in `FRONTEND_DEV_REPORT.md` mit klarer Überschrift „ESPSettingsSheet Bereinigung — Analyse“ oder in separater Datei `ESPSettingsSheet-Bereinigung-Analyse.md` in `.claude/reports/current/`.

---

## Agent-Befehl (Copy & Paste für frontend-dev)

```
Lade den Skill .claude/skills/frontend-development/SKILL.md. Führe eine reine Analyse durch (Modus A): ESPSettingsSheet Bereinigung.

Kontext: Das ESPSettingsSheet soll kein Konfigurations-UI mehr anbieten, nur noch Informations-Übersicht (Zone bleibt editierbar; Sensoren/Aktoren nach Subzone gruppiert, nur Anzeige).

Analysiere:
1. El Frontend/src/components/esp/ESPSettingsSheet.vue (IST: Sektionen, Events, Datenfluss, Stellen die Konfig öffnen)
2. El Frontend/src/views/HardwareView.vue (Event-Handler für open-sensor-config / open-actuator-config)
3. Subzone-Daten: Haben device.sensors/device.actuators subzone_id/subzone_name? Referenz: ZonePlate.vue für Gruppierungs-Pattern.

Ergebnis: Strukturierter Bericht mit (1) IST, (2) SOLL gemäß Auftragsdokument, (3) Gap-Analyse mit Datei+Zeilen, (4) konkreter Umsetzungsauftrag (Schritte, Dateien, Zeilen). Schreibe nach .claude/reports/current/FRONTEND_DEV_REPORT.md mit Überschrift „ESPSettingsSheet Bereinigung — Analyse“ (oder ESPSettingsSheet-Bereinigung-Analyse.md).
```

---

*Auftrag geprüft und ergänzt mit verify-plan (Pfade, Agent, Output, IST-Hinweise, Parent-Anpassung).*
