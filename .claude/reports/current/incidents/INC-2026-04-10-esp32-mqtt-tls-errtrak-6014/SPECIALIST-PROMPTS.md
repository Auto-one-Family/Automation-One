# SPECIALIST-PROMPTS — INC-2026-04-10-esp32-mqtt-tls-errtrak-6014

**Git-Pflicht für alle Dev-Rollen:** Arbeit und Commits nur auf Branch **`auto-debugger/work`** (nicht `master`).  
**Referenz-Artefakte:** `INCIDENT-LAGEBILD.md`, `CORRELATION-MAP.md`, `TASK-PACKAGES.md` (nach Verify), `VERIFY-PLAN-REPORT.md`.

---

## Rolle: esp32-dev — Agent `.claude/agents/esp32-dev.md`

**KONTEXT:** Incident INC-2026-04-10-esp32-mqtt-tls-errtrak-6014. Serial zeigt TLS-Timeout und `[6014] [UNKNOWN] MQTT connection lost`. Lagebild dokumentiert **ISSUE-SW-01**: `logCommunicationError` addiert `ERROR_COMMUNICATION` auf bereits absolute Codes.

**AUFTRAG:** **PKG-01** umsetzen: `logCommunicationError` so korrigieren, dass absolute Kommunikations-Codes (3000–3999) nicht erneut mit 3000 addiert werden. Audit `logApplicationError` / `logServiceError` auf gleiches Muster; bei Fund gleiche Strategie oder dokumentierter Follow-up.

**DATEIEN (Pflicht):**

- `El Trabajante/src/error_handling/error_tracker.cpp`
- `El Trabajante/src/error_handling/error_tracker.h` (nur falls Signatur/Doku-Anpassung nötig)
- Aufrufer nur bei API-Änderung — IST: alle `logCommunicationError`-Aufrufe in `src/` nutzen `#define`-Werte aus `error_codes.h` (absolute Codes).

**TESTS (nach Verify-Stand):**

```text
cd "El Trabajante" && pio run -e seeed_xiao_esp32c3
```

**OUTPUT:** PR/Commit auf `auto-debugger/work`; in Commit-Message auf Incident-ID verweisen.

**BLOCKER:** Keine für Start von PKG-01.

---

## Rolle: mqtt-debug — Agent `.claude/agents/mqtt-debug.md`

**KONTEXT:** TLS-Timeout und Transport-Fehler können Infrastruktur sein; ERRTRAK-Bug ist separat (PKG-01).

**AUFTRAG:** **PKG-02:** Checkliste Broker-Erreichbarkeit (TLS-Port, Zertifikat, DNS, Firewall), Mosquitto-Log-Korrelation — **ohne Secrets** (keine URLs mit Credentials, keine Keys). UTC-Zeitfenster mit Robin abstimmen.

**DATEIEN:** Kein Produktcode zwingend; Ergebnis als Kurzabschnitt in Chat oder Ergänzung `CORRELATION-MAP.md` nach Rücksprache mit TM (keine `.env`).

**BLOCKER:** `B-NET-01` bis Broker-Logs oder Gegenprobe vorliegen.

---

## Rolle: esp32-debug / esp32-dev (optional)

**AUFTRAG:** **PKG-03** nur nachreichen, wenn Robin Heap/`max_alloc`-Werte zum Disconnect-Zeitpunkt liefert.

**BLOCKER:** `B-HEAP-01`.

---

## Rolle: server-dev

**Nicht gestartet** — kein Server-Artefakt in diesem Incident ohne nachgereichte Logs.
