# Bereich 03 - Kommunikation und Topic-Contracts (IST-Revision 2026-04-04)

> Fokus: MQTT-Contracts, ACK-/Status-Semantik, Correlation und QoS-/Topic-Drift.

## 1) Was war veraltet?

- Die alte Fassung enthielt nur FA-Einzelpunkte ohne klaren IST-Revisionsrahmen.
- Mehrere Punkte waren gemischt aus Liveness-, Contract- und QoS-Ebene statt getrennt priorisiert.

## 2) Was ist jetzt der IST-Stand?

- `FA-COM-001`: Registration-Timeout als Gate-Fallback ohne harten ACK-Nachweis bleibt kritisch.
- `FA-COM-002`: Doppeltes Online-Signal (`heartbeat/ack` vs `server/status`) bleibt semantisch konfliktanfaellig.
- `FA-COM-003`: Durchgaengige Correlation-Pflicht ueber alle kritischen Kanaele bleibt offen.
- `FA-COM-004`: Topic-/Schema-Drift ohne harten Versionsanker bleibt mittleres Risiko.
- `FA-COM-005`: QoS-Semantik ist kanalabhaengig und erzeugt unterschiedliche Liefergarantien.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-COM-001`, `FA-COM-003` (ACK-Autoritaet und Korrelation als Kernvertrag).
- **P1:** `FA-COM-002` (Liveness/ACK-Prioritaetsregel).
- **P2:** `FA-COM-004`, `FA-COM-005` (Versionierung und QoS-Harmonisierung).

## 4) Was wurde in der Datei konkret angepasst?

- Einheitliches IST-Revisionsformat eingefuehrt.
- Kommunikationsbefunde nach Contract-Ebene priorisiert.
- Abnahmekriterien fuer ACK-/Topic-/QoS-Konsistenz ergaenzt.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn ACK, Correlation, Topic und QoS als getrennte Risikoebenen priorisiert sind.
- **Nicht bestanden**, wenn Liveness- und Contract-Fehler weiter vermischt ohne klare Gates bleiben.

