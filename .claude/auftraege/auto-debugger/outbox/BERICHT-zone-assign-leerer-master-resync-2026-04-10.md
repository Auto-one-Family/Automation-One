# Bericht: Wiederholte Zonen-Zuweisungen mit leerem `master_zone` (ESP-Serial)

**Datum:** 2026-04-10  
**Scope:** Heartbeat `ZONE_MISMATCH` → Auto-Resync `zone/assign`, `ZoneService.assign_zone`, Firmware `main.cpp`  
**Status:** Analyse

---

## 1. Symptom (Beobachtung)

Auf dem ESP-Serial (PlatformIO Monitor) wiederholt:

- MQTT: `…/zone/assign`
- Log: `Master Zone:` **ohne Wert** bzw. leere Anzeige
- Log: `Zone configuration saved (Zone: <zone_id>, Master: )` mit **leerem** Master-Teil

Intervall im Feld ca. **60 Sekunden**, passend zur dokumentierten Cooldown-Logik.

---

## 2. Server-Ursache: Auto-Resync bei Zone-Mismatch

Wenn die **Datenbank** eine Zone für das Gerät kennt, der **Heartbeat** des ESP aber „keine Zone“ meldet (oder `zone_assigned` false / Verlust nach Reboot), führt der Heartbeat-Handler einen **automatischen** erneuten Publish von `zone/assign` aus — mit **60 s Cooldown**:

```960:1019:El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py
                elif (not esp_has_zone and db_has_zone) or esp_lost_zone:
                    ...
                    zone_resync_cooldown_seconds = 60
                    ...
                    if should_resync:
                        ...
                        resync_payload = {
                            "zone_id": db_zone_id,
                            "master_zone_id": esp_device.master_zone_id or "",
                            "zone_name": esp_device.zone_name or "",
                            "kaiser_id": esp_device.kaiser_id or constants.get_kaiser_id(),
                            "timestamp": now_ts,
                        }
                        mqtt_client.publish(
                            resync_topic,
                            json.dumps(resync_payload),
                            qos=1,
                        )
```

**Folge:** Ist `esp_device.master_zone_id` in der DB **NULL/leer**, wird **bewusst** `""` publiziert — das ist **kein Zufall auf dem Serial**, sondern **Datenmodell + Resync-Pfad**.

---

## 3. Server-Ursache: Manuelles Assign über API

Bei normalem Zone-Assign setzt `ZoneService` die Payload ebenfalls mit Fallback auf leeren String:

```176:184:El Servador/god_kaiser_server/src/services/zone_service.py
        payload = {
            "zone_id": zone_id,
            "master_zone_id": master_zone_id or "",
            "zone_name": zone_name or "",
            "kaiser_id": self.kaiser_id,
            "timestamp": int(time.time()),
        }
```

Wenn der Client **`master_zone_id` weglässt oder `null`** übergibt, ist die MQTT-Nutzlast `master_zone_id: ""` — fachlich „kein Master“.

---

## 4. Firmware-Verhalten (ESP)

Die Firmware loggt die empfangenen JSON-Felder und übernimmt sie in NVS:

```1629:1661:El Trabajante/src/main.cpp
            LOG_I(TAG, "Zone ID: " + zone_id);
            LOG_I(TAG, "Master Zone: " + master_zone_id);
            LOG_I(TAG, "Zone Name: " + zone_name);
            ...
            temp_kaiser.master_zone_id = master_zone_id;
```

Ein **leerer String** vom Server führt zu **leerem Log** — das ist konsistent mit dem obigen Server-Payload, nicht zwingend ein Parser-Bug.

---

## 5. Warum „wiederholt“?

Kurz die möglichen Schleifen:

1. **Resync-Cooldown 60 s:** Solange der Heartbeat weiterhin einen **Mismatch** meldet (z. B. ESP meldet `zone_assigned=false`, obwohl DB eine Zone hat), wird nach Ablauf der Sperre **erneut** `zone/assign` gesendet — erneut mit `master_zone_id=""`, wenn die DB-Spalte leer ist.

2. **ESP bestätigt die Zone nicht in der Form, die der Server als „sync“ wertet** (z. B. NVS schreibt, Heartbeat-Metadaten stimmen noch nicht) → Mismatch bleibt → Resync-Schleife.

3. **Separat:** UI oder Skript könnte Assign häufig auslösen; die **60s**-Periodizität spricht aber stark für **Heartbeat-Resync**, nicht für manuelle Klicks alle 60 s.

---

## 6. Einordnung: Bug oder Konfiguration?

| Szenario | Bewertung |
|----------|-----------|
| Master-Zone ist fachlich **optional** (eine Ebene Hierarchie) | Leerer Master kann **korrekt** sein; Serial wirkt nur „seltsam“. |
| Master-Zone **soll** gesetzt sein (Betrieb erwartet Eltern-Zone) | Dann ist das Problem **DB/API**: `master_zone_id` wurde nie gepflegt — Resync **verstärkt** nur die sichtbare Inkonsistenz. |
| Endlosschleife Resync | Bug/Drift: Mismatch-Bedingung bleibt dauerhaft wahr → **operativer** Handlungsbedarf (Heartbeat-Felder, DB, Timing). |

---

## 7. Empfohlene nächste Schritte

1. **DB prüfen:** Für das betroffene `esp_id` Spalten `zone_id`, `master_zone_id`, `zone_name`.  
2. **Einmaliger REST-Assign** mit explizitem `master_zone_id` (wenn fachlich nötig) und prüfen, ob Serial dann einen nicht-leeren Master zeigt.  
3. **Server-Log:** Zeilen `ZONE_MISMATCH` / `Auto-reassigning zone` im Heartbeat-Handler suchen — bestätigt Resync-Pfad.  
4. Optional: **Produktentscheid** — soll Resync `master_zone_id` aus der **Zonen-Tabelle** ableiten statt nur aus `esp_device.master_zone_id`?

---

## 8. Referenzen

- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (ZONE_MISMATCH, Resync)
- `El Servador/god_kaiser_server/src/services/zone_service.py` (Payload `assign_zone`)
- `El Trabajante/src/main.cpp` (Handler `zone/assign`)
