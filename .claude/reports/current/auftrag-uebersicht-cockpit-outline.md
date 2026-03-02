# Auftrag: Uebersicht-Tab → System-Cockpit (OUTLINE)

**Ziel-Repo:** auto-one
**Kontext:** Der Uebersicht-Tab (/hardware) muss sinnvoll vom Monitor-Tab abgegrenzt werden. Keine Dopplungen. QuickActionsBall regelt Alerts. Uebersicht = Infrastruktur-Cockpit + Schnellnavigation + System-KPIs.
**Prioritaet:** Mittel (nach Komponenten-Tab und Phase 4A)
**Datum:** 2026-03-02
**Status:** OUTLINE — Muss noch mit Recherche und detaillierter Spezifikation ausgebaut werden
**Aufwand:** ~15-25h (Schaetzung, wird nach Ausarbeitung praezisiert)

---

## KERNPROBLEM: Abgrenzung Uebersicht vs. Monitor

### Was Robin NICHT will

> "Mir geht es ganz wichtig darum dass jetzt auf der Uebersichtsseite nichts sinnlos gedoppelt wird. Wir haben ja den Monitoring-Tab daneben."

### Klare Zustaendigkeiten (3 Tabs + QAB)

| Funktion | Zustaendig | NICHT zustaendig |
|----------|------------|------------------|
| **Live-Sensordaten pro Zone** | Monitor L1+L2 | ~~Uebersicht~~ |
| **Einzelsensor-History + Charts** | Monitor L3 | ~~Uebersicht~~ |
| **Alert-Verwaltung (Ack/Mute/Navigate)** | QAB + Notification Drawer | ~~Uebersicht~~ |
| **Hardware-Inventar + Metadaten** | Komponenten-Tab | ~~Uebersicht~~ |
| **System-weite Infrastruktur-Gesundheit** | **Uebersicht** | Monitor |
| **"Was braucht Aufmerksamkeit?"** | **Uebersicht** | Monitor (zeigt Daten, nicht Handlungsbedarf) |
| **Schnell-Navigation zu Problemen** | **Uebersicht** | Monitor (ist das Ziel der Navigation) |
| **Aggregate KPIs ueber alle Zonen** | **Uebersicht** | Monitor (zeigt pro Zone) |
| **ESP/Controller-Status** | **Uebersicht** | Monitor (zeigt Sensor-Daten, nicht Controller-Status) |
| **Wartungs-Dashboard** | **Uebersicht** | Komponenten (hat die Details) |

### Metapher

- **Uebersicht** = Flughafen-Tower ("Alles normal? Wo muss ich hinschauen?")
- **Monitor** = Cockpit eines einzelnen Flugzeugs ("Was genau passiert in dieser Zone?")
- **Komponenten** = Werkstatt-Inventar ("Was fuer Hardware habe ich, wie ist sie konfiguriert?")
- **QAB** = Funkgeraet ("Achtung, Problem! Hier, reagiere.")

---

## Was auf die Uebersicht MUSS (Sektionen-Entwurf)

### Sektion 1: System-Health-Banner (ganz oben)

**Zweck:** In 2 Sekunden wissen: "Laeuft alles?" — Ja/Nein.

**Inhalt:**
- Gesamtstatus-Ampel: Gruen/Gelb/Rot basierend auf schlimmster aktiver Bedingung
- Kurztext: "Alles normal" / "2 Warnings aktiv" / "1 Critical Alert"
- Bei Problemen: 1-Zeile-Zusammenfassung + Deep-Link zur Quelle

**Datenquelle:** `useSystemHealthStore` (geplant in Unified Monitoring UX, absorbiert in Phase 4A/4B). Aggregiert:
- ESP-Online-Rate (X von Y online)
- Aktive Alerts (Severity-gewichtet)
- Stale-Data-Rate (Sensoren ohne frische Daten)

**NICHT hier:** Alert-Liste → das ist QAB/Notification Drawer

### Sektion 2: Infrastruktur-KPIs (kompakte Karten-Reihe)

**Zweck:** Die 4-6 wichtigsten System-Zahlen auf einen Blick.

**KPI-Karten (Entwurf):**

| KPI | Wert | Trend | Beschreibung |
|-----|------|-------|-------------|
| ESPs Online | 8/10 | Sparkline 24h | Controller-Verfuegbarkeit |
| Sensoren aktiv | 42/45 | Sparkline 24h | Sensor-Verfuegbarkeit |
| Aktoren aktiv | 12/12 | — | Aktor-Verfuegbarkeit |
| Datenlucke | 0.3% | Sparkline 7d | Anteil fehlender Datenpunkte |
| Offene Alerts | 2 | — | Unbearbeitete Notifications |
| Naechste Wartung | 3 Tage | — | Naechstes Wartungsdatum (aus Komponenten-Tab) |

**Design:** Kompakte Cards in einer Reihe (Flexbox/Grid, responsive). Jede Karte ~120px breit. Mini-Sparkline eingebettet via `useSparklineCache.ts`. Klick auf KPI → relevante Detail-Ansicht.

**NICHT hier:** Sensor-Messwerte (Temperatur, Feuchte, etc.) → das ist Monitor-Tab

### Sektion 3: Zonen-Uebersicht (bestehendes ZonePlate-Konzept, UMFOKUSSIERT)

**Zweck:** Zonen als Navigations-Einstiegspunkte mit Infrastruktur-Fokus.

**Aktuell (ZonePlate.vue):** Zone-Akkordeons mit Sensor-Karten (Mini-Sparklines, aktuelle Werte). Problematisch weil das GENAU das ist was Monitor L1 auch zeigt.

**Neu (ZoneSummaryCard.vue):** Kompakte Zone-Karten (keine Akkordeons) die zeigen:
- Zone-Name + Gesundheits-Score (Ampel)
- Geraete-Count: "5 Sensoren, 2 Aktoren" (nicht die Werte!)
- Zone-Context-Teaser: Sorte + Phase + Alter (aus Zone-Context, Block K3)
- Problem-Badges: Offline-Geraete, Stale-Data, Wartung faellig
- **Klick → Monitor L2** (Zone-Detail)

**Entscheidend:** KEINE Sensor-Messwerte auf der Uebersicht. Keine Mini-Sparklines der Sensorwerte. Das ist Monitor. Stattdessen: Infrastruktur-Status + Kontext-Teaser + Navigation.

**Layout-Optionen (muss ausgearbeitet werden):**
- Grid (2-3 Spalten) fuer kompakte Darstellung
- Oder: Horizontaler Scroller fuer viele Zonen

### Sektion 4: Handlungsbedarf ("Needs Attention")

**Zweck:** Was muss Robin JETZT tun?

**Inhalt (priorisiert):**
1. **Offline-Geraete** — Welche ESPs/Sensoren sind gerade offline (mit "seit wann")
2. **Wartung faellig** — Geraete wo `next_maintenance` ueberschritten ist
3. **Stale Data** — Sensoren die seit X Minuten keine neuen Daten liefern
4. **Anomalien** — Ungewoehnliche Werte (spaeter, wenn ML-Modelle existieren)

**Design:** Kompakte Liste, max 5-8 Eintraege. "Alle anzeigen" Link zu gefilterter Ansicht. Jeder Eintrag hat Deep-Link zum betroffenen Geraet (→ Komponenten-Tab oder Monitor).

**NICHT hier:** Alert-Details → QAB. Historische Daten → Monitor.

### Sektion 5: Quick-Navigation (optional, muss evaluiert werden)

**Zweck:** Schnellzugriff auf haeufig genutzte Ansichten.

**Ueberlegungen:**
- Favoriten-Zone (1-Klick zum Monitor L2 der Hauptzone)
- Letzte Aktivitaet ("Zuletzt bearbeitet: SHT31 Config, Zone Bluete-A Context")
- Shortcuts zu System-Monitor, Dashboards, Rules

**Abgrenzung zu QAB:** QAB hat Quick Navigation (Block 4A.6). Uebersicht-Quick-Navigation waere teilweise redundant. MUSS evaluiert werden ob das hier sinnvoll ist oder ob QAB reicht.

---

## Was RAUS muss (aus der aktuellen Uebersicht)

| Aktuell auf Uebersicht | Wohin stattdessen | Begruendung |
|------------------------|--------------------|-------------|
| ZonePlate mit Sensor-Werten + Sparklines | Monitor L1 | Dupliziert Monitor exakt |
| DeviceMiniCards mit Live-Daten | Monitor L1/L2 | Dupliziert Monitor |
| Sensor-Messwerte (Temperatur, Feuchte...) | Monitor L1/L2/L3 | Monitor ist dafuer da |

## Was BLEIBT (transformiert)

| Aktuell | Transformation | Neu |
|---------|---------------|-----|
| ZonePlate als Navigation | → ZoneSummaryCard | Kompakter, Infrastruktur-Fokus |
| Zone-Gruppierung | → Flat Grid | Keine Akkordeons, Cards nebeneinander |

---

## Offene Fragen (vor Ausarbeitung zu klaeren)

### Architektur-Entscheidungen

1. **System-Health-Store:** `useSystemHealthStore` war im Unified Monitoring UX geplant (absorbiert). Braucht die Uebersicht einen eigenen aggregierten Store oder reicht ein Computed aus dem espStore?

2. **Sparklines auf KPIs:** Woher kommen die Trend-Daten? `useSparklineCache.ts` cached Sensor-Sparklines. Brauchen wir separate System-KPI-Sparklines (z.B. "ESP-Online-Rate letzte 24h")? Das waere ein neuer Backend-Endpunkt.

3. **ZoneSummaryCard vs. ZonePlate:** ZonePlate komplett ersetzen oder umbauen? ZonePlate wird aktuell auch im Monitor referenziert (als L1 Navigation). Eventuelle Shared-Komponente oder zwei separate Komponenten?

4. **Responsive Verhalten:** Bei wenig Zonen (2-3) sieht ein Grid komisch aus. Bei vielen Zonen (10+) wird ein Grid unuebersichtlich. Adaptive Layout-Strategie noetig.

5. **Composable-Extraktion:** Welche Logik aus dem aktuellen ZonePlate muss in ein Composable extrahiert werden fuer Wiederverwendung zwischen Uebersicht und Monitor?

### Inhaltliche Entscheidungen

6. **KPI-Auswahl:** Welche 4-6 KPIs sind fuer Robin am relevantesten? Vorschlag steht oben, aber Robin sollte priorisieren.

7. **"Needs Attention" Logik:** Was genau ist "stale data"? 5 Min? 15 Min? Konfigurierbar? Wie wird "Wartung faellig" bestimmt — harter Cut am Datum oder mit Puffer?

8. **Zone-Context auf der Uebersicht:** Wie viel Zone-Context (aus Block K3) soll auf der Uebersicht sichtbar sein? Nur "Sorte + Phase" als Teaser? Oder mehr?

9. **Quick-Navigation Redundanz mit QAB:** Block 4A.6 implementiert MRU-Navigation + Favoriten im QAB. Braucht die Uebersicht zusaetzlich Quick-Navigation-Elemente oder reicht der QAB?

---

## Initiale Recherche-Ergebnisse

### IoT Dashboard Overview Patterns (Web-Recherche)

**Quelle:** Smashing Magazine (2025), Memfault IoT Blog, Kaa IoT Cloud

1. **"5-Second Rule":** Ein Dashboard muss die kritischste Information in 5 Sekunden vermitteln. → System-Health-Banner ist richtig.

2. **Sparklines + KPIs:** Compact sparklines neben Key Metrics zeigen Trend UND aktuellen Wert. Keine Achsen-Labels, keine Legenden — nur der Trend-Pfeil. → KPI-Karten mit eingebetteten Sparklines.

3. **Progressive Disclosure:** Uebersicht → Klick → Detail. Nicht alles auf einer Seite. → Zonen als Cards, nicht als Akkordeons mit ausgeklappten Daten.

4. **Role-based Personalization:** Operations-Manager sieht System-Health, Grower sieht Pflanzen-Status. → Spaeter moeglich ueber konfigurierbare KPI-Karten.

5. **Micro-Animations gegen Change Blindness:** Fade-ins, Count-up Transitions wenn Werte sich aendern. → Dezent einsetzen bei KPI-Wert-Updates.

### Abgrenzung zu Monitor — Forschungsergebnis

Aus den 8 Papers der /forschung zum Komponenten-Tab (CEA Digital Twins):
- **Physical Layer** (Hardware-Status) → Uebersicht
- **Virtual Layer** (Simulation, Daten-Analyse) → Monitor / Dashboards
- **Synchronization Layer** (Echtzeit-Updates) → Monitor

Die Uebersicht entspricht dem "Physical Layer Overview" — zeigt den Zustand der physischen Infrastruktur, nicht die Analyse der Daten.

---

## Naechste Schritte (was fuer die vollstaendige Ausarbeitung noetig ist)

- [ ] **Recherche vertiefen:** IoT Cockpit/Overview UX Patterns, speziell Abgrenzung Uebersicht vs. Detail-Views in industriellen Plattformen (ThingsBoard Home, Grafana Home Dashboard, Azure IoT Central Overview)
- [ ] **ZonePlate.vue analysieren:** Genau verstehen was aktuell drin ist, was raus muss, was bleibt
- [ ] **Composable-Map erstellen:** Welche bestehenden Composables (useSparklineCache, useZoneGrouping, useHealthMetrics) werden gebraucht, welche muessen neu
- [ ] **System-Health-Store definieren:** Datenmodell, Quellen, Aggregationslogik
- [ ] **Mockup/Wireframe:** ASCII-Layout der neuen Uebersicht fuer Robin zum Absegnen
- [ ] **Robin-Feedback einholen:** KPI-Priorisierung, Zone-Context-Teaser-Umfang, Quick-Nav-Redundanz-Klaerung
- [ ] **Abhaengigkeiten pruefen:** Was braucht die Uebersicht aus Phase 4A (Notification-Store, System-Health-Store, Alert-Daten)?
- [ ] **Aufwand praezisieren:** Nach Klaerung der offenen Fragen

---

## Wissensbasis (fuer Ausarbeitung)

| Typ | Dokument | Pfad |
|-----|----------|------|
| TM-Briefing-Analyse | Analyseergebnis 1: Uebersicht-Tab | (in Robin's initialer Nachricht) |
| Bestehender Auftrag (absorbiert) | Unified Monitoring UX | `arbeitsbereiche/automation-one/frontend-konsolidierung/auftrag-unified-monitoring-ux.md` |
| Phase 4A | Notification-Stack (QAB, Alert-System) | `arbeitsbereiche/automation-one/hardware-tests/auftrag-phase4a-notification-stack.md` |
| Fahrplan | Sequenzieller Weiterbau nach 4A | `arbeitsbereiche/automation-one/fahrplan-nach-phase4a.md` |
| Recherche | IoT Component Inventory & AI-Ready Metadata | `wissen/iot-automation/iot-component-inventory-ai-metadata-infrastructure-2026.md` |
| Recherche | Quick Action Ball & Alert Management | `wissen/iot-automation/quick-action-ball-alert-management-recherche-2026.md` |
| Web-Recherche | IoT Dashboard Overview Patterns 2025 | Smashing Magazine, Memfault, Kaa IoT |
