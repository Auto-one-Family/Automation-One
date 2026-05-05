# Bericht: Config-Verträge — „Contract violation normalized on config_response“

**Datum:** 2026-04-10  
**Scope:** MQTT `config_response`, Kanonisierung `canonicalize_config_response`, Log in `config_handler.py`  
**Status:** Analyse / keine Implementierung in diesem Dokument

---

## 1. Symptom (Beobachtung)

Im Server-Log (Docker-Stdout, Text-Formatter) wiederholt:

```text
Contract violation normalized on config_response: esp_id=ESP_00000001 raw_status=success raw_type=actuator raw_error_code=None
```

Typischerweise **paarweise** kurz hintereinander (Doppel-Publish oder zwei Antworten pro Konfigurationsvorgang).

---

## 2. Technische Ursache (Codepfad)

### 2.1 Wo geloggt wird

```128:136:El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py
            if canonical.is_contract_violation:
                increment_contract_unknown_code("config_response")
                logger.warning(
                    "Contract violation normalized on config_response: esp_id=%s raw_status=%s raw_type=%s raw_error_code=%s",
                    esp_id,
                    canonical.raw_status,
                    canonical.raw_type,
                    canonical.raw_error_code,
                )
```

`is_contract_violation` kommt **ausschließlich** aus `canonicalize_config_response(...)`.

### 2.2 Wann `is_contract_violation` true ist

In `device_response_contract.py` sammelt die Funktion **contract_issues** (u. a.):

- unbekanntes oder fehlendes **`status`** (nach Alias-Auflösung)
- unbekanntes oder fehlendes **`type` / `config_type`**
- fehlendes **`correlation_id`** (es wird zwar ein synthetischer `missing-corr:cfg:…`-Wert gesetzt, aber der Eintrag `correlation_id=missing` bleibt in `contract_issues`)
- bei Fehlerpfaden: unbekannte **`error_code`**-Werte usw.

```110:172:El Servador/god_kaiser_server/src/services/device_response_contract.py
def canonicalize_config_response(payload: Mapping[str, Any], *, esp_id: str) -> CanonicalConfigResponse:
    ...
    correlation_id = _to_text(payload.get("correlation_id"))
    if correlation_id is None:
        ...
        correlation_id = f"missing-corr:cfg:{esp_id}:{config_type}:{ts_part}:{seq_token}"
        contract_issues.append("correlation_id=missing")
    ...
    is_contract_violation = len(contract_issues) > 0
```

### 2.3 Interpretation des konkreten Log-Musters

Für **`raw_status=success`** und **`raw_type=actuator`** sind die Felder **vom Wortlaut her** bereits kanonisch-konform (`success` ∈ bekannte Statusmenge, `actuator` ∈ bekannte Typen). **`raw_error_code=None`** ist bei Erfolg erwartbar (intern wird `error_code` auf `NONE` gesetzt).

Damit ist die **wahrscheinlichste** Erklärung für die Warnung: Die Payload enthält **kein `correlation_id`**, sodass `contract_issues` mindestens `correlation_id=missing` enthält — die Meldung ist also primär ein **Korrelations-/Vertragslücken-Hinweis**, nicht „falscher Status/Typ“.

Mock-/Test-ESP **`ESP_00000001`** passt zu einem Gerät, das Config-Acks sendet, ohne die vom Server bevorzugte Korrelations-ID mitzuliefern.

---

## 3. Einordnung (Bug vs. Erwartung)

| Aspekt | Bewertung |
|--------|-----------|
| Server robust? | Ja: synthetische `correlation_id`, Verarbeitung läuft weiter. |
| Observability | Die **eine** Warning-Zeile nennt **nicht** explizit `correlation_id=missing` — zur Diagnose muss man `canonicalize_config_response` kennen oder Logging erweitern. |
| Geräteseite | Wenn Produkt-ESP Config-Acks **ohne** `correlation_id` sendet, ist das relativ zum **Soll-Vertrag** (Observability/Correlation-Playbook) nachziehbar. |

---

## 4. Abgrenzung

- **`actuator_response`** hat eine **eigene** Kanonisierung und eigene „Contract violation“-Texte (`actuator_response_handler.py`) — nicht mit `config_response` verwechseln.
- Metrik `increment_contract_unknown_code("config_response")` zählt Verstöße mit — Details siehe `metrics.py` / Dashboards.

---

## 5. Empfohlene nächste Schritte (für Umsetzung, nicht Teil dieses Berichts)

1. **Payload-Trace** eines einzelnen Vorgangs: MQTT-Rohpayload `config_response` für `ESP_00000001` prüfen, ob `correlation_id` fehlt.  
2. **Firmware / Mock-ESP:** Bei Config-Ack dieselbe `correlation_id` zurückspiegeln, die der Server in der Config-Anfrage gesendet hat (falls im Projekt vorgesehen).  
3. Optional: Log-Zeile um **`contract_issues`** oder `canonical.message` ergänzen, um Warnungen ohne Quellcode-Lektüre lesbar zu machen.

---

## 6. Referenzen (Repo)

- `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py`
- `El Servador/god_kaiser_server/src/services/device_response_contract.py` (`canonicalize_config_response`)
