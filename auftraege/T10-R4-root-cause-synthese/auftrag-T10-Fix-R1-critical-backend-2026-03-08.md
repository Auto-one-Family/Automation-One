# Auftrag T10-Fix-R1: CRITICAL Backend — sensor_repo + timestamp + datetime + delete

> **Bezug:** T10-R4 Root-Cause-Synthese (2026-03-08)
> **Prioritaet:** CRITICAL (P0)
> **Datum:** 2026-03-08
> **Geschaetzter Aufwand:** ~2.5 Stunden
> **Ersetzt:** auftrag-T10-fixA, auftrag-T10-fixB (veraltet, neue Root-Cause-Analyse)
> **Voraussetzung:** Docker-Stack laeuft, alle Tests gruen
> **Naechster Schritt:** T11-Retest (Phasen 6, 10, 11) nach Abschluss

---

## Ziel

~~4 unabhaengige CRITICAL-Backend-Bugs fixen.~~ **[verify-plan: 2 von 4 bereits gefixt]** — nur Fix 2 (Timestamp) und Fix 4 (Subzone DateTime) muessen noch implementiert werden. Fix 1 (sensor_repo) und Fix 3 (notification JSONB) sind bereits im Working Tree. Verbleibender Aufwand: ~1h statt ~2.5h.

---

## Fix 1: BUG-08 — sensor_repo MultipleResultsFound (~1h)

> **[BEREITS GEFIXT — verify-plan 2026-03-08]**
> Dieser Fix ist bereits im Working Tree implementiert (Branch feat/session-sync-2026-03-08):
> - `sensor_repo.py:86-121`: `get_by_esp_gpio_and_type()` verwendet bereits list-basierte Abfrage statt `scalar_one_or_none()`. Docstring sagt explizit "BUG-08 fix" (Zeile 95).
> - `sensor_handler.py:204-222`: OneWire 4-Way-Lookup mit Fallback auf 3-Way bereits implementiert (inkl. I2C 4-Way via `get_by_esp_gpio_type_and_i2c()` ab Zeile 195).
> - **Aktion:** Nur noch committen und verifizieren — KEINE Code-Aenderung noetig.
> - **Hinweis:** Weitere Aufrufer nutzen weiterhin die 3-Way-Methode (`config_handler.py:369`, `sensors.py:495/618/744/1356`, `debug.py:891/938/1145`, `sensor_service.py:90/145/549`). Durch den list-basierten Fix in sensor_repo.py crashen diese nicht mehr, koennen aber bei mehreren DS18B20 auf gleichem GPIO den falschen Sensor zurueckgeben. Ggf. als separates Ticket erfassen.

### IST (veraltet — bereits gefixt)
~~Die Methode `get_by_esp_gpio_and_type()` in `sensor_repo.py` (ca. Zeile 103-109) filtert nur nach `(esp_id, gpio, sensor_type)`. Bei OneWire-Bus (mehrere DS18B20 auf gleichem GPIO) liefert die Query 2+ Rows. `scalar_one_or_none()` wirft `MultipleResultsFound`. Ergebnis: 110 Exceptions/30min, DS18B20-Daten werden NICHT gespeichert.~~

### SOLL (veraltet — bereits gefixt)
~~Wenn `onewire_address` im Payload vorhanden, muss die 4-Way-Methode `get_by_esp_gpio_type_and_onewire()` (existiert bereits, ca. Zeile 864) verwendet werden. Fallback auf 3-Way-Methode nur wenn kein `onewire_address`.~~

### Begruendung
OneWire-Bus erlaubt mehrere Sensoren auf einem GPIO. Das UNIQUE-Constraint der DB ist `(esp_id, gpio, sensor_type, onewire_address, i2c_address)`. Die Query muss denselben Composite-Key verwenden wie die DB. Die 4-Way-Methode existiert bereits — sie muss nur an den richtigen Stellen aufgerufen werden.

### Betroffene Dateien
1. ~~**sensor_handler.py** — Aufrufer von `get_by_esp_gpio_and_type()` finden und auf `get_by_esp_gpio_type_and_onewire()` umstellen wenn `payload.get("onewire_address")` vorhanden~~ **DONE**
2. ~~**sensor_repo.py** — Pruefe ob die 4-Way-Methode (Zeile ~864) `scalar_one_or_none()` korrekt verwendet. Falls ja: keine Aenderung noetig~~ **DONE (3-Way-Methode auf list-basiert umgestellt)**

### Akzeptanzkriterien
- [x] `{compose_service="el-servador"} |= "MultipleResultsFound"` → 0 Treffer in 30 Minuten
- [ ] DS18B20-Daten werden fuer MOCK_A3592B7E GPIO 4 gespeichert: `SELECT COUNT(*) FROM sensor_data ... WHERE created_at > NOW() - interval '10 minutes'` → > 0 **(noch zu verifizieren)**
- [ ] Bestehende Tests gruen (insbesondere sensor_repo Tests) **(noch zu verifizieren)**
- [ ] SHT31-Daten weiterhin korrekt gespeichert (Regression-Check) **(noch zu verifizieren)**

### Was NICHT gemacht werden soll
- Keine Aenderung am UNIQUE-Constraint
- Keine Aenderung an der 4-Way-Methode selbst (nur Aufrufer umstellen)
- Keine Frontend-Aenderungen

---

## Fix 2: BUG-05+06 — Timestamp ts<=0 Guard (~30 Min)

### IST
`sensor_handler.py` (ca. Zeile 329-337) konvertiert `payload["ts"]` direkt in `datetime.fromtimestamp()`. Bei `ts=0` (Wokwi ohne NTP) → `created_at = 1970-01-01`. Gleiches Problem in `heartbeat_handler.py` (ca. Zeile 202): `last_seen = 1970-01-01` → Maintenance setzt Device offline → Endlos-Flicker.

Die Validierung in `sensor_handler.py` (ca. Zeile 680-727) prueft nur ob `ts` vorhanden und `int` ist, NICHT ob `ts > 0`.

### SOLL
Server-Timestamp-Fallback an 3 Stellen:
1. `sensor_handler.py` Timestamp-Konvertierung (Zeile 329): `if esp32_timestamp_raw is None or esp32_timestamp_raw <= 0: esp32_timestamp = datetime.now(timezone.utc).replace(tzinfo=None)` — **Hinweis:** Variable heisst `esp32_timestamp_raw` (nicht `ts_value`)
2. `heartbeat_handler.py` last_seen-Berechnung (Zeile 202): `if payload["ts"] <= 0: last_seen = datetime.now(timezone.utc)` — **Hinweis:** Variable hier heisst `ts_value` (nach der Division)
3. `sensor_handler.py` Validierung (nach Zeile 727, nach isinstance-Check): `ts_value > 0` als zusaetzliche Pruefung

### Begruendung
Wokwi-Simulation (und jeder ESP ohne NTP-Sync, z.B. beim ersten Boot) sendet `ts=0`. Der Server muss als Fallback seinen eigenen Timestamp verwenden — er hat immer eine korrekte Uhrzeit. Daten mit Timestamp 1970-01-01 sind via API-Zeitfilter (`WHERE created_at > NOW() - interval '24h'`) unsichtbar → faktischer Datenverlust.

### Betroffene Dateien
1. **sensor_handler.py** — Timestamp-Konvertierung (Zeile 329-337) + Validierung (Zeile 720-727, ts > 0 Guard nach isinstance-Check einfuegen)
2. **heartbeat_handler.py** — last_seen-Berechnung (Zeile 202-203)

### Akzeptanzkriterien
- [ ] Wokwi-ESP mit `ts=0` → Daten in DB mit aktuellem Server-Timestamp
- [ ] `SELECT COUNT(*) FROM sensor_data WHERE created_at < '1971-01-01'` → 0 neue Rows
- [ ] Wokwi-ESP Status bleibt stabil "online" (kein Flicker)
- [ ] Echter ESP (mit NTP) weiterhin eigenen Timestamp → keine Regression
- [ ] Bestehende Tests gruen

### Was NICHT gemacht werden soll
- NICHT die 134 bestehenden Epoch-Rows fixen (kommt in Fix-Runde 4 als SQL-Cleanup)
- NICHT den Frontend `useESPStatus.ts` Fallback aendern (separate Aufgabe)
- NICHT das Heartbeat-Intervall oder Maintenance-Timeout aendern

---

## Fix 3: BUG-11 — notification_repo .astext Fix (~15 Min)

> **[BEREITS GEFIXT — verify-plan 2026-03-08]**
> Dieser Fix ist bereits im Working Tree implementiert (Branch feat/session-sync-2026-03-08):
> - `notification.py:139-140`: Spalte `extra_data` ist bereits `JSONB` (nicht mehr `JSON`).
> - Alembic-Migration `change_notification_extra_data_to_jsonb.py` existiert bereits (untracked).
> - `notification_repo.py:621`: `.astext` ist korrekt fuer JSONB — kein Code-Fix noetig.
> - **Aktion:** Migration committen, auf DB anwenden (`alembic upgrade head`), verifizieren.

> **Korrekturen am Plan (fuer TM):**
> - **Falscher Methodenname:** Plan sagt `resolve_all_for_device()` → richtig: `resolve_alerts_for_device()` (Zeile 603)
> - **Falsche Aufrufkette:** Plan sagt `esp_service.delete_device()` → richtig: `esp.py:614 delete_device()` ruft direkt `notif_repo.resolve_alerts_for_device(esp_id)` auf (Zeile 656), NICHT ueber esp_service

### IST (veraltet — bereits gefixt)
~~`notification_repo.py` (ca. Zeile 621) verwendet `Notification.extra_data["esp_id"].astext == esp_id`. Die Spalte `Notification.extra_data` ist als `Column(JSON)` deklariert (in `notification.py`, ca. Zeile 139), NICHT als `JSONB`. `.astext` existiert nur auf JSONB-Columns → `AttributeError` bei jedem Device-DELETE.~~

Aufrufkette (korrigiert):
```
DELETE /api/v1/esp/devices/{id}
  → esp.py:614 delete_device()          (API-Endpoint, NICHT esp_service)
    → notif_repo.resolve_alerts_for_device(esp_id)  (Zeile 656, Methode: Zeile 603)
      → notification_repo.py:621  ← .astext jetzt korrekt (JSONB)
```

### SOLL (veraltet — Option B bereits umgesetzt)
~~**Option A (Quick-Fix):** `.astext` ersetzen durch `cast(Notification.extra_data["esp_id"], Text)`.~~

~~**Option B (Empfohlen):** Column-Typ von `JSON` auf `JSONB` aendern via Alembic-Migration.~~ **DONE**

### Begruendung
PostgreSQL unterscheidet `JSON` (Text-Storage) und `JSONB` (Binary, mit Index-Support). SQLAlchemy's `.astext` Property ist nur fuer `JSONB` implementiert. Da `extra_data` bereits als JSON genutzt wird, ist die Migration auf JSONB ohne Datenverlust moeglich und bringt Performance-Vorteile.

### Betroffene Dateien
1. ~~**notification_repo.py** — Zeile ~621: `.astext` ersetzen oder beibehalten~~ **Bleibt (JSONB korrekt)**
2. ~~**notification.py** — Model: `Column(JSON)` → `Column(JSONB)`~~ **DONE**
3. ~~**Alembic-Migration** — `alter_column` fuer extra_data~~ **DONE** (`change_notification_extra_data_to_jsonb.py`)

### Akzeptanzkriterien
- [ ] `DELETE /api/v1/esp/devices/{test_id}` → HTTP 200/204 (nicht 500) **(noch zu verifizieren)**
- [ ] `{compose_service="el-servador"} |= "astext"` → 0 Treffer **(noch zu verifizieren)**
- [ ] Existierende Notifications weiterhin lesbar **(noch zu verifizieren)**
- [ ] Bestehende Tests gruen **(noch zu verifizieren)**
- [ ] **Migration angewendet:** `alembic upgrade head` erfolgreich **(noch zu verifizieren)**

### Was NICHT gemacht werden soll
- NICHT die gesamte Notification-Architektur umbauen
- NICHT andere JSON-Columns migrieren (nur extra_data)

---

## Fix 4: BUG-02 — Subzone-ACK DateTime Crash (~45 Min)

### IST
`subzone.py` (ca. Zeile 127-131) definiert `last_ack_at` als `DateTime` OHNE `timezone=True`. PostgreSQL speichert als `TIMESTAMP WITHOUT TIME ZONE`. Python-Code setzt `datetime.now(timezone.utc)` (aware). Vergleich `naive_from_db - aware_from_python` → `TypeError: can't subtract offset-naive and offset-aware datetimes`. ALLE Subzone-ACKs auf ALLEN ESPs scheitern.

Verstoss gegen die eigene Regel in `.claude/rules/api-rules.md`: "DateTime ohne timezone=True in Models → DB liefert naive Timestamps. Immer DateTime(timezone=True)."

### SOLL
1. Model: `DateTime(timezone=True)` in `subzone.py` (ca. Zeile 128)
2. Alembic-Migration: `op.alter_column('subzone_configs', 'last_ack_at', type_=sa.DateTime(timezone=True))`
3. Pruefe ALLE anderen DateTime-Spalten im gleichen Model auf fehlende `timezone=True`

### Begruendung
PostgreSQL unterscheidet `TIMESTAMP` (naive) und `TIMESTAMPTZ` (aware). Python's `datetime.now(timezone.utc)` erzeugt aware Timestamps. Wenn die DB-Spalte naive Timestamps speichert und Python aware vergleicht, crasht die Subtraktion. Die Migration ist verlustfrei — PostgreSQL konvertiert bestehende Werte automatisch.

### Betroffene Dateien
1. **subzone.py** — Model-Definition: `DateTime` → `DateTime(timezone=True)` (Zeile 128)
2. **Alembic-Migration** — neue Migration fuer `subzone_configs.last_ack_at`
3. **Bonus-Check:** Suche nach weiteren `DateTime` OHNE `timezone=True` im gesamten Models-Ordner

> **[verify-plan Bonus-Check Ergebnis — 2026-03-08]**
> 4 weitere `DateTime` OHNE `timezone=True` gefunden (Verstoss gegen api-rules.md):
> - `sensor.py:208-209` — `SensorConfig.last_manual_request`
> - `sensor.py:355-356` — `SensorData.timestamp` (CRITICAL: Time-Series-Spalte!)
> - `logic.py:124-125` — `LogicRule.last_triggered`
> - `ai.py:101-102` — `AIPrediction.timestamp`
> Empfehlung: Alle 5 Spalten (inkl. subzone) in EINER Migration zusammen fixen.

### Akzeptanzkriterien
- [ ] `{compose_service="el-servador"} |= "offset-naive"` → 0 Treffer
- [ ] Subzone-ACK funktioniert: Sensor einer Subzone zuweisen → ACK wird gespeichert
- [ ] `SELECT last_ack_at FROM subzone_configs LIMIT 5;` → Timestamps mit Timezone
- [ ] Migration reversibel (down-Migration vorhanden)
- [ ] Bestehende Tests gruen
- [ ] **Bonus:** Keine weiteren `DateTime` ohne `timezone=True` in Models

### Was NICHT gemacht werden soll
- NICHT die Subzone-Logik aendern (nur Typ-Fix)
- NICHT bestehende created_at/updated_at Spalten anfassen (sind bereits korrekt)

---

## Verifikation nach allen 4 Fixes

### Loki-Queries (alle muessen 0 Treffer liefern in 30 Min Beobachtung)

| Query | Bug | Erwartung |
|-------|-----|-----------|
| `{compose_service="el-servador"} \|= "MultipleResultsFound"` | BUG-08 | 0 |
| `{compose_service="el-servador"} \|= "1970-01-01"` | BUG-05 | 0 |
| `{compose_service="el-servador"} \|= "astext"` | BUG-11 | 0 |
| `{compose_service="el-servador"} \|= "offset-naive"` | BUG-02 | 0 |

### Funktions-Tests

| Test | Bug | Erwartung |
|------|-----|-----------|
| DS18B20 Daten fuer MOCK_A3592B7E | BUG-08 | Readings in DB, aktueller Timestamp |
| Wokwi-ESP Status nach 60s | BUG-05+06 | Status bleibt "online" |
| DELETE Device via API | BUG-11 | HTTP 200/204 |
| Subzone-ACK via Config-Panel | BUG-02 | last_ack_at gesetzt |

---

## Reihenfolge

> **[verify-plan Update — 2026-03-08]**

### Bereits erledigt (nur Verifikation + Commit noetig):
1. **BUG-08** — sensor_repo fix bereits im Working Tree ✅
2. **BUG-11** — notification JSONB migration + model bereits im Working Tree ✅

### Noch zu implementieren:
1. **BUG-05+06** (Wokwi komplett blockiert — hoechste verbleibende Dringlichkeit)
2. **BUG-02** (Subzone-ACKs blockiert + 4 weitere DateTime-Spalten ohne timezone=True)
