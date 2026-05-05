# AutomationOne Frontend Screenshots

**Datum:** 2026-05-05  
**Frontend-Version:** El Frontend v1.0.0  
**Stack:** Vue 3 + TypeScript + Tailwind CSS  
**Backend:** God-Kaiser Server (FastAPI)  
**Git-Commit:** `23803d2e` — refactor(frontend): InlineDashboardPanel — drop legacy inline mode, 4→3 modes  
**Gesamt:** 34 PNG-Dateien in 9 Hauptordnern

---

## Ordnerübersicht

| Ordner | Screenshots | Beschreibung |
|--------|-------------|--------------|
| `01-hardware-view/level-1-uebersicht/` | 5 | Hardware-Übersicht mit allen Räumen (Gewaechshaus, Zelt Wohnzimmer, E2e-Zone); hover-States für NOT-AUS und Alerts-Badge |
| `01-hardware-view/level-2-detail/` | 3 | ESP_6B27C8 Detail-Ansicht (Sensor-Liste, Aktor-Liste, Regeln-Panel); Sensor-Settings-Panel offen (Bodenfeuchte); Aktor-Settings-Panel offen (Pumpe/digital) |
| `02-monitor/level-1-uebersicht/` | 2 | Monitor-Tab mit Zone-Kacheln (Gewaechshaus + Zelt Wohnzimmer), Cross-Zone-Vergleich rechts |
| `02-monitor/level-2-detail/` | 2 | Zelt-Wohnzimmer-Zone-Detail mit Sensor-Cards und Aktoren; Luftfeuchte-Zeitreihen-Chart ausgeklappt |
| `03-editor/` | 3 | Dashboard Builder mit Widget-Katalog (Sensoren: Linien-Chart, Gauge, Sensor-Karte etc.; Aktoren; System); Linien-Chart-Widget im Vorschau-Canvas mit Sensor-Auswahl-Dropdown |
| `04-regeln-editor/` | 3 | Regeln-Liste (6 Regeln: Bewaesserung 5, Beleuchtung Zelt, Bewaesserung 3/4/6, Bewaesserung 2) + Vorlagen; visueller Flow-Editor für "Beleuchtung Zelt" (ZEITFENSTER→AND→AKTOR); Zeitfenster-Panel und Aktor-Aktions-Panel ausgeklappt |
| `05-alert-panel/` | 2 | Benachrichtigungs-Panel offen (11 aktive Alerts, Filter: Alle/Kritisch/Warnungen/Infos); Alert-Detail mit Quelle, Kategorie, Schweregrad, Korrelations-ID und Aktions-Buttons |
| `06-quick-action-ball/` | 2 | Quick-Action-Menü offen: 8 Optionen (Ausführungslog, Alert-Panel, Navigation, Emergency Stop, Quick-Search, Diagnose starten, Letzter Report, Backup erstellen) |
| `07-einstellungen/sensoren/` | 2 | Sensor-Settings-Panel (moisture/Bodenfeuchte): Grundeinstellungen, Betriebsmodus, Stale-Timeout, Mess-Alter; Schwellwerte-Sektion aufgeklappt (Alarm/Warn-Slider) |
| `07-einstellungen/aktoren/` | 1 | Aktor-Settings-Panel (Pumpe/digital): Steuerung mit EIN/AUS, Grundeinstellungen, Typ-Einstellungen, Safety-Status, Alert-Konfiguration, Laufzeit & Wartung |
| `07-einstellungen/rules/` | 2 | Rule Condition Settings (Zeitfenster-Block: Von/Bis-Stunde, Wochentage); Rule Action Settings (Aktor-Aktion: ESP-Gerät, Aktor, Befehl, max. Laufzeit) |
| `07-einstellungen/system/` | 2 | System Monitor Live-Events-Tab (104 Ereignisse, Quellen-Filter, Aktor-/Sensordaten-Logs); Health-Tab (1/4 Geräte online, 3 Problem-Geräte, ESP-Tabelle) |
| `07-einstellungen/benutzer/` | 1 | Benutzerverwaltung: 2 Benutzer (Test123, admin) mit Email, Rolle, Status, Erstelldatum |
| `07-einstellungen/kalibrierung/` | 1 | Sensor-Kalibrierung: 2-Punkt-Kalibrierung mit Status-Badges (Device Offline, Contract Idle, Qualitaet Suspect), Sensor-Auswahl (pH, EC, Feuchtigkeits x2, Temperatur), Schritt-Indikatoren |
| `07-einstellungen/plugins/` | 1 | AutoOps Plugins: 4/4 aktiv — Debug & Auto-Fix, ESP Configurator, System Health Check, System Cleanup |
| `07-einstellungen/postfach/` | 1 | E-Mail-Postfach mit Status-/Datums-/Template-Filter; leer (keine E-Mails gefunden) |
| `07-einstellungen/allgemein/` | 1 | Einstellungen: User Account (admin, Admin-Rolle), Server Connection (localhost:5173), About-Sektion |

---

## Hinweise

- **NOT-AUS hover** (01/04): Kein separater Tooltip sichtbar — Button zeigt nur Hover-State
- **Alerts hover** (01/05): Beim Hover auf den Alerts-Badge wurde eine Live-Status-Änderung auf ESP_6B27C8 sichtbar ("Keine Live-Daten")
- **Monitor Level 2**: Kein separater "Zeitraum 7d" Screenshot — Zeitreihe war live-only, kein Zeitraum-Picker sichtbar
- **Editor**: Kein bestehender Dashboard-Inhalt vorhanden — Linien-Chart als Demo-Widget manuell hinzugefügt; kein Code-View vorhanden
- **Quick Action Ball**: 8 Optionen vollständig dokumentiert, kein Untermenü vorhanden
- **Postfach**: Leer, keine E-Mail-Inhalte vorhanden
- **System-Monitor**: Monitoring-Stack (Grafana/Prometheus/Loki) offline — Health-Tab zeigt entsprechende Warnung
