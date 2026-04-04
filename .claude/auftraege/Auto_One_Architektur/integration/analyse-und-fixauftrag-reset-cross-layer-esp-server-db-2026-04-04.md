# Analyse- und Fixauftrag: Reset-Finalitaet Cross-Layer (ESP, Server, Datenbank)

**Stand:** 2026-04-04  
**Typ:** Vollstaendiger Analyse- und Umsetzungsauftrag  
**Scope:** ESP-Firmware, Server-Runtime, Datenmodell/Persistenz  
**Primaerziel:** Deterministischer Reset-Flow (Stromverlust) ohne Autoritaetsbruch, ohne Contract-Drift und ohne Finalitaetsverlust.

---

## 1) Executive Ergebnisbild

Der Reset-Fokus ist funktional weit, aber noch nicht abnahmefaehig.  
Die aktuelle Lage zeigt einen robusten lokalen Runtime-Kern, aber eine kritische Cross-Layer-Vertragsluecke:

1. Device laeuft lokal weiter und kann Regeln ausfuehren.
2. Heartbeat-ACK wird fail-closed abgewiesen, wenn `handover_epoch` fehlt.
3. Dadurch bleibt Registration pending.
4. Gleichzeitig sind wirksame Kommandopfade teilweise weiterhin aktiv.

Diese Kombination erzeugt einen inkonsistenten Autoritaetszustand:

- **Kontrollpfad sagt "nicht registriert"**,  
- **Aktorpfad fuehrt trotzdem Kommandos aus**.

Das ist der zentrale P0-Blocker fuer Cross-Layer-Finalitaet.

---

## 2) Harte Invarianten (muessen alle gleichzeitig gelten)

1. **Reset-Autonomie-Invariante**  
   Nach Stromrueckkehr und gueltiger lokaler Lage startet lokale Runtime deterministisch.

2. **ACK-Contract-Invariante**  
   Ohne vollstaendig gueltiges ACK darf keine Registration-/Online-Freigabe wirksam werden.

3. **Admission-Invariante**  
   Solange Registration pending ist, duerfen nicht autorisierte Online-Kommandos keine Aktorwirkung ausloesen.

4. **Session-Invariante**  
   ACK/Adoption muessen an eine gueltige Handover-Session gebunden sein.

5. **Finalitaets-Invariante**  
   Kritische Intents sind terminal write-once, auch nach Reset/Burst.

6. **Queue-Invariante**  
   Recovery und kritische Klassen bleiben unter Last priorisiert.

7. **Daten-Invariante**  
   Persistenzzustand ist bei Teilerfolg scope-monoton und reproduzierbar.

---

## 3) Logevidenz (entscheidend)

### EVIDENZ A - ACK fail-closed aktiv
- Mehrfach: `ACK contract reject: code=MISSING_HANDOVER_EPOCH`
- Mehrfach: `Heartbeat ACK missing handover_epoch — reject (fail-closed)`
- Counter steigt fortlaufend (`handover_contract_reject_count`).

**Interpretation:**  
Der ACK-Contract ist jetzt korrekt streng. Das ist positiv.

### EVIDENZ B - Registration bleibt geschlossen
- `Registration timeout observed - waiting for explicit heartbeat ACK (gate stays closed)`
- `Sensor Manager: Registration pending (no heartbeat ACK), skipping publish`

**Interpretation:**  
Control-plane verhaelt sich konsistent fail-closed.

### EVIDENZ C - Trotz pending Registration wirksame Aktorausfuehrung
- Eingang Aktorkommando sichtbar.
- `Actuator command executed: GPIO 14 ON = 1.00`

**Interpretation (kritisch):**  
Admission ist nicht durchgaengig an Registration-Status gekoppelt.

### EVIDENZ D - Persistenzstart mit leerer Aktorkonfig + spaeterer Push
- `Found 0 actuator(s) in NVS`
- `NVS blob size mismatch ... waiting for config push`
- spaeter Config push erfolgreich.

**Interpretation:**  
Reset-Kaltstart kann in einen Zwischenzustand mit fehlender Aktor-/Regelbasis fallen.  
Das muss als definierte Runtime-Stufe modelliert werden, nicht als stiller Normalbetrieb.

---

## 4) P0/P1/P2 Restluecken (Cross-Layer)

## P0-1 Kritisch: Registration-Gate vs Aktor-Admission entkoppelt

### Ist
- Registration bleibt zu, wenn ACK-Contract fehlt.
- Mindestens ein Aktorkommando wird trotzdem ausgefuehrt.

### Soll
- Ohne Registration/Sessionfreigabe keine wirksame externe Aktorsteuerung (ausser expliziter Safety-Ausnahme).

### Fixrichtung
- Einheitlicher Admission-Guard fuer alle externen Aktorkommandos:
  - wenn `registration_pending == true` dann reject mit Code (z. B. `REGISTRATION_PENDING`).
- Gleiche Guardfamilie fuer Sensor/Config/Aktor Intake (kontextspezifisch).

### Risiko
- **Sehr hoch** (Autoritaetsbruch).

---

## P0-2 Kritisch: Server sendet unvollstaendigen ACK-Contract

### Ist
- Heartbeat-ACKs kommen ohne `handover_epoch`.
- Device reagiert korrekt mit fail-closed.

### Soll
- Jeder ACK im relevanten Pfad enthaelt verpflichtend:
  - `handover_epoch`
  - optional `session_id` / `contract_version`
  - `ack_type` eindeutig.

### Fixrichtung
- Server-ACK-Builder auf Pflichtschema haerten.
- ACK ohne Pflichtfelder bereits serverseitig blocken/alarmeren.
- Contract-Version im ACK explizit mitliefern.

### Risiko
- **Sehr hoch** (dauerhaft keine gueltige Uebergabe moeglich).

---

## P1-1 Finalitaet ueber Reset/Burst (ESP + DB)

### Ist
- Device hat terminalen RAM-Store.
- Publish/Outcome kann bei Verbindungsproblemen fehlschlagen.

### Soll
- Kritische terminale Outcomes bleiben deduplizierbar und nachvollziehbar trotz Reset/Burst.

### Fixrichtung
- Device: persistente Mini-Historie fuer kritische terminale Intents.
- Server/DB: idempotentes Upsert pro `intent_id` mit final-state write-once.
- Outbox/Retry-Pfad fuer Outcome-Ingest robust machen.

### Risiko
- **Hoch** (doppelte oder verlorene Finalisierung).

---

## P1-2 Queue-/Publish-Haertung unter Last

### Ist
- Viele `SafePublish failed after retry`.
- Outcome-Publishes schlagen wiederholt fehl.

### Soll
- Kritische Outcomes duerfen nicht still untergehen; recovery-first Drain.

### Fixrichtung
- Einheitliches 3-Lane-Modell (`critical_recovery`, `critical`, `normal`).
- Kritische Outcome-Klasse mit staerkerem Retry- und Persistenzpfad.
- Explizite backpressure-Codes statt stiller Degradation.

### Risiko
- **Hoch** (fehlende Nachweisbarkeit trotz lokaler Wirkung).

---

## P1-3 Reset-Startup-Stufenmodell bei leeren NVS-Teilen

### Ist
- Sensoren vorhanden, Aktoren initial leer, Regeln blob mismatch, spaeter Push.

### Soll
- Explizite Zwischenstufe statt impliziter Normalbetrieb:
  - `LOCAL_RUNTIME_DEGRADED_CONFIG_PENDING` (oder aequivalent).

### Fixrichtung
- Laufzeitstufen mit Guard:
  - noch keine wirksame Aktorlogik bis minimale Konfigbasis stabil.
- Klarer Telemetrie-/Statusmarker fuer "warte auf config push".

### Risiko
- **Mittel/Hoch** (schwer reproduzierbare Randfaelle).

---

## P2-1 Metrik-Kontinuitaet ueber Power-Cycles

### Ist
- Counter vorhanden, aber Langlaufkontinuitaet begrenzt.

### Soll
- Maschinenlesbare Kontinuitaet je Bootsegment.

### Fixrichtung
- `boot_sequence_id`, `reset_reason`, `counter_base` mitgeben.
- Klare Segmentierungsregel fuer 24h-Auswertung.

### Risiko
- **Mittel**.

---

## 5) Analyseauftrag nach Schichten

## A) ESP-Schicht

1. Vollstaendige Admission-Matrix erstellen:
   - Welche Eingangsarten sind bei `registration_pending` erlaubt/verboten?
2. Alle Aktorpfade auf Registration-/Sessionguard pruefen.
3. Runtime-Statusmodell um "config pending nach reset" pruefen/haerten.
4. Outcome-Publish-Failures klassifizieren:
   - retryable,
   - persist-before-publish,
   - dropped (verboten fuer kritisch).

**Pflichtnachweis ESP:**  
Kein externer Aktoreffekt ohne gueltigen Contract-Zustand.

---

## B) Server-Schicht

1. ACK-Erzeugung fuer Heartbeat/Recovery-Endpunkte pruefen:
   - Pflichtfeld `handover_epoch` immer vorhanden?
2. ACK-Versionierung und Validierung im Ausgabepfad.
3. Contract-Monitoring:
   - Anteil invalider ACKs,
   - Ablehnungsgruende am Device korrelieren.
4. Recovery-Orchestrierung:
   - Sessionstart, Sessionepoch, sessionfinalize deterministisch.

**Pflichtnachweis Server:**  
Kein ACK ohne Pflichtschema wird produktiv versendet.

---

## C) Datenbank-/Persistenzschicht

1. Finale Outcome-Persistenz auf write-once pro Intent pruefen.
2. Idempotenz bei Duplicate/Retry/Reorder.
3. Outbox-/Inbox-Luecken fuer kritische Outcomes schliessen.
4. Korrelation zwischen:
   - befohlen,
   - ausgefuehrt,
   - final bestaetigt.

**Pflichtnachweis DB:**  
Kritische Intents bleiben auch bei Verbindungsstoerung final nachvollziehbar.

---

## 6) Testmatrix (Cross-Layer, Reset-zentriert)

1. **T1 Reset + ACK ohne `handover_epoch`**
   - Erwartung: fail-closed, keine Registration, keine externe Aktorwirkung.

2. **T2 Reset + gueltiger ACK-Contract**
   - Erwartung: kontrollierte Registration, session-scharfe Uebergabe.

3. **T3 Registration pending + externes Aktorkommando**
   - Erwartung: reject ohne Aktorwirkung.

4. **T4 Reset + config pending (Aktoren fehlen initial)**
   - Erwartung: degradierter Runtime-Status, keine stillen Falschannahmen.

5. **T5 Burst + Publish-Fehler auf kritischen Outcomes**
   - Erwartung: keine stille Outcome-Luecke; persistenter Recoverypfad.

6. **T6 24h Soak mit Power-Cycles**
   - Erwartung: stabile Metriksegmentierung und finale Nachvollziehbarkeit.

---

## 7) Umsetzungsreihenfolge fuer naechstes `/do`

1. **P0 zuerst**
   - ACK-Contract serverseitig vervollstaendigen.
   - Admission-Guard ESP-seitig fuer Aktorkommandos an Registration koppeln.

2. **P1 danach**
   - Finalitaet persistent und idempotent cross-layer.
   - Queue-/Publish-Lanes vereinheitlichen.
   - Reset-Config-pending Runtime-Status explizit machen.

3. **P2 abschliessend**
   - Metrik-Kontinuitaet und Langlaufnachweis.

---

## 8) Harte Abnahmekriterien

- [ ] Kein wirksames externes Aktorkommando bei `registration_pending`.
- [ ] Jeder produktive ACK enthaelt gueltiges `handover_epoch`.
- [ ] Keine Registration-/Online-Freigabe vor kompletter ACK-Validierung.
- [ ] Kritische Intent-Finalitaet ist reset-/burst-robust und idempotent.
- [ ] Queue-/Publish-Verhalten priorisiert kritische Recovery-Pfade reproduzierbar.
- [ ] Startup mit partiell leerer Konfig ist als expliziter Runtime-Status modelliert.
- [ ] 24h-Metriken sind ueber Power-Cycles maschinell konsistent auswertbar.

Wenn einer dieser Punkte nicht belegt ist, gilt der Auftrag als nicht bestanden.

