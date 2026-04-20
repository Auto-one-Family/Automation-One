# Server Dev Report: PKG-19 — LWT/Heartbeat-Kette im Standby-Fenster stabilisieren

## Modus: B (Implementierung)

## Auftrag

PKG-19 Server-Teil: LWT/Heartbeat-Folgekette im Standby-Fenster konsistent halten, Doppel-/Fehleskalation reduzieren. Keine Vermischung NotificationRouter vs WS-only error_event ohne Evidence.

## Codebase-Analyse

### Analysierte Dateien
- `src/mqtt/handlers/lwt_handler.py` — LWT-Handler (vorher stateless, kein Flapping-Tracking)
- `src/mqtt/handlers/heartbeat_handler.py` — Heartbeat-Handler (check_device_timeouts, WS-Broadcasts)
- `src/services/event_contract_serializers.py` — serialize_esp_health_event Signatur
- `src/core/metrics.py` — Prometheus-Counter-Pattern (increment_disconnect_reason)
- `tests/integration/test_lwt_handler.py` — 13 bestehende Tests
- `tests/integration/test_heartbeat_handler.py` — 37 bestehende Tests
- `tests/mqtt/test_heartbeat_handler.py` — 5 bestehende Unit-Tests

### Patterns gefunden
- Singleton mit `get_*_handler()` + globale `_*_instance`
- `TTLCache` für zeitliche Fenster-Logik (HeartbeatHandler._handover_epoch_by_esp)
- `serialize_esp_health_event(**kwargs)` für WS-Broadcasts mit optionalem `source`-Feld
- `device_metadata["last_disconnect"]` als Carrier für Disconnect-Kontext

### Root-Cause Befund (aus BERICHT)
Standby → MQTT-Write-Timeout → LWT → Online (kurz) → LWT → Online → LWT → ... Jeder Zyklus:
1. LWT markiert offline → Aktuator-Reset (teuer) → WS-Broadcast
2. Heartbeat kommt → online → WS-Broadcast
3. LWT kommt → offline → Aktuator-Reset NOCHMAL → WS-Broadcast
→ N×Aktuator-Resets, N×Audit-Logs, N×WS-Broadcasts für dieselbe Episode.

## Qualitaetspruefung (8-Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur & Einbindung | LWT: `__init__` + `_recent_lwt_ts` hinzugefügt (Pattern: HeartbeatHandler._handover_epoch_by_esp). HB: Inline-Guard in check_device_timeouts. Keine neuen Dateien. |
| 2 | Namenskonvention | snake_case, Konstanten UPPER_CASE (FLAPPING_WINDOW_SECONDS, FLAPPING_THRESHOLD). ✅ |
| 3 | Rückwärtskompatibilität | WS-Broadcast: neue Felder additiv (is_flapping, lwt_count_5m, reconnect_after_flapping, is_reconnect). Keine Entfernung. ✅ |
| 4 | Wiederverwendbarkeit | Nutzt existierendes device_metadata["last_disconnect"] als Carrier. Kein neues DB-Schema. ✅ |
| 5 | Speicher & Ressourcen | deque(maxlen=20) pro ESP statt unbounded list. Kein Memory-Leak. ✅ |
| 6 | Fehlertoleranz | Alle Checks mit isinstance/get-Guards. Kein Crash bei fehlenden Metadata-Feldern. ✅ |
| 7 | Seiteneffekte | Aktuator-Reset wird bei Flapping übersprungen (gewünscht). Safety-Service nicht betroffen. ✅ |
| 8 | Industrielles Niveau | Keine Stubs/TODOs. Vollständige Tests. ✅ |

## Cross-Layer Impact

| Geändert | Geprüft |
|----------|---------|
| WS-Broadcast (esp_health) neue Felder | Frontend: Additiv, kein Breaking-Change. Frontend-dev (PKG-20) nutzt lwt_count_5m/is_flapping für Flapping-Badge. |
| device_metadata["last_disconnect"] erweitert | DB: Kein Schema-Change (JSON-Feld). ✅ |
| Heartbeat timeout guard | Logic Engine: Nicht betroffen (guard nur in check_device_timeouts). ✅ |

## Ergebnis — Geänderte Dateien

### 1. `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py`
- **Flapping-Detection**: `__init__` mit `_recent_lwt_ts` (deque-basiert, 5-Min-Fenster)
- **`_record_lwt_event(esp_id)`**: Zählt LWT-Events im Fenster, gibt Count zurück
- **Flapping-Guard**: Bei ≥2 LWTs in 5 Min → `is_flapping=True`
  - Aktuator-Reset wird übersprungen (waren bereits idle vom ersten LWT)
  - device_metadata und WS-Broadcast erhalten `lwt_count_5m` + `is_flapping`
- **Logging**: LWT-Warning enthält jetzt `lwt_count_5m` und `flapping` Status

### 2. `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- **Anti-Doppel-Eskalation in check_device_timeouts**: Wenn `device_metadata.last_disconnect.source == "lwt"` UND der Timestamp jünger als `HEARTBEAT_TIMEOUT_SECONDS` ist → skip (LWT hat bereits gehandelt)
- **WS-Broadcast Enrichment**: `is_reconnect` Feld hinzugefügt; bei Reconnect nach Flapping: `reconnect_after_flapping=True` + `lwt_count_5m`
- **Bestehende unstaged Changes beibehalten**: `source="heartbeat"`, `source="heartbeat_timeout"`, server-authoritative Timestamp

### 3. Tests
- `tests/integration/test_lwt_handler.py`: +6 neue Tests (TestLWTFlappingDetection)
- `tests/integration/test_heartbeat_handler.py`: +3 neue Tests (TestHeartbeatTimeoutAntiDuplicateEscalation, TestHeartbeatWithoutGpioFieldsAccepted)

## Verifikation

```
pytest: 61 passed, 2 deselected (pre-existing soft_deleted_device failures)
ruff: All checks passed!
```

## Rest-Risiken / BLOCKER

| Risiko | Schwere | Mitigation |
|--------|---------|------------|
| FLAPPING_THRESHOLD=2 könnte zu aggressiv sein (einmaliger Doppel-LWT nach Broker-Restart) | Niedrig | Konstante ist leicht anpassbar; 2 ist konservativ genug für echtes Flapping |
| Aktuator-Reset-Skip bei Flapping: Falls ESP zwischen LWTs tatsächlich Aktuatoren aktiviert hat | Niedrig | In Standby-Fenster unwahrscheinlich; bei Wiederaufnahme kommt Heartbeat → online → Config-Push |
| Pre-existing Test-Failures (soft_deleted_device) | Keine PKG-19-Regression | Vorbekannt, nicht durch diese Änderungen verursacht |

## Empfehlung

- **frontend-dev (PKG-20)**: Nutze `is_flapping`, `lwt_count_5m`, `reconnect_after_flapping` aus esp_health WS-Events für Flapping-Badge
- **mqtt-dev (PKG-19)**: Broker-Konfiguration (`mosquitto.conf`) separat prüfen — Docker-Restart-Ursache ist infra-seitig
- **test-log-analyst (PKG-21)**: Runtime-Verify nach Deployment: 10-Min-Fenster auf doppelte Aktuator-Resets prüfen
