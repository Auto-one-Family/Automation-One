# Auftrag R20-P5 — Subzone-Konsistenz: assigned_sensor_config_ids befuellen

**Typ:** Bugfix — Backend (El Servador)
**Schwere:** MEDIUM
**Erstellt:** 2026-03-26 (korrigiert 2026-03-27)
**Ziel-Agent:** server-dev
**Aufwand:** ~1-2h
**Abhaengigkeit:** Nach R20-P1 pruefen ob Subzone-Drift bereits weg ist; unabhaengig umsetzbar

---

## Hintergrund

AutomationOne ordnet Sensoren ueber die Subzone zu — aber es gibt **keinen Foreign Key** auf
`sensor_configs`. Stattdessen laeuft die Zuordnung ueber Listen auf beiden Seiten:

### Zuordnungs-Mechanismen (3 Stueck, kein FK)

1. **`subzone_configs.assigned_gpios`** (JSON-Array, primaer):
   Die Subzone listet GPIO-Nummern. Alle `sensor_configs` desselben ESP mit passendem GPIO
   gehoeren zur Subzone. Beispiel: `assigned_gpios=[0, 27]` → alle Sensoren auf GPIO 0 und 27.

2. **`subzone_configs.assigned_sensor_config_ids`** (JSON-Array, sekundaer):
   Soll die konkreten UUID-Keys der `sensor_configs`-Zeilen enthalten. Differenziert bei
   GPIO-Kollisionen (I2C, OneWire — siehe GPIO-0-Problem unten).

3. **`sensor_configs.assigned_subzones`** (JSON-Array, Gegenseite):
   JSON-Liste von Subzone-IDs auf dem Sensor selbst. Bildet die Gegenrichtung ab.

**Wichtig:** `sensor_configs` hat **kein** `subzone_id`-Feld (FK). Nur `sensor_data` hat ein
`subzone_id`-Feld — das ist ein Snapshot-Feld das beim Speichern eines Messwerts die damals
gueltige Subzone festhält.

### Das GPIO-0-Problem (Kernmotivation fuer diesen Fix)

I2C-Sensoren verwenden `gpio=0` als Placeholder. Der ESP32 routet I2C ueber den I2C-Bus
(SDA/SCL), nicht ueber einen dedizierten GPIO. GPIO 0 ist bei aktivem WiFi ohnehin nicht
nutzbar (ADC2-Konflikt).

Konsequenz: `assigned_gpios=[0]` auf einer Subzone erfasst **ALLE** I2C-Sensoren des ESP —
auch wenn nur einer gemeint ist (z.B. SHT31 an 0x44 gehoert zur Subzone, BMP280 an 0x76
nicht). Genau hier ist `assigned_sensor_config_ids` der Differenzierungs-Mechanismus:
Die UUID identifiziert den Sensor eindeutig, unabhaengig vom GPIO.

### Das Problem (RC5, R20-03, R20-12)

DB-Befund (2026-03-26): `assigned_sensor_config_ids` ist fuer **ALLE** Subzones `[]` (leeres
Array). Das Feld wird nie befuellt — weder beim Erstellen einer Subzone, noch beim Zuweisen
eines Sensors, noch beim Sensor-Create.

Die bestehende Methode `sync_subzone_counts()` in `subzone_repo.py` berechnet `sensor_count`
bereits korrekt aus der DB — aber sie prueft `s.gpio in gpios OR str(s.id) in config_ids`.
Da `config_ids` immer leer ist, zaehlt sie nur per GPIO. Bei I2C-Sensoren (GPIO=0) fuehrt
das zu falschen Zaehlergebnissen wenn mehrere I2C-Sensoren verschiedenen Subzonen gehoeren
sollen.

**Sobald `assigned_sensor_config_ids` korrekt befuellt wird, zaehlt `sync_subzone_counts()`
automatisch richtig.** Kein separater Fix fuer `sensor_count` noetig.

---

## IST-Zustand

**Relevante Dateien:**
- `subzone_service.py` — Business Logic, `_upsert_subzone_config()` (arbeitet nur mit GPIOs)
- `subzone_repo.py` — DB-Queries, `sync_subzone_counts()` (berechnet sensor_count)
- `api/v1/sensors.py` — Sensor-CRUD, Delete-Pipeline (Zeilen ~1136-1169)

**Verhalten:**
- `_upsert_subzone_config()` in `subzone_service.py` verarbeitet `assigned_gpios` per
  List-Comprehension (neue Liste, kein in-place). `assigned_sensor_config_ids` wird ignoriert.
- `sync_subzone_counts()` in `subzone_repo.py` prueft `s.gpio in gpios OR str(s.id) in config_ids` —
  da `config_ids` immer `[]` ist, greift nur der GPIO-Pfad.
- Sensor-Delete in `sensors.py` raeumt GPIOs auf und ruft `sync_subzone_counts()` auf — aber
  bereinigt `assigned_sensor_config_ids` nicht (weil dort nie was drin steht).
- `sensor_configs.assigned_subzones` (JSON-Liste) — Status unklar, moeglicherweise auch leer.

**DB-Snapshot (2026-03-26):**
```
Subzone "Pflanze 1": sensor_count=2, assigned_sensor_config_ids=[], assigned_gpios=[0, 27]
```

GPIO 0 = I2C-Placeholder. Wenn ein zweiter I2C-Sensor hinzukommt der NICHT zu dieser Subzone
gehoert, wuerde er trotzdem mitgezaehlt.

---

## SOLL-Zustand

### Schritt 1 — assigned_sensor_config_ids beim Subzone-Assign befuellen

In `_upsert_subzone_config()` (subzone_service.py): Nach dem Setzen von `assigned_gpios`
die passenden `sensor_configs` per GPIO-Match ermitteln und deren IDs in
`assigned_sensor_config_ids` eintragen.

```python
# In _upsert_subzone_config(), nach dem assigned_gpios Update:
# Alle sensor_configs dieses ESP laden deren GPIO in assigned_gpios liegt
matching_configs = await db.execute(
    select(SensorConfig).where(
        SensorConfig.esp_id == esp_id,
        SensorConfig.gpio.in_(subzone.assigned_gpios)
    )
)
subzone.assigned_sensor_config_ids = [str(c.id) for c in matching_configs.scalars()]
flag_modified(subzone, "assigned_sensor_config_ids")  # PFLICHT bei JSON-Mutation
```

**Warum `flag_modified`:** SQLAlchemy trackt keine in-place Mutationen von JSON/Array-Feldern.
Ohne `flag_modified()` wird die Aenderung nicht persistiert — bekanntes Pattern aus INV-1a
(H4-Fix, `flag_modified` in `subzone.py:366-368` fuer `custom_data` als Referenz).

**Hinweis:** Da hier eine neue Liste zugewiesen wird (kein `.append()`), ist `flag_modified`
streng genommen nicht zwingend — aber zur Sicherheit immer aufrufen. Das bestehende Pattern
fuer `custom_data` macht es genauso.

### Schritt 2 — assigned_sensor_config_ids beim Sensor-Create befuellen

Wenn ein neuer Sensor erstellt wird (Sensor-Create in `sensors.py`), muss geprueft werden ob
dessen GPIO einer existierenden Subzone zugeordnet ist. Falls ja:
1. Die `config_id` des neuen Sensors in `assigned_sensor_config_ids` der Subzone einfuegen
2. `sync_subzone_counts()` aufrufen (aktualisiert `sensor_count` automatisch)

```python
# Nach erfolgreichem Sensor-Create:
# Pruefen ob es eine Subzone fuer diesen ESP + GPIO gibt
subzones = await db.execute(
    select(SubzoneConfig).where(
        SubzoneConfig.esp_id == sensor_config.esp_id
    )
)
for subzone in subzones.scalars():
    if sensor_config.gpio in subzone.assigned_gpios:
        if str(sensor_config.id) not in subzone.assigned_sensor_config_ids:
            subzone.assigned_sensor_config_ids = subzone.assigned_sensor_config_ids + [str(sensor_config.id)]
            flag_modified(subzone, "assigned_sensor_config_ids")
```

### Schritt 3 — Bei Sensor-Delete: assigned_sensor_config_ids bereinigen

In der Delete-Pipeline (`sensors.py`, Zeilen ~1136-1169) — dort werden GPIOs und
`sync_subzone_counts()` bereits korrekt aufgeraeumt. Zusaetzlich `assigned_sensor_config_ids`
bereinigen:

```python
# In der Delete-Pipeline, VOR dem eigentlichen Delete:
subzones = await db.execute(
    select(SubzoneConfig).where(SubzoneConfig.esp_id == sensor_config.esp_id)
)
for subzone in subzones.scalars():
    if str(sensor_config.id) in subzone.assigned_sensor_config_ids:
        subzone.assigned_sensor_config_ids = [
            sid for sid in subzone.assigned_sensor_config_ids
            if sid != str(sensor_config.id)
        ]
        flag_modified(subzone, "assigned_sensor_config_ids")
# Danach: sync_subzone_counts() wie bisher (zaehlt automatisch korrekt)
```

### Schritt 4 — Migrations-Script fuer bestehende Subzones

Ein einmaliges Alembic-Migrations-Script oder CLI-Command das:
1. Alle `subzone_configs` laedt
2. Fuer jede Subzone: alle `sensor_configs` desselben ESP ermittelt deren GPIO in
   `assigned_gpios` liegt
3. `assigned_sensor_config_ids` mit deren IDs befuellt
4. `sync_subzone_counts()` aufruft (oder sensor_count direkt aus dem GPIO+ID-Match berechnet)
5. In einer DB-Transaktion committed

```python
# Sinngemass:
for subzone in all_subzones:
    matching = await db.execute(
        select(SensorConfig).where(
            SensorConfig.esp_id == subzone.esp_id,
            SensorConfig.gpio.in_(subzone.assigned_gpios)
        )
    )
    subzone.assigned_sensor_config_ids = [str(c.id) for c in matching.scalars()]
    flag_modified(subzone, "assigned_sensor_config_ids")
await db.commit()
```

---

## Was NICHT geaendert werden darf

- `assigned_gpios`-Mechanismus (bleibt als primaerer Zuordnungsweg)
- `sync_subzone_counts()` Logik — die funktioniert bereits korrekt, sobald die IDs da sind
- DB-Schema (Felder existieren bereits, kein ALTER TABLE noetig)
- MQTT-Config-Push und Zone-ACK-Handler
- Subzone-Create/Delete-Endpoints (nur die Zuordnungs-Logik)
- `sensor_data.subzone_id` (Snapshot-Feld bei Messdaten, anderer Zweck)

---

## Offene Frage (vom Agenten zu klaeren)

**`sensor_configs.assigned_subzones` (JSON-Liste):** Dieses Feld auf dem Sensor bildet die
Gegenrichtung ab (Sensor → welche Subzones). Aktueller Befuellungsstatus unklar.

Wenn der Agent beim Implementieren feststellt dass `assigned_subzones` ebenfalls leer ist,
sollte es synchron mitgepflegt werden:
- Bei Schritt 1+2: `sensor_config.assigned_subzones` um die subzone_id erweitern
- Bei Schritt 3: `sensor_config.assigned_subzones` bereinigen (vor dem Delete)
- Falls das Feld bereits korrekt befuellt wird: nichts aendern.

**Entscheidung liegt beim Agenten** — er kann den Code lesen und den IST-Zustand pruefen.

---

## Akzeptanzkriterien

- [ ] Nach Subzone-Assign enthaelt `assigned_sensor_config_ids` die UUIDs aller sensor_configs
      deren GPIO in `assigned_gpios` liegt
- [ ] Neuer Sensor (Create) wird automatisch in `assigned_sensor_config_ids` eingetragen wenn
      sein GPIO einer Subzone zugeordnet ist
- [ ] Sensor-Delete bereinigt `assigned_sensor_config_ids` der betroffenen Subzone(n)
- [ ] `sensor_count` stimmt nach jeder Operation (wird von `sync_subzone_counts()` automatisch
      berechnet — kein manuelles Inkrementieren)
- [ ] Migrations-Script befuellt `assigned_sensor_config_ids` fuer alle bestehenden Subzones
- [ ] `flag_modified()` wird fuer alle JSON-Array-Mutationen auf `assigned_sensor_config_ids`
      aufgerufen (kein stiller Datenverlust)
- [ ] I2C-Sensoren (GPIO=0) werden korrekt per UUID differenziert, nicht pauschal per GPIO

---

## Kontext fuer den Agenten

**Subzone-Zuordnung — drei Mechanismen, kein FK:**

In AutomationOne gibt es **keinen Foreign Key** von `sensor_configs` zu `subzone_configs`.
Die Zuordnung laeuft ueber Listen auf beiden Seiten:

| Mechanismus | Feld | Seite | Zweck |
|------------|------|-------|-------|
| GPIO-Match | `subzone_configs.assigned_gpios` | Subzone | Primaer. Alle Sensoren auf diesem GPIO gehoeren zur Subzone |
| Config-ID-Match | `subzone_configs.assigned_sensor_config_ids` | Subzone | Sekundaer. UUID-basiert fuer I2C/OneWire-Differenzierung |
| Gegenseite | `sensor_configs.assigned_subzones` | Sensor | JSON-Liste von subzone_ids (Gegenrichtung) |

`sensor_data.subzone_id` ist ein **Snapshot-Feld** — es speichert die Subzone zum Messzeitpunkt
und hat nichts mit der Konfigurations-Zuordnung zu tun.

**GPIO-0 als I2C-Placeholder:** Alle I2C-Sensoren eines ESP teilen sich `gpio=0`. Wenn eine
Subzone `assigned_gpios=[0]` hat, erfasst sie ALLE I2C-Sensoren. Um zwischen SHT31 (0x44)
und BMP280 (0x76) zu differenzieren, braucht es `assigned_sensor_config_ids` mit den konkreten
UUIDs. Das ist der Hauptgrund fuer diesen Fix.

**`sync_subzone_counts()` (subzone_repo.py):** Diese bestehende Methode berechnet `sensor_count`
und `actuator_count` aus tatsaechlichen `sensor_configs` per `s.gpio in gpios OR str(s.id) in
config_ids`. Sie wird bereits nach Subzone-Upsert und Sensor-Delete aufgerufen. Sobald
`assigned_sensor_config_ids` befuellt ist, zaehlt sie automatisch korrekt — kein separater
Count-Fix noetig.

**flag_modified() Pflicht:** SQLAlchemy trackt keine in-place Mutationen von JSON/Array-Feldern.
`list.append()` oder `list.remove()` auf einem JSON-Feld wird NICHT automatisch als Aenderung
erkannt. Immer `flag_modified(obj, "feldname")` nach Mutationen aufrufen. Referenz-Pattern:
`subzone.py` Zeile ~366-368 (`custom_data`).

**Relevante Dateien:**
- `subzone_service.py` — `_upsert_subzone_config()` (Subzone-Assign-Logik)
- `subzone_repo.py` — `sync_subzone_counts()`, `get_subzone_by_sensor_config_id()`
- `api/v1/sensors.py` — Sensor-Create + Delete-Pipeline

**NICHT relevant:** `sensor_service.py` hat keinen Subzone-Bezug.

---

> Erstellt von: automation-experte Agent
> Korrigiert: 2026-03-27 (Schema-Fehler behoben, sync_subzone_counts-Redundanz entfernt)
> Roadmap-Referenz: R20-P5 in `auftraege/roadmap-R20-bugfix-konsolidierung-2026-03-26.md`
> Verwandte Bugs: R20-03 (Subzone-Drift), R20-12 (assigned_sensor_config_ids leer)
