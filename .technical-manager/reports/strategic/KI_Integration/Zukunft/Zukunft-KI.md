# AutomationOne – Vision: KI-Integration in modularer IoT-Automatisierung

## Das Problem

### Die Realität in Gewächshäusern und Produktionsumgebungen

Wer heute ein Gewächshaus, eine Fertigungsanlage oder ein beliebiges Automatisierungssystem mit Sensorik und Aktorik betreiben will, steht vor einem Markt der in zwei Extreme zerfällt.

Auf der einen Seite stehen proprietäre Komplettsysteme. Sie kommen mit eigener Hardware, eigener Software, eigenen Cloud-Plattformen. Die Oberflächen sehen professionell aus – poliert, mit Dashboards und Graphen. Aber sobald der Anwender etwas tun will, das der Hersteller nicht vorgesehen hat, stößt er an Wände. Ein neuer Sensortyp? Nur wenn der Hersteller ihn unterstützt. Daten exportieren? Vielleicht, über eine limitierte API, in einem Format das der Hersteller vorgibt. KI-Auswertung der eigenen Betriebsdaten? Nur über die Cloud des Anbieters, mit deren Modellen, zu deren Preisen, nach deren Regeln. Der Anwender hat ein System das funktioniert, aber er hat keine Kontrolle darüber.

Auf der anderen Seite stehen Open-Source-Bastellösungen. Raspberry Pi mit ein paar Sensoren, Home Assistant, Node-RED. Flexibel, billig, erweiterbar. Aber ab einer gewissen Komplexität – mehrere Zonen, dutzende Sensoren, Aktorsteuerung, Fehlerbehandlung, Nutzerverwaltung – bricht alles zusammen. Es gibt kein einheitliches Datenmodell, keine durchgängige Fehlerbehandlung, keine Skalierung. Und KI-Integration bedeutet hier: ein Python-Script das irgendwo läuft und dessen Ergebnisse per MQTT an einen Broker geschickt werden, ohne Validierung, ohne Permissions, ohne dass der Anwender versteht was passiert.

### Konkrete Schmerzpunkte

**Sensoren sind teuer und unflexibel.** Industrielle Gewächshaus-Sensorik kostet hunderte Euro pro Messpunkt. Die Installation ist aufwendig, die Integration herstellergebunden. Für das Trainieren von KI-Modellen braucht man anfangs viele Messpunkte – Temperatur, Luftfeuchtigkeit, Bodenfeuchte, CO2, Licht, in feiner Auflösung über jede Zone. Aber nach einem Jahr Datensammlung und einem trainierten Modell reichen oft ein Bruchteil der Sensoren, weil das Modell gelernt hat, aus wenigen Inputs die restlichen Parameter abzuleiten. Kein existierendes System unterstützt diesen natürlichen Lebenszyklus: viele Sensoren zum Lernen aufbauen, dann gezielt reduzieren und das Modell mit weniger Inputs weiterarbeiten lassen.

**Frontends sind entweder hübsch oder nützlich, selten beides.** Professionelle Systeme haben aufwendige Oberflächen die toll aussehen, aber dem Anwender wenig Handlungsspielraum geben. Billige Lösungen haben Oberflächen die alles können aber niemand bedienen will. Das eigentliche Problem ist tiefer: die meisten Frontends sind nicht für den Menschen gebaut der das Gewächshaus tatsächlich betreibt. Sie sind entweder für Ingenieure (zu technisch) oder für Marketing (zu oberflächlich).

**KI-Integration ist eine Blackbox.** Wer seine Betriebsdaten mit KI auswerten will, steht vor mehreren Hürden gleichzeitig. Die Daten liegen in einem Format vor das kein KI-Tool direkt versteht. Es gibt keine einfache Möglichkeit, bestimmte Datenbereiche auszuwählen – "nimm die Temperaturdaten aus Zone 3 von März bis Juni, aber nur die Tageswerte, und korreliere sie mit der Bewässerungsfrequenz." Das muss ein Data Scientist machen, manuell, mit Jupyter Notebooks und SQL-Queries. Und selbst wenn ein Modell trainiert ist, gibt es keinen standardisierten Weg, es zurück ins System zu bringen, es mit Live-Daten zu füttern, seine Ergebnisse zu validieren, und dem Anwender verständlich zu machen was es tut.

**Keine Lösung bietet echte Kontrolle über KI-Entscheidungen.** Wenn eine KI sagt "schalte die Bewässerung ab", wer entscheidet ob das passiert? In den meisten Systemen: entweder die KI alleine (gefährlich) oder der Mensch muss jede Einzelentscheidung bestätigen (unbenutzbar). Es gibt keinen Mittelweg – kein System das sagt: "Diese KI darf die Belüftung in Zone 1 steuern wenn die Konfidenz über 85% liegt, aber die Bewässerung nur mit manueller Bestätigung."

---

## Die Lösung: AutomationOne

### Kern-Philosophie

AutomationOne ist ein vollständig modulares IoT-Automatisierungsframework, das von der Hardware bis zur KI-Orchestrierung durchgängig auf vier Prinzipien aufgebaut ist:

**1. Alles ist modular, alles ist optional.**
Jede Komponente – von einem einzelnen Sensor über eine Zone bis hin zum gesamten KI-Layer – kann hinzugefügt, entfernt, ausgetauscht oder skaliert werden, ohne dass der Rest des Systems davon betroffen ist. Das System funktioniert mit einem ESP32 und einem Temperatursensor genauso wie mit hundert Geräten in zwanzig Zonen. Und es funktioniert komplett ohne KI – die KI-Integration ist ein optionaler Layer, der auf einer bereits funktionierenden Infrastruktur aufsetzt.

**2. Der Anwender behält die Kontrolle.**
Kein automatisierter Prozess läuft ohne explizite Erlaubnis. Der Anwender definiert was welche KI darf, welche Daten sie sehen kann, welche Geräte sie steuern darf, und unter welchen Bedingungen. Das gilt für Cloud-KI-Services genauso wie für lokale Modelle.

**3. Die Infrastruktur ist dieselbe für alle Funktionen.**
Ob ein Sensorwert im Dashboard angezeigt, in einer Datenbank gespeichert, von einer Alert-Regel ausgewertet, oder an ein KI-Modell übergeben wird – er fließt durch dieselben Kanäle, wird vom selben System validiert und verwaltet. Die KI bekommt keine Sonderbehandlung, sie ist ein Consumer wie jeder andere.

**4. Günstige, austauschbare Hardware.**
ESP32-Mikrocontroller statt proprietärer Sensormodule. Standardsensoren (DHT22, BMP280, Bodenfeuchte-Module) die für wenige Euro erhältlich sind. Die Hardware ist bewusst "dumm" – alle Intelligenz sitzt im Server. Ein defekter ESP32 wird für 5€ ersetzt, nicht für 500€.

### Architektur-Übersicht

Das System besteht aus vier Schichten, die aufeinander aufbauen aber unabhängig voneinander funktionieren:

**Layer 1 – El Trabajante (ESP32 Firmware, C++/PlatformIO)**
Die Geräte im Feld. Sensoren lesen, Aktoren steuern, Daten per MQTT an den Server senden. Keine eigene Logik – die ESPs tun was der Server ihnen sagt. Jedes Gerät meldet sich am System an, wird einer Zone zugeordnet, und bekommt seine Konfiguration vom Server. Wenn ein ESP32 ausfällt, weiß der Server das innerhalb von Sekunden (Heartbeat-System) und meldet es.

**Layer 2 – El Servador (FastAPI Backend, Docker-Stack)**
Das Herz des Systems. Empfängt alle Sensordaten, steuert alle Aktoren, verwaltet alle Zonen, speichert alles in PostgreSQL, bietet REST-APIs für das Frontend, und bedient WebSockets für Echtzeit-Updates. Dazu ein vollständiger Docker-Stack: MQTT-Broker (Mosquitto), Datenbank, Monitoring (Prometheus, Grafana, Loki). Alles was das System "weiß" und "kann" sitzt hier.

**Layer 3 – El Frontend (Vue 3, Vuetify)**
Die Schnittstelle zum Anwender. Zeigt Sensordaten, erlaubt Aktorsteuerung, visualisiert Zonen, verwaltet Geräte. Perspektivisch: KI-Service-Management, Pipeline-Builder, Permission-Konfiguration, und nutzerdefinierte Dashboards.

**Layer 4 – KI-Orchestrierung (optional)**
Externe KI-Services (OpenAI, Claude, Ollama, beliebige REST-APIs) und lokale ML-Modelle (Jetson) die an denselben Datenströmen hängen wie der Rest des Systems, aber über eigene Adapter, eigene Pipelines und eigene Permissions gesteuert werden.

---

## KI-Integration: Wie es ins System passt

### Das Grundprinzip: KI als Service-Consumer

Die wichtigste Designentscheidung ist, dass KI im System keine Sonderrolle einnimmt. Ein KI-Modell das Anomalien erkennt ist architektonisch nicht anders als eine Grafana-Alert-Rule die einen Schwellwert überwacht. Beides konsumiert Daten aus denselben Quellen (MQTT, PostgreSQL, Prometheus), beides produziert Ergebnisse die über dieselben Kanäle fließen (REST-API, WebSocket, MQTT), und beides unterliegt denselben Zugriffskontrollmechanismen.

Das bedeutet konkret: Der KI-Layer hat keinen direkten Zugriff auf Hardware. Er kann keinen ESP32 direkt ansprechen, keinen Aktor direkt schalten. Er geht immer über El Servador – denselben Weg den auch das Frontend oder die Logik-Engine nehmen. El Servador validiert, prüft Permissions, loggt, und führt dann aus. Die KI ist ein Auftraggeber, nicht ein Ausführender.

### Externe Services und lokale Modelle: Gleicher Adapter, verschiedene Endpoints

Das System unterscheidet nicht grundsätzlich zwischen einer Cloud-API (OpenAI, Claude) und einem lokalen Modell auf einem Jetson im selben Netzwerk. Beides ist ein externer Service der über einen Adapter angesprochen wird. Der Adapter abstrahiert die Verbindung – ob der HTTP-Request an api.openai.com oder an 192.168.1.50:8080 geht, ist für den Rest des Systems irrelevant.

Das hat weitreichende Konsequenzen. Der Anwender kann jederzeit zwischen Anbietern wechseln, ohne dass sich an seinen Pipelines etwas ändert. Er kann für verschiedene Aufgaben verschiedene Services nutzen – einen Cloud-LLM für komplexe Textanalyse, ein lokales Modell auf dem Jetson für Echtzeit-Anomalie-Erkennung, und einen eigenen REST-Endpoint für spezialisierte Berechnungen. Und wenn morgen ein neuer KI-Anbieter auftaucht, braucht es nur einen neuen Adapter – nicht eine Neuarchitektur.

Besonders wichtig: der Generic-REST-Adapter. Damit kann der Anwender jeden beliebigen HTTP-Endpoint einbinden, ohne dass dafür ein spezifischer Adapter programmiert werden muss. Er konfiguriert Request-Format, Response-Parsing und Authentifizierung über die Web-Oberfläche. Das ist maximale Erweiterbarkeit ohne Code-Änderungen.

### Daten-Pipelines: Vom Sensor zur KI-Entscheidung

Der Datenfluss im System ist: Trigger → Plugin → Aktion.

Ein **Trigger** ist ein Ereignis das eine Pipeline startet. Das kann ein Sensorwert sein ("Temperatur in Zone 3 über 28°C"), ein Zeitintervall ("alle 15 Minuten"), oder ein manueller Auslöser ("Anwender drückt Analyse-Button"). Trigger nutzen dieselbe Dateninfrastruktur die schon für das Alerting und die Logik-Engine existiert – MQTT-Subscriptions, Prometheus-Queries, Cron-ähnliche Scheduler.

Ein **Plugin** ist die KI-Aufgabe. Anomalie-Erkennung, Predictive Maintenance, Textanalyse, Bildklassifikation – jedes Plugin definiert was es braucht (Input-Schema) und was es liefert (Output-Schema). Es weiß nicht welcher Service dahinter steht – das wird über die Pipeline-Konfiguration zugeordnet. Dasselbe Anomalie-Plugin kann heute mit OpenAI laufen und morgen mit einem lokalen Modell, ohne Änderung am Plugin selbst.

Eine **Aktion** ist was mit dem Ergebnis passiert. Speichern in der Datenbank (automatisch), Anzeige im Frontend (via WebSocket), Aktor-Steuerung (nur mit Permission), Alert (Webhook, Email, Notification), oder Weiterleitung an eine andere Pipeline.

Der Anwender baut diese Pipelines über die Web-Oberfläche zusammen. Kein Code, keine Konfigurationsdateien. Er wählt den Trigger, das Plugin, den Service, und die Aktionen. Das System validiert die Konfiguration bevor es sie aktiviert.

### Das Permission-System: Kontrolle über KI-Handlungen

Hier trennt sich AutomationOne fundamental von anderen Ansätzen. Keine KI-Aktion die physische Geräte betrifft läuft ohne explizite, granulare Erlaubnis.

Permissions werden pro Pipeline und pro Gerät definiert. "Pipeline 'Klimasteuerung Zone 3' darf den Lüftungsmotor an ESP32_07 steuern, wenn die Konfidenz des KI-Ergebnisses über 85% liegt." Das bedeutet: der Anwender entscheidet nicht nur ob eine KI steuern darf, sondern welche KI, welches Gerät, und unter welchen Bedingungen.

Darunter liegt ein abgestuftes Modell:

Stufe 1 – **Nur Empfehlung.** Die KI analysiert, El Servador speichert das Ergebnis, das Frontend zeigt es dem Anwender. Keine automatische Aktion. Der Anwender entscheidet.

Stufe 2 – **Automatisch mit Schwellwert.** Die KI analysiert, und wenn die Konfidenz über dem vom Anwender gesetzten Schwellwert liegt, wird die Aktion automatisch ausgeführt. Unter dem Schwellwert: Empfehlung an den Anwender.

Stufe 3 – **Voll automatisch.** Die KI analysiert und handelt. Aber auch hier: nur für die Geräte und Aktionen die der Anwender explizit freigegeben hat. Und jede Aktion wird geloggt, mit Konfidenz-Score, Kontext-Daten, und Zeitstempel.

Entscheidend ist: das Permission-System nutzt dieselbe Infrastruktur die schon für die Benutzerrollenverwaltung existiert. Es ist keine separate Sicherheitsschicht die parallel zum bestehenden System läuft, sondern eine Erweiterung derselben Mechanismen.

### Datenauswahl und Modelltraining: Die vergessene Schnittstelle

Ein Kernproblem das die meisten Systeme ignorieren: wie kommt der Anwender von "ich habe Daten" zu "ich habe ein trainiertes Modell"?

In AutomationOne ist die Datenauswahl ein integraler Bestandteil des Systems, nicht ein nachgelagerter Export-Schritt. Der Anwender kann über das Frontend gezielt Datenbereiche selektieren:

**Zeitlich:** "Sensordaten von März bis Juni 2025"
**Räumlich:** "Nur Zone 3 und Zone 5"
**Parametrisch:** "Temperatur, Luftfeuchtigkeit und Bewässerungszyklen, aber nicht Licht"
**Qualitativ:** "Nur Zeiträume ohne bekannte Sensorausfälle" (nutzt die Error-Code-Datenbank)
**Kontextbezogen:** "Nur während der vegetativen Phase" (nutzt das Context-System)

Diese Selektion passiert auf Ebene der bestehenden Dateninfrastruktur – PostgreSQL-Queries mit den vorhandenen Indizes, gefiltert nach Zonen, Geräten und Zeiträumen die das System bereits verwaltet. Es muss nichts Neues gebaut werden für die Datenauswahl – die Struktur ist schon da, es braucht nur eine Frontend-Oberfläche die es dem Anwender zugänglich macht.

Das selektierte Dataset kann dann an einen KI-Service übergeben werden – zum Training, zum Fine-Tuning, oder zur Analyse. Ob das Training auf einem Cloud-Service, auf dem lokalen Jetson, oder auf einem separaten Rechner stattfindet, ist dem System egal. Das Ergebnis – ein trainiertes Modell oder eine Konfiguration – kommt über denselben Adapter-Mechanismus zurück ins System.

Besonders wichtig: der Anwender versteht was er selektiert. Keine SQL-Queries, keine Jupyter-Notebooks. Stattdessen eine Oberfläche die seine Sprache spricht: Zonen, Sensoren, Zeiträume, Phasen. Das System übersetzt das in die technische Abfrage.

### Der Sensor-Lebenszyklus: Aufbauen, Lernen, Reduzieren

AutomationOne ist architektonisch darauf ausgelegt, dass sich die Hardware-Konfiguration über die Zeit ändert. Das ist kein Edge-Case, das ist der Normalfall.

**Phase 1 – Aufbauen:** Viele günstige Sensoren in allen Zonen. Maximale Datenabdeckung. Das System registriert jedes Gerät, ordnet es Zonen zu, validiert die Datenströme. Die Error-Code-Datenbank und das Heartbeat-System stellen sicher dass defekte Sensoren sofort erkannt werden.

**Phase 2 – Lernen:** KI-Modelle werden mit den gesammelten Daten trainiert. Der Anwender selektiert Trainingsdaten über die Frontend-Oberfläche. Modelle laufen als Pipelines im System und ihre Ergebnisse werden gegen die realen Sensordaten validiert – automatisch, über dieselbe Monitoring-Infrastruktur.

**Phase 3 – Reduzieren:** Das trainierte Modell hat gelernt, aus wenigen Inputs die restlichen Parameter abzuleiten. Der Anwender entfernt Sensoren. Im System: Gerät wird deaktiviert, Zone-Konfiguration aktualisiert, Pipeline läuft mit reduzierten Inputs weiter. Das Modell übernimmt die Rolle der entfernten Sensoren – es liefert geschätzte Werte die im Frontend genauso angezeigt werden wie gemessene, aber klar als "KI-geschätzt" markiert.

Das Entscheidende: dieser Abbau ist genauso einfach wie der Aufbau. Sensor entfernen, System bestätigt, Pipeline passt sich an. Kein Neutraining nötig wenn das Modell auf Robustheit gegenüber fehlenden Inputs trainiert wurde. Und wenn der Anwender merkt dass ein bestimmter Sensor doch fehlt, fügt er ihn wieder hinzu – genauso einfach.

Diese Fähigkeit zum dynamischen Skalieren in beide Richtungen ist tief in der Architektur verankert. Die Zonierung, die Geräteverwaltung, die Sensor-Registry, die Logik-Engine, die Datenbank-Struktur – alles ist darauf ausgelegt, dass Geräte kommen und gehen. Die KI-Integration erbt diese Eigenschaft automatisch, weil sie auf derselben Infrastruktur aufsetzt.

---

## Was bei der Integration unbedingt beachtet werden muss

### Trennung von Daten-Infrastruktur und KI-Logik

Die größte Gefahr bei der KI-Integration ist, dass KI-spezifischer Code in die bestehenden Schichten einsickert. Wenn die MQTT-Handler plötzlich KI-spezifische Felder verarbeiten, wenn das Datenbank-Schema KI-Tabellen mit Sensor-Tabellen vermischt, wenn das Frontend KI-Widgets nicht von Standard-Widgets unterscheiden kann – dann verliert das System seine wichtigste Eigenschaft: die Modularität.

Deshalb gilt: der KI-Layer hat sein eigenes Verzeichnis, seine eigenen Datenbankmodelle, seine eigenen API-Endpoints, seine eigenen Frontend-Komponenten. Er liest aus denselben Datenquellen wie der Rest des Systems, aber er schreibt in seine eigenen Tabellen. Er nutzt dieselben WebSocket-Kanäle für Echtzeit-Updates, aber seine Nachrichten haben eigene Event-Typen. Er folgt denselben Patterns (Adapter, Registry, Service, Repository), aber in seinem eigenen Namespace.

Das klingt nach Mehraufwand, aber es ist die Voraussetzung dafür, dass das System auch ohne KI vollständig funktioniert, und dass der KI-Layer ausgetauscht, erweitert oder entfernt werden kann ohne den Rest zu berühren.

### Keine KI-Aktion ohne Audit-Trail

Jede Entscheidung die eine KI trifft muss nachvollziehbar sein. Das bedeutet: welcher Service wurde aufgerufen, mit welchen Input-Daten, was war das Ergebnis, welche Konfidenz hatte es, welche Aktion wurde ausgelöst, und wurde die Aktion tatsächlich ausgeführt oder vom Permission-System abgelehnt.

Das ist kein Feature, das ist eine Grundvoraussetzung. In einer Produktionsumgebung muss der Anwender jederzeit nachvollziehen können warum ein Aktor geschaltet wurde. War es eine manuelle Aktion vom Frontend? Eine Logik-Engine-Regel? Oder eine KI-Entscheidung? Und wenn KI: mit welchen Daten, welchem Modell, welcher Konfidenz?

Die Monitoring-Infrastruktur (Loki, Prometheus, Grafana) die bereits geplant ist, liefert den technischen Unterbau dafür. Die KI-Container loggen ihre Entscheidungen strukturiert, Promtail sammelt sie, Loki macht sie durchsuchbar, Grafana macht sie sichtbar. Das Error-Code-System wird um KI-spezifische Codes erweitert. Der Anwender sieht im Frontend: "Lüftung Zone 3 geöffnet – Auslöser: KI-Pipeline 'Klimasteuerung', Konfidenz 92%, Basis: Temperaturwerte der letzten 30 Minuten."

### Graceful Degradation: Was passiert wenn die KI ausfällt?

Wenn der Cloud-KI-Service nicht erreichbar ist. Wenn der Jetson abstürzt. Wenn das Modell unplausible Ergebnisse liefert. Was dann?

Das System muss in jedem dieser Fälle weiter funktionieren. Sensoren messen weiter, El Servador verarbeitet weiter, das Frontend zeigt weiter an, die Logik-Engine-Regeln greifen weiter. Der KI-Layer ist per Definition optional – das muss auch im Fehlerfall gelten.

Konkret bedeutet das: Pipelines haben Timeout-Mechanismen. Wenn ein Service nicht antwortet, wird die Aktion nicht ausgeführt – nicht verzögert, nicht gepuffert, sondern übersprungen, mit einem klaren Log-Eintrag und optional einem Alert. Das System fällt auf die nächstniedrigere Automatisierungsstufe zurück: von KI-gesteuert auf regelbasiert (Logik-Engine), von regelbasiert auf manuell (Frontend-Steuerung).

Dasselbe gilt für die Plausibilitätsprüfung. Wenn ein Modell sagt "Temperatur wird in 5 Minuten auf 60°C steigen" obwohl der aktuelle Wert bei 22°C liegt, muss das System das abfangen. Nicht durch eine allgemeine Prüfung ("ist der Wert realistisch?"), sondern durch die bestehende Infrastruktur: die Logik-Engine kennt die physikalischen Grenzen jedes Sensors (konfiguriert pro Sensortyp), und wenn ein KI-Ergebnis außerhalb dieser Grenzen liegt, wird es markiert, geloggt, und dem Anwender zur Entscheidung vorgelegt.

### API-Keys und sensible Daten

Externe KI-Services brauchen API-Keys. Diese Keys dürfen niemals im Klartext in der Datenbank liegen, niemals in Logs auftauchen, niemals über die REST-API zurückgegeben werden. Verschlüsselung in der Datenbank (AES-256 oder ähnlich, mit einem Server-seitigen Key), Maskierung in Logs und API-Responses, und eine klare Trennung: der Key wird einmal eingegeben und danach nie wieder angezeigt – nur "Key vorhanden: Ja/Nein" und ein "Testen"-Button.

Das gilt genauso für Betriebsdaten die an externe Services gesendet werden. Der Anwender muss wissen und kontrollieren können, welche Daten sein System an welchen Service schickt. Die Pipeline-Konfiguration macht das transparent: sie zeigt explizit welche Datenfelder im Request enthalten sind. Und für besonders sensible Umgebungen: die Möglichkeit, bestimmte Datenfelder zu anonymisieren oder zu aggregieren bevor sie das System verlassen.

### Versionierung und Rollback

Wenn eine Pipeline-Konfiguration geändert wird, wenn ein neues Modell deployed wird, wenn Permissions angepasst werden – all das muss versioniert sein. Nicht im Sinne eines vollständigen Git-Repositories, aber mindestens: wer hat wann was geändert, und die Möglichkeit zur vorherigen Version zurückzukehren.

Das bestehende Datenbank-Schema mit `created_at`, `updated_at` und Alembic-Migrations liefert den Unterbau. Was dazukommt: ein `version`-Feld auf Pipeline-Konfigurationen und ein Änderungs-Log das der Anwender einsehen kann.

### Kein Lock-in auf irgendeiner Ebene

Weder Hardware noch Software noch KI-Service. Das System muss jederzeit ohne Datenverlust von einem Zustand in einen anderen überführt werden können:

ESP32 durch anderen Mikrocontroller ersetzen – die MQTT-Schnittstelle ist standardisiert, die Firmware-Architektur ist dokumentiert.

Cloud-KI durch lokale KI ersetzen – derselbe Adapter, anderer Endpoint.

PostgreSQL durch eine andere Datenbank ersetzen – die Repository-Schicht abstrahiert den Datenbankzugriff.

Docker-Stack auf andere Hardware verschieben – Container sind portabel by Design.

Das ist kein akademisches Prinzip. Es ist die Voraussetzung dafür, dass der Anwender auch in fünf Jahren noch die Kontrolle über sein System hat, unabhängig davon was mit einzelnen Anbietern, Services oder Hardware-Plattformen passiert.

---

## Bestehendes Fundament: Was das System schon mitbringt

Die KI-Integration baut nicht auf der grünen Wiese auf. AutomationOne hat bereits eine substantielle Infrastruktur die direkt als Grundlage dient.

### Datenfluss und Kommunikation

Das MQTT-basierte Kommunikationssystem mit strukturierten Topics (`ao/devices/{id}/...`) ist der natürliche Kanal für KI-Daten. Sensordaten fließen bereits durch diesen Kanal – die KI-Pipelines subscriben auf dieselben Topics. Ergebnisse fließen über denselben Mechanismus zurück. Das Heartbeat-System erkennt wenn ein Gerät (oder ein KI-Container) nicht mehr erreichbar ist.

### Zonierung und Gerätemanagement

Jedes Gerät ist einer Zone zugeordnet. Jede Zone hat ihre Konfiguration, ihre Sensoren, ihre Aktoren. Die KI-Pipelines können zonenspezifisch arbeiten – "Anomalie-Erkennung nur in Zone 3" – weil die Infrastruktur für diese Filterung bereits existiert. Das Hinzufügen und Entfernen von Geräten ist ein gelöster Prozess: der KI-Layer erbt diese Fähigkeit.

### Logik-Engine

Die bestehende Logik-Engine verarbeitet Cross-ESP-Regeln: wenn Sensor X in Zone A über Schwellwert, dann Aktor Y in Zone B schalten. Die KI-Pipelines sind architektonisch parallel dazu – eine weitere Art von Regelverarbeitung, aber mit lernfähigen Modellen statt statischer Schwellwerte. Beide können koexistieren: die Logik-Engine als Sicherheitsnetz mit harten Grenzen, die KI-Pipeline als intelligente Optimierung innerhalb dieser Grenzen.

### Error-Code-System und Testinfrastruktur

Ein durchgängiges Error-Code-System über alle Layer mit strukturierten Fehlermeldungen. Eine Testinfrastruktur mit hunderten Tests über Backend, Frontend und Firmware inklusive Wokwi-CI-Simulation für ESP32-Szenarien. Beides wird direkt von der KI-Integration genutzt: die Error-Codes werden um KI-spezifische Codes erweitert (gleiche Systematik, gleiche Struktur), und die Testinfrastruktur wird um KI-Pipeline-Tests erweitert (Mock-Services, Input/Output-Validierung).

### Datenbank-Struktur

PostgreSQL mit Alembic-Migrations, einem Repository-Pattern für Datenbankzugriffe, und einem Schema das Geräte, Sensoren, Aktoren, Zonen und ihre Beziehungen abbildet. Die KI-Integration fügt eigene Tabellen hinzu (Services, Pipelines, Permissions, Predictions) die über Foreign Keys mit den bestehenden Tabellen verbunden sind – aber in eigenem Namespace, sauber getrennt.

### Monitoring-Infrastruktur (in Aufbau)

Prometheus für Metriken, Loki für Logs, Grafana für Visualisierung. Diese Infrastruktur dient doppelt: sie überwacht das System selbst, und sie liefert die Datengrundlage für ML-basiertes Debugging. Die KI-Container loggen in denselben Stack, ihre Metriken (Inferenz-Latenz, Konfidenz-Verteilung, Request-Count) fließen in Prometheus, ihre Entscheidungen sind in Loki durchsuchbar.

### Agent-Workflow für Entwicklung

Ein strukturierter Entwicklungsworkflow mit Claude-basierten Agents in VS Code, einem Technical Manager als strategischer Steuerungsinstanz, standardisierten Auftrags- und Report-Formaten, und einer mehrstufigen Analyse-Pipeline. Dieser Workflow wird direkt genutzt um die KI-Integration zu implementieren – jede Phase wird als Auftrag formuliert, analysiert, gegengeprüft, und erst nach Freigabe umgesetzt.

---

## Zusammenfassung: Was AutomationOne anders macht

AutomationOne löst nicht ein einzelnes Problem. Es baut eine Plattform die dem Anwender die Kontrolle zurückgibt – über seine Hardware, seine Daten, seine Automatisierung und seine KI-Integration.

Das System ist von unten nach oben modular. Jede Schicht funktioniert unabhängig, jede Komponente ist austauschbar, jede Erweiterung ist optional. Die KI-Integration ist die leistungsfähigste Erweiterung, aber sie ist bewusst als Erweiterung gebaut – nicht als Voraussetzung.

Der Anwender spricht mit dem System in seiner Sprache. Zonen, Sensoren, Zeiträume, Aktionen – nicht SQL-Queries, JSON-Konfigurationen oder Jupyter-Notebooks. Das System übersetzt.

Und die Kontrolle bleibt beim Anwender. Welche KI-Services laufen, welche Daten sie sehen, welche Geräte sie steuern dürfen, unter welchen Bedingungen – das alles entscheidet der Mensch, explizit, nachvollziehbar, jederzeit widerrufbar.

Das ist die Vision. Die Infrastruktur dafür wird Schicht für Schicht aufgebaut: erst stabil, dann beobachtbar, dann intelligent. Jede Schicht verstärkt die vorherige, keine ersetzt sie.