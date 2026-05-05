# Bericht: Test-JSON-Fehler (Invalid JSON / `mqtt_parse_fail_id`)

**Datum:** 2026-04-10  
**Scope:** MQTT-Subscriber `_route_message`, Unit-Tests, beobachteter Log mit Topic `…/FAKE_VERIFY/…`  
**Status:** Analyse

---

## 1. Symptom (Beobachtung im Docker-Log)

```text
Invalid JSON payload topic=kaiser/god/esp/FAKE_VERIFY/sensor/temp/data … Expecting property name enclosed in double quotes: line 1 column 2 (char 1)
```

Zusätzlich erscheint eine synthetische ID der Form `mqtt_parse_fail_id=parse-fail:<hex>`.

---

## 2. Verhalten im Code (Soll)

Wenn die Nutzlast **kein gültiges JSON** ist, wird **kein** Handler ausgeführt; es wird gezählt und mit `failure_class` protokolliert:

```174:188:El Servador/god_kaiser_server/src/mqtt/subscriber.py
            try:
                payload = json.loads(payload_str)
            except json.JSONDecodeError as e:
                # Synthetic correlation for log correlation when payload cannot be parsed (no handler run).
                mqtt_parse_fail_id = f"parse-fail:{uuid4().hex}"
                logger.error(
                    "Invalid JSON payload topic=%s mqtt_parse_fail_id=%s: %s",
                    topic,
                    mqtt_parse_fail_id,
                    e,
                    extra={"failure_class": "mqtt_json_parse"},
                )
                self.messages_failed += 1
                return
```

Das ist **kein** Anwendungsfehler im Handler, sondern ein **Ingress-Reject** auf Protokollebene (Payload-Qualität).

---

## 3. Repo-Abgleich: Unit-Test vs. Feld-Log

### 3.1 Versionierter Test (aktuell im Repo)

```124:133:El Servador/god_kaiser_server/tests/unit/test_mqtt_correlation.py
def test_route_message_json_decode_error_logs_mqtt_parse_fail_id(caplog):
    """Invalid JSON on a topic yields a stable mqtt_parse_fail_id in the error log."""
    mock_client = MagicMock()
    sub = Subscriber(mqtt_client=mock_client, max_workers=1)
    before_failed = sub.messages_failed
    with caplog.at_level(logging.ERROR):
        sub._route_message("kaiser/god/esp/ESP_UNIT/sensor/temp/data", "{not-json")
    assert sub.messages_failed == before_failed + 1
    assert "mqtt_parse_fail_id=" in caplog.text
    assert "parse-fail:" in caplog.text
```

- Topic-**ESP-ID** im Test: **`ESP_UNIT`**, nicht `FAKE_VERIFY`.
- Payload: `"{not-json"` — bewusst ungültiges JSON.

### 3.2 `FAKE_VERIFY` im Repository

Im Workspace-Tree gibt es **keine** Treffer für `FAKE_VERIFY` (Stand Auswertung). Die im Betriebs-Log gesehene **esp_id im Topic** ist daher sehr wahrscheinlich:

- eine **manuelle** `mosquitto_pub`-Injektion,
- ein **lokaler/nicht committeter** Test,
- oder ein **externes** Skript.

**Fachlich** ist das Verhalten identisch: beliebiges Topic + ungültiges JSON → gleicher ERROR-Pfad.

---

## 4. Einordnung

| Frage | Antwort |
|-------|---------|
| Ist das ein Produktions-Bug? | Nur dann, wenn ein **echtes** Gerät oder der Server **bewusst** kein JSON sendet. Sonst: erwartete Abweisung. |
| Ist es „Lärm“? | In **CI/Dev** kann es häufig auftreten, wenn Tests oder Tools fehlerhafte Payloads senden. |
| Korrelation | `mqtt_parse_fail_id` und optional spätere Loki/Alloy-Pipeline dienen der **Forensik** (siehe Correlation-Playbook / I02). |

---

## 5. Empfohlene nächste Schritte

1. **Ursache für `FAKE_VERIFY` klären:** MQTT-Broker-Log oder `mosquitto_sub` im Zeitfenster; ggf. CI-/Lokal-Skripte.  
2. Tests von echten Fehlpayloads **von** Produktions-Traffic trennen (eigener Broker, Test-Topic-Prefix), um Metriken `messages_failed` nicht zu verfälschen.  
3. Optional: In Staging **keine** zufälligen Publish auf `kaiser/#` mit Rohstrings.

---

## 6. Referenzen

- `El Servador/god_kaiser_server/src/mqtt/subscriber.py` (`_route_message`)
- `El Servador/god_kaiser_server/tests/unit/test_mqtt_correlation.py`
