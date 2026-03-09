# Auftrag T10-Fix-R2: HIGH Backend — Actuator-Session + raw_mode Default

> **Bezug:** T10-R4 Root-Cause-Synthese (2026-03-08)
> **Prioritaet:** HIGH (P1)
> **Datum:** 2026-03-08
> **Geschaetzter Aufwand:** ~45 Minuten
> **Voraussetzung:** Fix-Runde 1 (CRITICAL) abgeschlossen oder parallel moeglich
> **Naechster Schritt:** Fix-Runde 3 (MEDIUM)

---

## Ziel

> **[verify-plan Zusammenfassung]** Von 2 geplanten Fixes ist nur 1 tatsaechlich noetig:
> - **Fix 1 (BUG-01):** Session-Race existiert NICHT — `_auto_push_config()` nutzt bereits eigene `resilient_session()`. sensor_count-Vergleich ist `== 0` (Reboot-Erkennung), nicht allgemeiner Mismatch. **Nur Diagnostik, kein Code-Fix noetig.**
> - **Fix 2 (BUG-09):** raw_mode Default-Aenderung waere SCHAEDLICH (bricht Pi-Enhanced). NUR der Fallback (`processed_value = raw_value`) ist korrekt und noetig. Geschaetzter Aufwand reduziert sich auf ~10 Min.

2 HIGH-Priority Backend-Bugs analysiert. Fix 1 erfordert nur Diagnostik, Fix 2 nur Fallback-Absicherung.

---

## Fix 1: BUG-01 — Actuator-Geister Session-Race (~30 Min)

### IST
`heartbeat_handler.py` (Zeile 1194-1207) erkennt Config-Mismatch: `esp_sensor_count == 0 and db_sensor_count > 0` bzw. `esp_actuator_count == 0 and db_actuator_count > 0`. Daraufhin wird `asyncio.create_task(self._auto_push_config(esp_device.device_id))` aufgerufen.

> **[verify-plan Korrektur]** Session-Race existiert NICHT im aktuellen Code. `_auto_push_config()` (Zeile 1216-1251) nutzt bereits `async with resilient_session() as session:` (Zeile 1227) — eine eigene Session, unabhaengig von der Heartbeat-Session. Docstring Zeile 1221 bestaetigt: "Uses its own DB session to avoid conflicts with the heartbeat session."
>
> **[verify-plan Korrektur]** sensor_count-Mismatch-Szenario stimmt nicht. Die Bedingung (Zeile 1195) ist `esp_sensor_count == 0 and db_sensor_count > 0` — also NUR bei Reboot (ESP meldet 0). Ein Szenario "ESP meldet 4, Server erwartet 2" triggert KEINEN Config-Push, da `4 == 0` → False. Die Formel `abs(esp_count - db_count * 2) > db_count` waere daher nicht noetig und potentiell schaedlich (koennte echte Reboot-Erkennung stoeren).
>
> **Falls der Bug dennoch beobachtet wird:** Ursache muss anderswo liegen (z.B. Actuator-Handler, MQTT-Subscriber, oder ein anderer `asyncio.create_task`-Aufruf). Bitte Log-Zeile mit "InvalidRequestError" und vollstaendigem Stacktrace pruefen.

### SOLL

> **[verify-plan Korrektur]** Punkt 1 ist BEREITS implementiert — `_auto_push_config()` nutzt `resilient_session()` seit dem aktuellen Code-Stand. Kein Fix noetig.
> **[verify-plan Korrektur]** Punkt 2 (sensor_count Formel) basiert auf falscher Praemisse — die Bedingung prueft nur `== 0` (Reboot-Erkennung), nicht allgemeinen Mismatch. Kein Fix noetig.
>
> **Empfehlung an TM:** Diesen Fix-Block komplett streichen oder Root-Cause mit echten Logs (Loki: `{compose_service="el-servador"} |= "InvalidRequestError"`) verifizieren. Falls InvalidRequestError tatsaechlich auftritt, liegt die Ursache woanders.

### Begruendung

> **[verify-plan Korrektur]** Die Session-Race-Begruendung ist technisch korrekt als generelles asyncio-Pattern, aber trifft nicht auf den aktuellen Code zu — der Fix wurde offenbar bereits frueher umgesetzt. Der sensor_count-Vergleich ist ein reiner `== 0`-Check (Zeile 1195), kein allgemeiner Mismatch-Vergleich.

### Betroffene Dateien

> **[verify-plan Korrektur]** Beide Aenderungen sind NICHT noetig:
> 1. ~~**heartbeat_handler.py** — `_auto_push_config()` Aufruf (Zeile 1207): eigene Session~~ → BEREITS implementiert (Zeile 1227: `resilient_session()`)
> 2. ~~**heartbeat_handler.py** — sensor_count Mismatch-Detection (Zeile 1194): toleranterer Vergleich~~ → Bedingung ist `== 0` (Reboot-Erkennung), nicht `!=`. Kein Mismatch-Problem.

### Akzeptanzkriterien

> **[verify-plan Korrektur]** Da der beschriebene Bug im Code nicht existiert, sind diese Kriterien Diagnostik-Checks, keine Fix-Validierung:

- [ ] `{compose_service="el-servador"} |= "Handler returned False" |= "actuator"` → Pruefen ob Problem ueberhaupt auftritt
- [ ] `{compose_service="el-servador"} |= "InvalidRequestError"` → Pruefen ob Problem ueberhaupt auftritt (mit Stacktrace!)
- [ ] Bestehende Tests gruen

### Was NICHT gemacht werden soll
- NICHT die Actuator-Auto-Registration komplett deaktivieren (sie ist gewollt fuer Firmware-Discovery)
- NICHT die Config-Push-Logik aendern (nur die Session-Verwaltung)
- NICHT den Actuator GPIO 27 aus der Firmware entfernen (das ist Firmware-Aufgabe)

---

## Fix 2: BUG-09 — raw_mode Default invertiert (~15 Min)

### IST
`sensor_handler.py` (Zeile 717-718): `if "raw_mode" not in payload: payload["raw_mode"] = True`. Mock-DS18B20 sendet Payload OHNE `raw_mode`-Feld → Default `raw_mode=True`.

> **[verify-plan Korrektur]** Die Analyse "Processing-Pipeline wird komplett uebersprungen" ist nur TEILWEISE korrekt. Der Processing-Flow (sensor_handler.py Zeile 242):
> ```
> if sensor_config and sensor_config.pi_enhanced and raw_mode:  → Pi-Enhanced
> elif not raw_mode:                                             → Local
> (sonst)                                                        → processed_value bleibt None
> ```
> Mit `raw_mode=True` UND `pi_enhanced=True` (DB-Default!) wird Pi-Enhanced Processing KORREKT ausgefuehrt. `processed_value=None` tritt NUR auf wenn:
> - `sensor_config` ist None (Sensor noch nicht konfiguriert) ODER
> - `sensor_config.pi_enhanced` ist False (explizit deaktiviert)
>
> **[verify-plan Korrektur]** `DS18B20Processor` ist NICHT in `sensor_type_registry.py` — korrekte Datei: `sensors/sensor_libraries/active/temperature.py` (Klasse ab Zeile 23).
> **[verify-plan Korrektur]** `pi_enhanced` ist KEIN Attribut des Processors, sondern ein DB-Feld auf `SensorConfig` (sensor.py Zeile 128-133) mit Default `True`, nicht False.

### SOLL

> **[verify-plan KRITISCHE Korrektur]** Punkt 1 (Default auf False aendern) wuerde Pi-Enhanced Processing BRECHEN!
> - Mit `raw_mode=False`: Zeile 242 `sensor_config.pi_enhanced and raw_mode` → FALSE → Pi-Enhanced wird NIE ausgefuehrt
> - Stattdessen: Zeile 285 `elif not raw_mode` → TRUE → `processed_value = value` (payload "value" Feld, oft 0.0 bei Mock-ESPs)
> - **KONSEQUENZ:** ALLE ESPs die `raw_mode` nicht explizit senden verlieren Pi-Enhanced Processing komplett!
>
> **Korrekter Fix:** NUR Punkt 2 umsetzen (Fallback). Default `raw_mode=True` ist KORREKT fuer Pi-Enhanced-System.

1. ~~Default aendern: `payload["raw_mode"] = False`~~ → **NICHT UMSETZEN** — wuerde Pi-Enhanced Processing zerstoeren
2. **Fallback in Processing-Pipeline:** Wenn `processed_value` nach Processing immer noch `None` → `processed_value = raw_value` (mindestens den Rohwert durchreichen) — **KORREKT, UMSETZEN**

### Begruendung

> **[verify-plan Korrektur]** Die Begruendung ist invertiert. `raw_mode=True` bedeutet "ESP sendet Rohdaten, Server soll Pi-Enhanced Processing machen" — also genau das Gegenteil von "kein Processing". Der aktuelle Default `True` ist KORREKT fuer das Pi-Enhanced-System.
> Das eigentliche Problem ist die fehlende Fallback-Absicherung: Wenn kein sensor_config existiert oder pi_enhanced=False ist, gibt es keinen Fallback → processed_value bleibt None.
> **Korrekter Fix:** Nur Fallback hinzufuegen (nach Zeile 288 in sensor_handler.py): `if processed_value is None: processed_value = raw_value`

### Betroffene Dateien
1. ~~**sensor_handler.py** — Default-Zuweisung (Zeile 717-718): `True` → `False`~~ → **NICHT UMSETZEN** (siehe oben)
2. **sensor_handler.py** — Processing-Pipeline (nach Zeile 288): Fallback `if processed_value is None: processed_value = raw_value` — **KORREKT**

### Akzeptanzkriterien
- [ ] DS18B20 Readings haben `processed_value != NULL` (nach BUG-08 Fix)
- [ ] DS18B20 Readings haben `unit` befuellt (z.B. "Grad-C")
- [ ] SHT31 Processing weiterhin korrekt (Regression-Check)
- [ ] Bestehende Tests gruen

### Was NICHT gemacht werden soll
- NICHT den DS18B20Processor umschreiben (Datei: `sensors/sensor_libraries/active/temperature.py`, NICHT sensor_type_registry.py)
- NICHT pi_enhanced Default aendern (DB-Model sensor.py Zeile 130: `default=True` — ist korrekt)
- NICHT die sensor_type_registry aendern
- **NICHT raw_mode Default aendern** (True ist korrekt fuer Pi-Enhanced-System)

---

## Verifikation nach Fix

> **[verify-plan Korrektur]** Fix 1 (BUG-01) erfordert keine Code-Aenderung — nur Diagnostik. Fix 2 reduziert sich auf den Fallback.

| Test | Bug | Erwartung |
|------|-----|-----------|
| Actuator-Command auf ESP_472204 | BUG-01 | Nur Diagnostik: Loki-Log auf "InvalidRequestError" pruefen, Stacktrace dokumentieren |
| DS18B20 processed_value | BUG-09 | `!= NULL` dank Fallback `processed_value = raw_value` |
| DS18B20 mit pi_enhanced=True | BUG-09 | Pi-Enhanced Processing funktioniert weiterhin (raw_mode=True Regression!) |
| SHT31 Regression | BUG-09 | Daten weiterhin korrekt |
