# Bereich 03 - Kommunikation und Topic-Contracts (IST-Revision 2026-04-05)

> Fokus: MQTT-Contracts, ACK-/Status-Semantik, Correlation und QoS-/Topic-Drift.
> Reality-Check: Firmware `mqtt_client.cpp` / `main.cpp`, Server `heartbeat_handler.py`, Referenz `MQTT_TOPICS.md` (v2.13).

## 1) Was war veraltet?

- Die alte Fassung enthielt nur FA-Einzelpunkte ohne klaren IST-Revisionsrahmen.
- Mehrere Punkte waren gemischt aus Liveness-, Contract- und QoS-Ebene statt getrennt priorisiert.

## 2) Was ist jetzt der IST-Stand?

- `FA-COM-001`: Registration-Gate ist fail-closed (`mqtt_client.cpp`: Timeout oeffnet nicht; Blockade bis gueltiger Heartbeat-ACK). In `main.cpp` folgt `confirmRegistration()` unmittelbar auf den ACK-Contract-Check (`handover_epoch` u.a.) und laeuft fuer jeden gueltigen ACK inkl. `pending_approval` und `error` — Publish-Gate und Freigabe-Status sind damit nicht dieselbe Semantik. Restluecke: P1 `SERVER_ACK_TIMEOUT` (120s) als zweiter Liveness-Pfad (Safe-State/P4) neben der Gate-Logik; DB/WebSocket (`heartbeat_handler.py`) liegen im Normalfall nach dem Early-ACK, nicht davor.
- `FA-COM-002`: Zwei Liveness-Kanaele (`system/heartbeat/ack` vs `kaiser/.../server/status`) existieren weiter; in `main.cpp` ist die Prioritaet festgelegt (`server/status` = Hint, Heartbeat-ACK = autoritative Recovery/Registration, inkl. stale-retain-Haertung nach Reconnect). Restluecke: Consumer ausserhalb dieser Firmware-Regel koennen Signale gleichwertig interpretieren.
- `FA-COM-003`: Correlation ist auf kritischen Pfaden hart (z.B. Config strikt ohne `correlation_id` → Contract-Fehler auf ESP; Server setzt MQTT-Request-CIDs in `subscriber.py`; Intent-Outcome mit `contract_version`). Restluecke: Kein einheitlicher Pflicht-Name/Semantik ueber alle Kanaele (z.B. `request_id` vs `correlation_id`); Firmware-`ensureCorrelationId` erzeugt Fallbacks — end-to-end Audit ohne Normalisierung bleibt lueckenhaft.
- `FA-COM-004`: ACK-Pfad traegt Versions- und Typ-Felder (`contract_version`, `ack_type`, `handover_epoch` laut Server-ACK und Referenz v2.13). Restluecke: Nicht jedes Topic/Payload nutzt dieselbe Schema-Versionsstrategie; Drift zwischen Firmware-Zweigen und Referenz bleibt moeglich.
- `FA-COM-005`: QoS-Semantik ist weiterhin kanalabhaengig (Referenztabelle und Publish-Aufrufe) und erzeugt unterschiedliche Liefergarantien — unveraendert beobachtbar.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-COM-003` (durchgaengige, konsumenten-taugliche Correlation-/Tracking-Semantik ueber alle kritischen Kanaele).
- **P1:** `FA-COM-001` (Gate-Oeffnung vs. Freigabe-Status vs. P1-ACK-Timeout), `FA-COM-002` (Zweikanal-Liveness fuer externe Consumer).
- **P2:** `FA-COM-004`, `FA-COM-005` (einheitliche Schema-Versionierung ueber alle Topics; QoS-Harmonisierung).

## 4) Was wurde in der Datei konkret angepasst?

- Einheitliches IST-Revisionsformat eingefuehrt.
- Kommunikationsbefunde nach Contract-Ebene priorisiert.
- Abnahmekriterien fuer ACK-/Topic-/QoS-Konsistenz ergaenzt.
- IST gegen Code/Reference verifiziert (2026-04-05): Registration-Gate, ACK-Contract, Subscriber-Correlation, Topic-QoS-Tabelle.
- IST-Zeilen zu `FA-COM-001`/`002`/`003`/`004` an fail-closed Gate, dokumentierte ACK-Prioritaet, Correlation-Stufen und ACK-Versionsfelder aus dem Code angeglichen; Priorisierung in Abschnitt 3 angepasst.
- `FA-COM-001` Restluecke korrigiert: fruehere Annahme „Server online vor ESP-Gate“ widerspricht Early-ACK-vor-DB/WebSocket in `heartbeat_handler.py`; stattdessen Gate vs. Freigabe-Status vs. P1-Timeout praezisiert.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn ACK, Correlation, Topic und QoS als getrennte Risikoebenen priorisiert sind.
- **Nicht bestanden**, wenn Liveness- und Contract-Fehler weiter vermischt ohne klare Gates bleiben.

