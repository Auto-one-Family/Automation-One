# Paket 05: ESP32 Safety-Katalog und Priorisierung (P1.5)

## 1) Ziel und Scope

Dieses Dokument konsolidiert die lokalen Safety-Mechanismen der Firmware (`El Trabajante`) fuer:
- Normalbetrieb (`ONLINE`),
- Degraded-Pfade (`DISCONNECTED`, `OFFLINE_ACTIVE`, `RECONNECTING`),
- Recovery (Reconnect + ACK, Reboot/Power-Loss).

ID-Schema:
- Safety-Barrieren: `FW-SAF-XXX`

Evidenz:
- **sicher**: direkt aus Codepfaden + P1.2/P1.3/P1.4 Dokumenten ableitbar.
- **teilweise**: Richtung klar, aber harte Laufzeitgarantie/Atomik nicht voll belegt.
- **offen**: relevante Luecke fuer P1.6 Contract.

## 2) Safety-Katalog (FW-SAF-XXX)

| ID | Mechanismus | Ausloeser | Owner | Wirkung auf Aktorik/Sensorik | RAM/NVS Abhaengigkeit | Evidenz |
|---|---|---|---|---|---|---|
| FW-SAF-001 | Safe GPIO Init bei Boot | `setup()` Start | Shared (Boot) | Pins werden frueh in sicheren Zustand gebracht | RAM-only Laufzeitaktion | sicher |
| FW-SAF-002 | Bootloop-Latch / Safe-Mode | `boot_count > 5` in <60s | Shared | verhindert unkontrolliertes Weiterlaufen bei Crash-Loop | Counter/State in NVS | teilweise |
| FW-SAF-003 | ACK-Timeout Guard | kein Server-ACK fuer 120s | Core1 (SafetyTask) + Shared Atomics | ohne Offline-Regeln: sofort Safe-State; mit Regeln: P4-Disconnect-Pfad | ACK-Timestamp RAM-only | sicher |
| FW-SAF-004 | Disconnect Grace Timer | Disconnect erkannt, 30s Delay | Core1 (offline_mode_manager) | vermeidet zu fruehes Rule-Umschalten bei kurzen Flaps | RAM-only Timer | sicher |
| FW-SAF-005 | Offline Rule Engine (P4) | `OFFLINE_ACTIVE` alle 5s | Core1 | lokale binaere Aktorsteuerung ueber Hysterese | Rules in NVS, Runtime in RAM | sicher |
| FW-SAF-006 | Server-ACK als harter Exit aus Offline | ACK in `RECONNECTING/OFFLINE_ACTIVE` | Core0->Core1 Hook | stoppt lokale Regeln, reset auf ONLINE | `is_active` Reset + NVS Write | sicher |
| FW-SAF-007 | Server Override pro Aktor | Server-Kommando in `OFFLINE_ACTIVE` | Core1 | verhindert Rule-vs-Server Ping-Pong je GPIO | `server_override` explizit RAM-only | sicher |
| FW-SAF-008 | Calibration Guard (ph/ec/moisture) | Rule eval fuer kalibrierpflichtige Sensoren | Core1 | Rule wird blockiert; Aktor wird OFF erzwungen | Runtime Guard, keine Persistenz noetig | sicher |
| FW-SAF-009 | Time-Window Guard | Regel mit Zeitfilter, aber Zeit ungueltig/ausserhalb Fenster | Core1 | Rule pausiert (hold), keine neue unsafe Aktivierung | Zeitstatus RAM-only, Rule-Config NVS | sicher |
| FW-SAF-010 | NaN/Stale Guard im Rule-Eval | `getSensorValue()` liefert NaN/stale | Core1 | Rule-Skip, keine ungepruefte Schaltung | Cache RAM-only (stale >5min) | sicher |
| FW-SAF-011 | Emergency Stop Notify-Pfad | Notfall-Kommando/Broadcast | Core0 Trigger, Core1 Execute | priorisierter Stop aller Aktoren | Runtime-only | sicher |
| FW-SAF-012 | Immediate Safe-State ohne Regeln | Disconnect und `offline_rule_count=0` | Core1 | alle Aktoren sofort in Safe-State | RAM-only Entscheidung | sicher |
| FW-SAF-013 | Queue-Isolation Core0/Core1 | Config/Command/Pub Queue Uebergabe | Shared Architektur | reduziert Cross-Core Data-Races auf Owner-Daten | Queues RAM-only | sicher |
| FW-SAF-014 | Rule-Blob Integritaetspruefung | Rule-Load aus NVS | Core1 + Storage | CRC/Size-Mismatch => `rule_count=0`, kein blindes Ausfuehren | NVS kritisch | sicher |
| FW-SAF-015 | Deactivate Cleanup + Persist | ACK-Return ONLINE | Core1 | aktive Rule-Aktoren OFF, `is_active=false` persistiert | NVS Write beim Exit | teilweise |
| FW-SAF-016 | Sensor Circuit-Breaker | wiederholte Messfehler | Core1 Sensorpfad | verhindert dauerndes fehlerhaftes Schalten aus schlechten Messungen | RAM-only Counter/State | sicher |
| FW-SAF-017 | Watchdog Diagnostik/Feed-Regeln | lange/blockierende Pfade | Shared | reduziert Haenger ohne silent freeze | Zustand teilweise persistiert (watchdog storage) | teilweise |

## 3) Safety-Barrieren auf kritischen Pfaden

| Kritischer Pfad | Relevante Barrieren | Bewertung |
|---|---|---|
| Boot | FW-SAF-001, FW-SAF-002, FW-SAF-014, FW-SAF-017 | stark, aber Persistenz-/Bootloop-Details teils offen |
| Approval/Registration | FW-SAF-003, FW-SAF-013 | robust fuer ACK-Timeout, bei Parse/Queue-Fail beobachtungsluecken |
| OFFLINE_ACTIVE | FW-SAF-004..FW-SAF-012, FW-SAF-016 | starkes lokales Safety-Set vorhanden |
| Reconnect | FW-SAF-006, FW-SAF-015 | funktional gut, NVS-Write-Fail bleibt Drift-Risiko |
| Reboot/Power-Loss | FW-SAF-002, FW-SAF-014, FW-SAF-015 | sicher fuer Rule-Blob-Defekt, Atomik ueber mehrere Domaenen offen |

## 4) Top-Risiken (Priorisierung)

### Kritisch
1. **FW-RISK-SAF-001:** Unklare Atomik bei kombinierten Persistenzupdates (Sensor/Rules/Lifecycle) kann Mischzustand nach Reboot erzeugen.
2. **FW-RISK-SAF-002:** Safety-relevante NVS-Write-Fails (`is_active`, approval/state) koennen Runtime-vs-NVS-Drift verursachen.

### Hoch
3. **FW-RISK-SAF-003:** Config-Parse-Fail im Queue-Worker ohne garantierten negativen `config_response` erschwert sicheren Re-Sync.
4. **FW-RISK-SAF-004:** NaN/Stale-Phase nach Reboot fuehrt zu Rule-Skip und damit potentiell langem Hold-Zustand ohne frische Evidenz.
5. **FW-RISK-SAF-005:** Queue-full Drops (Config/Command/Publish) sind teils nur logbasiert sichtbar, nicht contract-sicher rueckgemeldet.

### Mittel
6. **FW-RISK-SAF-006:** `quality=suspect` blockiert lokal nicht zwingend die Rule-Auswertung (fokus aktuell auf calibration/NaN/stale).
7. **FW-RISK-SAF-007:** Legacy-No-Task Pfad hat anderes Timing/Isolation-Verhalten als Normalbetrieb.

## 5) Evidenzgrad offener Punkte

| Punkt | Evidenzgrad | Kurzbegruendung |
|---|---|---|
| Multi-Domain Write-Atomik | offen | kein durchgaengig belegter transaktionaler Commit ueber Domains |
| Safety-Rueckmeldung bei Config-Parse-Fail | sicher (als Luecke) | TODO im Queue-Worker, aktuell kein garantierter Error-Response |
| Rule-Status-Drift bei Write-Fail | teilweise | Fehlerszenario plausibel, harte Feld-fuer-Feld-Recovery nicht voll belegt |
| Lokale Policy fuer `quality=suspect` | teilweise | Schutz durch andere Guards vorhanden, aber keine globale harte Sperrregel |

## 6) Kurzfazit fuer P1.5

Die Firmware besitzt bereits starke lokale Safety-Barrieren fuer Disconnect, Offline-Regelbetrieb und Emergency-Pfade. Die groessten Defizite liegen nicht in fehlenden Guards, sondern in Determinismus und Nachvollziehbarkeit ueber Persistenz- und Queue-Fehlerfaelle hinweg.
