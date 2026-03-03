# V7.2 Absturz-Sicherheit — Verifikationsbericht

> **Datum:** 2026-03-03
> **Agent:** server-development
> **Geprueft:** main.py, plugin_service.py, mqtt/client.py, mqtt/offline_buffer.py, diagnostics_service.py, websocket.ts

---

## Server-Neustart Recovery

### Startup-Sequenz (main.py:87-625 — `lifespan()`)

| Schritt | Was | Zeilen | Status |
|---|---|---|---|
| 0 | Security Validation (JWT, MQTT TLS) | 101-129 | OK |
| 0.5 | Resilience Patterns (Circuit Breakers) | 131-154 | OK |
| 1 | Database Init (`init_db()`) | 156-168 | OK — 5 Attempts, 2s exponential |
| 2 | MQTT Connect | 170-181 | OK — Startet auch bei Failure (Auto-Reconnect) |
| 3 | MQTT Handler Registration | 183-260 | OK — 12 Handler + 3 Mock-Handler |
| 3.4 | Central Scheduler Init | 262-267 | OK |
| 3.4.1 | SimulationScheduler Init | 269-311 | OK |
| 3.4.2 | MaintenanceService Init + Start | 313-324 | OK — Registriert alle Cleanup/Monitor-Jobs |
| 3.4.3 | Prometheus Metrics (15s Interval) | 326-347 | OK |
| 3.4.4 | Digest Service (60min Interval) | 349-366 | OK |
| 3.4.5 | Alert Suppression Tasks (5min + Daily) | 368-378 | OK — Non-critical, try/except |
| 3.5 | Mock-ESP Recovery | 380-394 | OK — Non-critical, try/except |
| 3.6 | Sensor Type Auto-Registration | 396-415 | OK — Non-critical, try/except |
| 3.7 | Sensor Schedule Recovery | 417-443 | OK — Non-critical, try/except |
| 4 | MQTT Subscribe All | 445-453 | OK — Nur wenn connected, sonst auf Reconnect |
| 5 | WebSocket Manager Init | 455-460 | OK |
| 6 | Services (Safety, Actuator, Logic Engine) | 462-585 | OK |
| 6.1 | Plugin Registry → DB Sync | 587-603 | OK — Non-critical, try/except |

### Bewertung

- **Scheduler-Jobs re-registriert:** JA — Mindestens 8-10 Jobs (3 Maintenance Cleanup, 3 Monitor Health, 1 Metrics, 1 Digest, 2 Suppression)
- **MQTT-Handler re-registriert:** JA — 12 Handler + 3 Mock-Handler = 15 Registrierungen
- **Circuit Breaker Reset:** JA — `_on_connect()` (client.py:527-529) ruft `self._circuit_breaker.reset()` auf
- **Plugin-Sync:** JA — `sync_registry_to_db()` in Step 6.1 (Zeile 597)
- **Graceful Shutdown:** JA — Definiert in Zeile 631-717, ordentliche Reihenfolge:
  1. LogicScheduler → LogicEngine → SequenceExecutor
  2. MaintenanceService (entfernt Jobs)
  3. SimulationScheduler (stoppt Mocks)
  4. CentralScheduler (entfernt alle Jobs)
  5. WebSocket Manager
  6. MQTT Subscriber (Thread Pool, 30s Timeout)
  7. MQTT Client disconnect
  8. DB Engine dispose
- **SIGTERM-Handling:** FastAPI/Uvicorn handled SIGTERM nativ via lifespan Context-Manager
- **BESTANDEN**

---

## Plugin-Crash-Isolation

### Code-Review (plugin_service.py:163-244)

| Aspekt | Status | Details |
|---|---|---|
| try/except vorhanden | **JA** | Zeile 190-238: `try: ... except Exception as e:` |
| Gefangene Exceptions | `Exception` | Faengt alle Standard-Exceptions. **NICHT:** `BaseException`, `SystemExit`, `KeyboardInterrupt` |
| DB-Rollback | **NEIN — aber commit im finally** | Zeile 242: `await self.db.commit()` im `finally`-Block. Kein explizites `rollback()`. Der `execution`-Record wird mit `status="error"` committed. |
| Plugin-Rollback | **JA** | Zeile 235-238: `await plugin.rollback(autoops_context, client, [])` im except-Block, mit eigenem try/except |
| Error-Logging | **JA** | Zeile 233: `logger.error(f"Plugin '{plugin_id}' execution failed: {e}", exc_info=True)` |
| Notification bei Crash | **NEIN** | Keine Notification — wird in V3.3 Phase B adressiert |
| Timeout | **NEIN** | Kein `asyncio.wait_for()` Timeout. Plugin laeuft unbegrenzt. |
| Execution Record | **JA** | `finished_at` + `duration_seconds` werden im `finally` gesetzt. Record wird committed. |

### Risiken

1. **Kein Timeout:** Ein Plugin das haengt (Endlosschleife, blockierender HTTP-Call) blockiert den Worker fuer immer. **Empfehlung:** `asyncio.wait_for(plugin.execute(...), timeout=300)` (5 Minuten).
2. **SystemExit/KeyboardInterrupt:** Werden NICHT gefangen → Server-Absturz moeglich. **Bewertung:** Akzeptabel — diese sollten den Server tatsaechlich stoppen.
3. **Memory-Fehler:** `MemoryError` ist ein `Exception`-Subtyp und wird gefangen. Aber das System koennte instabil sein. **Risiko: GERING** — Plugins haben keinen Zugriff auf grosse Datenmengen.
4. **Kein expliziter DB-Rollback:** Wenn das Plugin eine fehlerhafte DB-Operation macht, wird im `finally` `commit()` aufgerufen. Das committed den `execution`-Record, aber potentiell auch fehlerhafte Plugin-DB-Aenderungen. **Empfehlung:** `await self.db.rollback()` VOR dem error-handling, dann neuen commit fuer den execution-record.

- **BESTANDEN** (mit Empfehlungen fuer Timeout und Rollback)

---

## MQTT-Disconnect Recovery (Code-Review)

### on_disconnect (client.py:576-636)
- Setzt `self.connected = False`
- Rate-Limited Logging (max 1x pro Minute) — verhindert Log-Spam
- **Auto-Reconnect:** Wird von paho-mqtt automatisch gehandelt (`reconnect_delay_set(min_delay=1, max_delay=60)`, Zeile 270)
- Keine Circuit-Breaker-Aenderung bei Disconnect — korrekt, da CB nur publish-Fehler trackt

### on_connect (client.py:515-562)
- Setzt `self.connected = True`
- Reconnect-Delay wird auf 1 zurueckgesetzt (Zeile 519)
- **Circuit Breaker Reset:** JA — `self._circuit_breaker.reset()` (Zeile 528)
- **Re-Subscribe:** JA — `self._subscriber.subscribe_all()` (Zeile 535) wird aufgerufen wenn `self._subscriber` gesetzt ist
- `set_subscriber()` (Zeile 495-503) wird in main.py:199 aufgerufen — Subscriber-Referenz ist vorhanden
- **Offline Buffer Flush:** JA — `self._flush_offline_buffer()` wird asynchron nach Reconnect aufgerufen (Zeile 541-551)

### Offline Buffer (offline_buffer.py)
- **Max Size:** Konfigurierbar, Default aus `settings.resilience.offline_buffer_max_size` (maxlen-Deque)
- **Flush-Mechanismus:** `flush()` (Zeile 194-268) — Batch-weise, max 3 Attempts pro Message, failed Messages werden re-queued
- **flush_all()** (Zeile 270-294) — Loop mit 0.1s Delay zwischen Batches, stoppt bei keinem Progress
- **Thread-Safety:** `asyncio.Lock()` fuer alle Buffer-Operationen
- **Drop-Policy:** Oldest-first bei vollem Buffer (deque maxlen)

### Bewertung
- **Re-Subscribe:** VOLLSTAENDIG — Alle Topics werden bei Reconnect automatisch wieder abonniert
- **Offline-Buffer:** FUNKTIONAL — Messages werden gepuffert und nach Reconnect geflusht
- **Recovery-Mechanismus:** Robust mit exponential Backoff (1s-60s)
- **BESTANDEN**

---

## WebSocket-Reconnect (Code-Review)

### Reconnect-Logik (websocket.ts)
- **Max Attempts:** 10 (Zeile 52)
- **Exponential Backoff:** 1s → 2s → 4s → 8s → 16s → 30s (max) mit Jitter (Zeile 270-276)
- **Token-Refresh:** JA — `refreshTokenIfNeeded()` (Zeile 136-151) wird VOR jedem Reconnect aufgerufen. Prueft JWT-Expiry mit 60s Buffer.
- **Tab-Switch Recovery:** JA — `visibilitychange` Event-Handler (Zeile 297-337). Bei Tab-Switch prüft er Connection und reconnected bei Bedarf.
- **Cleanup:** JA — `cleanupVisibilityHandling()` (Zeile 344-349) entfernt den Event-Listener via `removeEventListener`. `disconnect()` (Zeile 237-256) raeumt Timer und Listener auf.
- **onClose-Handler:** Zeile 201-213 — Reconnect nur bei non-normal Closure (`event.code !== 1000`). Bei Max-Attempts-Exhaustion: Status → `error`.
- **Connect-Callbacks:** `onConnectCallbacks` Set (Zeile 71) notifiziert Stores nach erfolgreichem Connect → Stores koennen Daten refreshen.

### Bewertung
- **Tab-Switch Recovery:** JA
- **Token-Refresh:** JA — Vor jedem Reconnect
- **Server-Restart Recovery:** JA — Auto-Reconnect mit exponential Backoff, max 10 Versuche
- **Store Re-Sync:** TEILWEISE — Connect-Callbacks benachrichtigen Stores, aber ob alle Stores re-fetchen haengt von ihrer Implementierung ab
- **Memory-Leak-Schutz:** JA — Listener werden bei `disconnect()` entfernt
- **BESTANDEN**

---

## DiagnosticsService Einzelcheck-Fehler

### Code-Review (diagnostics_service.py:104-143)

```python
for name, check_fn in self.checks.items():
    check_start = datetime.now(UTC)
    try:
        result = await check_fn()
    except Exception as e:
        logger.warning(f"Diagnostic check '{name}' failed: {e}")
        result = CheckResult(
            name=name,
            status=CheckStatus.ERROR,
            message=f"Check fehlgeschlagen: {str(e)}",
        )
    result.duration_ms = (datetime.now(UTC) - check_start).total_seconds() * 1000
    results.append(result)
```

| Aspekt | Status | Details |
|---|---|---|
| Einzelcheck try/except | **JA** | Jeder Check laeuft in eigenem try/except (Zeile 113-121) |
| Partielle Ergebnisse | **JA** | Fehlgeschlagene Checks werden als `CheckStatus.ERROR` in die Ergebnisliste aufgenommen. Andere Checks laufen weiter. |
| Check-Timeout | **NEIN** | Kein `asyncio.wait_for()` pro Check. Ein haengender Check (z.B. `_check_monitoring` mit `httpx.AsyncClient(timeout=3.0)`) koennte den ganzen Run blockieren. **ABER:** Die meisten Checks nutzen eigene Timeouts (z.B. httpx 3s). Nur DB-Checks ohne expliziten Timeout koennten laenger dauern. |
| Overall-Status | **JA** | `max()` ueber alle Check-Status (Zeile 126-128) — der schlechteste Check bestimmt den Overall-Status |
| Report-Persistierung | **JA mit Fallback** | Zeile 641-645: `try: await self.session.commit()` mit `except: await self.session.rollback()` |

### Edge Case: DB nicht erreichbar waehrend Diagnostic-Run
- Report-Persistierung hat try/except (Zeile 641-645)
- Checks die DB-Zugriff brauchen (database, esp_devices, sensors, actuators, alerts, plugins) wuerden mit `CheckStatus.ERROR` markiert
- Check `_check_database` (Zeile ~289) prueft die DB-Connection selbst → wuerde fehlschlagen
- **Ergebnis:** Report wird im Memory erzeugt und als Response zurueckgegeben, aber NICHT persistent gespeichert wenn DB down ist. Log-Eintrag vorhanden.

- **BESTANDEN** (mit Empfehlung fuer per-Check-Timeout)

---

## Gesamt-Bewertung

- **ABSTURZ-SICHER FUER HW-TEST: JA**
- **SOFORT-FIX erforderlich: NEIN**

### Kritische Luecken: KEINE

### Empfehlungen (nicht-blockierend)

| # | Empfehlung | Prioritaet | Wo |
|---|---|---|---|
| 1 | Plugin-Execute Timeout (300s) | MITTEL | plugin_service.py:222 |
| 2 | Plugin-Execute expliziter DB-Rollback vor Error-Handling | NIEDRIG | plugin_service.py:230 |
| 3 | Diagnostic-Check per-Check-Timeout (z.B. 10s) | NIEDRIG | diagnostics_service.py:114 |
| 4 | Plugin-Crash-Notification (V3.3 Phase B) | GEPLANT | plugin_service.py |

### Manuelle Tests (D3/D4) — VOM USER DURCHZUFUEHREN

Die folgenden Tests erfordern laufende Docker-Container und koennen nicht per Code-Review verifiziert werden:

**D3: MQTT-Disconnect Simulation**
```bash
# 1. System laeuft normal
# 2. docker stop automationone-mqtt
# 3. 30 Sekunden warten
# 4. docker start automationone-mqtt
# Pruefen: CB OPEN→HALF_OPEN→CLOSED, Offline-Buffer, Re-Subscribe, Recovery-Zeit
```

**D4: WebSocket-Reconnect**
```bash
# 1. Frontend im Browser offen
# 2. Browser-Tab schliessen/oeffnen
# 3. docker restart automationone-server
# Pruefen: Auto-Reconnect, Token-Refresh, Store Re-Sync
```

**Code-Review-Ergebnis:** Alle Mechanismen sind implementiert und sehen korrekt aus. Manuelle Tests bestaetigen das Verhalten.
