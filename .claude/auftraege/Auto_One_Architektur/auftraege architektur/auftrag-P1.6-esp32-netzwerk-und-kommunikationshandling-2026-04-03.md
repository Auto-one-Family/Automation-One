# Auftrag P1.6: ESP32 Netzwerk- und Kommunikationshandling

**Ziel-Repo:** auto-one (El Trabajante Firmware)  
**Bereich:** AutomationOne Architektur-Komplettanalyse (`architektur-autoone`)  
**Roadmap-Bezug:** `roadmap-komplettanalyse.md` -> Paket 1, Schritt P1.6  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~6-10h  
**Abhaengigkeit:** P1.1 bis P1.5 abgeschlossen

---

## Ziel

Analysiere das Netzwerk- und Kommunikationshandling der ESP32-Firmware end-to-end mit Fokus auf deterministischem Recovery und Safety-stabiler Reconciliation.

Zu beantworten:
1. Wie laufen WiFi-Provisioning, Connect, Reconnect und Offline-Verhalten als belastbare State-Machine?
2. Welche MQTT-Topicfamilien, QoS-, Queue-, Timeout- und Backoff-Regeln gelten effektiv?
3. Welche ACK/NACK- und Retry-Vertraege sind fuer Config/Command/Publish wirklich garantiert?
4. Wie werden Queue-full, Parse-Fail und Outbox-Full beobachtbar und reproduzierbar behandelt?
5. Wie wird ONLINE nach Stoerung nur mit konsistentem ACK-/Sync-Stand erreicht?

---

## Pflichtinputs

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-05-esp32-safety-katalog-und-priorisierung.md`
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-05-esp32-safety-wirksamkeit-fehlerbilder.md`
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-05-esp32-safety-policy-und-entscheidungsregeln.md`
4. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-speicherkarte-ram-vs-nvs.md`
5. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-schreib-und-restore-strategie.md`
6. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-reboot-powerloss-konsistenzanalyse.md`
7. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensorhandling-end-to-end.md`
8. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-contract-matrix.md`
9. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-runtime-lifecycle-state-model.md`
10. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-trigger-matrix.md`
11. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-core-interaktionsbild.md`
12. `arbeitsbereiche/automation-one/architektur-autoone/roadmap-komplettanalyse.md`

Regel:
- Nur Source-of-Truth-Dateien ohne `copy.md` verwenden.
- Ergebnisse ausschliesslich in bestehender Struktur ablegen.

---

## Arbeitsschritte

## Block A - Netzwerk-State-Machine und Betriebsmodi

1. Netzwerkzustandsraum konsolidieren: Provisioning, Connecting, Connected, MQTT-Connected, Unregistered, Offline-Grace, Offline-Active, Reconnecting, Online-Acked.
2. Trigger und Guards je Uebergang dokumentieren:
   - WiFi-Link up/down,
   - MQTT connect/disconnect,
   - ACK timeout,
   - Server status/LWT,
   - Grace Timer, Retry Timer.
3. Pro Uebergang Failure-Path festhalten (Timeout, Debounce, Fallback in Provisioning, Safe-State).

Output Block A:
- Zustands- und Uebergangskarte mit IDs `FW-NET-STATE-XXX`.

---

## Block B - MQTT Flow, Topicfamilien und Delivery-Verhalten

1. Topicfamilien klassifizieren (Sensor, Command, Config, Heartbeat, Status, Response).
2. Effektive QoS-, Queue- und Outbox-Pfade dokumentieren:
   - Core1->Core0 publish queue,
   - Command-/Config-Queues,
   - outbox full Verhalten.
3. Verlustverhalten je Pfad erfassen:
   - drop, retry, skip, fallback.

Output Block B:
- MQTT/Queue-Flow-Matrix mit IDs `FW-NET-FLOW-XXX`.

---

## Block C - ACK/NACK-, Retry- und Reconciliation-Contract

1. Verbindliche Contracts ableiten fuer:
   - Config success/error (inkl. Parse-Fail, Queue-Full),
   - Command response,
   - Reconnect->ONLINE nur mit ACK.
2. Korrelation und Idempotenz festlegen:
   - `correlation_id`/`request_id`,
   - wiederholbare Config-Pushes,
   - dedizierte Fehlercodes.
3. Reconciliation nach Disconnect/Reboot beschreiben:
   - verlorene volatile Queue-Daten,
   - Drift-Erkennung Runtime vs NVS.

Output Block C:
- Contract- und Reconciliation-Spezifikation mit IDs `FW-NET-CON-XXX`.

---

## Block D - Observability und Betriebskennzahlen

1. Pflichtmetriken definieren:
   - Queue fill-rate,
   - Queue drops,
   - outbox full,
   - NVS write fail,
   - guard-skip Gruende (`NaN`, `stale`, `suspect`, time-invalid).
2. Pflicht-Events definieren:
   - DISCONNECTED,
   - OFFLINE_ACTIVE,
   - RECONNECTING,
   - ONLINE_ACKED,
   - PERSISTENCE_DRIFT.
3. Metrik/Event-Mapping auf Fehlerbilder und Safety-Wirkung herstellen.

Output Block D:
- Observability-Contract mit IDs `FW-NET-OBS-XXX`.

---

## Block E - Risiken, offene Punkte, Hand-off in P1.7

1. Risiken priorisieren (kritisch/hoch/mittel) mit Evidenzgrad.
2. Restluecken markieren, die erst in P1.7 (ESP32-Integrationsbild) geschlossen werden koennen.
3. Klare Integrationsfragen fuer Server/DB/UI-Vertrag vorbereiten.

Output Block E:
- Priorisierte Risiko- und Integrationsfragenliste.

---

## Deliverables

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-06-esp32-netzwerk-state-machine-und-betriebsmodi.md`
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-06-esp32-mqtt-flow-ack-nack-retry-contract.md`
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-06-esp32-observability-und-reconciliation-contract.md`

---

## Akzeptanzkriterien

- [ ] Vollstaendige Netzwerk-State-Machine mit Triggern/Guards/Failure-Pfaden dokumentiert
- [ ] MQTT-Topic- und Queue-Verhalten inklusive Drop-/Retry-Pfaden nachvollziehbar
- [ ] ACK/NACK-Contract fuer Config/Command deterministisch beschrieben
- [ ] Reconnect->ONLINE nur mit ACK als klare Regel abgesichert
- [ ] Reconciliation fuer verlorene volatile Daten beschrieben
- [ ] Pflichtmetriken und Pflicht-Events mit Safety-Bezug definiert
- [ ] Risiken/Offene Punkte priorisiert und evidenzbewertet
- [ ] Keine Code-Aenderung im Firmware-Repo vorgenommen

---

## Nicht-Scope

- Keine Implementierung von MQTT-/Queue-/Retry-Logik im Firmware-Code
- Keine Aenderung von Server- oder Datenbankschema
- Keine UI/Frontend-Sync-Implementierung
- Keine Endgueltige Gesamtintegration ueber alle Schichten (P1.7/Paket 5)

---

## Erfolgskriterium fuer Robin

Nach P1.6 ist praezise beantwortbar:
- welche Kommunikationspfade robust und deterministisch sind,
- wo Delivery-/Sync-Luecken heute noch auftreten,
- welche Contracts vor P1.7 zwingend stabil sein muessen, damit Safety und Konsistenz im Gesamtsystem halten.
