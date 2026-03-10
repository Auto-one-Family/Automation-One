# ESP32 Zone/ACK Analyse — T14-Fix-A Vorbereitung

> **Datum:** 2026-03-09
> **Modus:** A (Analyse)
> **Auftrag:** Pruefe ob ESP32-Firmware zone/ack mit correlation_id sendet (T14-Fix-A Vorbereitung)
> **Analysierte Dateien:**
> - `El Trabajante/src/main.cpp` (Zone-Handler: Z. 1392-1625, Subzone-Handler: Z. 1628-1736)
> - `El Trabajante/src/utils/topic_builder.h` + `topic_builder.cpp` (Z. 264-278)
> - `El Trabajante/src/services/config/config_manager.cpp` (updateZoneAssignment: Z. 432-472)

---

## Ergebnis-Zusammenfassung

| Frage | Antwort |
|-------|---------|
| Existiert `buildZoneAssignTopic()`? | JA — Z. 47, implementiert Z. 266-271 |
| Existiert `buildZoneAckTopic()`? | JA — Z. 48, implementiert Z. 273-278 |
| Wird zone/ack gesendet? | JA — nach Assign (Z. 1583-1600) und nach Removal (Z. 1444-1461) |
| Enthalt zone/ack eine `correlation_id`? | **NEIN** — fehlt komplett |
| NVS-Schreiben vor ACK? | **JA** — korrekte Reihenfolge |
| Gleiche Analyse fuer subzone/ack? | `correlation_id` fehlt ebenfalls |
| Existiert `buildSubzoneAssignTopic()`? | JA — Z. 39, Z. 228-233 |
| Existiert `buildSubzoneAckTopic()`? | JA — Z. 41, Z. 242-247 |

---

## 1. Zone-Assign Handler (main.cpp Z. 1392-1625)

### Subscribe

```
Z. 816-824: String zone_assign_topic = TopicBuilder::buildZoneAssignTopic();
            mqttClient.subscribe(zone_assign_topic);
```

Der ESP subscribt korrekt auf `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`.

### Verarbeitung

**Felder die aus dem Payload gelesen werden (Z. 1406-1409):**
```cpp
String zone_id        = doc["zone_id"].as<String>();
String master_zone_id = doc["master_zone_id"].as<String>();
String zone_name      = doc["zone_name"].as<String>();
String kaiser_id      = doc["kaiser_id"].as<String>();
```

**correlation_id wird NICHT gelesen.** Kein `doc["correlation_id"]`.

### NVS-Schreiben vor ACK (Zone Assignment, Erfolgsfall)

Ablaufreihenfolge in Z. 1518-1600:

1. Z. 1519: `configManager.updateZoneAssignment(zone_id, master_zone_id, zone_name, kaiser_id)` — schreibt NVS
2. Z. 1521-1524: In-Memory-Update der `g_kaiser`-Variablen
3. Z. 1525-1579: Optional: kaiser_id-Wechsel, Unsubscribe/Resubscribe
4. Z. 1583-1600: **ACK wird gesendet** — erst NACH NVS-Write

**Race-Condition-Prevention: korrekt.** NVS-Write ist synchron (`saveZoneConfig` → `putString`) und abgeschlossen bevor ACK published wird.

### ACK-Payload (Erfolgsfall, Z. 1583-1600)

```cpp
String ack_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/ack";
DynamicJsonDocument ack_doc(256);
ack_doc["esp_id"]        = g_system_config.esp_id;
ack_doc["status"]        = "zone_assigned";
ack_doc["zone_id"]       = zone_id;
ack_doc["master_zone_id"] = master_zone_id;
ack_doc["ts"]            = (unsigned long)timeManager.getUnixTimestamp();
ack_doc["seq"]           = mqttClient.getNextSeq();
// correlation_id: FEHLT
```

**Hinweis:** Der ack_topic wird hier DIREKT als String-Konkatenation gebaut, nicht via `TopicBuilder::buildZoneAckTopic()`. Dasselbe gilt fuer den Fehler-ACK Z. 1615. Das ist eine Inkonsistenz, aber keine funktionale Abweichung solange kaiser_id korrekt gesetzt ist.

### ACK-Payload (Removal-Fall, Z. 1444-1461)

```cpp
ack_doc["esp_id"]       = g_system_config.esp_id;
ack_doc["status"]       = "zone_removed";
ack_doc["zone_id"]      = "";
ack_doc["master_zone_id"] = "";
ack_doc["ts"]           = (unsigned long)timeManager.getUnixTimestamp();
ack_doc["seq"]          = mqttClient.getNextSeq();
// correlation_id: FEHLT
```

Hier wird `TopicBuilder::buildZoneAckTopic()` korrekt verwendet (Z. 1445).

### ACK-Payload (Fehler-Faelle, Z. 1475-1480, Z. 1509-1514, Z. 1615-1619)

Alle Fehler-ACKs werden als Raw-JSON-String gebaut — kein `correlation_id`-Feld.

---

## 2. TopicBuilder: Zone-Topics

```
topic_builder.h Z. 47-48:
  static const char* buildZoneAssignTopic();  // WP3
  static const char* buildZoneAckTopic();     // WP3

topic_builder.cpp Z. 266-278:
  buildZoneAssignTopic() -> "kaiser/%s/esp/%s/zone/assign"
  buildZoneAckTopic()    -> "kaiser/%s/esp/%s/zone/ack"
```

Beide Methoden sind vollstaendig implementiert und korrekt.

---

## 3. Subzone-Handling (main.cpp Z. 1628-1736)

### sendSubzoneAck Helper (Z. 105-131)

```cpp
void sendSubzoneAck(const String& subzone_id, const String& status, const String& error_message) {
    ack_doc["esp_id"]    = g_system_config.esp_id;
    ack_doc["status"]    = status;
    ack_doc["subzone_id"] = subzone_id;
    ack_doc["timestamp"] = millis() / 1000;
    // correlation_id: FEHLT
    ack_doc["seq"]       = mqttClient.getNextSeq();
}
```

**correlation_id fehlt im subzone/ack ebenfalls.**

### NVS-Schreiben vor ACK (Subzone)

Ablaufreihenfolge Z. 1715-1728:
1. Z. 1716: `configManager.saveSubzoneConfig(subzone_config)` — NVS-Write
2. Z. 1728: `sendSubzoneAck(subzone_id, "subzone_assigned", "")` — ACK danach

**Race-Condition-Prevention: korrekt.** Identisches Pattern wie bei Zone.

### TopicBuilder: Subzone-Topics

```
topic_builder.h Z. 39-41:
  buildSubzoneAssignTopic() -> "kaiser/%s/esp/%s/subzone/assign"
  buildSubzoneAckTopic()    -> "kaiser/%s/esp/%s/subzone/ack"
```

Beide implementiert und korrekt.

---

## 4. Wo correlation_id BEREITS verwendet wird

Zum Vergleich: correlation_id wird in zwei anderen Kontexten korrekt verarbeitet:

- **handleSensorConfig** (Z. 2503-2507): `doc["correlation_id"]` gelesen, an `ConfigResponseBuilder::publishWithFailures()` weitergegeben
- **handleActuatorConfig** (Z. 2740-2747): Gleicher Pattern

Das zeigt: Das Pattern ist bekannt und in der Codebase vorhanden. Es wurde nur nicht in den Zone/Subzone-Handlern implementiert.

---

## 5. Was fehlt — Detaillierte Gap-Analyse

### Gap 1: Zone-ACK ohne correlation_id

**Betroffene Stellen:**

| Stelle | Typ | Zeile |
|--------|-----|-------|
| Zone Assignment Erfolg | ack_doc Aufbau | Z. 1584-1590 |
| Zone Removal Erfolg | ack_doc Aufbau | Z. 1446-1452 |
| Zone Validation-Error | Raw-String | Z. 1510-1513 |
| Zone NVS-Error | Raw-String | Z. 1616-1619 |
| Zone Removal-Error | Raw-String | Z. 1476-1479 |

**Was fehlen muss:**
1. `doc["correlation_id"]` aus dem Payload lesen (neben zone_id, Z. 1406-1409)
2. `ack_doc["correlation_id"] = correlation_id` in alle ACK-Dokumente einfuegen
3. Raw-String Fehler-ACKs muessen ebenfalls correlation_id einschliessen

### Gap 2: Subzone-ACK ohne correlation_id

**Betroffene Stellen:**

| Stelle | Typ | Zeile |
|--------|-----|-------|
| sendSubzoneAck() Helper | ack_doc Aufbau | Z. 109-119 |

**Was fehlen muss:**
1. `sendSubzoneAck()` Signatur um `correlation_id`-Parameter erweitern
2. `doc["correlation_id"]` im Subzone-Assign-Handler lesen (Z. 1638+)
3. `ack_doc["correlation_id"] = correlation_id` im Helper einfuegen
4. Alle `sendSubzoneAck()`-Aufrufe mit correlation_id anpassen

### Gap 3: Inkonsistenz beim Topic-Building im Zone-Assign-Handler

Erfolgs-ACK (Z. 1583) und Fehler-ACK (Z. 1615) bauen das Topic per String-Konkatenation statt `TopicBuilder::buildZoneAckTopic()`. Funktional OK, aber inkonsistent zum Removal-Pfad (Z. 1445) der den TopicBuilder korrekt verwendet.

---

## 6. Klare Antworten

**Sendet die Firmware zone/ack mit correlation_id? NEIN.**

Die Firmware sendet zone/ack (Topic korrekt, Reihenfolge korrekt), aber **ohne** `correlation_id` im Payload. Der Server sendet die correlation_id im zone/assign-Payload, die Firmware liest das Feld nicht und spiegelt es nicht zurueck.

**Sendet die Firmware subzone/ack mit correlation_id? NEIN.**

Gleicher Befund. Das sendSubzoneAck()-Helper-Pattern kennt keine correlation_id.

**Ist die NVS-Schreib-Reihenfolge korrekt? JA.**

Sowohl bei Zone (Z. 1519 vor Z. 1583) als auch Subzone (Z. 1716 vor Z. 1728) wird NVS geschrieben BEVOR der ACK published wird. Keine Race-Condition moeglich.

---

## 7. Empfehlung fuer T14-Fix-A Implementierung

Minimaler Fix (nur correlation_id hinzufuegen, keine strukturellen Aenderungen):

**Zone-Handler (main.cpp Z. 1406):**
```cpp
// Neu: correlation_id lesen
String correlation_id = doc["correlation_id"] | String("");
```

**Zone-ACK (Z. 1584-1590), Ergaenzung:**
```cpp
if (correlation_id.length() > 0) {
    ack_doc["correlation_id"] = correlation_id;
}
```

**sendSubzoneAck() Signatur (Z. 106):**
```cpp
void sendSubzoneAck(const String& subzone_id, const String& status,
                    const String& error_message, const String& correlation_id = "")
```

**Scope der Aenderungen:** Nur `main.cpp`. Keine neuen Dateien. Kein Einfluss auf TopicBuilder, ConfigManager oder andere Manager.
