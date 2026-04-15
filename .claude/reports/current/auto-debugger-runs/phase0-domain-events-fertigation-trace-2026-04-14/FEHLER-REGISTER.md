# FEHLER-REGISTER — phase0-domain-events-fertigation-trace-2026-04-14

| ID | Befund | Evidence | Fix / Status |
|----|--------|----------|--------------|
| FE-01 | `useFertigationKPIs` las WebSocket-Nachrichten aus `msg.payload` statt `msg.data` — Listener liefen ins Leere. | `El Frontend/src/services/websocket.ts` (`WebSocketMessage.data`); Composable vor Fix | **Behoben:** `message.data`, Hilfsfunktionen für `value` / Timestamp. |
| FE-02 | Runoff-Pfad nutzte `reading_value`, Inflow `processed_value` — Server sendet **`value`**. | `sensor_handler.py` broadcast | **Behoben:** einheitlich `numericFromSensorWsPayload` (`value`, Fallback `processed_value`/`reading_value`). |
| FE-03 | Integrationsdoku beschreibt falsches WS-API (`msg.payload`, `processed_value`). | `docs/FERTIGATION_WIDGET_INTEGRATION.md` Zeilen ~169–179 | **Offen (P1):** Doku anpassen oder auf diesen Bericht verweisen. |
