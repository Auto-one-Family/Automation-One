# T16-V2 Block C — Circuit Breaker + Logic Engine Health

**Erstellt:** 2026-03-10
**Modus:** B (Spezifisch: Circuit Breaker Status + Logic Engine Health)
**Quellen:** `src/core/resilience/circuit_breaker.py`, `src/core/resilience/registry.py`, `src/mqtt/client.py`, `src/db/session.py`, `src/main.py`, `src/services/logic_engine.py`, `src/services/logic_scheduler.py`, Docker logs `automationone-server` (24h / 6h), PostgreSQL `cross_esp_logic`

---

## V-RE-01: Circuit Breaker Status

**Ergebnis:** PASS
**Status:** mqtt=closed, database=closed, external_api=closed
**State-Wechsel letzte 24h:** Nein

### Details

Alle 3 Circuit Breaker wurden beim Serverstart (2026-03-10 09:06:58) erfolgreich initialisiert und im `ResilienceRegistry`-Singleton registriert. Die Startup-Logs bestaetigen:

```
[resilience] CircuitBreaker[external_api] initialized: threshold=5, recovery=60.0s, half_open=15.0s
[resilience] CircuitBreaker[database] initialized: threshold=3, recovery=10.0s, half_open=5.0s
[resilience] CircuitBreaker[mqtt] initialized: threshold=5, recovery=30.0s, half_open=10.0s
[resilience] Status: healthy=True, breakers=3 (closed=3, open=0)
```

Kein einziger echter State-Wechsel (CLOSED → OPEN / OPEN → HALF_OPEN) wurde in den letzten 24h im Log gefunden. Der einzige Eintrag mit "Manual reset" ist der mqtt-Breaker beim Startup-Reset (closed → closed), was normales Initialisierungsverhalten ist.

### Breaker-Konfiguration (aus Code)

| Breaker | Registriert in | Failure Threshold | Recovery Timeout | Half-Open Timeout |
|---------|---------------|------------------|-----------------|-------------------|
| `mqtt` | `mqtt/client.py` MQTTClient.__init__ | 5 | 30.0s | 10.0s |
| `database` | `db/session.py` init_db_circuit_breaker() | 3 | 10.0s | 5.0s |
| `external_api` | `main.py` startup | 5 | 60.0s | 15.0s |

### API-Exposition des Status

**Befund:** Der `/api/v1/health/detailed`-Endpoint exponiert keinen Circuit Breaker Status. Die `DetailedHealthResponse` gibt DB, MQTT und WebSocket-Metriken zurueck, aber kein `resilience`-Feld. Der `ResilienceRegistry.get_health_status()`-Aufruf ist im Code vorhanden, wird aber von keinem Health-Endpoint aufgerufen.

Ein dedizierter Resilience-Endpoint existiert nicht. Der Status ist nur indirekt ueber Startup-Logs sichtbar.

**Server- und Health-Check-Status:**
- `/api/v1/health/live` → `{"success":true,"alive":true}` (HTTP 200)
- `/api/v1/health/ready` → `{"success":true,"ready":true,"checks":{"database":true,"mqtt":true,"disk_space":true}}` (HTTP 200)

---

## V-RE-02: Logic Engine Health

**Ergebnis:** PASS (mit Hinweis: keine aktiven Rules)
**Aktive Rules:** 0
**Scheduler-Frequenz:** 60s (bestaetigt)
**Errors letzte 6h:** Nein

### Details

Die Logic Engine und der Logic Scheduler wurden beim Serverstart korrekt gestartet:

```
Logic Engine started
Logic Scheduler started (interval: 60s)
Logic Engine evaluation loop started
Logic Scheduler loop started
```

Die `LogicEngine._evaluation_loop()` laeuft im 1s-Takt (keepalive, keine Arbeit), der `LogicScheduler._scheduler_loop()` evaluiert alle 60s timer-getriggerte Rules.

**DB-Zustand der Rule-Tabelle:**

| Tabelle | Gesamt-Rules | Aktive Rules (enabled=true) |
|---------|-------------|----------------------------|
| `cross_esp_logic` | 0 | 0 |

Die Datenbank-Tabelle heisst `cross_esp_logic` (nicht `logic_rules`). Das `enabled`-Flag (nicht `is_active` wie im Test-Skript angenommen) steuert die Aktivierung. Aktuell sind keine Rules angelegt.

Ein zweiter Log-Check auf timer-triggered Rules ergab keine Eintraege — was korrekt ist, da keine Rules vorhanden sind. Ebenso keine Fehlereintraege in der Logic-Engine-Log-Ausgabe der letzten 6h.

**Architektur-Hinweis:** Die `LogicEngine._evaluation_loop()` (1s-Schleife) ist ein reiner Keepalive — die eigentliche Rule-Evaluierung laeuft event-getrieben ueber `sensor_handler` (nach jedem Sensor-Eingang) und timer-getrieben ueber `LogicScheduler` (alle 60s). Es gibt also keinen "60s-Hauptschleife der Engine" — der 60s-Takt gehoert zum Scheduler, nicht zur Engine selbst.

---

## 3. Bewertung & Empfehlung

**Root Cause:** Kein Problem gefunden.

- Alle 3 Circuit Breaker sind im `closed`-Zustand und haben in den letzten 24h keinen State-Wechsel durchgefuehrt — Resilience-System stabil.
- Logic Engine und Scheduler laufen ordnungsgemaess. Keine Rules sind konfiguriert, was erwartetes Verhalten im aktuellen Entwicklungsstand ist.

**Gefundene Auffaelligkeit (nicht kritisch):**

Der `ResilienceRegistry.get_health_status()`-Aufruf existiert im Code, wird aber von keinem HTTP-Endpoint exponiert. Der `/api/v1/health/detailed`-Endpoint zeigt kein `resilience`-Feld. Fuer Monitoring-Zwecke waere ein dedizierter `/api/v1/health/resilience`-Endpoint oder die Integration der Breaker-Metriken in `DetailedHealthResponse` sinnvoll.

**Nichtblockierende Empfehlung:**
- Optional: Circuit Breaker Status in `/api/v1/health/detailed` integrieren, z.B. als `resilience`-Objekt mit `healthy`, `breakers`-Dict.
- Keine sofortige Aktion notwendig. Server ist operationell.
