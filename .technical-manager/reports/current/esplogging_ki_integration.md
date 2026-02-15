# AutomationOne – KI & Monitoring Roadmap

## Kontext

Robin arbeitet alleine am 4-Layer IoT Framework AutomationOne (ESP32 Firmware → FastAPI Backend → Vue 3 Frontend → Technical Manager). Das System läuft in Docker auf WSL2, mit 13+ Claude Code Agents in VS Code und einem Technical Manager (TM) als strategische Steuerungsinstanz in claude.ai. Aktueller Fokus: Debugging, Stabilisierung, Frontend-Konsolidierung.

Dieser Plan führt von der aktuellen Debugging-Phase schrittweise zu einem vollständig überwachten, KI-optimierten Entwicklungsworkflow und perspektivisch zu lokaler ML-Inferenz auf einem NVIDIA Jetson Orin Nano Super (8GB, ~280€).

**Architektur-Entscheidung:** Der Docker-Stack (El Servador, PostgreSQL, Mosquitto, Frontend, Monitoring) bleibt auf dem Hauptrechner (WSL2, perspektivisch Mini-PC/NAS). Der Jetson wird ausschließlich als dedizierte KI-Inferenz-Box eingesetzt – er empfängt Daten per MQTT/REST vom Hauptserver, rechnet, und schickt Ergebnisse zurück. Saubere Trennung von Infrastruktur und ML. Der ser2net-Container zur Serial-Bridge wird fest in den Stack integriert.

---

## Phase 1 – Monitoring Stack & Echtzeit-Logging

**Ziel:** Alle Datenströme zentral sichtbar machen. Kein blindes Debuggen mehr.

### 1.1 Loki + Promtail + Grafana in Docker-Stack integrieren

Drei neue Services in `docker-compose.yml`, idealerweise als eigenes Compose-Profil `monitoring`:

- **Loki** – Log-Aggregation und Abfrage (Port 3100)
- **Promtail** – Sammelt Docker-Container-Logs über den Docker-Socket, taggt automatisch nach Container-Name
- **Grafana** – Dashboards und Alerting (Port 3000)

Promtail-Config braucht saubere Label-Zuordnung:

| Container | Label `layer` | Label `service` |
|-----------|--------------|----------------|
| automationone-server | backend | el-servador |
| automationone-frontend | frontend | el-frontend |
| automationone-postgres | database | postgres |
| automationone-mqtt | broker | mosquitto |
| ser2net (neu) | firmware | esp32-serial |
| ml-agent (Phase 3) | ml | anomaly-detection |

### 1.2 ESP32 Serial Output einfangen

Zwei parallele Wege:

**A) MQTT Debug-Topic (permanente Lösung)**

Neuer Topic-Prefix in El Trabajante Firmware: `ao/devices/{device_id}/debug`

Schweregrade als Subtopic oder Payload-Feld: `ERROR`, `WARN`, `INFO`, `DEBUG`

El Servador empfängt diese und schreibt sie als strukturierte Logs (JSON), die Promtail abgreifen kann. Damit fließen ESP32-Logs durch den selben Kanal wie alle anderen Daten – passt zur server-zentrische Architektur.

**B) Serial-zu-Netzwerk-Bridge (fester Bestandteil des Stacks)**

Docker-Container `ser2net` liest `/dev/ttyUSB0` (oder mehrere Ports bei mehreren ESP32s) und sendet die Zeilen an Loki (via Promtail oder direkt via Loki Push API). Wird permanent im Stack mitlaufen – nicht nur für die Entwicklungsphase, sondern als vollwertige Datenquelle für den Monitoring-Stack und später die ML-Modelle auf dem Jetson.

### 1.3 Grafana "Kontrollraum" Dashboard

Ein zentrales Dashboard mit:

- Log-Panel pro Layer (Backend, Frontend, Firmware, Broker, DB) – live, filterbar nach Severity
- MQTT-Traffic-Metriken (Messages/sec, Topics aktiv) via Prometheus-Exporter
- Container-Health-Status (CPU, RAM, Restart-Count) via cAdvisor → Prometheus
- Korrelations-View: alle Logs ±5 Sekunden um einen Error herum (LogQL)

### 1.4 Prometheus-Metriken

El Servador bekommt einen `/metrics` Endpoint (FastAPI + `prometheus-fastapi-instrumentator` oder custom):

- Request-Count, Latency, Error-Rate pro Endpoint
- MQTT-Message-Count (published, received, errors)
- WebSocket-Verbindungen aktiv
- DB-Query-Dauer

Mosquitto-Exporter für Broker-Metriken. PostgreSQL-Exporter für DB-Metriken.

### Ergebnis Phase 1

Du hast einen "Kontrollraum" in Grafana, in dem du live siehst was in jedem Layer passiert. Kein manuelles `docker logs -f` mehr, kein Terminal-Hopping. Jeder Error ist getaggt, korrelierbar, und durchsuchbar.

---

## Phase 2 – Intelligentes Alerting & Debug-Wissensbasis

**Ziel:** Das System meldet dir proaktiv wenn etwas nicht stimmt. Gleichzeitig baust du systematisch Wissen auf, das später einem ML-Debug-Assistenten dient.

### 2.1 Grafana Alert Rules

Alert-Regeln für bekannte Probleme:

- ESP32 sendet keine MQTT-Heartbeats mehr (Timeout > X Sekunden)
- El Servador Error-Rate überschreitet Schwellwert
- PostgreSQL Connection-Pool erschöpft
- MQTT-Broker Reconnect-Schleifen (Pattern: disconnect → connect → disconnect in kurzer Zeit)
- Frontend WebSocket-Verbindung verloren
- Container-Restart detected

Alert-Kanal: Grafana kann Webhooks, Email, Slack, Discord. Für dich alleine reicht ein Webhook an El Servador, der es ins Frontend-Dashboard als Notification schickt.

### 2.2 Log-basierte Metriken

In Loki/LogQL definierst du Metriken, die aus Log-Patterns abgeleitet werden:

- `rate({layer="backend"} |= "ERROR" [5m])` → Errors pro 5 Minuten
- `count_over_time({layer="firmware", device_id="esp32_01"} |= "timeout" [1h])` → Timeout-Häufigkeit pro Gerät
- `rate({service="mosquitto"} |= "socket error" [5m])` → MQTT-Verbindungsprobleme

Diese Metriken werden in Grafana visualisiert und können Alerts auslösen.

### 2.3 Debug-Wissensbasis aufbauen (Vorbereitung ML-Assistent)

Ab hier sammelst du systematisch Wissen für den späteren ML-basierten Debug-Assistenten. Das ist keine Extra-Arbeit, sondern eine Dokumentationsgewohnheit die du dir aneignest.

**Fehlermuster-Katalog** – ein strukturiertes Dokument (Markdown oder JSON) in `.claude/reference/errors/`:

Für jedes Fehlermuster, das dir beim Debugging begegnet, dokumentierst du:

- **Pattern-ID**: eindeutiger Bezeichner (z.B. `MQTT_RECONNECT_LOOP`)
- **Symptome**: welche Log-Zeilen aus welchen Containern tauchen auf?
- **Ursache**: was war tatsächlich das Problem?
- **Lösung**: was hast du getan?
- **Beteiligte Layer**: welche Teile des Systems waren betroffen?
- **Korrelation**: welche Log-Einträge aus anderen Containern traten gleichzeitig auf?
- **Schweregrad**: kritisch / warnung / kosmetisch

Beispiel-Eintrag:

```yaml
- id: MQTT_RECONNECT_LOOP
  symptoms:
    - container: mosquitto
      pattern: "socket error on client esp32_01, disconnecting"
      frequency: ">3x in 60s"
    - container: el-servador
      pattern: "MQTT client esp32_01 went offline"
    - container: esp32-serial
      pattern: "WiFi: disconnect reason 202"
  root_cause: "ESP32 WiFi-Interferenz bei schwachem Signal, führt zu TCP-Timeout"
  solution: "WiFi TX-Power anpassen oder Reconnect-Backoff in Firmware erhöhen"
  layers: [firmware, broker, backend]
  severity: warning
  correlation_window: "±10s"
```

**Warum das wertvoll ist:**

- Sofort: dein ERROR_CODES Referenzdokument wird besser, deine Agents können darauf zugreifen
- Mittelfristig: Grafana Alert Rules werden präziser (du kennst die echten Patterns)
- Langfristig: dieser Katalog wird zum Trainingsdatensatz für den ML-Klassifikator in Phase 3

**Label-Taxonomie für Logs:** Definiere jetzt schon die Labels, die du an Logs hängen willst. Das macht späteres ML-Training einfacher, weil die Daten schon gelabelt sind.

### Ergebnis Phase 2

Das System warnt dich aktiv bei bekannten Problemen. Du hast einen wachsenden Katalog von Fehlermustern, der sowohl den Claude Agents als auch später einem ML-Modell dient. Die Debug-Agents können den Katalog als Referenz nutzen.

---

## Phase 2.5 – TM & Agent Workflow Professionalisierung

**Ziel:** Den bestehenden KI-gestützten Entwicklungsworkflow so straffen, dass Analyse- und Implementierungsaufträge in 2-3 durchlaufenden Schritten sauber erledigt werden, ohne dass du ständig manuell eingreifen musst.

### Die Essenz deines aktuellen Workflows

Du arbeitest in einem Dreiklang: Du (als Entscheider) kommunizierst mit dem TM (claude.ai), der strategisch denkt und Aufträge formuliert. Diese Aufträge gehen via Copy/Paste an die VS Code Agents, die sie operativ ausführen. Ergebnisse fließen als Reports zurück.

Das funktioniert, aber es gibt Reibungsverluste: Aufträge müssen teilweise mehrfach nachgeschärft werden, Agents produzieren Reports in unterschiedlichen Formaten, und die Kette "Analyse → Gegenprüfung → Freigabe → Umsetzung" braucht zu viele manuelle Zwischenschritte.

### 2.5.1 Standardisierte Auftragsformate

**Analyseauftrag-Template:**

Jeder Analyseauftrag den der TM formuliert folgt einer festen Struktur, die die Agents ohne Rückfragen verarbeiten können:

```
AUFTRAGSTYP: ANALYSE
SCOPE: [welche Layer / welche Dateien / welcher Bereich]
FOKUS: [was genau untersucht werden soll]
TIEFE: [oberflächlich / standard / tief]
OUTPUT: [erwartetes Report-Format]
KONTEXT: [relevante Vorgeschichte, letzte Änderungen]
ABHÄNGIGKEITEN: [welche Reports/Ergebnisse als Input dienen]
```

**Implementierungsauftrag-Template:**

```
AUFTRAGSTYP: IMPLEMENTIERUNG
SCOPE: [welche Dateien betroffen]
ZIEL: [was soll danach anders sein]
CONSTRAINTS: [was darf NICHT verändert werden]
VALIDIERUNG: [wie wird Erfolg geprüft – Tests, Healthchecks, manuell]
ROLLBACK: [was tun wenn es schiefgeht]
ABHÄNGIG VON: [welcher Analyseauftrag / welche Freigabe]
```

Diese Templates werden Teil der TM Knowledge Base, sodass der TM sie automatisch verwendet.

### 2.5.2 Dreistufige Analyse-Pipeline

Wenn du dem TM sagst "analysiere X", läuft folgender Ablauf:

**Schritt 1 – Erstanalyse (Agent: zuständiger Debug- oder Dev-Agent)**

Agent führt den Analyseauftrag aus, schreibt Report nach `.claude/reports/current/`. Fokus auf Fakten: was ist der IST-Zustand, was wurde gefunden, welche Auffälligkeiten.

**Schritt 2 – Gegenprüfung (Agent: meta-analyst oder zweiter Agent)**

Ein anderer Agent liest den Report aus Schritt 1 und prüft: Sind die Schlussfolgerungen nachvollziehbar? Wurden alle Aspekte des Scopes abgedeckt? Gibt es Widersprüche zu bekannten Patterns (Fehlermuster-Katalog)? Ergänzt oder korrigiert.

**Schritt 3 – Konsolidierung (Agent: system-manager oder TM)**

Zusammenführung zu einem finalen Report mit klarer Empfehlung. Dieser Report geht an dich (via TM) zur Freigabe.

Die Agents brauchen dafür ein einheitliches Report-Format:

```
# [Report-Typ] – [Bereich] – [Datum]
## Status: ERSTANALYSE | GEGENGEPRÜFT | KONSOLIDIERT
## Auftrag: [Referenz zum Originalauftrag]
## Ergebnisse
[Strukturierte Findings]
## Empfehlung
[Konkrete nächste Schritte]
## Offene Fragen
[Was konnte nicht geklärt werden]
```

### 2.5.3 Implementierungs-Pipeline

Nach Freigabe eines Analyseergebnisses:

**Schritt 1 – Plan erstellen (zuständiger Dev-Agent)**

Agent erstellt einen konkreten Implementierungsplan basierend auf der freigegebenen Analyse. Der Plan listet: welche Dateien geändert werden, in welcher Reihenfolge, welche Tests danach laufen müssen.

**Schritt 2 – Plan prüfen (system-manager oder zweiter Agent)**

Gegenprüfung: Ist der Plan vollständig? Konflikte mit anderen Bereichen? Werden die Constraints eingehalten? Sind die Tests ausreichend?

**Schritt 3 – Zurück an dich / TM**

Der geprüfte Plan geht an dich. Du approved oder forderst Änderungen.

**Schritt 4 – Umsetzung (Dev-Agent im Edit-Mode)**

Erst nach expliziter Freigabe wird implementiert. Agent arbeitet den Plan ab, führt Tests aus, schreibt Umsetzungs-Report.

### 2.5.4 Verbesserungen am Agent-System

Damit die Pipelines flüssig laufen, brauchen die Agents folgende Ergänzungen:

**Chain-Awareness:** Jeder Agent muss erkennen, ob er der erste in einer Kette ist (Erstanalyse) oder ob er auf einem vorherigen Report aufbaut (Gegenprüfung). Das lässt sich über ein Feld im Auftrags-Header lösen:

```
CHAIN-POSITION: 1/3 | 2/3 | 3/3
VORHERIGER-REPORT: .claude/reports/current/[filename]
```

**Report-Discovery:** Agents müssen wissen wo Reports liegen und welchen Status sie haben. Dein `/collect-reports` Skill kann erweitert werden, um Reports nach Status zu filtern.

**Fehlermuster-Referenz:** Die Debug-Agents bekommen Zugriff auf den Fehlermuster-Katalog (Phase 2.3) als Referenz. Wenn ein Agent ein bekanntes Pattern findet, referenziert er die Pattern-ID statt das Problem neu zu beschreiben.

### 2.5.5 TM Knowledge Base Update

Der TM bekommt folgende neue Dokumente in seiner Knowledge Base:

- Auftrags-Templates (Analyse + Implementierung)
- Pipeline-Beschreibung (3-Stufen-Ablauf)
- Report-Format-Spezifikation
- Aktuelle Agent-Inventar mit Zuständigkeiten
- Fehlermuster-Katalog (wächst kontinuierlich)

Damit kann der TM Aufträge formulieren, die die Agents ohne Nachfragen verarbeiten, und du bekommst konsistente, geprüfte Ergebnisse zurück.

### Ergebnis Phase 2.5

Du sagst dem TM: "Analysiere den MQTT-Reconnect-Flow zwischen ESP32 und Server." Der TM formuliert einen sauberen Analyseauftrag. Du kopierst ihn in VS Code. Agent 1 analysiert, Agent 2 prüft gegen, Agent 3 konsolidiert. Du bekommst einen fertigen Report mit Empfehlung. Nach deiner Freigabe erstellt ein Dev-Agent den Implementierungsplan, ein zweiter prüft ihn, du approved, und erst dann wird umgesetzt. 2-3 Durchläufe, minimal manuelle Eingriffe, nachvollziehbare Ergebnisse.

---

## Phase 3 – KI-gestütztes Debugging auf dem Jetson

**Ziel:** GPU-beschleunigte, intelligente Debug-Unterstützung auf dem Jetson Orin Nano Super. Der Jetson läuft als reine ML-Inferenz-Box im Netzwerk, empfängt Daten vom Hauptserver (MQTT/REST/Loki), analysiert sie und schickt Ergebnisse zurück.

### Voraussetzungen (aus Phase 1 + 2)

- Monitoring-Stack läuft stabil mit sauberen Labels
- Mindestens 4-8 Wochen Sensor- und Log-Daten gesammelt
- Fehlermuster-Katalog hat 15-20+ dokumentierte Patterns mit Beispiel-Logzeilen
- Prometheus-Metriken-Historie über mehrere Wochen verfügbar

### 3.1 Hardware: Jetson Orin Nano Super Dev Kit

NVIDIA Jetson Orin Nano Super Dev Kit (~280-320€ inkl. Import). 67 TOPS, 8GB RAM, 1024 CUDA Cores, 32 Tensor Cores. Als reine ML-Box mit 2-3 GB für Modelle und 5 GB Headroom mehr als ausreichend – selbst mit allen unten beschriebenen Modellen parallel. Carrier Board ist kompatibel mit Orin NX 16GB Modul, falls später ein Upgrade gewünscht wird.

Aufsetzen: JetPack 6.2.1 (Ubuntu 22.04), Docker mit `--runtime nvidia`, Netzwerkverbindung zum Hauptserver. Der Jetson braucht keinen eigenen Docker-Stack – nur die ML-Container.

### 3.2 ML-Debugging-Methoden – Gesamtübersicht

Alle folgenden Methoden laufen als eigenständige Docker-Container auf dem Jetson. Jeder Container empfängt Daten vom Hauptserver und schickt Ergebnisse zurück (MQTT-Topic `ao/ml/{method}/results` oder REST-Endpoint auf El Servador).

---

#### 3.2.1 Log-Klassifikation (überwacht)

**Was es tut:** Liest jede Log-Zeile in Echtzeit und ordnet sie einem bekannten Fehlermuster aus dem Katalog zu.

**Wie es funktioniert:** Trainiert mit dem Fehlermuster-Katalog aus Phase 2 als gelabelte Trainingsdaten. Pro Fehler-Kategorie 20-50 Beispiel-Logzeilen reichen. Modell: fastText oder kleines DistilBERT, wenige MB groß, Inferenz <1ms pro Zeile.

**Mehrwert gegenüber Regex:** Erkennt Variationen die nicht explizit definiert sind. Neuer ESP32-Typ mit leicht anderer Fehlermeldung → Regex versagt, ML-Modell erkennt die Ähnlichkeit.

**Output:** `{log_line, predicted_pattern: "MQTT_RECONNECT_LOOP", confidence: 0.87}`

**Wann starten:** Sofort nach Phase 2 (braucht gelabelte Daten).

---

#### 3.2.2 Anomalie-Erkennung auf Logs (unüberwacht)

**Was es tut:** Erkennt Log-Zeilen die "nicht normal" sind, ohne die Fehler-Kategorien zu kennen. Fängt unbekannte Probleme, die noch nicht im Katalog stehen.

**Wie es funktioniert:** Autoencoder oder Isolation Forest, trainiert nur auf normalen Logs (der Großteil des Outputs). Alles was vom gelernten "Normal" abweicht, bekommt einen Anomalie-Score.

**Mehrwert:** Komplementär zur Klassifikation. Klassifikator sagt "bekanntes Problem X". Anomalie-Detektor sagt "unbekanntes Problem, bitte untersuchen." Zusammen decken sie alles ab.

**Output:** `{log_line, anomaly_score: 0.94, is_anomaly: true}`

**Wann starten:** Sofort nach Phase 1 (braucht nur "normale" Logs als Baseline, keine Labels).

---

#### 3.2.3 Cross-Layer-Korrelation

**Was es tut:** Erkennt kausale Ketten über mehrere Container hinweg. Beispiel: ESP32 sendet langsamer → MQTT-Queue steigt → El Servador Timeout → Frontend zeigt Stale Data. Ein Mensch muss vier Log-Streams parallel lesen – dieses Modell sieht die Zusammenhänge automatisch.

**Wie es funktioniert:** Temporal Convolutional Network (TCN) oder einfaches LSTM. Input: Zeitfenster (60s) mit Features aus allen Layern (Error-Count, Latenz, Message-Rate pro Container). Output: erkanntes Anomalie-Cluster mit wahrscheinlichem Ursprungs-Layer.

**Daten-Voraussetzung:** 10-15 dokumentierte Fehler-Kaskaden mit Timestamps aus dem Fehlermuster-Katalog (das `correlation_window` Feld).

**Output:** `{time_window, cluster_detected: true, probable_origin: "firmware", affected_layers: ["broker", "backend", "frontend"], confidence: 0.78}`

**Wann starten:** Nach Phase 2 (braucht dokumentierte Kaskaden).

---

#### 3.2.4 Sequenz-Pattern-Mining

**Was es tut:** Entdeckt automatisch Fehler-Kaskaden: "Wenn Event A passiert, folgt in 80% der Fälle Event B innerhalb von 30 Sekunden." Lernt die Regeln selbstständig aus der Log-Historie.

**Wie es funktioniert:** PrefixSpan oder Markov-Chain-Ansatz über die Log-Historie. Kein Training im klassischen Sinne – der Algorithmus findet die Patterns selbst.

**Echtzeit-Anwendung:** Modell beobachtet den Log-Stream und sagt voraus: "MQTT_DISCONNECT gerade aufgetreten → erwarte SENSOR_TIMEOUT in ~5s, erwarte BACKEND_RETRY in ~12s." Wenn erwartete Folgefehler ausbleiben, ist das ebenfalls bemerkenswert.

**Output:** `{trigger_event: "MQTT_DISCONNECT", predicted_sequence: [{event: "SENSOR_TIMEOUT", expected_in_s: 5, probability: 0.80}, {event: "BACKEND_RETRY", expected_in_s: 12, probability: 0.73}]}`

**Wann starten:** Nach Phase 1 + einige Wochen Log-Historie.

---

#### 3.2.5 Predictive Failure Detection

**Was es tut:** Warnt bevor ein Fehler auftritt. Lernt die "Vorboten" eines Ausfalls. Beispiel: bevor ein ESP32 die WiFi-Verbindung verliert, sinkt die RSSI-Stärke über 2 Minuten und Antwortzeiten steigen leicht.

**Wie es funktioniert:** Zeitreihen-Forecasting (Prophet, DeepAR, oder kleines LSTM) auf Prometheus-Metriken. Prognostiziert die nächsten N Minuten und warnt wenn die Prognose in einen kritischen Bereich läuft.

**Daten-Voraussetzung:** Metriken-Historie über Wochen und genug dokumentierte Ausfälle um das Muster "Vorbote → Ausfall" zu lernen. Sammelt sich in Phase 1+2 automatisch an.

**Output:** `{metric: "esp32_01_rssi", current: -72, predicted_5min: -85, threshold: -80, alert: "WiFi-Verlust wahrscheinlich in ~3min"}`

**Wann starten:** Frühestens Monat 2-3 (braucht ausreichend Metriken + Ausfälle).

---

#### 3.2.6 Metrik-Korrelation

**Was es tut:** Findet automatisch welche Metriken zusammenhängen. "Wenn PostgreSQL-Query-Dauer über 200ms steigt, steigt 10s später die Frontend-Error-Rate." Oder: "CPU-Last auf Container X korreliert mit MQTT-Message-Rate, aber nur wenn >3 ESP32s gleichzeitig senden."

**Wie es funktioniert:** Granger-Kausalität, Dynamic Time Warping, oder Korrelations-Screening über Prometheus-Zeitreihen. Läuft periodisch (z.B. stündlich) als Batch-Job.

**Output:** Abhängigkeitskarte des Systems – welche Metrik beeinflusst welche andere, mit Zeitverzögerung und Konfidenz. In Grafana als Heatmap visualisierbar.

**Wann starten:** Nach Phase 1 + 2-4 Wochen Prometheus-Daten.

---

#### 3.2.7 Log-Clustering

**Was es tut:** Gruppiert alle Logs automatisch nach Ähnlichkeit – nicht nach vordefinierten Kategorien, sondern selbstständig. Entdeckt Fehlerklassen die noch nicht im Katalog stehen.

**Wie es funktioniert:** DBSCAN oder HDBSCAN auf Log-Embeddings (jede Zeile wird via Sentence-BERT in einen Vektor umgewandelt, dann geclustert). Läuft als täglicher Batch-Job.

**Output:** "12 Cluster gefunden. 8 matchen bekannte Patterns. 4 sind neu – hier sind Beispiele." Neue Cluster werden dir vorgeschlagen, du entscheidest ob sie in den Fehlermuster-Katalog aufgenommen werden.

**Mehrwert:** Automatische Erweiterung des Fehlermuster-Katalogs. Feedback-Loop: neue Cluster → du labelst sie → Klassifikator (3.2.1) wird besser.

**Wann starten:** Nach Phase 1 (braucht nur Log-Historie, keine Labels).

---

#### 3.2.8 Drift Detection

**Was es tut:** Erkennt wenn sich das Systemverhalten schleichend ändert, ohne dass einzelne Fehler auffallen. Beispiel: durchschnittliche Sensor-Update-Rate sinkt über Wochen um 15%, oder die Verteilung der MQTT-Payload-Größen verschiebt sich.

**Wie es funktioniert:** Statistische Drift-Detektoren (Page-Hinkley, ADWIN) auf Metriken-Streams. Vergleicht laufend aktuelle Verteilungen mit der gelernten Baseline.

**Output:** `{metric: "el_servador_response_time", drift_detected: true, baseline_mean: 45ms, current_mean: 68ms, drift_since: "2026-03-15", significance: 0.95}`

**Wann starten:** Nach Phase 2 (braucht stabile Baseline über Wochen).

---

### 3.3 Zusammenspiel der Methoden

Die acht Methoden ergänzen sich zu einem vollständigen Debug-Assistenten:

| Frage | Methode |
|-------|---------|
| "Was ist das für ein Fehler?" | Log-Klassifikation (3.2.1) |
| "Ist das normal?" | Anomalie-Erkennung (3.2.2) |
| "Welche Container hängen zusammen?" | Cross-Layer-Korrelation (3.2.3) |
| "Was kommt als nächstes?" | Sequenz-Pattern-Mining (3.2.4) |
| "Wird etwas bald ausfallen?" | Predictive Failure (3.2.5) |
| "Welche Metriken beeinflussen sich?" | Metrik-Korrelation (3.2.6) |
| "Gibt es unbekannte Fehlertypen?" | Log-Clustering (3.2.7) |
| "Hat sich etwas schleichend verändert?" | Drift Detection (3.2.8) |

### 3.4 Empfohlene Reihenfolge auf dem Jetson

1. **Sofort:** Log-Klassifikation + Anomalie-Erkennung (Basis-Duo, deckt bekannte und unbekannte Fehler ab)
2. **Nach 2-4 Wochen:** Log-Clustering + Sequenz-Pattern-Mining (erweitert den Katalog, findet Kaskaden)
3. **Nach 1-2 Monaten:** Cross-Layer-Korrelation + Metrik-Korrelation (systemweites Verständnis)
4. **Nach 2-3 Monaten:** Predictive Failure + Drift Detection (proaktive Überwachung)

Alle acht Modelle zusammen brauchen geschätzt 2-3 GB RAM auf dem Jetson. Bei 8 GB Gesamtspeicher bleiben 5 GB Headroom – kein Ressourcen-Stress.

### 3.5 Integration in Grafana

Alle ML-Ergebnisse fließen zurück an El Servador und werden als Metriken/Annotations in Grafana sichtbar. Ein dediziertes "ML Debug Assistant" Dashboard zeigt: aktive Klassifikationen, Anomalie-Alerts, vorhergesagte Fehler-Kaskaden, Drift-Warnungen, und neue entdeckte Cluster. Die ML-Ergebnisse ergänzen die rohen Logs – du siehst nicht nur was passiert ist, sondern was es bedeutet.

### Ergebnis Phase 3

Der Jetson läuft 24/7 als intelligenter Debug-Assistent neben deinem Hauptserver. Er erkennt bekannte Fehler automatisch, warnt bei unbekannten Anomalien, sagt Folgefehler vorher, entdeckt neue Fehlerklassen selbstständig, und bemerkt schleichende Veränderungen die dir sonst entgehen würden. Dein manueller Debug-Aufwand sinkt massiv – du reagierst nur noch auf konsolidierte, klassifizierte Hinweise statt rohe Logs zu durchforsten.

---

## Zeitliche Einordnung (grobe Schätzung)

| Phase | Dauer | Abhängig von |
|-------|-------|-------------|
| Phase 1 – Monitoring Stack | 2-4 Wochen | – |
| Phase 2 – Alerting & Wissensbasis | 2-3 Wochen + fortlaufend | Phase 1 abgeschlossen |
| Phase 2.5 – Workflow-Professionalisierung | 2-3 Wochen | Kann parallel zu Phase 2 laufen |
| Phase 3a – Jetson Setup + Basis-ML | 2-3 Wochen | Phase 1+2, Hardware vorhanden |
| Phase 3b – Erweiterte ML-Methoden | 4-8 Wochen, schrittweise | Phase 3a + Wochen an Daten-Historie |

Phase 2 (Fehlermuster-Katalog) und Phase 2.5 (Workflow) können teilweise parallel laufen. Phase 3 ist bewusst am Ende, weil sie die Daten und Patterns aus Phase 1+2 braucht. Die ML-Methoden in Phase 3 werden schrittweise aktiviert – nicht alles auf einmal.

---

## Zusammenfassung der Deliverables pro Phase

**Phase 1:** `docker-compose.monitoring.yml`, Promtail-Config, Grafana-Dashboard JSON, ESP32 Debug-MQTT-Implementation, ser2net-Container (permanenter Stack-Bestandteil)

**Phase 2:** Grafana Alert Rules, LogQL-Metriken, Fehlermuster-Katalog (`.claude/reference/errors/PATTERNS.yaml`), Label-Taxonomie-Dokument

**Phase 2.5:** Auftrags-Templates, Pipeline-Dokumentation, Report-Format-Spec, Agent-Updates (Chain-Awareness, Report-Discovery), TM Knowledge Base Update

**Phase 3a:** Jetson Orin Nano Super Setup (JetPack, Docker, Netzwerk), Log-Klassifikator Container, Anomalie-Erkennungs-Container, MQTT-Anbindung an Hauptserver, Grafana ML-Dashboard

**Phase 3b:** Sequenz-Pattern-Mining Container, Cross-Layer-Korrelation Container, Log-Clustering Batch-Job, Metrik-Korrelation Batch-Job, Predictive Failure Container, Drift Detection Container