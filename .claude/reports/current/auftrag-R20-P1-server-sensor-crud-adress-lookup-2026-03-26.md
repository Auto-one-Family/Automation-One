# Auftrag R20-P1 — Server Sensor-CRUD Adress-Lookup Fix

**Typ:** Bugfix — Backend (El Servador)
**Schwere:** CRITICAL
**Erstellt:** 2026-03-26
**Ziel-Agent:** server-dev [Korrektur: "Backend-Agent (auto-one)" existiert nicht, korrekter Agent-Name: `server-dev`]
**Aufwand:** ~2h
**Abhaengigkeit:** Keiner — kann sofort gestartet werden

---

## Hintergrund und Root Cause

AutomationOne speichert Sensor-Konfigurationen in der Tabelle `sensor_configs`. Jeder
Sensor hat einen `esp_id`, `gpio`, `sensor_type`, und je nach Interface-Typ entweder eine
`onewire_address` (OneWire-Sensoren) oder eine `i2c_address` (I2C-Sensoren). Die
Datenbank hat einen COALESCE-UNIQUE-Constraint der parallele Sensoren auf einem GPIO
korrekt unterstuetzt — das heisst, DB-Schema ist korrekt und kein Problem.

Der CRUD-Endpoint `POST /api/v1/sensors/{esp_id}/{gpio}` in `sensors.py` ist gleichzeitig
Create UND Update. Er prueft ob ein Sensor bereits existiert mit:

```python
existing = await sensor_repo.get_by_esp_gpio_and_type(
    esp_device.id, gpio, request.sensor_type
)
```

Diese Methode sucht NUR nach `(esp_id, gpio, sensor_type)` — sie ignoriert `onewire_address`
und `i2c_address`. Das fuehrt zu folgendem Bug:

**Szenario OneWire (R20-01):**
- ESP hat DS18B20 mit ROM-Code "28FF...BAE1" auf GPIO 4 — bereits in DB
- User fuegt zweiten DS18B20 mit ROM-Code "28FF...B083" auf GPIO 4 hinzu
- `get_by_esp_gpio_and_type(esp_id, 4, "ds18b20")` findet den ERSTEN Sensor
- Update-Pfad (Zeilen 860-905) aktualisiert Name/Settings, aber `onewire_address` wird NICHT aktualisiert
- **Ergebnis:** Zweiter Sensor wird nie angelegt. Erster Sensor bleibt unveraendert (falscher ROM-Code)

**Szenario I2C (R20-02):**
- ESP hat SHT31 an I2C-Adresse 0x44 (Dezimal: 68) — bereits in DB als sht31_temp + sht31_humidity
- User fuegt zweiten SHT31 an 0x45 (Dezimal: 69) hinzu
- `get_by_esp_gpio_and_type(esp_id, 0, "sht31_temp")` findet den ersten SHT31 (0x44)
- **Ergebnis:** Zweiter SHT31 wird nie angelegt

**Beweis aus Logs:** Der Server loggt seit Wochen 85+ Warnings:
```
"Multiple configs for esp=... gpio=0 type=sht31_temp: 2 results.
OneWire/I2C without address? Returning first match."
```
Der Server weiss dass es ein Problem gibt, handelt aber nicht korrekt.

**Bereits vorhandene Loesung:** `get_by_esp_gpio_type_and_onewire()` existiert bereits in
`sensor_repo.py:1068-1106`. Sie wird nur nicht im CRUD-Flow verwendet.

---

## IST-Zustand

**Datei:** `sensors.py` Zeilen 783-785 und 860-905

Der Sensor-Lookup beim CRUD-Endpoint ist immer adresslos:
```python
existing = await sensor_repo.get_by_esp_gpio_and_type(
    esp_device.id, gpio, request.sensor_type  # KEIN onewire_address, KEIN i2c_address
)
```

Der Update-Pfad (Zeilen 860-905) setzt `onewire_address` und `i2c_address` nicht — auch
wenn sich die Adresse geaendert haette.

---

## SOLL-Zustand

### Schritt 1 — CRUD-Lookup adressbasiert machen (sensors.py:783-788)

**[Korrektur] Reihenfolge beachten:** `interface_type` wird aktuell NACH dem Lookup ermittelt
(Zeile 788), muss aber DAVOR stehen. Zeile 788 (`interface_type = request.interface_type or
_infer_interface_type(...)`) muss VOR den Lookup (Zeile 783) verschoben werden.

**[Korrektur] Null-Guard:** Wenn `request.onewire_address` oder `request.i2c_address` None ist
(User hat keine Adresse angegeben), MUSS auf `get_by_esp_gpio_and_type` zurueckgefallen werden.
Referenz-Pattern in `debug.py:908-915`:
```python
if i2c_addr is not None:
    existing = await sensor_repo.get_by_esp_gpio_type_and_i2c(...)
else:
    existing = await sensor_repo.get_by_esp_gpio_and_type(...)
```

Fuer jeden `interface_type` die richtige Lookup-Methode nutzen:

**Fuer `interface_type == "ONEWIRE"` UND `request.onewire_address is not None`:**
```python
# Statt get_by_esp_gpio_and_type:
existing = await sensor_repo.get_by_esp_gpio_type_and_onewire(
    esp_device.id, gpio, request.sensor_type, request.onewire_address
)
# get_by_esp_gpio_type_and_onewire existiert bereits in sensor_repo.py:1068-1106
```

**Fuer `interface_type == "I2C"` UND `request.i2c_address is not None`:**
```python
existing = await sensor_repo.get_by_esp_gpio_type_and_i2c(
    esp_device.id, gpio, request.sensor_type, request.i2c_address
)
# [Korrektur] get_by_esp_gpio_type_and_i2c EXISTIERT BEREITS in sensor_repo.py:1108-1146
# Schritt 3 (Methode erstellen) ist NICHT noetig!
```

**Fuer `interface_type == "ANALOG"` oder `"DIGITAL"`, oder Adresse ist None:**
`get_by_esp_gpio_and_type` bleibt unveraendert — hier ist GPIO allein eindeutig.

### Schritt 2 — Update-Pfad korrigieren (sensors.py:860-905)

Im Update-Pfad muss die Adresse explizit gesetzt werden, falls sie sich geaendert hat:
```python
# Hinzufuegen im Update-Block:
if request.onewire_address is not None:
    existing.onewire_address = request.onewire_address
if request.i2c_address is not None:
    existing.i2c_address = request.i2c_address
```

### ~~Schritt 3 — Analoge Repo-Methode erstellen (sensor_repo.py)~~ ENTFAELLT

**[Korrektur] `get_by_esp_gpio_type_and_i2c()` existiert BEREITS in `sensor_repo.py:1108-1146`.**
Tests existieren in `tests/unit/db/repositories/test_sensor_repo_i2c.py` (14 Test-Cases).
Wird bereits verwendet in: `debug.py:909,956`, `sensors.py:646`, `sensor_repo.py:64,87`,
`sensor_handler.py:209`. Kein Code noetig — nur im CRUD-Pfad (Schritt 1) einsetzen.

### Schritt 3 (NEU) — sensor_service.py:145 fixen (gleicher Bug)

**[Ergaenzung] sensor_service.py hat DENSELBEN Bug:**
```python
# sensor_service.py:145 (aktuell):
existing = await self.sensor_repo.get_by_esp_gpio_and_type(esp_device.id, gpio, sensor_type)
```
Diese Methode wird fuer programmatische Sensor-Erstellung genutzt (nicht nur REST-API).
Dieselbe adressbasierte Logik wie in Schritt 1 anwenden.

---

## Was NICHT geaendert werden darf

- DB-Schema (COALESCE-UNIQUE-Constraint ist bereits korrekt)
- Config-Push-Pipeline (sendet `onewire_address` und `i2c_address` bereits korrekt)
- Sensor-Processing-Pipeline (MQTT-Handler, Pi-Enhanced Processing)
- MQTT-Topic-Struktur (`sensor/{gpio}/data`)
- Authentifizierung und Authorisierung

---

## Akzeptanzkriterien

- [ ] `POST /api/v1/sensors/{esp_id}/4` mit `sensor_type=ds18b20, onewire_address=28FF...B083`
      erstellt einen NEUEN DB-Eintrag wenn bereits `28FF...BAE1` auf GPIO 4 existiert
- [ ] `POST /api/v1/sensors/{esp_id}/0` mit `sensor_type=sht31_temp, i2c_address=69`
      erstellt einen NEUEN DB-Eintrag wenn bereits `i2c_address=68` auf GPIO 0 existiert
- [ ] Sensor mit exakt gleicher Adresse (same esp_id, gpio, sensor_type, onewire_address/i2c_address)
      wird korrekt als Update behandelt (kein Duplikat)
- [ ] Bestehende Sensoren bleiben unveraendert wenn ein neuer Sensor hinzugefuegt wird
- [ ] Keine "Multiple configs... Returning first match" Warnings mehr nach dem Fix
- [ ] `sensor_data` fuer beide Sensoren auf einem GPIO wird korrekt getrennt gespeichert
- [ ] Bestehende Tests laufen ohne Regression durch

---

## Kontext fuer den Agenten

**OneWire-Protokoll:** Erlaubt beliebig viele Geraete auf einem Pin. Jedes Geraet hat
einen eindeutigen 64-bit ROM-Code (z.B. "28FF641F7FCCBAE1"). Der Server speichert diesen
als `onewire_address` (String) in `sensor_configs`. Der COALESCE-UNIQUE-Index stellt sicher
dass (esp_id, gpio, sensor_type, onewire_address) eindeutig ist.

**I2C-Protokoll:** Erlaubt mehrere Geraete auf einem Bus (SDA/SCL). Jedes Geraet hat eine
7-bit-Adresse (z.B. SHT31: 0x44=68 oder 0x45=69). In AutomationOne wird GPIO 0 als
Konvention fuer I2C-Sensoren genutzt (kein dedizierter GPIO — I2C laeuft auf GPIO 21/22).

**ESP_EA5484 DB-Snapshot (2026-03-26):**
```
gpio=0, sht31_temp,     i2c_address=68 (0x44), Subzone "Innen"
gpio=0, sht31_humidity, i2c_address=68 (0x44), Subzone "Innen"
gpio=4, ds18b20,        onewire_address="28FF641F7FCCBAE1", Subzone "Aussen"
```
Kein zweiter DS18B20, kein SHT31 an 0x45 — obwohl beide physisch am ESP haengen.
Root Cause bestaetigt: Der falsche Lookup-Pfad verhindert die Anlage.

---

> Erstellt von: automation-experte Agent
> Roadmap-Referenz: R20-P1 in `auftraege/roadmap-R20-bugfix-konsolidierung-2026-03-26.md`
> Folgeauftrag: R20-P2 (ESP32-Firmware findSensorConfig), R20-P3 (Frontend Adress-Modal)
