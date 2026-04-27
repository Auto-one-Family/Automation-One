# Auftrag AUT-190 — Frontend-Verifikation FE-01 / FE-02 / FE-03

**Auftragstyp:** Verifikations-Analyse (KEINE Implementierung)
**Empfaenger:** technical manager (Auto-one)
**Schicht:** Frontend (El Frontend — Vue 3, TypeScript, Pinia) + teilweise Backend (FE-02/FE-03)
**Linear-Referenz:** AUT-190
**Datum:** 2026-04-26
**Prioritaet:** Mittel
**Berichts-Ablage:** Dieser Ordner — Datei `bericht-AUT-190-frontend-fe01-fe02-fe03-2026-04-26.md`
**Anhang-Unterordner (falls noetig):** `bericht-AUT-190-anhang/` in diesem Ordner

---

## Problem

Der Cluster-Hub C5 (Frontend / Operator-UX) fuehrt in Abschnitt 5b drei Folge-Auftraege.
Diese Auftraege wurden aus einer Bestandsaufnahme (AUT-175 E4) identifiziert und sind im
Hub wie folgt konkretisiert:

- **FE-01:** 14 WebSocket-MessageType-Strings haben kein TypeScript-Interface — Typsystem-Luecke
- **FE-02:** WS `SensorDataEvent` fehlen die Felder `config_id`, `onewire_address`, `i2c_address`
- **FE-03:** CORS `allow_methods` ist in `main.py` hartkodiert statt aus `CORSSettings` zu lesen

Der TM prueft fuer jeden Punkt den aktuellen Code-Stand, liefert Evidenz und bewertet ob
der Fund noch relevant ist oder ob ein Fix zwischenzeitlich implementiert wurde.

---

## IST — Behauptungen, die zu pruefen sind

### FE-01 — WS MessageType Interface-Luecken

**Behauptung:**
Das Frontend hat 44 WebSocket-MessageType-Strings (verifiziert AUT-175 E4). Davon haben
nur 30 ein TypeScript-Interface. 14 MessageTypes werden ohne typsicheres Interface behandelt,
was zu Runtime-Fehlern und schlechter IDE-Unterstuetzung fuehrt.

Die 44 MessageTypes sind in `esp.store.ts` aktiv verarbeitet (37 Event-Typen behandelt).
Die fehlenden 14 Interfaces sind als intern als `E4-ws-union (MEDIUM)` klassifiziert.

Bekannte WS-Event-Typen (nicht vollstaendig — TM verifiziert im Code):
`sensor_data`, `sensor_config_created`, `sensor_config_updated`, `sensor_config_deleted`,
`actuator_status`, `actuator_response`, `actuator_alert`, `esp_discovered`, `esp_health`,
`esp_diagnostics`, `device_approved`, `device_rejected`, `zone_assignment`,
`subzone_assignment`, `config_response`, `logic_execution`, `notification_updated`,
`unread_count`, `device_context_changed`, `error_event`, `system_event`.

**Kern-Frage FE-01:**
- Wie viele MessageTypes haben aktuell ein TypeScript-Interface? (Grep nach `MessageType` oder
  `interface.*Event` in `src/types/` oder `src/stores/`)
- Welche der 14 (oder mehr) ohne Interface sind durch spaetere Commits nachgeruestet worden?
- Welche sind noch offen?

---

### FE-02 — WS SensorDataEvent fehlende Felder

**Behauptung:**
Das `SensorDataEvent`-Interface (oder Payload-Typ) im Frontend enthaelt NICHT die Felder
`config_id`, `onewire_address`, `i2c_address`. Dadurch matcht `sensor.store.ts` WS-Events
nur anhand `gpio + sensor_type` (Zeile 121-123 laut Bestandsaufnahme). Bei mehreren Sensoren
am gleichen GPIO (z. B. zwei DS18B20 mit unterschiedlichen OneWire-Adressen) trifft das
Live-Update immer den ersten Treffer — falsches Sensor-Matching.

Dies ist ein Cross-Layer-Problem: Server muss diese Felder im WS-Payload senden, Frontend
muss sie im Interface erhalten und beim Matching verwenden.

**Kern-Frage FE-02:**
- Enthaelt `SensorDataEvent` (oder equivalentes Interface/Typ) aktuell `config_id`,
  `onewire_address`, `i2c_address`?
- Enthaelt `sensor.store.ts:121-123` (oder Umgebung) aktuell ein Matching das neben
  `gpio + sensor_type` auch `onewire_address` oder `config_id` beruecksichtigt?
- Sendet der Server (WS-Broadcast in `sensor_handler.py` oder `websocket_manager.py`)
  diese Felder im Payload?

---

### FE-03 — CORS allow_methods Hardcoding in main.py

**Behauptung:**
In `main.py` (FastAPI-Einstiegspunkt) sind die `allow_methods` fuer CORS hartkodiert
anstatt aus dem `CORSSettings`-Konfigurationsobjekt gelesen zu werden. Das bedeutet:
Aenderungen an erlaubten HTTP-Methoden muessen an zwei Stellen gepflegt werden (Einstellung
und Hardcoding), was inkonsistente CORS-Konfiguration riskiert.

**Kern-Frage FE-03:**
- In welcher Zeile von `main.py` ist `allow_methods` hartkodiert? (Snippet)
- Existiert ein `CORSSettings`-Klasse oder -Objekt? Wo? (Datei:Zeile)
- Ist der Widerspruch noch vorhanden, oder wurde er zwischenzeitlich aufgeloest?

---

## SOLL — Was der TM liefern soll

TM verteilt an Frontend-Spezialisten (FE-01, FE-02 Frontend-Seite) und Backend-Spezialisten
(FE-02 Server-Seite, FE-03). Pro Unterpunkt:

1. **Status-Pruefung:** Ist die Luecke noch offen oder zwischenzeitlich behoben?
2. **Code-Evidenz (Pflicht):** Datei-Pfad, Zeilennummer, Snippet, Commit-Hash.
3. **Erklaerung:** 1-3 Saetze Kontext.
4. **Falls noch offen:** Konkrete Lueckenbeschreibung + Implementierungsempfehlung.

**Code-Beweis-Anforderung — JEDER Unterpunkt MUSS enthalten:**
- **Datei-Pfad** (Auto-one-relativ, z. B. `frontend/src/stores/sensor.store.ts`)
- **Zeilennummer(n)**
- **Code-Snippet** (3-15 Zeilen in Markdown-Codeblock)
- **Commit-Hash oder -Datum** (via `git log -1 --pretty="%H %ad" -- <datei>`)
- **Begruendung** in 1-3 Saetzen

---

## Eingebetteter Fachkontext

### Frontend-Architektur AutomationOne

**Stack:** Vue 3.5.13 + TypeScript + Pinia + Chart.js 4.5.0 (NICHT ECharts) + GridStack 12.1.2.
**148 Komponenten, 23 Pinia Stores, 36 Composables** (verifiziert AUT-175 E4).

**WebSocket-System:**
- 44 MessageType-Strings total (AUT-175 E4), davon 30 mit TypeScript-Interface.
- `esp.store.ts` behandelt 37 Event-Typen aktiv.
- WS-Events: 16 bekannte Haupt-Typen (u. a. `sensor_data`, `actuator_status`, `esp_discovered`,
  `zone_assignment`, `subzone_assignment`, `config_response`, `logic_execution`,
  `notification_updated`, `error_event`, `system_event`).
- Listener muessen in `onUnmounted` abgemeldet werden (Speicherleck-Risiko).

**Sensor-Store Matching-Problem (Kontext fuer FE-02):**
`sensorId`-Format intern: 3-teilig `espId:gpio:sensorType`.
In URL: 2-teilig `espId-gpio{gpio}`.
WS-Event-Matching in `sensor.store.ts` nutzt nur `gpio + sensor_type` — bei mehreren Sensoren
am gleichen GPIO (DS18B20 Multi-Instance) trifft das immer den ersten Eintrag (DS18B20-Overwrite-Bug
intern als NB6 markiert).

**Auth-System (relevant fuer FE-03 CORS):**
Queue-basierter Token-Refresh — genau ein Refresh gleichzeitig, parallele 401s werden gequeued.

**Server-Pfade (verifiziert):**
- FastAPI Einstiegspunkt: `main.py` im Server-Root (oder `src/main.py` — TM verifiziert).
- `sensor_handler.py` — Sensor-Daten-Verarbeitung und WS-Broadcast.
- `websocket_manager.py` — WS-Event-Distribution.
- `sensor_type_registry.py` — liegt unter `src/sensors/` (NICHT `src/services/`).

**Operator-Cockpit-Prinzipien (Kontext fuer Relevanz-Einschaetzung):**
1. Korrekte Entscheidungen unter Last — nicht nur schoenes UI.
2. Finalitaetsmodell: `accepted -> pending -> terminal (success|failed|timeout|partial)`.
3. Design-System: 129 Tokens mit semantischen Prefixes (`--color-*`, `--glass-*`,
   `--space-*`, `--elevation-*`). Kein `--ao-*` Prefix.
4. Icons: `lucide-vue-next` (keine Emoji-Icons).

**Sicherheitskritische Layout-Entscheidungen (unveraenderlich):**
- `SensorConfigPanel` nur in HardwareView (L1/L2). NIEMALS in SensorsView.
- `DashboardView` (`/dashboard-legacy`) ist LEGACY (wird entfernt).
- `InlineDashboardPanel mode-Prop`: 4 Modi: `'view' | 'manage' | 'inline' | 'side-panel'`.

---

## Akzeptanzkriterien

Der Bericht ist nur akzeptiert, wenn JEDER der folgenden Punkte drei Felder hat:
`STATUS` (IMPLEMENTIERT | TEILWEISE | OFFEN) + `Code-Evidenz` (Datei:Zeile+Snippet) + `Begruendung`.

| Punkt | Pruef-Frage | Erwartetes Feld |
|-------|-------------|-----------------|
| FE-01 | Wie viele der 14 fehlenden WS-Interfaces wurden nachgeruestet? Welche sind noch offen? | STATUS + Liste offener Interfaces + Evidenz |
| FE-02-FE | Enthaelt SensorDataEvent aktuell config_id / onewire_address / i2c_address? | STATUS + Evidenz |
| FE-02-BE | Sendet Server diese Felder im WS-SensorData-Payload? | STATUS + Evidenz |
| FE-02-Match | Nutzt sensor.store.ts diese Felder beim Matching? | STATUS + Evidenz |
| FE-03 | allow_methods hartkodiert in main.py? CORSSettings-Objekt vorhanden? | STATUS + Evidenz |

**Sonderfall:** Falls ein Punkt im Code komplett nicht auffindbar ist (Datei umbenannt,
Feature entfernt), explizit als "Quelle nicht auffindbar — Konkretisierung durch Robin noetig"
markieren. Kein Raten.

---

## Berichts-Struktur (verbindlich fuer den TM)

Datei: `bericht-AUT-190-frontend-fe01-fe02-fe03-2026-04-26.md` (in diesem Ordner)

```
# Bericht AUT-190 — Frontend-Verifikation FE-01/02/03

**Datum:** 2026-04-26
**Erstellt von:** [TM + Frontend-Spezialist + Backend-Spezialist]
**Commit-Stand:** [git log HEAD --format="%H %ad" -1]

## Executive Summary

- FE-01: [STATUS] — [X/14 Interfaces nachgeruestet, Y noch offen]
- FE-02: [STATUS] — [Frontend-Interface: ja/nein; Server-Payload: ja/nein; Matching: ja/nein]
- FE-03: [STATUS] — [allow_methods hartkodiert: ja/nein; CORSSettings vorhanden: ja/nein]

## FE-01 — WS MessageType Interface-Luecken

### Status
[IMPLEMENTIERT | TEILWEISE | OFFEN]

### Aktueller Zaehler
- MessageTypes gesamt: [N]
- Mit TypeScript-Interface: [N]
- Noch ohne Interface: [N] — Liste: [...]

### Code-Evidenz
Datei: `frontend/src/...`
Zeile: X
Commit: [hash] ([datum])
```ts
[Interface-Defintion oder fehlende Stelle]
```
Erklaerung: [1-3 Saetze]

### Empfehlung
[falls OFFEN: konkreter naechster Schritt]

## FE-02 — SensorDataEvent fehlende Felder (Cross-Layer)
### Frontend-Interface [IMPLEMENTIERT|OFFEN]
[Evidenz]
### Server-Payload [IMPLEMENTIERT|OFFEN]
[Evidenz]
### Store-Matching [IMPLEMENTIERT|OFFEN]
[Evidenz]

## FE-03 — CORS allow_methods Hardcoding
[Datei:Zeile, Snippet, Erklaerung, Empfehlung]

## Anhang: Konsultierte Spezialisten-Agenten
- [Agent-Name]: [Teilaufgabe] — [Sub-Befund in 1 Satz]

## Folge-Empfehlungen
[Was muesste als naechstes als Implementierungs-Issue raus?
 Format: "FE-0X: [Empfehlung] — Prio [HIGH/MEDIUM/LOW] — Schicht [Frontend|Backend|Cross-Layer]"]
```

---

## Hinweise fuer den TM

- **Kein Lesen von Life-Repo-Pfaden** — alle Evidenz aus dem Auto-one-Checkout.
- **Keine Implementierung** — nur Analyse. Auch wenn FE-03 trivial erscheint (1-Zeilen-Fix),
  bitte Empfehlung in "Folge-Empfehlungen" statt eigenmaechtigem Fix.
- **FE-02 erfordert Backend-Pruefung:** WS-Payload des Servers muss separat verifiziert
  werden. TM verteilt an Backend-Spezialisten fuer den Server-Pfad.
- **Git-Befehl:** `git log -1 --pretty="%H %ad" -- <datei>`
