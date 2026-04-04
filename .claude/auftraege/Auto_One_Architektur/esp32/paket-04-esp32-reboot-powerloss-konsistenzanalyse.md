# Paket 04: ESP32 Reboot-/Power-Loss Konsistenzanalyse (P1.4)

## 1) Ziel

Szenariobasierte Bewertung des Konsistenzzustands nach Reboot und Power-Loss, mit Fokus auf RAM/NVS-Grenze und Safety-Auswirkung.

ID-Schema:
- Konsistenzanalyse: `FW-CONS-XXX`

## 2) Boot-Restore-Reihenfolge (evidenzbasiert)

1. Boot + Safe-GPIO + Bootloop/State-Pruefung.
2. Persistierte Basiszustaende (Lifecycle/Provisioning/Approval) laden oder reparieren.
3. Connectivity-Layer (WiFi/MQTT/Registration-Gate) initialisieren.
4. Core1-Owner Configs (Sensor/Rules) aus NVS anwenden.
5. Runtime-only Daten neu aufbauen (Queues leer, Value-Cache neu, Overrides leer).

## 3) Szenarioanalyse (FW-CONS-XXX)

| ID | Szenario | Erwarteter Zustand nach Neustart | Konsistenzstatus | Safety-Wirkung | Evidenzgrad |
|---|---|---|---|---|---|
| FW-CONS-001 | Normaler Reboot ohne laufende Config-Aenderung | Persistierte Config/Rules/Lifecycle wieder aktiv; Runtime-Caches leer | **konsistent** | sicher, sofern Sensorwerte neu einlaufen | sicher |
| FW-CONS-002 | Power-Loss waehrend Config-Update (vor Queue-Drain) | Alte NVS-Config bleibt aktiv; neue Config evtl. nie angewendet | **inkonsistent aber safe** | System bleibt auf altem Stand; Risiko: Server erwartet neuen Stand | sicher |
| FW-CONS-003 | Power-Loss waehrend Config-Apply inkl. Persistierung | Teilweise uebernommene Konfig moeglich (Atomikgrenze offen) | **kritisch inkonsistent** (wenn Mehrfeld-Aenderung teilpersistiert) | potenziell falsche Sensor-/Rule-Kombination bis neuem Push | teilweise |
| FW-CONS-004 | Power-Loss waehrend OFFLINE_ACTIVE Rule-Evaluierung | Rule-Runtime (`server_override`, Cache, Timer) verloren; persistente Rules bleiben | **inkonsistent aber safe** | kurzzeitig Rule-Neuaufbau noetig, Safe-Fallback bleibt vorhanden | sicher |
| FW-CONS-005 | NVS-Rule-Blob defekt (CRC/Size-Fehler) | Rule-Count wird auf 0 gesetzt, wartet validen Config-Push | **inkonsistent aber safe** | bei Disconnect eher Safe-State statt lokale Regeln | sicher |
| FW-CONS-006 | NVS-Write-Fail bei Rule-Status/Lifecycle | Persistenz kann hinter Runtime herlaufen (stale state) | **kritisch inkonsistent** (policy/state drift) | falscher Startmodus nach Reboot moeglich | teilweise |
| FW-CONS-007 | Reboot waehrend MQTT/Pub-Backpressure | Telemetrieverlust akzeptiert, Config bleibt unveraendert | **konsistent** | lokale Safety bleibt durch Core1-Logik erhalten | sicher |
| FW-CONS-008 | Reboot nach langem Sensor-Fehler (Circuit Breaker OPEN) | CB-Zustand und Cache resetten (RAM-only) | **inkonsistent aber safe** | temporaer neue Bewertungsphase, aber kein dauerhafter unsafe Aktorzustand belegt | sicher |

## 4) Konsistenzluecken (priorisiert)

### Kritisch
1. **FW-CONS-010:** Unklare Atomik bei kombinierten Config-Writes (Sensor + Rule + Lifecycle) kann teilpersistente Mischzustaende erzeugen.
2. **FW-CONS-011:** NVS-Write-Failure bei statusnahen Daten (`is_active`, approval/state) kann Reboot-Drift zwischen Serversicht und Firmware verursachen.

### Hoch
3. **FW-CONS-012:** Fehlende garantierte negative Config-Antwort bei Parse-Fail verhindert sauberen Server-Re-Sync.
4. **FW-CONS-013:** Volatiler Value-Cache fuehrt nach Reboot zu NaN-/Stale-Phasen im Offline-Evaluator bis neue Messwerte eintreffen.

### Mittel
5. **FW-CONS-014:** Queue-full Drops (Config/Command/Publish) reduzieren Determinismus von kurz vor Reboot empfangenen Aenderungen.
6. **FW-CONS-015:** Legacy-No-Task-Modus aendert Timing/Isolation und erschwert konsistente Erwartung ueber alle Deployments.

## 5) Risiken und offene Punkte (Block D)

| Prio | Risiko / Offener Punkt | Bedeutung fuer P1.5/P1.6 | Evidenz |
|---|---|---|---|
| kritisch | Fehlende nachgewiesene Write-Atomik ueber zusammenhaengende Config-Domaenen | P1.5 Safety-Determinismus, P1.6 Re-Sync Robustheit | offen |
| kritisch | State-/Rule-Drift bei NVS-Write-Fail | P1.5 falscher Safety-Start, P1.6 falsche Connectivity-Entscheidungen | teilweise |
| hoch | Kein garantierter negativer Config-ACK bei Queue-Parse-Fail | P1.6 Contract/Resync-Luecke | sicher |
| hoch | Rule-Status-Teilpersistenz ohne belegtes Throttling | Flash-Last, potenzielle Wear-/Burst-Probleme fuer P1.6 Stabilitaet | teilweise |
| mittel | Runtime-Cache volatil ohne explizites Warmstart-Konzept | P1.5 Rule-Eval startet mit Datenluecke | sicher |
| mittel | Queue-Drops ohne Nack-Contract | P1.6 Observability/Delivery-Garantien unklar | sicher |

## 6) Hand-off Fragen fuer P1.5 (Safety) und P1.6 (Netzwerk)

### Fuer P1.5
1. Welche minimalen Rule-/State-Objekte muessen atomar konsistent sein, damit Reboot nie zu unsicherer Aktorik fuehrt?
2. Wie lange ist der post-reboot NaN-/Stale-Zeitraum im Offline-Evaluator safety-tolerierbar?
3. Muss `quality=suspect` lokal bereits rule-blockierend wirken, um falsche Offline-Aktionen zu vermeiden?
4. Wie wird ein Write-Fail bei safety-relevanten Zustandsdaten fail-safe signalisiert und behandelt?

### Fuer P1.6
5. Welcher Nack-/Retry-Contract schliesst die Config-Parse-Fail-Luecke deterministisch?
6. Welche Telemetrie braucht es fuer Queue-Fill, Drop-Rate und Outbox-Full, um Re-Sync sicher zu steuern?
7. Welche Debounce-/Backpressure-Strategie begrenzt Config-Bursts vor NVS-Writes?
8. Soll Reconnect ohne ACK weiterhin Rule-aktiv bleiben oder differenzierter nach Persistenz-/Sync-Stand entscheiden?

## 7) Abschlussbewertung P1.4

Das System ist fuer den Normalfall reboot-stabil, weil zentrale Konfigurationen persistiert sind und Safety-Fallbacks greifen. Die prioritaeren Luecken liegen in Atomik-/Fehler-Transparenz der Schreibpfade und in der Drift-Kontrolle zwischen Runtime und NVS bei Fehler- oder Burst-Situationen.

