# Paket 05: ESP32 Safety-Policy und Entscheidungsregeln (P1.5)

## 1) Ziel

Dieses Dokument definiert verbindliche lokale Safety-Policies fuer:
- Rule-Evaluation bei fehlerhaften/unsicheren Sensorwerten,
- Aktorfreigabe nach Reboot,
- Priorisierung lokaler Regeln vs externer Kommandos,
- P1.6 Hand-off als Netzwerk-/Reconciliation-Contract.

ID-Schema:
- Policies: `FW-POL-SAF-XXX`

## 2) Verbindliches Policy-Set (FW-POL-SAF-XXX)

| ID | Policy | Regeltext (verbindlich) | Begruendung |
|---|---|---|---|
| FW-POL-SAF-001 | NaN-Regel | Wenn Sensorwert `NaN` ist, wird die zugehoerige Rule in diesem Zyklus nicht evaluiert (`skip`) und kein neuer Aktorzustand gesetzt. | verhindert Entscheidungen auf ungueltiger Datenbasis |
| FW-POL-SAF-002 | Stale-Regel | Wenn Wert stale ist (Cache ueber Schwellzeit), gilt er wie `NaN`: Rule-Skip, keine neue Aktivierung. | vermeidet Schalten auf veralteten Daten |
| FW-POL-SAF-003 | Suspect-Regel | `quality=suspect` wird lokal mindestens als **degradierter Wert** behandelt: keine Aktivierung in Richtung "mehr Risiko", Deaktivierung in Richtung Safe-State bleibt erlaubt. | schliesst Blindspot zwischen "nur NaN guard" und realer Messunsicherheit |
| FW-POL-SAF-004 | Calibration-Required Regel | Fuer kalibrierpflichtige Typen (`ph/ec/moisture`) duerfen lokale Offline-Rules nicht aktiv schalten; bei aktivem Rule-State wird OFF erzwungen. | bereits gelebtes Fail-safe Muster |
| FW-POL-SAF-005 | Zeitfilter-Regel | Bei aktivem Zeitfilter und ungueltiger Zeit (`NTP unsynced`) wird Rule pausiert (hold), keine neue Aktivierung. | verhindert falsche Zeitfenster-Aktionen |
| FW-POL-SAF-006 | Reconnect-ACK Regel | Reconnect allein beendet Offline nicht; erst valider Server-ACK darf auf ONLINE rueckfuehren und Rule-Zustaende resetten. | klare Autoritaet, race-resistent |
| FW-POL-SAF-007 | Override-Prioritaet | Externes Server-Kommando in `OFFLINE_ACTIVE` hat fuer den betroffenen Aktor Prioritaet und setzt `server_override`. | verhindert Rule-vs-Command Konflikt |
| FW-POL-SAF-008 | No-Rule Disconnect Regel | Bei Disconnect ohne gueltige Offline-Rules werden alle Aktoren sofort in Safe-State gesetzt. | deterministisches Verhalten ohne lokale Entscheidungsgrundlage |
| FW-POL-SAF-009 | Persistenzfehler-Regel | Safety-relevante NVS-Write-Fehler werden als degradierter Zustand behandelt und muessen telemetriert werden; Runtime darf nicht stillschweigend als "persistiert" gelten. | verhindert verdeckte Reboot-Drift |
| FW-POL-SAF-010 | Queue-Fehler-Regel | Queue-full/parse-fail in sicherheitsrelevanten Config/Command-Pfaden muessen als expliziter Fehler (Nack/Telemetry) sichtbar sein. | beobachtbarer, reproduzierbarer Recovery-Pfad |

## 3) Mindestbedingungen fuer Aktorfreigabe nach Reboot

`Aktorfreigabe` bedeutet hier: lokales oder externes Schalten ausserhalb eines harten Safe-State.

### FW-POL-SAF-020 (Kaltstart-Gate)
Freigabe erst wenn alle Bedingungen erfuellt sind:
1. Persistente Rule-/Config-Daten erfolgreich geladen und validiert (inkl. Rule-CRC/Size).
2. Aktorzustand wurde auf sicheren Startzustand gesetzt oder hardwarekonsistent gelesen.
3. Fuer rule-gesteuertes Schalten liegt mindestens ein frischer, nicht-stale Wert je benoetigter Sensorquelle vor.
4. Bei Zeitfiltern ist Zeitbasis gueltig oder Rule bleibt explizit pausiert.

### FW-POL-SAF-021 (Warmstart-Reconnect-Gate)
Nach reconnect gilt:
1. Ohne ACK keine Aufhebung von `OFFLINE_ACTIVE`.
2. Nach ACK: Offline-Rules resetten, aktive Rule-Aktoren kontrolliert OFF, dann ONLINE.
3. Persistenz-Write beim Rule-Reset muss Erfolg/Fail explizit markieren.

### FW-POL-SAF-022 (Failover bei unklarer Lage)
Wenn Bedingungen 1-4 nicht nachweisbar sind:
- keine Aktivierung neuer Aktoren,
- bevorzugt Safe-State oder unveraenderter Zustand mit klarer Degraded-Meldung.

## 4) Prioritaet: Lokaler Rule-Fallback vs externes Kommando

1. **Emergency Stop** (hoechste Prioritaet, sofort).
2. **Explizites Server-Kommando in OFFLINE_ACTIVE** (setzt `server_override` je Aktor).
3. **Lokale Offline-Rules** (nur fuer Aktoren ohne aktives Override, nur mit gueltigen Guards).
4. **Normaler Online-Regelbetrieb** (nach ACK-bestaetigtem ONLINE).

Konfliktregel:
- pro Aktor gilt immer genau eine aktive Steuerquelle; bei Quellenwechsel muss Zustand explizit protokolliert und telemetriert werden.

## 5) P1.6 Hand-off: Zwingende Netzwerk-Contracts

Die folgenden Punkte muessen in P1.6 explizit als ACK/NACK/Retry/Telemetry Contract umgesetzt werden.

### ACK/NACK
- **FW-POL-SAF-030:** Jeder Config-Push endet deterministisch in `config_response` (success oder error, nie still).
- **FW-POL-SAF-031:** Parse-Fail/Queue-Full erhalten dedizierte Fehlercodes und Korrelation (`correlation_id`).
- **FW-POL-SAF-032:** Reconnect->ONLINE nur nach ACK mit eindeutigem Sequenz-/Zeitbezug.

### Retry
- **FW-POL-SAF-033:** Fehlerhafte Config-Pushes sind idempotent erneut sendbar.
- **FW-POL-SAF-034:** Backoff fuer wiederholte Push-Fails, um Queue-/NVS-Bursts zu begrenzen.

### Telemetry/Observability
- **FW-POL-SAF-035:** Pflichtmetriken: Queue-Fill, Queue-Drops, Outbox-Full, NVS-Write-Fail, Rule-Guard-Skips (NaN/stale/time/suspect).
- **FW-POL-SAF-036:** Pflicht-Events fuer Zustandswechsel: DISCONNECTED, OFFLINE_ACTIVE, RECONNECTING, ONLINE_ACKED.
- **FW-POL-SAF-037:** Pflicht-Event fuer Persistenzdrift-Verdacht (Runtime != persisted state).

## 6) Offene Entscheidungen vor P1.6 (kritisch)

1. Soll `quality=suspect` lokal immer aktivierungsblockierend sein (empfohlen: ja, ausser explizit freigegebene Sensorprofile)?
2. Welche Sensorfrische gilt als Mindestanforderung fuer Rule-basierte Aktorfreigabe nach Reboot?
3. Welche safety-relevanten Felder muessen atomar zusammen persistiert werden?
4. Wie wird ein NVS-Write-Fail im Runtime-Verhalten sofort abgesichert (hold/off/degraded lock)?

## 7) Kurzfazit

Die Firmware besitzt bereits die wichtigsten lokalen Safety-Muster. Fuer belastbare Safety unter Drift-/Fehlerszenarien muss P1.6 vor allem die Rueckmelde-, Retry- und Telemetrie-Vertraege verhaerten, damit aus "degraded aber handhabbar" kein "unsicher/unklar" wird.
