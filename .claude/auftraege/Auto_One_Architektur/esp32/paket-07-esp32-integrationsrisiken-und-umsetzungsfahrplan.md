# Paket 07: ESP32 Integrationsrisiken und Umsetzungsfahrplan (P1.7)

## 1) Ziel

Dieses Dokument finalisiert Block C, D und E von P1.7:
- Stabilitaets-/Fragilitaetsbewertung je Uebergabepunkt,
- verbindlicher Sollvertrag fuer ACK/NACK/Retry/Drift/Reconciliation,
- priorisierte Hand-off-Aufgaben fuer Paket 2-5.

ID-Schema:
- Risiken/Fragilitaet: `FW-INT-RISK-XXX`
- Sollvertrag: `FW-INT-SOLL-XXX`

## 2) Fragilitaetsmatrix je Schnittstelle (Block C)

| ID | Schnittstelle | Einstufung | Evidenzbasierter Grund | Verifizierbarkeit (Metrik/Test) |
|---|---|---|---|---|
| FW-INT-RISK-001 | Sensor publish queue -> outbox | stabil aber degradierbar | Queue/outbox koennen bei Last droppen | `publish_outbox_full_total`, Lasttest mit Backpressure |
| FW-INT-RISK-002 | Config ingress -> config queue | fragil | Queue-full terminiert nicht immer mit normiertem Fehlercode | `queue_drop_config_total`, Test "queue full -> error response" |
| FW-INT-RISK-003 | Config worker parse/apply | fragil | Parse-Fail ist nicht durchgaengig harter NACK | Test "invalid JSON -> deterministic error response" |
| FW-INT-RISK-004 | Command queue actuator/sensor | fragil | Queue-full aktuell oft nur lokale Telemetrie | `queue_drop_cmd_total`, Test "queue full -> command NACK" |
| FW-INT-RISK-005 | Reconnect ACK-Autoritaet | stabil aber degradierbar | Muster robust, aber Liveness/ACK semantisch vermischbar | Eventvergleich `server_status` vs `heartbeat_ack` |
| FW-INT-RISK-006 | Offline reset persist | fragil | NVS-write-fail kann Drift verursachen | `nvs_write_fail_total`, Power-cut Test beim Reset |
| FW-INT-RISK-007 | Runtime vs NVS Konsistenz | fragil | Drift-Event nicht ueberall verpflichtend | Event `PERSISTENCE_DRIFT` + Recovery-Test |
| FW-INT-RISK-008 | QoS-Vertragslage ueber Schichten | stabil aber degradierbar | Doku/Implementierung nicht immer deckungsgleich | Contract-Testmatrix pub/sub QoS |
| FW-INT-RISK-009 | UI Online-Zustand | fragil (integrativ) | bei fehlender Zweiteilung kann "online" ueberinterpretiert werden | UI Test `link_online` vs `ack_online` |

## 3) Priorisierte Top-Risiken

### Kritisch

1. `FW-INT-RISK-020` - Parse-Fail ohne harten NACK (Config driftbar, Retry unkontrolliert).
2. `FW-INT-RISK-021` - Persistenzfehler ohne verpflichtendes Drift-Signal (`NVS_WRITE_FAIL`/`PERSISTENCE_DRIFT`).
3. `FW-INT-RISK-022` - Queue-full in command/config ohne deterministische negative Terminierung.

### Hoch

4. `FW-INT-RISK-030` - Outbox-/Drain-Drops ohne vollstaendige Ende-zu-Ende Sichtbarkeit.
5. `FW-INT-RISK-031` - ACK-Autoritaet semantisch unscharf (`server/status=online` vs Heartbeat-ACK).
6. `FW-INT-RISK-032` - QoS-Drift zwischen Referenzdoku und effektiver Laufzeit.

### Mittel

7. `FW-INT-RISK-040` - Reconciliation-Abschlusskriterien nicht als Session-Vertrag fixiert.
8. `FW-INT-RISK-041` - UI zeigt potenziell keinen klaren Degraded-Kanal fuer Drift.

## 4) Verbindlicher Integrationsvertrag (Block D, FW-INT-SOLL-XXX)

### 4.1 ACK- und ONLINE-Vertrag

| ID | Sollregel |
|---|---|
| FW-INT-SOLL-001 | `ONLINE_ACKED` gilt nur bei validem Heartbeat-ACK plus positiv klassifiziertem Reset/Persistenzresultat. |
| FW-INT-SOLL-002 | `server/status=online` darf nur als Liveness-Hinweis fuer fruehen Reconnect dienen, nie als finale ACK-Autoritaet. |
| FW-INT-SOLL-003 | Jede Zustandsaenderung nach Disconnect muss die Signalquelle tragen (`heartbeat_ack`, `server_status`, `timeout`). |

### 4.2 NACK- und Fehlercode-Vertrag

| ID | Sollregel |
|---|---|
| FW-INT-SOLL-010 | Jeder Config-/Command-Request endet in `success|error|timeout`; kein stilles Ende. |
| FW-INT-SOLL-011 | `QUEUE_FULL` ist verpflichtender Error-Code fuer verworfene Queue-Enqueues. |
| FW-INT-SOLL-012 | `PARSE_FAIL` ist verpflichtender Error-Code fuer ungueltige Payloads nach Queue-Drain. |
| FW-INT-SOLL-013 | `OUTBOX_FULL` ist verpflichtender Error-Code fuer Publish-Pfade mit Outbox-Ablehnung. |
| FW-INT-SOLL-014 | `NVS_WRITE_FAIL` ist verpflichtender Error-Code fuer safety-kritische Persistenzfehler. |
| FW-INT-SOLL-015 | Alle Fehlercodes werden als kanonischer schichtuebergreifender Katalog (Firmware/Server/DB/UI) gefuehrt. |

### 4.3 Drift- und Reconciliation-Vertrag

| ID | Sollregel |
|---|---|
| FW-INT-SOLL-020 | `PERSISTENCE_DRIFT` wird ausgelost, wenn Runtime-Reset nicht erfolgreich persistiert werden konnte oder Persistenzzustand unbekannt ist. |
| FW-INT-SOLL-021 | Reconciliation ist session-basiert (`recon_session_id`) mit Status `started|running|completed|failed`. |
| FW-INT-SOLL-022 | Delta-Replay ist idempotent und ueber `correlation_id/request_id/seq` deduplizierbar. |
| FW-INT-SOLL-023 | Retry-Vertrag nutzt Backoff und endet bei max attempts mit explizitem terminalem Fehlerereignis. |
| FW-INT-SOLL-024 | Re-Sync gilt nur als abgeschlossen, wenn offene Requests aufgeloest und Drift-Indikatoren bereinigt sind. |

## 5) Pflicht-Observability fuer Verifizierbarkeit

| ID | Pflichtsignal | Mindestinhalt | Zweck |
|---|---|---|---|
| FW-INT-SOLL-040 | `CONFIG_PUSH_FAILED` | `correlation_id`, `error_code`, `reason`, `seq` | deterministischer Retry |
| FW-INT-SOLL-041 | `COMMAND_DROPPED` | request key, queue reason, gpio/topic family | command reliability |
| FW-INT-SOLL-042 | `PUBLISH_DROPPED` | topic family, qos, path(queue/outbox), seq | delivery transparency |
| FW-INT-SOLL-043 | `PERSISTENCE_DRIFT` | field group, runtime state, persist-known flag | safety transparency |
| FW-INT-SOLL-044 | `ONLINE_ACKED` | ack source, reset persist result | klare Online-Semantik |

## 6) Hand-off in Paket 2-5 (Block E)

## Paket 2 (Server) - zuerst

| Prio | Aufgabe | Abhaengigkeit | Ergebnis |
|---|---|---|---|
| P0 | ACK-Autoritaet normieren (`server_status` vs heartbeat ACK) | keine | serverseitig eindeutige Zustandsmaschine |
| P0 | Error-Code-Katalog fuer `QUEUE_FULL/PARSE_FAIL/OUTBOX_FULL/NVS_WRITE_FAIL` finalisieren | ACK-Normierung | einheitlicher Vertrag fuer API/WS/DB |
| P0 | Reconciliation-Session-Modell implementieren | ACK + Error-Codes | steuerbarer Re-Sync |
| P1 | Timeout-/Retry-Policy fuer fehlende Responses standardisieren | Error-Codes | kontrollierte Wiederholungen statt Blind-Retry |
| P1 | Contract-Tests fuer alle 4 E2E-Ketten aufbauen | Session-Modell | regressionsfeste Integrationssicherheit |

## Paket 3 (DB) - direkt nach Paket 2

| Prio | Aufgabe | Abhaengigkeit | Ergebnis |
|---|---|---|---|
| P0 | Tabellen/Events fuer canonical error codes und reconciliation sessions aufnehmen | Server P0 abgeschlossen | querybare Integrationshistorie |
| P0 | Drift-Ereignisse persistierbar und filterbar machen | Error-Code-Katalog | auditierbarer Safety-Status |
| P1 | Request-Outcome-Timeline (`success/error/timeout`) speichern | Server Retry-Vertrag | saubere Ursachenanalyse |

## Paket 4 (Frontend) - nach Server/DB-Grundlage

| Prio | Aufgabe | Abhaengigkeit | Ergebnis |
|---|---|---|---|
| P0 | Status-Split `link_online` vs `ack_online` in UI einfuehren | Server ACK-Normierung | keine Scheinsicherheit bei Online |
| P0 | Sichtbarer Degraded-Kanal fuer `PERSISTENCE_DRIFT`/Drop-Events | DB/WS Events | operatorfaehige Risikoerkennung |
| P1 | Command/Config Outcome-Panel mit Korrelation anzeigen | Request-Outcome Timeline | schnellere Betriebstriage |

## Paket 5 (Gesamtintegration) - nach Schichtenabgleich

| Prio | Aufgabe | Abhaengigkeit | Ergebnis |
|---|---|---|---|
| P0 | E2E-Testmatrix fuer Sensor/Config/Command/Reconnect inkl. Negativpfade | Paket 2-4 P0 | belastbare End-to-End-Verifikation |
| P0 | Fault-Injection: queue full, parse fail, outbox full, nvs write fail | E2E-Testmatrix | Nachweis der Sollvertraege |
| P1 | Soak-/Flap-Tests fuer ACK/Liveness-Race und Reconciliation-Abschluss | ACK-Normierung | Stabilitaetsnachweis im Langlauf |

## 7) Sofortmassnahmen vs mittelfristige Architekturtrennung

### Sofortmassnahmen (P0)
- ACK-Autoritaet hart trennen (Liveness vs Konsistenz-ACK).
- Canonical Error-Codes aktivieren und in allen Negativpfaden erzwingen.
- Parse-Fail und Queue-Full als verpflichtende terminale Responses.
- Drift-Event und Reconciliation-Session als first-class Integrationsobjekte.

### Mittelfristig (P1)
- QoS-Wahrheitstabelle als einheitliche Runtime-/Doku-Quelle.
- Vollstaendige E2E-Korrelationskette bis UI-Triage-Ansicht.
- Erweiterte Last-/Fault-Injection-Automation.

## 8) Umsetzungsreihenfolge (verbindlich)

1. Paket 2 P0 (ACK + Error-Codes + Session-Vertrag).
2. Paket 3 P0 (Persistenzmodell fuer Fehler/Session/Drift).
3. Paket 4 P0 (UI-Klarheit fuer `ack_online` und Degraded).
4. Paket 5 P0 (E2E-Negativpfad-Verifikation).
5. Paket 2-5 P1-Massnahmen als Härtung.

## 9) Abschluss P1.7

Das Integrationsbild ist verbindlich abgeschlossen: die belastbaren Schnittstellen sind benannt, die fragilen Uebergaben sind priorisiert und die Folgearbeiten fuer Server, DB, UI und Gesamtintegration sind mit Abhaengigkeiten und Reihenfolge umsetzbar spezifiziert.
