# Vorarbeit: Rollen-Trennung der Views

**Datum:** 2026-03-03
**Zweck:** Exakte IST-Analyse + SOLL-Definition als Grundstein fuer den Implementierungsplan
**Abhaengigkeit:** Muss VOR dem eigentlichen Auftrag (auftrag-komponenten-tab-wissensinfrastruktur.md) abgeschlossen sein

---

## 1. IST-Zustand — Drei Hauptbloecke

### ViewTabBar (Dreierblock)

```
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Uebersicht│ │  Monitor │ │  Editor  │
│ /hardware│ │ /monitor │ │ /editor  │
└──────────┘ └──────────┘ └──────────┘
     ↑             ↑             ↑
 HardwareView  MonitorView  CustomDashboardView
```

### Isoliert (Sidebar-Link "Komponenten")

```
┌───────────────┐
│  Komponenten  │
│   /sensors    │
└───────────────┘
        ↑
   SensorsView
```

---

## 2. Feature-Matrix (IST)

| Feature | HardwareView (`/hardware`) | MonitorView (`/monitor`) | SensorsView (`/sensors`) | CustomDashboardView (`/editor`) |
|---------|---------------------------|--------------------------|--------------------------|--------------------------------|
| **ViewTabBar** | JA | JA | NEIN (isoliert) | JA |
| **Zone-Akkordeon** | JA (Level 1, ESP-zentrisch) | JA (Level 1, Zone-Tiles) | JA (Zone→Subzone) | NEIN |
| **Subzone-Gruppierung** | NEIN | JA (L2, read-only) | JA (CRUD: create/rename/delete) | NEIN |
| **ESP-Zuordnung per Drag&Drop** | JA (Zone-Zuweisung) | NEIN | NEIN | NEIN |
| **ESP-Detail (Orbital)** | JA (Level 2) | NEIN | NEIN | NEIN |
| **SensorConfigPanel** | JA (SlideOver, L2 Klick) | NEIN (read-only) | JA (SlideOver, Karten-Klick) | NEIN |
| **ActuatorConfigPanel** | JA (SlideOver, L2 Klick) | NEIN | JA (SlideOver, Karten-Klick) | NEIN |
| **ESPConfigPanel** | JA (SlideOver) | NEIN | NEIN | NEIN |
| **DeviceMetadataSection** | JA (im SensorConfigPanel) | NEIN | JA (im SensorConfigPanel) | NEIN |
| **SensorCard** | NEIN (DeviceMiniCard) | JA (L2 Subzone-Cards) | JA (Zone-Cards) | NEIN |
| **ActuatorCard** | NEIN (DeviceMiniCard) | JA (L2 Tab) | JA (Tab) | NEIN |
| **Live-Daten** | JA (Sparkline in MiniCard) | JA (L2 Cards + L3 Chart) | JA (raw_value in Cards) | JA (Widgets) |
| **Historien-Chart** | NEIN | JA (L2 expand + L3 SlideOver) | NEIN | JA (Chart-Widgets) |
| **Multi-Sensor Overlay** | NEIN | JA (L3, bis 4 Sensoren) | NEIN | NEIN |
| **Sensor-Filter** | NEIN (ESP-Filter) | NEIN | JA (Type, Quality, ESP) | NEIN |
| **Actuator-Toggle** | JA (ESPOrbitalLayout) | NEIN | JA (ActuatorCard) | NEIN |
| **Emergency Stop** | NEIN | NEIN | JA (Actuator-Tab) | NEIN |
| **Zone Create/Delete** | JA (inline form) | NEIN | NEIN | NEIN |
| **ComponentSidebar (Drag)** | JA (Sensor-/Aktor-Typen) | NEIN | NEIN | JA (Widget-Katalog) |
| **PendingDevices** | JA (Panel) | NEIN | NEIN | NEIN |
| **AddSensorModal** | JA (via Orbital) | NEIN | NEIN | NEIN |
| **AddActuatorModal** | JA (via Orbital) | NEIN | NEIN | NEIN |
| **Logic Rules Ribbon** | JA (Regel-Status) | NEIN | NEIN | NEIN |
| **InlineDashboardPanel** | JA (L1 Zone) | JA (L1 Zone) | NEIN | NEIN |
| **Config-Link zum Bearbeiten** | — (hat Config selbst) | `/sensors?sensor=...` | — (ist das Ziel) | NEIN |
| **useZoneGrouping** | NEIN | JA | JA | NEIN |
| **groupDevicesByZone** | JA | NEIN | NEIN | NEIN |

---

## 3. Duplizierung: Was genau ist doppelt?

### Zwischen HardwareView L2 und SensorsView

| Funktion | HardwareView L2 | SensorsView |
|----------|-----------------|-------------|
| Sensor-Config oeffnen | Klick auf Sensor → SlideOver | Klick auf SensorCard → SlideOver |
| SensorConfigPanel | Identisch (gleiche Komponente) | Identisch (gleiche Komponente) |
| ActuatorConfigPanel | Identisch (gleiche Komponente) | Identisch (gleiche Komponente) |
| DeviceMetadataSection | Enthalten (via SensorConfigPanel) | Enthalten (via SensorConfigPanel) |
| Subzone-Dropdown | Im SensorConfigPanel vorhanden | Im SensorConfigPanel vorhanden |

**Kern-Duplizierung:** Das SensorConfigPanel (mit Subzone + Metadata) ist sowohl in HardwareView als auch SensorsView erreichbar. Beide Views oeffnen denselben SlideOver.

### Zwischen SensorsView und MonitorView

| Funktion | SensorsView | MonitorView |
|----------|-------------|-------------|
| Zone→Subzone Akkordeon | JA (CRUD) | JA (read-only) |
| SensorCard Darstellung | JA (mit Config-Klick) | JA (mit Detail-Klick) |
| ActuatorCard Darstellung | JA (mit Toggle + Config) | JA (read-only) |
| useZoneGrouping | JA | JA |

**Kern-Duplizierung:** Beide zeigen Zone→Subzone-gruppierte Sensor-/Aktor-Karten, aber mit unterschiedlichem Zweck (Config vs. Monitor).

---

## 4. SOLL-Zustand — Robins Vision

### Kern-Aussage

> "SensorsView soll Hardwareinformationen und Plugin-Informationen verwalten.
> HardwareView (Dashboard) soll die Funktion der Sensoren und Aktoren uebernehmen."

### Uebersetzung in View-Rollen

```
┌─────────────────────────────────────────────────────────────┐
│ ViewTabBar (Dreierblock) — BETRIEB                          │
│                                                             │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│ │ Uebersicht│  │  Monitor │  │  Editor  │                   │
│ │ /hardware│  │ /monitor │  │ /editor  │                   │
│ └──────────┘  └──────────┘  └──────────┘                   │
│                                                             │
│ ROLLE: Sensor-/Aktor-BETRIEB (Konfiguration, Live-Daten,   │
│        Zuordnung, Regeln, Dashboards)                       │
│                                                             │
│ - Sensor auf ESP konfigurieren (Name, Schwellwerte, etc.)  │
│ - Subzone-Zuordnung (wo gehoert der Sensor hin?)           │
│ - Live-Monitoring, Charts, Alerts                           │
│ - Custom Dashboard Widgets                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ SensorsView → Komponenten-Tab (Sidebar) — INVENTAR          │
│                                                             │
│ ┌───────────────┐                                           │
│ │  Komponenten  │                                           │
│ │   /sensors    │  (oder /components, Umbenennung moeglich) │
│ └───────────────┘                                           │
│                                                             │
│ ROLLE: Hardware-INVENTAR + Wissens-Infrastruktur            │
│                                                             │
│ - Hersteller, Modell, Seriennummer, Datenblatt              │
│ - Installationsdatum, Standort                              │
│ - Wartungsintervall, naechste Wartung                        │
│ - Notizen, Custom Fields                                    │
│ - KEINE Live-Daten, KEINE Schwellwerte, KEINE Charts       │
│ - Zukuenftig: Plugin-Infos, KI-Kontext, Warenwirtschaft    │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Gap-Analyse: Was muss sich aendern?

### 5.1 HardwareView (Uebersicht) — Subzones rein, Hardware-Info raus

> **Robins Vorgabe:** Dashboard darf NICHT gross umstrukturiert werden. Subzone-Einstellungen
> muessen rein. Hardware-Informationen (Hersteller, Modell, Seriennummer) muessen RAUS.
> Links zu /sensors muessen weg.

| Was | IST | SOLL | Aktion |
|-----|-----|------|--------|
| **Subzone-CRUD** | NICHT vorhanden (nur in SensorsView Z. 98-186) | Subzone create/rename/delete in ZonePlate-Header oder L2 | Subzone-CRUD aus SensorsView hierher verschieben. Ort: ZonePlate-Header (L1) als Akkordeon-Subgroup oder im ESPOrbitalLayout (L2) |
| Subzone-Filter L1 | ZonePlate filtert nach subzone_id (Z. 63-73) | Beibehalten + Subzone-Name anzeigen | ZonePlate hat bereits Filter — nur Label verbessern |
| **Hardware-Info entfernen** | SensorConfigPanel zeigt DeviceMetadataSection (Hersteller, Modell, Seriennummer etc.) | NUR Betriebs-Config (Name, Schwellwerte, Subzone, GPIO) | DeviceMetadataSection per Prop `showMetadata=false` ausblenden |
| **ESPSettingsSheet bereinigen** | Zeigt WiFi RSSI, Heap, Uptime, Hardware-Type (Z. 515-597) | Runtime-Status (WiFi, Uptime) BLEIBT. Hardware-Details (Typ, Modell) NUR als Kurzinfo | Minimale Aenderung — Runtime-Infos sind Betriebsdaten, keine Hardware-Inventar-Daten |
| Sensor-Filter | Nur ESP-Filter (Mock/Real/Status) | Beibehalten wie IST | Dashboard-Filter sind fuer ESP-Verwaltung, nicht fuer Sensor-Typ-Filterung |
| Emergency Stop | NICHT vorhanden | Sollte im Aktor-Bereich sein | EmergencyStopButton einbauen (existiert bereits) — OPTIONAL, nicht kritisch |

### 5.2 MonitorView — Subzones verwalten, Links zu /sensors entfernen

> **Robins Vorgabe:** Subzone-Einstellungen muessen auch im Monitor an den richtigen Stellen sein.
> Verlinkungen auf /sensors muessen weg.

| Was | IST | SOLL | Aktion |
|-----|-----|------|--------|
| **Config-Link zu /sensors** | Z. 1609: `router.push({ name: 'sensors', query: { sensor: ... } })` | ENTFERNEN (Monitor ist read-only fuer Sensordaten) | Button "Konfiguration" in Sensor-Card-Expand ENTFERNEN |
| **Subzone-CRUD** | Read-only Akkordeon (Z. 1523-1660) | Subzone rename/delete in L2 Subzone-Header | Action-Buttons (Stift=Rename, Muelleimer=Delete) an Subzone-Header (Z. 1535). Pattern: Gleich wie in SensorsView Z. 748-753 |
| **Subzone Create** | NICHT vorhanden | "+ Subzone" Button im L2 Zone-Detail | Button unter letztem Subzone-Akkordeon (Z. ca. 1621). Pattern: Gleich wie SensorsView Z. 664-688 |
| Subzone-Akkordeon | Funktioniert (Z. 1523-1660) | Beibehalten, um CRUD-Buttons erweitern | Bestehende Struktur bleibt |
| Kommentar L14 | "Config is in SensorsView" | Entfernen (veraltet) | Kommentar loeschen |

### 5.3 SensorsView (Komponenten) — Hardware-Inventar werden

> **Robins Vorgabe:** Hardware-Informationen muessen IN den jetzigen SensorsView.
> Das ist die neue Heimat fuer Hersteller, Modell, Seriennummer, Wartung, Datenblatt etc.

| Was | IST | SOLL | Aktion |
|-----|-----|------|--------|
| Zone→Subzone Akkordeon mit Cards | SensorCard/ActuatorCard mit Live-Daten | Flache Hardware-Inventar-Tabelle (alle Geraete) | KOMPLETT ENTFERNEN, eigene InventoryTable bauen |
| Sensor/Actuator Tabs | Tab-Navigation sensors/actuators | Flache Liste ALLER Geraete (Sensoren + Aktoren + ESPs) | Umbau auf Inventar-Fokus |
| **Hardware-Info anzeigen** | NICHT vorhanden (nur in Dashboard-SlideOvers) | ZENTRALE Stelle fuer Hersteller, Modell, Seriennummer, Datenblatt, Wartung | DeviceDetailPanel mit DeviceMetadataSection als Hauptinhalt |
| SensorConfigPanel | Volle Config (Schwellwerte, GPIO, etc.) | ENTFERNEN — Config bleibt im Dashboard | NUR DeviceMetadataSection-Inhalt zeigen, keine Betriebsconfig |
| Live-Daten (raw_value) | Angezeigt in Cards | NUR als Kurzstatus in Tabelle (Online/Offline + letzter Wert) | Minimale Status-Anzeige, keine Charts |
| Subzone CRUD | create/rename/delete (Z. 98-186) | ENTFERNEN — lebt kuenftig in Uebersicht + Monitor | Code nach HardwareView/MonitorView verschieben |
| Filter | Type, Quality, ESP | NEU: Filter nach Zone, Typ, Status, Hersteller, Wartungsstatus | Neue Filter-Logik fuer Inventar |
| Emergency Stop | Actuator-Tab | ENTFERNEN — nicht relevant fuer Inventar | Lebt im Dashboard |
| Actuator Toggle | ActuatorCard | ENTFERNEN — nicht relevant fuer Inventar | Lebt im Dashboard |

---

## 6. Implementierungs-Reihenfolge (Vorschlag)

### Phase 0: Vorarbeit (dieser Plan)
- [x] IST-Analyse aller Views
- [x] Duplizierungen identifiziert
- [x] SOLL-Rollenverteilung definiert
- [ ] Robin bestaetigt SOLL-Zustand

### Phase 1: Dashboard + Monitor bereinigen (Subzones rein, Hardware-Info raus, Links weg)

**Ziel:** Dashboard behaelt seine Struktur, bekommt Subzone-CRUD. Hardware-Info wird ausgeblendet.
MonitorView bekommt Subzone-CRUD, verliert /sensors-Links.

| Schritt | Datei(en) | Was |
|---------|-----------|-----|
| 1.1 | `SensorConfigPanel.vue` | Prop `showMetadata?: boolean` (default: true). Wenn `false`: DeviceMetadataSection wird ausgeblendet |
| 1.2 | `HardwareView.vue` | `showMetadata=false` an SensorConfigPanel + ActuatorConfigPanel uebergeben |
| 1.3 | `MonitorView.vue` Z. 1609 | Config-Link zu `/sensors` ENTFERNEN (Button "Konfiguration" in Sensor-Card-Expand) |
| 1.4 | `MonitorView.vue` Z. 14 | Kommentar "Config is in SensorsView" ENTFERNEN |
| 1.5 | `MonitorView.vue` Z. 1535 | Subzone-Header um Rename/Delete Action-Buttons erweitern |
| 1.6 | `MonitorView.vue` Z. ca. 1621 | "+ Subzone" Button unter letztem Subzone-Akkordeon einbauen |
| 1.7 | `HardwareView.vue` / `ZonePlate.vue` | Subzone-CRUD in ZonePlate-Header oder als eigene Section in L1 einbauen |
| 1.8 | Subzone-CRUD Composable | Subzone create/rename/delete Logik aus SensorsView (Z. 98-186) in eigenes Composable `useSubzoneCRUD.ts` extrahieren, damit es in 3 Views wiederverwendbar ist |

**Aufwand:** ~6-8h
**Risiko:** Gering-Mittel — Dashboard-Struktur bleibt erhalten, nur CRUD + Prop-Aenderungen
**Warum ZUERST:** Subzone-CRUD muss verfuegbar sein BEVOR es aus SensorsView entfernt wird

### Phase 2: SensorsView zum Hardware-Inventar umbauen

**Ziel:** SensorsView wird zum Hardware-Inventar. Hardware-Info (Hersteller, Modell, Wartung etc.) lebt NUR HIER.

| Schritt | Datei(en) | Was |
|---------|-----------|-----|
| 2.1 | `SensorsView.vue` | Zone-Akkordeon + SensorCard/ActuatorCard-Rendering ENTFERNEN |
| 2.2 | `SensorsView.vue` | Subzone CRUD ENTFERNEN (lebt jetzt in Uebersicht + Monitor via Composable) |
| 2.3 | `SensorsView.vue` | EmergencyStopButton + Actuator-Toggle ENTFERNEN |
| 2.4 | `SensorsView.vue` | Live-Daten-Anzeige REDUZIEREN auf Status-Dot (Online/Offline) + letzter Wert als Kurzinfo |
| 2.5 | `SensorsView.vue` | Ersetzen durch: Flache Inventar-Tabelle (InventoryTable.vue) mit Suche, Filter, Sortierung |
| 2.6 | `SensorsView.vue` | Detail-SlideOver: DeviceDetailPanel mit DeviceMetadataSection als HAUPTINHALT |
| 2.7 | `Sidebar.vue` | OPTIONAL: Label "Komponenten" → "Inventar" oder "Hardware-Inventar" |

**Aufwand:** ~8-12h (groesster Block)
**Risiko:** Mittel — viel Code wird entfernt/ersetzt
**Abhaengigkeit:** Phase 1 MUSS fertig sein (Subzone-CRUD muss woanders erreichbar sein, bevor SensorsView es verliert)

---

## 7. Kritische Entscheidungen (VOR Implementierung)

| # | Frage | Entscheidung | Begruendung |
|---|-------|-------------|-------------|
| E1 | Wo lebt Subzone-CRUD nach Umbau? | **BEIDES: Uebersicht (HardwareView) + Monitor** | Robin: "Subzone-Einstellungen in Uebersicht und in Monitor an den richtigen Stellen." Composable `useSubzoneCRUD.ts` macht Code wiederverwendbar |
| E2 | Wird `/sensors` Route umbenannt? | **Bleibt `/sensors`**, Sidebar-Label kann angepasst werden | Kein Breaking Change noetig |
| E3 | MonitorView Config-Link Ziel? | **ENTFERNEN** | Robin: "Verlinkungen auf sensors weg." Monitor ist read-only + Subzone-CRUD |
| E4 | SensorsView Inventar-Format? | **Eigene InventoryTable** (NICHT DataTable.vue) | DataTable.vue ist DB-spezifisch (max 8 Spalten, UUID-Logik). Eigene Komponente noetig |
| E5 | HardwareView Subzone-CRUD wo genau? | **ZonePlate-Header** (L1) — Subzones als expandierbare Sub-Sektion pro Zone | Pattern: Wie SensorsView Zone-Akkordeon, aber IN der ZonePlate |
| E6 | MonitorView Subzone-CRUD wo genau? | **L2 Subzone-Header** — Action-Buttons (Rename/Delete) + "Subzone hinzufuegen" Button am Ende | Pattern: Gleich wie aktuell in SensorsView Z. 748-753 |

---

## 8. Dateien-Uebersicht (betroffen)

| Datei | Phase | Aenderung |
|-------|-------|-----------|
| `El Frontend/src/composables/useSubzoneCRUD.ts` | 1 | **NEU** — Subzone create/rename/delete Logik extrahiert aus SensorsView |
| `El Frontend/src/components/esp/SensorConfigPanel.vue` | 1 | Prop `showMetadata` hinzufuegen |
| `El Frontend/src/components/esp/ActuatorConfigPanel.vue` | 1 | Prop `showMetadata` hinzufuegen |
| `El Frontend/src/views/HardwareView.vue` | 1 | `showMetadata=false` an Config-Panels + Subzone-CRUD einbinden |
| `El Frontend/src/components/hardware/ZonePlate.vue` | 1 | Subzone-CRUD-Buttons in Zone-Header integrieren |
| `El Frontend/src/views/MonitorView.vue` | 1 | /sensors-Link Z.1609 ENTFERNEN, Kommentar Z.14 ENTFERNEN, Subzone-CRUD-Buttons in L2 Header |
| `El Frontend/src/views/SensorsView.vue` | 2 | KOMPLETT umbauen zum Hardware-Inventar |
| `El Frontend/src/components/inventory/InventoryTable.vue` | 2 | **NEU** — Flache Geraete-Tabelle |
| `El Frontend/src/components/inventory/DeviceDetailPanel.vue` | 2 | **NEU** — Hardware-Detail SlideOver |
| `El Frontend/src/shared/stores/inventory.store.ts` | 2 | **NEU** — Filter/Pagination State |
| `El Frontend/src/shared/design/layout/Sidebar.vue` | 2 | OPTIONAL: Label aendern |
| `El Frontend/src/composables/useZoneGrouping.ts` | - | KEINE Aenderung (wird weiter von MonitorView genutzt) |
| `El Frontend/src/components/devices/DeviceMetadataSection.vue` | - | KEINE Aenderung (wird weiter genutzt — jetzt ZENTRAL in SensorsView) |
| `El Frontend/src/types/device-metadata.ts` | - | KEINE Aenderung |
| `El Frontend/src/api/subzones.ts` | - | KEINE Aenderung (wird von neuem Composable genutzt) |

---

## 9. Zusammenfassung

**Aktuelles Problem:** SensorsView mischt Betriebs-Config UND verwaltet Subzones UND zeigt Live-Daten. HardwareView hat bereits 90% der Betriebs-Config aber KEINE Subzone-Verwaltung. Hardware-Infos (Hersteller, Modell etc.) sind im Dashboard versteckt statt im Inventar-Tab. Links zu /sensors im Monitor sind verwirrend.

**Loesung (Robins Vorgaben):**
- **Dashboard (Uebersicht)** = BLEIBT wie es ist + bekommt Subzone-CRUD + Hardware-Info ausblenden
- **Monitor** = BLEIBT wie es ist + bekommt Subzone-CRUD + /sensors-Links weg
- **Komponenten-Tab (/sensors)** = WIRD ZUM INVENTAR (Hardware-Info, Wartung, Hersteller, kuenftig KI-Kontext)

**Entscheidungen (E1-E6) sind geklaert.** Implementierung kann starten mit Phase 1 (Dashboard+Monitor bereinigen) → Phase 2 (SensorsView umbauen).
