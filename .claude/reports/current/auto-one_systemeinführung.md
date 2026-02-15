# AutomationOne – System-Einführung

> **Version:** 5.0 | **Stand:** 2026-02-14
> **Technische Details:** Siehe `auto-one_systemarchitektur.md`

---

## Was ist AutomationOne?

AutomationOne ist ein modulares IoT-Framework für skalierbare Sensor- und Aktor-Netzwerke. Es verbindet beliebig viele ESP32-Mikrocontroller mit einem zentralen Server, der alle Daten sammelt, verarbeitet und über ein Web-Dashboard verfügbar macht.

**Das Kernversprechen:** Sensoren und Aktoren hinzufügen, Regeln definieren, Daten auswerten – alles über eine Web-Oberfläche, ohne eine Zeile Code zu ändern. Die Firmware auf den ESP32-Geräten muss nach der Ersteinrichtung nicht mehr angefasst werden.

**Typische Einsatzgebiete:**
- Gewächshaus-Automation (Temperatur, Feuchtigkeit, pH, EC, Bewässerung, Belüftung)
- Labor-Monitoring (Umgebungsbedingungen, Geräteüberwachung)
- Gebäude-Automation (Klima, Beleuchtung, Zugangskontrolle)
- Industrielle Überwachung (Sensornetzwerke, Fernsteuerung)

---

## Wie ist das System aufgebaut?

AutomationOne arbeitet in drei Schichten. Jede Schicht hat eine klare Aufgabe:

```
┌────────────────────────────────────────────────────────────┐
│  Web-Dashboard (El Frontend)                              │
│  Sehen, Konfigurieren, Steuern – alles im Browser        │
└───────────────────────┬────────────────────────────────────┘
                        │ Echtzeit-Verbindung (WebSocket + REST)
┌───────────────────────┴────────────────────────────────────┐
│  Zentraler Server (El Servador)                           │
│  Verarbeiten, Speichern, Entscheiden, Automatisieren      │
│  PostgreSQL | MQTT-Broker | Logic Engine                  │
└───────────────────────┬────────────────────────────────────┘
                        │ MQTT-Nachrichten (leichtgewichtig, zuverlässig)
┌───────────────────────┴────────────────────────────────────┐
│  ESP32-Agenten (El Trabajante)                            │
│  Sensoren auslesen, Aktoren schalten – nicht mehr         │
│  Beliebig viele Geräte, beliebig viele Sensoren/Aktoren  │
└────────────────────────────────────────────────────────────┘
```

**Warum diese Aufteilung?** Die gesamte Intelligenz liegt auf dem Server. ESP32-Geräte sind bewusst "dumm" gehalten – sie erfassen Rohdaten und führen Befehle aus. Dadurch kann das System wachsen (mehr ESPs, mehr Sensoren), ohne die Firmware aktualisieren zu müssen. Neue Sensortypen, neue Automationsregeln, neue Auswertungen – alles passiert zentral auf dem Server.

---

## Was kann das System?

### Daten sammeln

Jeder ESP32 kann bis zu 10 Sensoren gleichzeitig betreiben. Die Messwerte fließen automatisch in die zentrale Datenbank:

| Sensor-Typ | Schnittstelle | Messwert |
|------------|---------------|----------|
| DS18B20 | OneWire | Temperatur (°C) |
| SHT31 | I2C | Temperatur + Luftfeuchtigkeit |
| BMP280 / BME280 | I2C | Luftdruck (+ Temperatur/Feuchte) |
| pH-Sensor | Analog (ADC) | pH-Wert |
| EC-Sensor | Analog (ADC) | Leitfähigkeit (µS/cm) |
| Bodenfeuchtigkeit | Analog (ADC) | Feuchtigkeit (%) |
| CO2-Sensor | Variabel | CO2-Konzentration (ppm) |
| Lichtsensor | Analog (ADC) | Lichtstärke (Lux) |
| Durchflusssensor | Digital | Durchfluss (L/min) |

**Mehrere Sensoren am gleichen Anschluss** sind möglich: An einem I2C-Bus können Geräte mit unterschiedlichen Adressen nebeneinander arbeiten. An einem OneWire-Pin lassen sich beliebig viele DS18B20-Sensoren über ihren eindeutigen ROM-Code adressieren.

**Messintervalle** sind pro Sensor konfigurierbar (2 Sekunden bis 5 Minuten). Alle Messwerte werden mit Zeitstempel in der PostgreSQL-Datenbank gespeichert – für Echtzeit-Anzeige und historische Auswertung.

### Daten verarbeiten (Pi-Enhanced Processing)

Der Server übernimmt die rechenintensive Auswertung der Sensor-Rohdaten. Jeder Sensortyp hat eine eigene Processing-Library auf dem Server:

```
ESP32 liest Rohwert (z.B. ADC-Wert 2150)
  │
  ▼ Sendet Rohwert via MQTT
  │
Server: Lädt passende Sensor-Library (z.B. ph_sensor.py)
  ├── Spannungs-Kompensation
  ├── Temperatur-Korrektur
  └── Qualitäts-Bewertung
  │
  ▼ Ergebnis: pH 6.8, Qualität "gut"
  │
  ├── In Datenbank speichern
  ├── An Dashboard senden (Echtzeit)
  └── An Logic Engine weiterleiten (Automation)
```

**9 Sensor-Libraries** sind verfügbar: pH, EC, Temperatur, Feuchtigkeit, Bodenfeuchte, Druck, CO2, Durchfluss, Licht. Neue Libraries können als Python-Modul ergänzt werden, ohne den Server neu zu starten.

Dieses Konzept hält die ESP32-Firmware einfach und verlegt die Verarbeitungslogik dorthin, wo sie leicht angepasst werden kann – auf den Server.

### Aktoren steuern

Über den Server lassen sich Aktoren auf beliebigen ESP32 steuern:

| Aktor-Typ | Steuerung | Beispiel |
|-----------|-----------|---------|
| Pumpe | Ein/Aus (mit Runtime-Schutz) | Bewässerungspumpe |
| Ventil | Ein/Aus | Magnetventil |
| PWM | Stufenlos (0–255) | Lüfter-Geschwindigkeit |
| Relay | Ein/Aus | Beleuchtung, Heizung |

Jeder Aktor-Befehl durchläuft **zwei Safety-Checks** – einmal auf dem Server (SafetyService) und einmal auf dem ESP32 (SafetyController) – bevor die Hardware geschaltet wird. Ein Emergency-Stop kann jederzeit alle Aktoren im gesamten Netzwerk in unter 100 Millisekunden abschalten.

### Automatisieren (Cross-ESP Logic Engine)

Die Logic Engine verknüpft Sensoren und Aktoren über ESP32-Grenzen hinweg. Regeln werden im Web-Dashboard erstellt:

**Beispiel:** "Wenn die Temperatur an ESP_Gewächshaus (Sensor GPIO 4) über 28°C steigt, schalte den Lüfter an ESP_Belüftung (Aktor GPIO 25) ein. Wenn sie unter 24°C fällt, schalte ihn wieder aus."

**Verfügbare Bedingungen:**
- Sensor-Schwellwert (größer, kleiner, zwischen, gleich)
- Zeitfenster (z.B. nur zwischen 08:00 und 18:00)
- Hysterese (Ein bei >28°C, Aus bei <24°C – verhindert schnelles An/Aus-Schalten)
- Kombinationen (UND/ODER-Logik)

**Verfügbare Aktionen:**
- Aktor schalten (Ein/Aus/PWM)
- Verzögerung (1 Sekunde bis 1 Stunde)
- Benachrichtigung (Dashboard, Email, Webhook)
- Sequenz (verkettete Aktionen: Schritt 1 → Schritt 2 → Schritt 3)

**Safety:** Ein ConflictManager verhindert, dass zwei Regeln gleichzeitig denselben Aktor steuern. Ein RateLimiter begrenzt die Ausführungshäufigkeit. Ein LoopDetector erkennt zirkuläre Abhängigkeiten (Regel A triggert Regel B triggert Regel A).

### Visualisieren

Das Web-Dashboard zeigt alles in Echtzeit:

- **Zone Overview:** Alle Zonen auf einen Blick (Gesamtstatus)
- **Zone Detail:** Einzelne Zone mit allen zugehörigen ESP32-Geräten
- **Device Detail:** Einzelnes ESP32 mit Sensor-Satelliten und Aktor-Satelliten im Orbital-Layout

Die Navigation zwischen den Ebenen funktioniert per Klick (Drill-Down) und Breadcrumb (Zurück). 26 WebSocket-Events halten das Dashboard aktuell – Sensor-Werte, Aktor-Zustände, Health-Status, Discovery-Events und Logic-Ausführungen erscheinen sofort.

---

## Dynamische Anpassung

Das System lässt sich im laufenden Betrieb umkonfigurieren:

| Aktion | Wie | Firmware-Update nötig? |
|--------|-----|----------------------|
| Sensor hinzufügen | Dashboard → ESP → Sensor konfigurieren (GPIO, Typ, Intervall) | Nein |
| Sensor entfernen | Dashboard → Sensor löschen | Nein |
| Aktor hinzufügen | Dashboard → ESP → Aktor konfigurieren (GPIO, Typ, Safety) | Nein |
| Automationsregel erstellen | Dashboard → Logic Builder (Bedingungen + Aktionen) | Nein |
| ESP einer Zone zuordnen | Dashboard → Drag & Drop oder API | Nein |
| Subzone erstellen | Dashboard → Zone → Subzone anlegen | Nein |
| Neues ESP32 einbinden | ESP flashen → WiFi verbinden → im Dashboard genehmigen | Einmalig (Ersteinrichtung) |
| Neuen Sensortyp unterstützen | Python-Library in `sensor_libraries/active/` ablegen | Nein |

**Config-Push:** Konfigurationsänderungen werden über MQTT (QoS 2 – exakt einmal) an die betroffenen ESP32 gesendet. Der ESP32 bestätigt den Empfang. Kein Firmware-Update, kein Neustart.

---

## Sicherheit

### Mehrstufiges Safety-System

Jeder Befehl an einen Aktor durchläuft mehrere Prüfungen:

1. **Frontend:** Benutzer-Authentifizierung (JWT)
2. **Server – SafetyService:** Validierung vor MQTT-Publish
3. **Server – ConflictManager:** Kein Aktor-Konflikt mit aktiven Regeln
4. **ESP32 – SafetyController:** Lokale Prüfung vor GPIO-Schaltung
5. **ESP32 – GPIO Safe-Mode:** Alle Pins starten beim Boot sicher

### Emergency-Stop

Ein globaler Emergency-Stop schaltet alle Aktoren im gesamten Netzwerk ab:

- **Latenz:** Unter 100 Millisekunden
- **Mechanismus:** MQTT Broadcast (QoS 2) an alle ESP32
- **Reaktion:** Alle Outputs werden auf INPUT gesetzt (stromlos)
- **Auslöser:** Manuell (Dashboard/API) oder automatisch (Logic Engine)

### Circuit Breaker

Drei Circuit Breaker schützen kritische Verbindungen (Datenbank, MQTT, externe APIs). Bei wiederholten Fehlern wird die Verbindung vorübergehend unterbrochen, um Kaskaden-Ausfälle zu verhindern. Nach einer Recovery-Phase werden Test-Anfragen gesendet, bevor der normale Betrieb wiederhergestellt wird.

### Authentifizierung

- **Dashboard:** JWT-Token (Access + Refresh), Admin/Operator-Rollen
- **MQTT (Produktion):** Username/Password + ACL + TLS-Verschlüsselung
- **Zertifikate (Produktion):** TLS 1.2+ für alle Verbindungen

---

## Datenanalyse und KI-Integration

### Aktueller Stand: Fokussierte Sensor-Libraries

Die Datenanalyse findet direkt im Server statt – als Sensor-spezifische Processing-Libraries. Jede Library ist auf einen Sensortyp zugeschnitten (pH-Berechnung, EC-Temperaturkompensation, Feuchte-Konvertierung). Keine generische KI, sondern präzise, bewährte Algorithmen pro Anwendungsfall.

Die Libraries sind modular und austauschbar. Ein neuer Usecase erfordert eine neue Library-Datei – nicht ein neues ML-Modell.

### Analyse-gesteuerter Datenbetrieb

Die Architektur wird so aufgebaut, dass nicht nur Rohdaten gesammelt werden, sondern das System versteht, *welche* Daten in *welchem Kontext* erhoben werden. Das geschieht über drei Mechanismen:

**1. Anreicherbare Sensor- und Aktor-Metadaten**

Jeder Sensor und Aktor erhält über die Konfiguration hinaus ein erweiterbares Metadaten-Profil. Darin lassen sich Kontextinformationen hinterlegen – etwa das Medium, in dem gemessen wird, die Umgebungsbedingungen, Kalibrierungszyklen oder der Zweck des Sensors im Gesamtprozess. Je präziser diese Metadaten gepflegt sind, desto gezielter können Analyse-Modelle arbeiten: Ein pH-Sensor in einer Nährlösung liefert andere Auswertungsparameter als derselbe Sensortyp in einem Abwasserbecken. Diese Kontextschicht macht den Unterschied zwischen reiner Datenerfassung und verwertbarer Analyse.

**2. Bedarfsgesteuerte Datenerfassung**

Nicht alle Daten lassen sich automatisch erheben. Manche Sensoren – etwa pH- und EC-Sonden – erfordern eine manuelle Aktivierung durch einen Mitarbeiter (Sonde eintauchen, Probe vorbereiten, Kalibrierung prüfen). Gleiches kann für bestimmte Aktoren gelten, die eine überwachte Inbetriebnahme benötigen.

Das System wird zwischen zwei Erfassungsmodi unterscheiden:

- **Automatisch:** Sensoren, die kontinuierlich laufen (Temperatur, Feuchtigkeit, Druck, Licht). Daten fließen ohne menschliches Zutun in die Datenbank.
- **Aktivierungspflichtig:** Sensoren und Aktoren, die eine bewusste Handlung erfordern. Das System weiß, dass diese Datenpunkte existieren, aber nicht permanent verfügbar sind.

**3. Analyse-Profile und gezielte Alerts**

Für spezifische Auswertungen – etwa ein Nährstoff-Monitoring, eine Wachstumsanalyse oder eine Klima-Optimierung – werden Analyse-Profile definiert. Ein Profil beschreibt, welche Datenquellen es benötigt, welche davon automatisch verfügbar sind und welche manuell erhoben werden müssen.

Daraus ergeben sich gezielte Handlungsaufforderungen an den Nutzer:

- Das Dashboard zeigt an, welche Datenpunkte für eine bestimmte Auswertung noch fehlen
- Spezifische Alerts informieren Mitarbeiter, dass eine Messung durchgeführt werden muss ("pH-Messung an Becken 3 erforderlich – letzte Messung vor 48h")
- Nach Abschluss aller benötigten Messungen startet die Auswertung automatisch

Das Prinzip: Analyse-Anforderungen steuern die Datenerfassung – nicht umgekehrt. Das System weiß, was es braucht, zieht automatisch, was es kann, und fordert gezielt an, was menschliche Interaktion erfordert. Dadurch entsteht kein Datenfriedhof, sondern ein zweckgebundener Datenstrom, der exakt die Informationen liefert, die eine Auswertung tatsächlich benötigt.

### Vorbereitet: Dedizierte KI-Inferenz

Für fortgeschrittene Analysen ist eine Erweiterung konzipiert:

- **ai_predictions-Tabelle** im Datenbankschema bereits angelegt (Prediction-Typ, Konfidenz, Input/Result als JSON)
- **Geplante Hardware:** NVIDIA Jetson Orin Nano Super als dedizierte Inferenz-Box
- **Architektur:** Separater Service – empfängt Daten vom Server, rechnet, sendet Ergebnisse zurück
- **Use Cases:** Anomalie-Erkennung, Ressourcen-Optimierung, Failure Prediction

Die KI-Modelle werden fokussiert eingesetzt – angepasst an den konkreten Usecase, nicht als generische Lösung. Die modulare Architektur erlaubt es, Modelle auszutauschen oder neue hinzuzufügen, ohne das Kernsystem zu verändern. Die oben beschriebenen Analyse-Profile bilden dabei die Schnittstelle: Sie definieren den Datenbedarf, den ein Modell hat, und das System sorgt dafür, dass dieser Bedarf gedeckt wird – automatisch, wo möglich, und durch gezielte menschliche Interaktion, wo nötig.

---

## Testfähigkeit

AutomationOne wird auf allen drei Schichten automatisiert getestet:

| Schicht | Tool | Was wird getestet | Umfang |
|---------|------|-------------------|--------|
| **Server** | pytest | API-Endpoints, MQTT-Handler, Logic Engine, Safety, Resilience | 105 Test-Dateien |
| **Frontend** | Vitest + Playwright | Stores, Composables, E2E-Flows (Auth, Sensor, Actuator, Emergency) | 10 Test-Dateien |
| **Firmware** | Wokwi Simulator | Boot, Sensoren, Aktoren, Emergency, Config, I2C, OneWire, NVS | 163 Szenarien |
| **Gesamt** | | | **278 Tests/Szenarien** |

**CI/CD:** GitHub Actions Pipelines für Backend, Frontend und Firmware. Automatische Tests bei jedem Push.

---

## Skalierung

### Aktuell: Ein Server, beliebig viele ESPs

Der aktuelle Aufbau – ein Server mit PostgreSQL, MQTT-Broker und Frontend – bedient ein Netzwerk aus ESP32-Geräten. Das MQTT-Protokoll ist leichtgewichtig genug, um Dutzende ESPs mit hunderten Sensoren über einen Broker zu verarbeiten.

### Vorbereitet: Kaiser-Relay für große Netzwerke

Für Netzwerke mit 100+ ESP32 ist eine Skalierungsebene vorgesehen: Kaiser-Relays (Raspberry Pi Zero) arbeiten als lokale Zwischenknoten. Sie betreuen eine Gruppe von ESPs, puffern bei Verbindungsausfall und synchronisieren mit dem zentralen Server.

Das MQTT-Topic-Schema (`kaiser/{kaiser_id}/esp/{esp_id}/...`) und die Datenbanktabellen (`kaiser_registry`, `esp_ownership`) sind bereits darauf vorbereitet. Die Erweiterung ist eine Konfigurationsänderung, keine Architekturänderung.

---

## Monitoring

Ein optionaler Monitoring-Stack (8 Container) liefert Einblick in den Systembetrieb:

- **Grafana** (Port 3000): Dashboards für Server-Health, Container-Metriken, MQTT-Traffic
- **Prometheus** (Port 9090): Metriken-Sammlung (Custom Gauges, Counters, Histograms)
- **Loki + Promtail**: Zentrale Log-Aggregation aller Container (7 Tage Retention)
- **cAdvisor:** Container-Ressourcen (CPU, RAM, Restart-Count)
- **Exporter:** PostgreSQL-Metriken, Mosquitto-Metriken

Start mit einem Befehl: `docker compose --profile monitoring up -d`

---

## Zusammenfassung

| Eigenschaft | AutomationOne |
|-------------|---------------|
| **Sensoren** | 9 Typen (pH, EC, Temperatur, Feuchte, Druck, CO2, Licht, Durchfluss, Bodenfeuchte) – erweiterbar |
| **Aktoren** | 4 Typen (Pumpe, Ventil, PWM, Relay) – erweiterbar |
| **Automation** | Cross-ESP Logic Engine mit Hysterese, Zeitfenstern, Sequenzen |
| **Sicherheit** | JWT, Circuit Breaker, Safety-Checks, Emergency-Stop (<100 ms) |
| **Datenbank** | PostgreSQL, 19 Tabellen, Time-Series, Audit-Log |
| **Kommunikation** | MQTT (QoS 0/1/2), WebSocket (26 Events), REST (~170 Endpoints) |
| **Frontend** | Vue 3, 3-Level-Zoom, Echtzeit, Drag & Drop |
| **Tests** | 278 automatisierte Tests/Szenarien, CI/CD |
| **Monitoring** | Grafana, Prometheus, Loki (optional) |
| **Datenanalyse** | Analyse-Profile steuern Datenerfassung, gezielte Alerts für manuelle Messungen |
| **Erweiterung** | Neue Sensoren per Python-Library, neue Aktoren per C++-Driver, KI vorbereitet |
| **Skalierung** | Multi-Kaiser-fähiges Topic-Schema, Kaiser-Relay vorbereitet |

> **Technische Architektur:** `auto-one_systemarchitektur.md`
> **Referenz-Dokumentation:** `.claude/reference/` (MQTT_TOPICS, REST_ENDPOINTS, ERROR_CODES, COMMUNICATION_FLOWS, PRODUCTION_CHECKLIST)
