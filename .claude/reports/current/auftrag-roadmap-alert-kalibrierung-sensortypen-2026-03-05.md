# Roadmap: Alert-Konfigurationen & Kalibrierung / Sensor-Aktortypen

**Erstellt:** 2026-03-05  
**Verfeinert:** 2026-03-05 (Fokus, Reihenfolge, Einzel-Sensoren)  
**Basis:** Config-Panel-Optimierung 1–5 abgeschlossen  
**Priorität:** HOCH (nach Abschluss Config-Panel)  
**Typ:** Roadmap für Analyseaufträge + Recherche/Forschung

---

## Frontend-Fokus (verbindlich)

**Konfiguration und Kalibrierung finden ausschließlich in der HardwareView statt:**

| Level | View | Kontext |
|-------|------|---------|
| **L1** | HardwareView | Zone-Übersicht, ESPSettingsSheet (nur Info) |
| **L2** | HardwareView | Orbital-Layout → Klick auf Sensor/Aktor-Satellite → **SensorConfigPanel** / **ActuatorConfigPanel** |

- **SensorConfigPanel** = einziger Ort für Sensor-Konfiguration inkl. **Kalibrierung** (CalibrationWizard, Kalibrierungs-Sektion)
- **ActuatorConfigPanel** = einziger Ort für Aktor-Konfiguration
- **Nicht** Komponenten-Tab (/sensors), **nicht** MonitorView, **nicht** CustomDashboardView

**Arbeitsprinzip:** Fokussiert in einer View arbeiten. Nicht zwischen Views springen. Aufträge so formulieren, dass der Fokus (HardwareView L2 → Config-Panels) gewahrt bleibt.

---

## Getrennte Behandlung: Alerts, Notifications, Log-Anzeige

Diese drei Bereiche müssen **getrennt voneinander** analysiert und verwaltet werden:

| Bereich | Kontext | Wo konfiguriert? | Wo angezeigt? |
|--------|---------|------------------|---------------|
| **Alerts** (Panel-konfigurierbar) | Sensor/Aktor-Schwellen, AlertConfigSection | SensorConfigPanel, ActuatorConfigPanel (AlertConfigSection) | TBD (Vollanalyse) |
| **Notifications** | Benachrichtigungen an User (E-Mail, Inbox) | Phase 4A, Notification-Preferences | Inbox, Drawer |
| **Log-Anzeige** | Technische Logs für User (Debug, Fehler) | SystemMonitorView, ggf. Loki | SystemMonitorView Tab |

**Vermischung prüfen:** Werden systeminterne Alerts (Stale-Sensor, MQTT-Disconnect, Server-Fehler) mit Panel-konfigurierbaren Alerts vermischt? → Thema 1 (Alert-Vollanalyse).

---

## Reihenfolge (verbindlich)

Die Reihenfolge ist festgelegt, damit zusammenhängend gearbeitet werden kann:

```
1. Sensor-/Aktortypen-Recherche + Forschung  (Grundlage)
        ↓
2. Darstellung & Funktionalität optimieren   (auf Basis der Recherche)
        ↓
3. Kalibrierung pro Sensortyp               (einzeln, aber einheitlich)
```

**Warum diese Reihenfolge?** Ohne Kenntnis der Sensortypen und ihrer Anforderungen kann Darstellung/Funktionalität nicht sinnvoll optimiert werden. Ohne optimierte Darstellung ist Kalibrierung-UI nicht nutzerfreundlich.

---

## Thema 1: Alert-Konfigurationen — Vollanalyse

### Ziel

Das Alert-System analysieren — **getrennt** von Notifications und Log-Anzeige:

- **Vermischung prüfen:** System-Alerts vs. Panel-konfigurierbare Alerts
- **Datenfluss:** AlertConfigSection (SensorConfigPanel/ActuatorConfigPanel) → API → Backend
- **Darstellung & Verwaltung:** Wo werden Alerts dem User angezeigt? Kategorisierung (sensor, actuator, system, infrastructure)?
- **Backend:** Endpoints, Services, Grafana vs. eigener Stack

### Kontext

- **Frontend:** AlertConfigSection ist **Teil von** SensorConfigPanel/ActuatorConfigPanel (HardwareView L2)
- **Trennung:** Alerts ≠ Notifications ≠ Log-Anzeige — jeweils separate Analyse

### Erwartetes Ergebnis

- Strukturierter Bericht: Inventar, Datenfluss, Empfehlung Trennung, priorisierte Verbesserungen

---

## Thema 2: Sensor-/Aktortypen — Recherche + Forschung (VOR Kalibrierung)

### Ziel

**Vor** der Kalibrierungs-Optimierung muss die Recherche zu Sensoren und Aktoren abgeschlossen sein:

- **Recherche:** Anzeige und Verarbeitung verschiedener Typen (SENSOR_TYPE_CONFIG, actuator_type)
- **Forschung:** Typ-spezifische Defaults, Multi-Value-Sensoren (SHT31 Temp+Humidity)
- **IST-Analyse:** sensorDefaults.ts, AddSensorModal Typ-Auswahl, Config-Panel typ-spezifische Felder

### Erwartetes Ergebnis

- Grundlage für **Darstellungs- und Funktionalitäts-Optimierung** (Auftrag 2b)
- Einheitliche UI/UX über alle Sensortypen, Backend zukunftsfähig und wartbar

---

## Thema 3: Darstellung & Funktionalität optimieren

### Ziel

Auf Basis der Sensor-/Aktortypen-Recherche:

- Darstellung der verschiedenen Sensortypen im SensorConfigPanel optimieren
- Funktionalität für typ-spezifische Felder vereinheitlichen
- **Fokus:** HardwareView L2 → SensorConfigPanel, ActuatorConfigPanel

### Zusammenhang

- Einheitliches UI/UX über alle Sensortypen
- Backend wartbar, User-freundlich

---

## Thema 4: Kalibrierung — pro Sensortyp einzeln

### Ziel

Kalibrierung **jedes** Sensortyps **einzeln** durchgehen — aber mit **einheitlichem** Muster:

- **Basis:** Echte Messungen, die Gerät und System tatsächlich unterstützen
- **User-Experience:** Nutzer kann Kalibrierung gut umsetzen, **Wiederholungen mitten im Flow** wenn es nicht klappt
- **Pro Sensortyp:** pH, EC, Bodenfeuchte, Temperatur-Offset, … — jeweils eigener Auftrag

### Reihenfolge

| # | Sensortyp | Recherche | Kalibrierungs-Auftrag |
|---|-----------|-----------|------------------------|
| 1 | pH | 2-Punkt-Kalibrierung (bereits) | Verfeinerung, Retry-Flow |
| 2 | EC | Analog pH | Verfeinerung, Retry-Flow |
| 3 | Bodenfeuchte | Kapazitiv, ADC | … |
| 4 | Temperatur | Offset-Kalibrierung | … |
| … | … | … | … |

### Zusammenhang wahren

- **UI/UX:** Einheitliches Kalibrierungs-Pattern über alle Sensortypen (CalibrationWizard, Retry, Abbruch)
- **Backend:** calibration_data Schema konsistent, zukunftsfähig, wartbar
- **User-freundlich:** Klare Anleitung, Wiederholung möglich, kein „alles oder nichts“

### Kontext

- **Ort:** SensorConfigPanel (HardwareView L2) → Kalibrierungs-Sektion, CalibrationWizard
- **Bestehend:** CalibrationWizard für pH, EC

---

## Arbeitsprinzipien

| Prinzip | Bedeutung |
|---------|-----------|
| **Fokussiert arbeiten** | Nicht zwischen Views springen. Ein Auftrag = ein Fokus (z.B. nur SensorConfigPanel). |
| **Zusammenhang wahren** | Einzelne Sensortypen, aber einheitliches UI/UX und Backend-Schema. |
| **Aufträge präzise** | Jeder Auftrag mit klarem Scope, keine Vermischung. |
| **Robin-geleitet** | Reihenfolge und Priorisierung durch Robin. |

---

## Reihenfolge (Übersicht)

| Phase | Thema | Typ | Ergebnis |
|-------|-------|-----|----------|
| **A** | Alert-Konfigurationen Vollanalyse | Analyse | Bericht: Vermischung, Datenfluss, Empfehlungen |
| **B** | Sensor-/Aktortypen Recherche + Forschung | Recherche + Forschung | Grundlage für Darstellungs-Optimierung |
| **C** | Darstellung & Funktionalität optimieren | Implementierung | Einheitliches UI/UX, Backend wartbar |
| **D** | Kalibrierung pro Sensortyp (einzeln) | Implementierung | pH → EC → Bodenfeuchte → … je eigener Auftrag |

**Hinweis:** A kann parallel zu B oder danach. C und D sind sequenziell (C vor D).

---

## Nächste Schritte

1. **Robin bestätigt Start:** Phase A (Alert) oder Phase B (Sensortypen-Recherche)?
2. **Auftrag formulieren:** Analyseauftrag oder Recherche-Auftrag mit klarem Scope
3. **Skills nutzen:** `/recherche` für Praxis, `/forschung` für Papers

**Phase A — Analyseauftrag erstellt:** `auftrag-alert-konfiguration-vollanalyse-phase-a.md` — Vollständiges Inventar Konfiguration + Anzeige, Dopplungs-Matrix, Vermischungs-Prüfung, Datenfluss. ~6–10h.

---

## Referenzen

- `roadmap-sensor-config-wissensdatenbank-verifikation-2026-03-05.md` — SensorConfigPanel nur in HardwareView L2
- `auftrag-sensorconfigpanel-feature-komplettanalyse-dopplungen.md` — AlertConfigSection, CalibrationWizard
- `hardware-tests/auftrag-phase4a-notification-stack.md` — Phase 4A, Notification
- `auftrag-bodenfeuchtesensor-implementierung.md` — Bodenfeuchte, CalibrationWizard Preset
- `auftrag-sht31-frontend-handling-analyse.md` — Multi-Value, CalibrationWizard
