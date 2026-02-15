# Auftrag an @server-debug
Datum: 2026-02-10 22:30
Modus: A – Analyse (kein Code ändern)

---

## Kontext

Zone-Kaiser-Implementierung (WP1-WP9) ist abgeschlossen, Bugs gefixt. Es existiert bereits ein paralleler Auftrag an server-development für DB-Kaskaden und Daten-Integrität. Dieser Auftrag hier ist ERGÄNZEND und fokussiert auf **Laufzeit-Resilienz**: Kann das System während und nach strukturellen Änderungen (Zone löschen, ESP deaktivieren, Config-Push) sicher und transparent weiterarbeiten?

### Referenz: KI-Audit Befunde (bereits verifiziert)

Der KI-Audit (`KI_AUDIT_REPORT.md`) hat 4 kritische Befunde im Device-Lifecycle-Plan identifiziert. Diese sind FAKTEN und beeinflussen die Analyse:

1. **State-Machine unvollständig**: Es fehlen `rejected → pending_approval` (Rediscovery), `approved/online → rejected`, `offline → online` (Heartbeat). Diese Übergänge EXISTIEREN im Code.
2. **Wokwi-Flow**: seed_wokwi_esp.py setzt `status="offline"`, NICHT `pending_approval`. Approval-Flow wird übersprungen.
3. **Approve akzeptiert auch `rejected`**: `esp.py:1132` erlaubt `pending_approval` ODER `rejected` → `approved`.
4. **Heartbeat-Felder**: Korrekt sind `ts`, `uptime`, `heap_free`/`free_heap`, `wifi_rssi`, `sensor_count`, `actuator_count`, `gpio_status`. NICHT `firmware_version`, NICHT `hardware_type`.

Diese Befunde als Fakten behandeln, nicht nochmal verifizieren.

### Architektur-Prinzip

Server-zentrisch. ESP32 = dumme Agenten. ALLE Intelligenz auf dem Server. ESP führt aus, Server entscheidet. MQTT als einziger Kommunikationskanal zwischen Server und ESP.

---

## Dein Auftrag

### Analyse: System-Resilienz bei strukturellen Änderungen

Erstelle eine **vollständige IST/SOLL-Analyse** die folgende 4 Kernfragen beantwortet. Pro Frage: Was macht das System JETZT (IST mit Code-Referenzen), was SOLLTE es tun, was fehlt (GAP).

---

### Frage 1: Cascade Delete – Wie weit reicht die Kaskade?

**Was wir wissen:** Zone-Removal kaskadiert auf Subzones und ESP-NVS (WP1/WP8).

**Was wir NICHT wissen und du analysieren sollst:**

Wenn eine Zone entfernt wird:
- Was passiert mit **Sensor-Konfigurationen** die an Subzones dieser Zone gebunden sind? Werden sie auf dem Server gelöscht, deaktiviert, oder bleiben sie als Orphans?
- Was passiert mit **Actuator-Konfigurationen** in dieser Zone? Gleiche Frage.
- Was passiert mit **Logic-Flows/Automation-Rules** die Sensoren oder Aktoren aus dieser Zone referenzieren? Werden sie deaktiviert oder laufen sie mit fehlenden Referenzen weiter?
- Was passiert auf **DB-Ebene**? Gibt es CASCADE DELETE auf den Foreign Keys? Oder RESTRICT? Oder SET NULL? Oder gar nichts?
- Bleibt die **Sensor-Data-History** (SensorReading-Records) erhalten wenn die Sensor-Config gelöscht wird?

**Prüfe konkret in:**
- DB-Models: Foreign Key Constraints auf SubzoneConfig, SensorConfig, ActuatorConfig, LogicRule (falls existent), SensorReading
- Services: zone_service.py `remove_zone()`, subzone_service.py `remove_subzone()` – welche abhängigen Records werden explizit gelöscht?
- Repositories: Gibt es `delete_cascade()` Methoden oder wird nur die Zone/Subzone selbst gelöscht?

**IST/SOLL Format:**

```
| Abhängige Entität | Was passiert JETZT bei Zone-Delete | Was SOLLTE passieren | GAP |
|-------------------|------------------------------------|---------------------|-----|
| Subzones | [Code-Referenz: was genau] | Kaskadiert löschen | ? |
| Sensor-Configs | [Code-Referenz: was genau] | Deaktivieren, nicht löschen | ? |
| Actuator-Configs | [Code-Referenz: was genau] | Safe-State setzen, deaktivieren | ? |
| Logic-Flows | [Code-Referenz: was genau] | Deaktivieren mit Grund | ? |
| Sensor-History | [Code-Referenz: was genau] | IMMER erhalten | ? |
| GPIO-Reservierungen | [Code-Referenz: was genau] | Freigeben auf Server+ESP | ? |
```

Gleiche Matrix für: **Subzone-Delete**, **ESP-Reject**, **ESP-Delete** (falls Endpoint existiert).

---

### Frage 2: Cross-ESP Logic-Resilienz

**Szenario:** ESP-A hat Sensor S1. Logic-Rule sagt: "Wenn S1 > 30°C, dann Actuator A1 auf ESP-B einschalten." Das ist Cross-ESP-Logic über den Server.

**Was du analysieren sollst:**

- Existiert diese Funktionalität? Wo ist sie implementiert? (Logic Engine, Automation Rules, Cross-ESP Chains)
- Was passiert wenn **ESP-A offline geht** (Heartbeat-Timeout)? Läuft die Logic-Rule weiter mit veralteten Daten? Wird sie pausiert? Wird sie als "degraded" markiert?
- Was passiert wenn **ESP-A rejected** wird? Wird die Logic-Rule automatisch deaktiviert?
- Was passiert wenn die **Zone von ESP-A entfernt** wird aber ESP-A noch online ist? Sensor S1 meldet weiter Daten – werden sie noch verarbeitet?
- Was passiert wenn **Sensor S1 gelöscht** wird? Erkennt die Logic-Rule dass ihre Quelle fehlt?
- Was passiert wenn **Actuator A1 auf ESP-B** deaktiviert wird? Erkennt die Logic-Rule dass ihr Ziel fehlt?

**IST/SOLL Format:**

```
| Szenario | IST-Verhalten (Code-Referenz) | SOLL-Verhalten | GAP |
|----------|-------------------------------|----------------|-----|
| ESP-A offline, Logic aktiv | ? | Rule pausieren, Frontend informieren | ? |
| ESP-A rejected, Logic aktiv | ? | Rule deaktivieren, Grund loggen | ? |
| Zone von ESP-A entfernt | ? | Prüfen ob Sensoren noch zugeordnet | ? |
| Sensor S1 gelöscht | ? | Rule als "broken" markieren | ? |
| Actuator A1 deaktiviert | ? | Rule als "degraded" markieren | ? |
| Beide ESPs online, alles OK | ? | Rule läuft normal | ? |
```

---

### Frage 3: Multi-Config-Push zum ESP

**Szenario:** Server sendet mehrere Konfigurationen an einen ESP kurz hintereinander: Zone-Assignment + Subzone-Config + Sensor-Config + Actuator-Config.

**Was du analysieren sollst:**

**Server-Seite:**
- Kann der Server mehrere Config-Messages in schneller Folge über MQTT publishen?
- Gibt es ein Queuing/Sequencing? Oder werden alle parallel gefeuert?
- Gibt es Acknowledgment-Handling pro Config-Push? Wartet der Server auf ACK bevor er die nächste Config sendet?
- Was passiert wenn ein ACK ausbleibt? Retry? Timeout? Aufgeben?

**ESP-Seite:**
- Wie verarbeitet der ESP eingehende MQTT-Config-Messages? Sequenziell oder parallel?
- Hat der ESP eine Message-Queue oder verarbeitet er inline im MQTT-Callback?
- Was passiert wenn Config-Message 2 ankommt während Config-Message 1 noch verarbeitet wird (NVS-Write, GPIO-Setup)?
- Kann es zu Race-Conditions kommen? NVS-Write von Config-1 und Config-2 gleichzeitig?
- Gibt es einen Puffer-Überlauf bei zu vielen gleichzeitigen Messages?

**Prüfe konkret in:**
- Server: config_handler.py, zone_service.py, subzone_service.py – wie werden Config-Pushes ausgelöst?
- Server: MQTT-Publisher – gibt es Queuing, Sequencing, ACK-Waiting?
- ESP: main.cpp MQTT-Callback – wie werden eingehende Messages dispatched?
- ESP: config_manager.cpp – NVS-Write-Pattern, Locking, Sequenzialisierung?

**IST/SOLL Format:**

```
| Aspekt | IST (Code-Referenz) | SOLL | GAP |
|--------|---------------------|------|-----|
| Server: Config-Push Sequencing | ? | Sequenziell mit ACK-Wait oder geordnete Queue | ? |
| Server: ACK-Handling | ? | Timeout + Retry + Fallback | ? |
| ESP: Message-Verarbeitung | ? | Sequenzielle Queue, kein Parallel-Processing | ? |
| ESP: NVS-Write-Safety | ? | Atomic Write oder Lock pro Operation | ? |
| ESP: Buffer bei Burst | ? | Definierter Puffer mit Overflow-Handling | ? |
| Gesamtflow: 4 Configs hintereinander | ? | Geordnet, bestätigt, rollback-fähig | ? |
```

---

### Frage 4: Frontend-Transparenz und User-Information

**Kernfrage:** Wird der User bei ALLEN Zustandsänderungen sauber und zeitnah informiert? Kann er den System-Zustand jederzeit verstehen?

**Was du analysieren sollst:**

- **WebSocket-Events:** Welche Events werden bei Zone-Delete, Subzone-Delete, ESP-Reject, Config-Push an das Frontend gebroadcasted? Liste ALLE existierenden Events auf.
- **Fehlende Events:** Gibt es Zustandsänderungen die passieren OHNE dass das Frontend informiert wird?
- **User-Feedback bei Kaskaden:** Wenn Zone gelöscht wird und 5 Subzones + 12 Sensoren betroffen sind – sieht der User eine Zusammenfassung? Oder verschwindet einfach die Zone?
- **Confirmation-Dialoge:** Gibt es Bestätigungs-Dialoge VOR destruktiven Aktionen? ("Zone löschen wird X Subzones und Y Sensoren betreffen – fortfahren?")
- **Error-States im UI:** Wenn ein Config-Push fehlschlägt oder ein ACK ausbleibt – wird dem User ein Fehler angezeigt? Oder bleibt das UI im "Loading"-Zustand hängen?
- **Device-Status-Anzeige:** Zeigt das Frontend alle realen Device-States korrekt an? (online, offline, pending_approval, approved, rejected – inklusive der im Audit gefundenen Übergänge `rejected → pending_approval`, `offline → online`)
- **Logic-Rule-Status:** Wenn eine Logic-Rule "degraded" ist (weil ein ESP offline) – sieht der User das?

**Prüfe konkret in:**
- Server: WebSocket-Broadcast-Calls in zone_service.py, subzone_service.py, esp_service.py, config_handler.py
- Server: websocket_manager.py – welche Event-Types werden definiert?
- Frontend: esp.ts Store – welche WebSocket-Events werden gehandelt?
- Frontend: Welche Views/Components zeigen Device-Status, Zone-Status, Logic-Status?

**IST/SOLL Format:**

```
| Zustandsänderung | WS-Event existiert? | Frontend handelt Event? | User sieht was? | SOLL |
|------------------|--------------------|-----------------------|----------------|------|
| Zone gelöscht | ? | ? | ? | Confirmation + Zusammenfassung + Live-Update |
| Subzone gelöscht | ? | ? | ? | Confirmation + betroffene Sensoren zeigen |
| ESP rejected | ? | ? | ? | Warnung + was verloren geht |
| ESP offline (Timeout) | ? | ? | ? | Status-Badge + Zeit seit letztem Heartbeat |
| Config-Push erfolgreich | ? | ? | ? | Success-Notification |
| Config-Push fehlgeschlagen | ? | ? | ? | Error mit Retry-Option |
| Logic-Rule degraded | ? | ? | ? | Warnung im Logic-Dashboard |
| Cross-ESP Logic unterbrochen | ? | ? | ? | Welche Rule, welcher ESP, seit wann |
```

---

## Output-Format

```markdown
# System-Resilienz bei strukturellen Änderungen – IST/SOLL-Analyse

## 1. Cascade Delete Analyse
### IST-Matrix (mit Code-Referenzen)
### SOLL-Matrix
### GAPs und empfohlene Fixes

## 2. Cross-ESP Logic Resilienz
### IST-Matrix (mit Code-Referenzen)
### SOLL-Matrix
### GAPs und empfohlene Fixes

## 3. Multi-Config-Push Analyse
### IST-Matrix (Server + ESP, mit Code-Referenzen)
### SOLL-Matrix
### GAPs und empfohlene Fixes

## 4. Frontend-Transparenz
### IST-Matrix (Events + UI, mit Code-Referenzen)
### SOLL-Matrix
### GAPs und empfohlene Fixes

## 5. Zusammenfassung
### Alle GAPs priorisiert (Kritisch / Hoch / Mittel)
### Empfohlene Implementierungsreihenfolge
### Geschätzter Aufwand pro Fix
```

---

## Scope-Grenzen

- Du analysierst, du änderst NICHTS
- Du liest Server-Code, ESP-Code UND Frontend-Code soweit nötig für die Analyse
- Wenn du etwas nicht verifizieren kannst (z.B. ESP-Verhalten bei Multi-Config), dokumentiere es als "MUSS GETESTET WERDEN" mit konkretem Test-Szenario
- Keine Annahmen – wenn du etwas nicht im Code findest, schreib "NICHT GEFUNDEN" statt zu raten

## Erfolgskriterium

1. Alle 4 IST/SOLL-Matrizen vollständig ausgefüllt mit Code-Referenzen
2. Jede GAP klar identifiziert: Was fehlt, wo, warum es ein Problem ist
3. Empfohlene Fixes sind konsistent mit vorhandener Codebase (keine Workarounds, keine neuen Patterns wenn vorhandene Patterns passen)
4. Priorisierung nachvollziehbar: Was muss SOFORT gefixt werden vs. was kann warten
5. Der TM kann aus diesem Report direkt Implementierungsaufträge für Dev-Agents ableiten

## Report zurück an

`.technical-manager/inbox/agent-reports/server-debug-resilience-2026-02-10.md`
