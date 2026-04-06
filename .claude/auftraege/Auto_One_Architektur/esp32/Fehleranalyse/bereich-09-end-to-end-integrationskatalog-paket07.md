# Bereich 09 - End-to-End Integrationskatalog (Paket 07)

> Fokus: Reale E2E-Ketten `Sensor`, `Config`, `Command`, `Offline->Reconnect->ONLINE_ACKED` ueber Firmware -> Server -> DB -> UI, mit terminaler Korrektheit und Grenzfall-Sicht.

## 1) Was war veraltet?

1. Die alte Aussage "Config hat keinen deterministischen Terminalzustand" ist im jetzigen Stand zu pauschal.  
   In den Negativpfaden werden heute `config_response` und `intent_outcome` mit `correlation_id` erzeugt (`QUEUE_FULL`, `REPLAY_QUEUE_FULL`, `JSON_PARSE_ERROR`, `CONTRACT_CORRELATION_MISSING`, `STALE_SCOPE`, `COMMIT_FAILED`).
2. Die alte Aussage "Command-Queue-Drops verlieren Kausalitaet bis UI" ist in dieser Form nicht mehr korrekt.  
   Admission-/Queue-Fails erzeugen `intent_outcome`-Terminalevents; Server persistiert diese mit Monotonie-/Finalitaetsguard; Frontend behandelt Terminalitaet idempotent.
3. Die alte Aussage "ONLINE ist nicht von ACK entkoppelt" ist teilweise veraltet.  
   `kaiser/{kaiser_id}/server/status` mit `status=online` wird als Hinweis behandelt; der autoritative Uebergang erfolgt erst nach valider Heartbeat-ACK-Pruefung (`status`, `handover_epoch` + Contract-Match).
4. Weiterhin korrekt geblieben ist die Kernluecke bei Sensor-Telemetrie: keine harte Ende-zu-Ende-Bestaetigung bis zur Firmware.

## 2) Was ist jetzt der IST-Stand?

### E2E-01 Sensorkette (Firmware -> MQTT -> Server -> DB -> UI)

- **Ist-Stand:** Sensorwerte werden ueber `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` publiziert; es gibt keinen dedizierten Sensor-ACK-Vertrag zur Firmware.
- **Terminalitaet:** Nicht durchgaengig als "genau ein terminales Ergebnis je Messung" modelliert.
- **DB/UI-Sicht:** Empfangene Daten sind sichtbar; nicht empfangene Daten bleiben nur indirekt erklaerbar.
- **Bewertung:** **weiterhin offen (hoch)**.

### E2E-02 Configkette (Server-Request -> Firmware-Apply -> Server/DB/UI)

- **Ist-Stand:** `correlation_id` ist im Config-Pfad verpflichtend; Missing/Queue/Parse/Apply-Fehler werden explizit als `config_response` + `intent_outcome` emittiert.
- **Server/DB:** Canonicalisierung plus terminal authority (`command_outcomes`) verhindert stale/non-final Rueckschreiben.
- **UI:** Config-Events werden per `correlation_id` finalisiert; nicht finalisierbare Events werden als Contract-Issue sichtbar gemacht (nicht still ignoriert).
- **Bewertung:** **deutlich gehaertet, Restpunkte siehe Abschnitt 3**.

### E2E-03 Commandkette (REST/MQTT-Command -> Firmware -> Response -> UI)

- **Ist-Stand:** Queue-Full/Rejection-Pfade erzeugen explizite Outcomes; normale Erfolgs-/Fehlerpfade sind korreliert (`correlation_id`, `request_id`).
- **Server/DB:** `intent_outcome` wird persistiert, dedupliziert und mit Finalitaetsregeln verarbeitet.
- **UI:** Terminalstatus ist idempotent (`created -> pending -> terminal`), Duplikate werden nicht erneut geoeffnet.
- **Bewertung:** **funktional konsistent fuer Terminalitaet**, keine pauschale "Kausalitaetsluecke bis UI" mehr belegbar.

### E2E-04 OFFLINE -> RECONNECT -> ONLINE_ACKED

- **Ist-Stand:** `kaiser/{kaiser_id}/server/status` (Online-/Offline-Hinweis) ist von der autoritativen Heartbeat-ACK-Validierung auf `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack` getrennt; ACK erfordert gueltige Contract-Felder (`status`, `handover_epoch`) und Contract-Match.
- **State-Guards:** Stale retained Offline-Hinweise nach Reconnect werden abgefangen; Recovery folgt ACK-Contract statt fruehem Link-Hinweis.
- **Server-Seite:** Heartbeat-ACK wird mit `handover_epoch` erzeugt; Metriken fuer ACK-/Reconciliation-Lebenszyklus vorhanden.
- **Bewertung:** **wesentlich verbessert, semantische Trennung ist implementiert**.

## 3) Welche Restluecken bleiben?

## FA-E2E-001 - Sensor-Telemetrie ohne harte Ende-zu-Ende Zustellbestaetigung bleibt offen

- **Betroffene Kette:** Measurement -> Publish -> Ingestion -> Persistenz -> UI
- **Reproduzierbare Luecke:** Es existiert kein verpflichtender Rueckkanal "Messung X ist persistent/terminal verarbeitet".
- **Folge:** Datenluecken bleiben teils nur indirekt attribuierbar (Transport vs. Queue/Outbox vs. Ingestion-Ausfall).
- **Prioritaet:** **P0 / hoch**

## FA-E2E-002 - Nicht-kritische Publish-Drops sind nicht immer als terminales Intent-Outcome sichtbar

- **Betroffene Kette:** Firmware Publish-Queue/Outbox unter Last
- **Reproduzierbare Luecke:** `publish`-Outcome-Emission ist fuer kritische Pfade ausgepraegter; fuer nicht-kritische Telemetrie fehlt durchgaengige Terminalsicht pro Event.
- **Folge:** Teilweise Beobachtungsluecke bei Last-/Backpressure-Szenarien.
- **Prioritaet:** **P1**

## FA-E2E-003 - QoS-/Contract-SoT bleibt verteilt statt zentral versioniert

- **Betroffene Kette:** Firmware TopicBuilder + Server TopicBuilder + Dokumentation
- **Reproduzierbare Luecke:** Kein einzelnes maschinenlesbares, versionsgefuehrtes Source-of-Truth-Artefakt fuer Topic+QoS+Terminalregeln.
- **Folge:** Drift-Risiko bei spaeteren Erweiterungen/Refactorings bleibt.
- **Prioritaet:** **P1**

## 4) Was wurde in der Datei konkret angepasst?

- Den alten statischen Fehlerkatalog durch einen IST-basierten Integrationskatalog ersetzt (veraltet vs. aktuell getrennt).
- Die vier Pflichtketten einzeln neu bewertet und mit aktuellem terminalen Verhalten beschrieben.
- Veraltete Pauschalfindings zu Config/Command/ACK explizit bereinigt und in "gehaertet, aber Restpunkte" ueberfuehrt.
- Verbleibende Restluecken auf drei reproduzierbare Findings verdichtet und priorisiert (P0/P1).
- Verbindliche Abnahmekriterien fuer Schritt 10 ergaenzt.

## Abnahmekriterien (Schritt 10)

- **Bestanden**, wenn:
  1) die vier E2E-Ketten separat mit aktuellem IST-Stand dokumentiert sind,  
  2) veraltete Aussagen explizit als veraltet markiert und fachlich korrigiert sind,  
  3) verbleibende Risiken als reproduzierbare Findings mit Prioritaet vorhanden sind,  
  4) terminale Korrektheit (Config/Command/Offline-ACK) explizit bewertet ist.
- **Nicht bestanden**, wenn einer der vier Punkte fehlt oder alte, inzwischen widerlegte Pauschalaussagen unveraendert stehen bleiben.
