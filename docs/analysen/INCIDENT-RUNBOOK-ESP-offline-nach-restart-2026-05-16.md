# Incident Runbook: ESP bleibt offline nach Restart

## Ziel
Schnelle Eingrenzung, wenn ein ESP nach Server-/DB-Restart im Frontend `offline` bleibt.

## 1) Datenbankzustand pruefen
- `esp_devices.status` fuer betroffenes Geraet pruefen.
- `esp_devices.last_seen` pruefen: muss letzter echter Heartbeat-Zeitpunkt sein.
- Wenn `status=offline` und `last_seen` frisch auf Offline-Zeit wirkt: auf Policy-Verletzung achten.

## 2) MQTT-Ereigniskette pruefen
- LWT-Eingang fuer das Geraet pruefen (`.../system/will`).
- Ersten validen Heartbeat nach Restart pruefen (`.../system/heartbeat`).
- Erwartung: Nach erstem validen Heartbeat folgt deterministisch `status=online`.

## 3) WebSocket-Stream pruefen
- `esp_health`-Events fuer `esp_id` beobachten.
- Erwartete Reihenfolge im Recovery-Fall:
  1. `offline` (Quelle: `lwt` oder `heartbeat_timeout`)
  2. `online` (Quelle: `heartbeat`)

## 4) Frontend-Konsistenz pruefen
- Bei `esp_health: online` muss `offlineInfo` lokal geloescht werden.
- Badge muss innerhalb eines Heartbeat-Zyklus wieder auf `online` springen.

## 5) Wenn Problem weiter besteht
- Reconnect-Laufzeitdaten (`is_reconnect`, `last_disconnect`) gegenpruefen.
- Prüfen, ob Heartbeat mit gueltigem `ts` ankommt (bei `ts<=0` gilt Server-Zeit-Fallback).
- Einen gezielten Neustart-Test laufen lassen: `LWT -> Heartbeat`, dreimal hintereinander.
