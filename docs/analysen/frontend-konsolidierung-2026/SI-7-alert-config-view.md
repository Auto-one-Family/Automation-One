# SI-7 Alert-Config-View — Analyse & Konsolidierungskonzept

**Stand:** 2026-05-06
**Linear:** AUT-244 [SI-7]
**Autor:** Meta-Analyst (auto)
**Branch:** auto-debugger/work

---

## 1. Drei-Pfad-Inventar-Tabelle

| Pfad | Bezeichnung | Existierende UI-Eingabe | API-Endpoint | Status |
|------|-------------|-------------------------|--------------|--------|
| **P1 — Logic Engine** | Cross-ESP, serverseitig, `cross_esp_logic`-Tabelle | `LogicView.vue` + `RuleFlowEditor.vue` + `RuleConfigPanel.vue` — vollständiger visueller Editor (Node-Palette, Canvas, Config-Panel) | `POST/PUT/PATCH/DELETE /api/v1/logic/rules/` | Vorhanden, funktional |
| **P2 — Offline-Rules** | ESP-lokal, Firmware, NVS-Blob | Kein dedizierter UI-Editor vorhanden. Offline-Rules entstehen implizit aus Logic-Engine-Regeln mit `hysteresis`/`sensor_threshold`/`time_window`-Bedingungen; der Konvertierungspfad läuft vollständig in `config_builder.py:_extract_offline_rule()` auf dem Server. Die einzige UI-Berührung ist die `LinkedRulesSection.vue` (read-only Navigation zur Logic-Rule). | Kein direkter Offline-Rule-Endpoint; Payload entsteht in `ConfigPayloadBuilder.build_combined_config()` und wird automatisch nach Sensor-/Aktor-/Logic-CRUD über `esp_service.send_config()` an MQTT gepusht. | Kein eigenständiger UI-Pfad |
| **P3 — sensor_threshold / Alert-Config** | Notification-only, Deadband/Override | (a) `SensorConfigPanel.vue` — Akkordeon "Sensor-Schwellwerte (Basis)": 4 Felder `alarmLow/warnLow/warnHigh/alarmHigh` + RangeSlider. Gespeichert als `threshold_min/warning_min/warning_max/threshold_max` in `sensor_configs`. (b) `AlertConfigSection.vue` — Akkordeon "Alert-Konfiguration": Notifications-Toggle, Suppression-Grund/-Notiz/-Timeout, Severity-Override, Schwellen-Override (`custom_thresholds`) für Alert-Regeln. (c) `DeviceAlertConfigSection.vue` — ESP-Level-Toggle + Propagation zu Kind-Sensoren/Aktoren. | (a) `PUT /api/v1/sensors/{esp_id}/{gpio}` (createOrUpdate). (b) `GET/PATCH /api/v1/sensors/{sensor_id}/alert-config`. (c) `espApi.getAlertConfig` / `espApi.updateAlertConfig`. | Vorhanden, funktional |

**Wichtige Feststellung:** Keine dedizierte `AlertConfigView.vue` in `El Frontend/src/views/` vorhanden. Die gesamte Alert-Konfiguration ist in `SensorConfigPanel.vue` (Context: HardwareView-SlideOver) als Akkordeon-Sektion eingebettet. Es gibt keinen eigenständigen Routing-Einstiegspunkt `/alert-config`.

---

## 2. Konsolidierungs-Konzept — Editor-Spezifikation

### Kontext

Heute müssen Benutzer für die vollständige Konfiguration eines Schwellwert-gesteuerten Verhaltens zwischen zwei voneinander getrennten UI-Pfaden navigieren:

- **P1 (Logic Engine):** `LogicView` — visueller Node-Editor, eigene Route `/logic`
- **P3 (sensor_threshold):** `SensorConfigPanel` — SlideOver in `HardwareView`

Ein einheitlicher "Alert-Config-Editor" würde die drei Konfigurationsmodi pro Sensor/Aktor an einem Ort zusammenfassen.

### Option A — Erweiterung des bestehenden SensorConfigPanel

Das `SensorConfigPanel.vue` erhält eine vierte Akkordeon-Sektion "Schwellwert-Steuerung" mit drei Tabs:

- **Tab 1: Nur Notification** — aktueller Stand (`sensor_threshold`-Felder + `AlertConfigSection`)
- **Tab 2: Online-Logic** — Deeplink-Button "Regel erstellen/bearbeiten in LogicView" + read-only Liste der `LinkedRulesSection`; keine inline Rule-Erstellung
- **Tab 3: Offline-Rule** — Read-only Darstellung der abgeleiteten Offline-Rule (aus Logic-Engine-Regel) + Slot-Anzeige "X/8 belegt" + Hinweis auf cross-ESP-Ausschluss

Vorteil: Kein neuer View, keine neue Route. Nachteil: SensorConfigPanel wird weiter aufgebläht.

### Option B — Neue dedizierte Route `/sensors/{id}/alert-config`

Eigenständige `AlertConfigView.vue` als L3-Modal oder SlideOver, erreichbar aus `SensorCard.vue`, `SensorConfigPanel.vue` und `LinkedRulesSection.vue`. Enthält alle drei Pfad-Tabs.

Vorteil: Klare URL-Semantik, direkter Deeplink aus Notifications möglich. Nachteil: Neuer View + Router-Eintrag + neue API-Anforderung `GET /api/v1/sensors/{id}/alert_config` (aggregiert alle drei Pfade).

### Option C — Alert-Center Integration (AUT-196 Backlog)

Erweitert den Notification-Drawer um eine "Konfiguration" Seite pro Alert. Setzt AUT-196 voraus.

**Empfehlung für SI-7:** Option A als kurzfristige Maßnahme. Option B wenn `GET /sensors/{id}/alert_config`-Aggregations-Endpoint implementiert wird (siehe Abschnitt 7).

---

## 3. Konflikt-Anzeige-Befund — IST vs. SOLL

### IST

- `LogicStore.recentConflictArbitrations` speichert die letzten 20 `conflict.arbitration`-WS-Events (Typ: `ConflictArbitrationEvent` aus `logic.store.ts:84`).
- `ActuatorStore.finalizeConflictLoserIntent()` setzt den verliernden Aktor-Intent auf `terminal_failed` mit Reason `conflict_arbitration` und emittiert einen Warning-Toast.
- `NotificationItem.vue` erkennt `metadata.event_type === 'conflict.arbitration'` und zeigt den Hinweis "Dieser Alert ist informativ" (AUT-131 B-CNFL2-04, implementiert).
- `SystemMonitorView.vue` empfängt `conflict.arbitration`-Events im Event-Feed (Zeile 562).
- E2E-Test `aut-131-conflict-alert-center.spec.ts` ist vorhanden (Status: untracked, neues File im Git-Status).

### SOLL (noch fehlend)

- Keine dedizierte Konflikt-Anzeige **in der Nähe des Sensors/Aktors** (z.B. im `SensorConfigPanel` oder `ActuatorConfigPanel`). Wenn zwei Logic-Rules denselben Aktor adressieren, gibt es im Panel keinen sichtbaren Hinweis auf den Konflikt-Zustand.
- Keine Anzeige "Diese Regel konkurriert mit Regel X auf GPIO Y" im `LinkedRulesSection.vue`.
- Keine Anzeige der Conflict-History im `LogicView` pro Regel (es gibt `recentConflictArbitrations` im Store, aber kein UI-Binding dafür in `LogicView` oder `RuleCard`).

**Fazit:** Die systemische Konflikt-Behandlung ist vollständig (Store + Toast + Notification-Drawer). Die kontextuelle Konflikt-Anzeige an der Konfigurations-Stelle (SensorConfigPanel, RuleCard) fehlt.

---

## 4. Offline-Rules-Limit-Analyse — Slot-Anzeige

### IST

- `ConfigPayloadBuilder.MAX_OFFLINE_RULES = 8` (`config_builder.py:155`).
- Bei Überschreitung wird serverseitig per `logger.warning` geloggt und die Liste auf 8 gekürzt (`config_builder.py:445–452`).
- **Keine UI-Anzeige** "X/8 Offline-Rules belegt" im Frontend.
- `actuator.store.ts` kennt keine `offline_rules`-Daten. Der Store verarbeitet Lifecycle/Config-Intents, nicht Rule-Slots.
- `logic.store.ts` enthält `rules`-Array (alle Logic-Rules), aber keine Information, wie viele davon tatsächlich als Offline-Rule auf einem bestimmten ESP landen (weil die Qualifikationsprüfung serverseitig in `_extract_offline_rule()` läuft).

### Fehlende Server-Seite

Es gibt keinen API-Endpoint `GET /api/v1/esp/{esp_id}/offline_rules_preview`, der die qualifizierten Offline-Rules für ein ESP zurückgeben würde. Die Slot-Anzeige ist deshalb auf dem Frontend heute nicht realisierbar ohne Hinzufügen dieses Endpoints.

### Ausschluss-Kriterien (relevant für UI-Hinweise)

Aus `_extract_offline_rule()` ergeben sich folgende Fälle, in denen eine Logic-Rule **nicht** als Offline-Rule qualifiziert — und die dem Benutzer heute nicht kommuniziert werden:
- OR-Compound-Bedingungen
- Calibration-Required-Sensor-Typen (ph, ec, moisture, soil_moisture)
- Cross-ESP-Aktionen (sensor und Aktor auf verschiedenen ESPs)
- `sensor_value_type` > 23 Zeichen
- Fehlende numerische Schwellenwerte

---

## 5. Time-Filter-Befund — vorhandene Komponente vs. Anforderung

### IST

Die Zeitfenster-Konfiguration ist im **Logic-Engine-Pfad (P1)** vollständig implementiert:

- `RuleConfigPanel.vue` (Zeilen 524–563): Zeitfenster-Knoten-Typ "time" mit vier `<input type="number">`-Feldern für `startHour`, `startMinute`, `endHour`, `endMinute` (0–23/0–59). Kein Slider — direkte Zahleneingabe.
- `RuleFlowEditor.vue`: Serialisierung als `time_window`-Condition mit `start_hour/start_minute/end_hour/end_minute` (Zeilen 697–702).
- Zusätzlich: `days_of_week`-Feld im Config-Panel (aus Grep-Kontext ersichtlich), was in `_days_of_week_db_to_tm_mask()` auf ESP-Bitmask umgerechnet wird.

### Mapping in Offline-Rules

`config_builder.py:_extract_offline_rule()` extrahiert die `time_filter` aus einem `time_window`/`time`-Condition in AND-Compounds (Zeilen 863–903):
- Felder: `start_hour`, `start_minute`, `end_hour`, `end_minute`, `days_of_week_mask`, `timezone`.
- Backward-Compatibility: Legacy `HH:MM`-Strings werden gesplittet.

### SOLL-Lücke

- Die Zeitfenster-Eingabe im `RuleConfigPanel` verwendet `input[type=number]`, kein Uhrzeit-Picker (kein `<input type="time">`). Dies ist akzeptabel für Power-User, aber weniger intuitiv als ein Slider oder ein nativer Zeitpicker.
- Keine Anzeige des konfigurierten Zeitfensters in der `LinkedRulesSection.vue` (zeigt nur Rule-Name + Status, nicht die Bedingungszusammenfassung).
- Kein Hinweis im `SensorConfigPanel`, wenn eine Logic-Rule mit Zeitfenster eine Offline-Rule mit `time_filter` erzeugt.

---

## 6. Config-Push-Pending — Status + API-Kandidat

### IST: Vorhanden und funktional

`PendingConfigBanner.vue` (`El Frontend/src/components/esp/PendingConfigBanner.vue`) ist eine eigenständige Komponente, die bereits in `SensorConfigPanel.vue` (Zeile 850–854) und `ActuatorConfigPanel.vue` eingebunden ist:

- Zeigt Spinner bei `accepted`/`pending`-State.
- Zeigt Warning-Icon bei `terminal_timeout`-State.
- Zeigt Korrelations-ID (gekürzt).
- Bietet "Erneut senden"- und "Verwerfen"-Aktionen.
- Deeplink zu SystemMonitor `/system-monitor?tab=events`.

`ActuatorStore.pendingConfigOrders` ist ein computed-Array aller nicht-abgeschlossenen Config-Intents (für globale Banner-Verwendung, z.B. in einer zukünftigen Toolbar).

### Trigger-Mechanismus

Der Config-Push wird **nicht** manuell ausgelöst. Er ist an CRUD-Operationen gebunden:

- Sensor create/update/delete → `sensors.py` → `esp_service.send_config()` → MQTT
- Logic rule create/update/delete/toggle → `logic.py:_push_config_to_affected_esps()` → `esp_service.send_config()` → MQTT

`esp.py` Kommentar (Zeile 733): "Ein manueller Config-Push-Endpoint existiert nicht."

### clean_session-Relevanz (ADR 2026-04-26)

Mit `clean_session = true` kann ein Config-Push verloren gehen, wenn der ESP zum Zeitpunkt des Pushes offline ist. Der Push wird dann **nicht** re-delivered, sobald der ESP wieder online kommt. Der `PendingConfigBanner` zeigt diesen Zustand als Timeout an. Es gibt **keinen automatischen Retry-Mechanismus**, nur den manuellen "Erneut senden"-Button.

### Fehlende Komponente für Offline-Rules

Es gibt kein "Offline-Rules Push pending"-Signal, das spezifisch auf die `offline_rules`-Keys im Config-Frame hinweist. Der generische `PendingConfigBanner` deckt dies ab (er trackt alle `config_keys` aus `config_published`-Events), aber die UI differenziert nicht zwischen einem reinen Sensor-Config-Push und einem Push, der auch `offline_rules` enthält.

---

## 7. Server-Touchpoints-Tabelle

| Komponente | Datei | Funktion/Endpoint | Beschreibung |
|-----------|-------|-------------------|--------------|
| `ConfigPayloadBuilder` | `services/config_builder.py` | `build_combined_config()` | Aggregiert Sensoren, Aktoren, Offline-Rules zu einem ESP32-Payload |
| `ConfigPayloadBuilder` | `services/config_builder.py` | `_extract_offline_rule()` | Konvertiert eine CrossESPLogic-Regel in einen Offline-Rule-Dict; enthält P4-Guard für Kalibrierungstypen, OR-Ausschluss, Cross-ESP-Ausschluss, Längen-Guard |
| `ConfigPayloadBuilder` | `services/config_builder.py` | `_build_offline_rules()` | Iteriert alle enabled Rules, ruft `_extract_offline_rule()` auf, kürzt auf `MAX_OFFLINE_RULES = 8` |
| `ConfigPayloadBuilder` | `services/config_builder.py` | `_validate_offline_rules_consistency()` | AUT-59: Entfernt Offline-Rules mit GPIOs, die nicht im Config-Frame vorhanden sind |
| Logic API | `api/v1/logic.py` | `_push_config_to_affected_esps()` | Hilfsfunktion; ruft `build_combined_config` + `esp_service.send_config` nach rule create/update/delete/toggle auf |
| Sensor API | `api/v1/sensors.py` | `GET /{sensor_id}/alert-config` | Gibt `alert_config` (JSONB) + `thresholds` aus `sensor_configs` zurück |
| Sensor API | `api/v1/sensors.py` | `PATCH /{sensor_id}/alert-config` | Merged partial update in JSONB `alert_config`; kein MQTT-Push (nur Notification-Routing) |
| Sensor API | `api/v1/sensors.py` | `PUT /api/v1/sensors/{esp_id}/{gpio}` | createOrUpdate: schreibt `threshold_min/max`, `warning_min/max` in `sensor_configs`; triggert MQTT-Config-Push |
| ESP API | `api/v1/esp.py` | `espApi.getAlertConfig` / `updateAlertConfig` | Device-Level Alert-Config (JSONB); kein MQTT-Push |

### Nicht vorhanden

- `GET /api/v1/sensors/{id}/alert_config` als Aggregations-Endpoint (kombiniert P1-Rules + P2-Offline-Rule-Status + P3-Threshold) — würde für Option B des Editors benötigt.
- `GET /api/v1/esp/{esp_id}/offline_rules_preview` — würde Slot-Anzeige im Frontend ermöglichen.

---

## 8. Follow-up-Vorschläge

Keine Implementierung — nur Handlungsoptionen für nachfolgende Issues.

**FU-1 — Offline-Rules-Preview-Endpoint (Server)**
Neuer `GET /api/v1/esp/{esp_id}/offline_rules_preview`-Endpoint, der die Ausgabe von `_build_offline_rules()` + `_validate_offline_rules_consistency()` ohne MQTT-Push zurückgibt. Ermöglicht:
- Slot-Anzeige "X/8 belegt" im Frontend
- Hinweis welche Logic-Rules als Offline-Rule qualifizieren / nicht qualifizieren + Grund

**FU-2 — Slot-Anzeige im SensorConfigPanel (Frontend)**
Erweiterung von `LinkedRulesSection.vue` oder neuer Abschnitt im `SensorConfigPanel`: Zeigt Offline-Rule-Status pro GPIO (setzt FU-1 voraus).

**FU-3 — Kontextuelle Konflikt-Anzeige (Frontend)**
`LinkedRulesSection.vue` erhält eine computed-Eigenschaft basierend auf `logicStore.recentConflictArbitrations`: Wenn eine verknüpfte Regel in den letzten N Konflikten als Gewinner oder Verlierer aufgetaucht ist, wird ein Badge "Konflikt zuletzt XY ago" angezeigt.

**FU-4 — Aggregations-Endpoint für Alert-Config-Editor (Server)**
`GET /api/v1/sensors/{sensor_id}/alert_config_context` gibt zurück: P3-Thresholds, P3-AlertConfig, verknüpfte P1-Rules (aus Logic-Store), qualifizierte P2-Offline-Rules (aus FU-1-Logik). Ermöglicht Option B des Konsolidierungs-Konzepts.

**FU-5 — Zeitfenster-Eingabe verbessern (Frontend)**
`RuleConfigPanel.vue` Zeitfenster-Node: `<input type="time">` statt `<input type="number">` für `startHour+Minute` / `endHour+Minute`. Reduziert Eingabefehler (z.B. Stunde > 23).

**FU-6 — Offline-Rule Push-Differenzierung im PendingConfigBanner (Frontend)**
`PendingConfigBanner.vue` erhält optionalen Prop `configKeys: string[]`. Bei `config_keys.includes('offline_rules')` wird der Banner-Text um "inkl. Offline-Rules" ergänzt. Setzt voraus, dass `handleConfigPublished` die `config_keys` ans Intent weitergibt (bereits im `actuator.store.ts` Zeile 1122 implementiert).

**FU-7 — Kein manueller Config-Push gewünscht (Architektur-Gate)**
Die Architektur sieht explizit keinen manuellen Push-Endpoint vor (`esp.py:733`). Jedes UI-Feature, das einen "Jetzt pushen"-Button benötigt, müsste diesen Entscheid revidieren. Alternativ: REST-Trigger über ein neues `POST /api/v1/esp/{esp_id}/push_config`-Endpoint als Operator-only-Aktion. Entscheidung liegt beim TM.

---

## Anhang: Datei-Referenzen

| Datei | Relevanz |
|-------|---------|
| `El Frontend/src/components/devices/AlertConfigSection.vue` | P3-Sensor-Alert-Konfiguration (Suppression, Schwellen-Override, Severity) |
| `El Frontend/src/components/devices/DeviceAlertConfigSection.vue` | P3-Device-Level-Alert-Konfiguration (Propagation zu Kindern) |
| `El Frontend/src/components/devices/LinkedRulesSection.vue` | Read-only Verknüpfungs-Anzeige P1 → Sensor/Aktor |
| `El Frontend/src/components/esp/SensorConfigPanel.vue` | Haupteinstieg P3-Konfiguration; enthält Threshold-Akkordeon + AlertConfigSection |
| `El Frontend/src/components/esp/PendingConfigBanner.vue` | Config-Push-Pending-Indikator (Pending/Timeout/Dismiss) |
| `El Frontend/src/components/rules/RuleConfigPanel.vue` | P1-Zeitfenster-Eingabe (time-Node: startHour/endHour/startMinute/endMinute) |
| `El Frontend/src/components/rules/RuleFlowEditor.vue` | P1-Serialisierung time_window-Condition |
| `El Frontend/src/shared/stores/actuator.store.ts` | Config-Intent-Lifecycle; `pendingConfigOrders`, `registerConfigIntentFromRest` |
| `El Frontend/src/shared/stores/logic.store.ts` | P1-Rules; `recentConflictArbitrations`; `handleConflictArbitrationEvent` |
| `El Frontend/src/components/notifications/NotificationItem.vue` | AUT-131: `isArbitrationInfo`-Flag für Konflikt-Benachrichtigungen |
| `El Servador/god_kaiser_server/src/services/config_builder.py` | `_extract_offline_rule()`, `MAX_OFFLINE_RULES=8`, P4-Guard, Time-Filter-Extraktion |
| `El Servador/god_kaiser_server/src/api/v1/sensors.py` | `GET/PATCH /{sensor_id}/alert-config` |
| `El Servador/god_kaiser_server/src/api/v1/logic.py` | `_push_config_to_affected_esps()` nach Rule-CRUD |
