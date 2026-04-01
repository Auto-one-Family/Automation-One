# Frontend Debug Report

**Erstellt:** 2026-03-31T16:08 UTC
**Modus:** B (Spezifisch: "Analysiere alle Frontend-Logs der letzten 20 Minuten")
**Quellen:** Docker-Logs (automationone-frontend), Loki-Query, vite.config.ts, alert-center.store.ts, esp.ts Store, SERVER_DEV_REPORT.md, ESP32_DEV_REPORT.md

---

## 1. Zusammenfassung

Der Frontend-Container lief in den letzten 20 Minuten fehlerfrei durch — **keine TypeScript-Build-Errors, keine Vue-Runtime-Exceptions, kein Build-Failure.** Der einzige Befund sind wiederholte Vite-Proxy-Fehler (`ENOTFOUND el-servador` und `ECONNREFUSED`), die vollstaendig auf einen Server-Neustart zurueckzufuehren sind: Der `el-servador`-Container startete erst um 15:50 UTC, der Frontend-Container bereits um 15:31 UTC — eine DNS-Luecke von ~19 Minuten. Seit dem erfolgreichen Server-Start um ~15:51 UTC sind keine neuen Fehler aufgetreten. Handlungsbedarf: niedrig (transient, selbstloesend), mit einem strukturellen Hinweis zur Proxy-Konfiguration.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `docker logs automationone-frontend --since 40m` | OK | Vollstaendig ausgewertet |
| Loki Query `{compose_service="el-frontend"}` last 20min | OK | Bestaetigt Docker-Log-Befunde, keine weiteren Eintraege |
| `El Frontend/vite.config.ts` | OK | Proxy-Konfiguration analysiert |
| `El Frontend/src/shared/stores/alert-center.store.ts` | OK | Polling-Quelle identifiziert |
| `El Frontend/src/stores/esp.ts` | OK | 14 WS-Handler, Cleanup vorhanden |
| `SERVER_DEV_REPORT.md` | OK | Kein Frontend-Impact aus Server-Aenderungen |
| `ESP32_DEV_REPORT.md` | OK | Kein Frontend-Impact aus ESP32-Aenderungen |
| docker inspect (Container-Startzeiten) | OK | Startzeiten-Delta identifiziert |

---

## 3. Befunde (sortiert nach Schweregrad)

### 3.1 Vite-Proxy-Fehler: `ENOTFOUND el-servador`

- **Schwere:** Mittel (transient, bereits aufgeloest)
- **Zeitraum:** 15:37:00 — 15:51:05 UTC (ca. 14 Minuten)
- **Haeufigkeit:** ~20+ Eintraege (WS-Proxy + HTTP-Proxy)
- **Betroffene Requests:**
  - WebSocket-Verbindungsversuche (`/ws`)
  - `GET /api/v1/notifications/alerts/stats`
- **Root Cause:** `VITE_API_TARGET=http://el-servador:8000` und `VITE_WS_TARGET=ws://el-servador:8000` sind im Container als Env-Variablen gesetzt. Der Docker-Service `el-servador` war zum Startzeitpunkt des Frontend-Containers noch nicht im DNS des Docker-Netzwerks aufgeloest, weil `automationone-server` erst um 15:50:59 UTC startete (Frontend: 15:31:54 UTC — Luecke: ~19 Minuten).
- **Evidenz:**
  - `docker logs automationone-frontend`: `Error: getaddrinfo ENOTFOUND el-servador` ab 15:37:00 UTC
  - `docker inspect automationone-frontend`: StartedAt = `2026-03-31T15:31:54Z`
  - `docker inspect automationone-server`: StartedAt = `2026-03-31T15:50:59Z`
- **Aktueller Status:** Selbstloesend. Nach Server-Neustart wechselte der Fehler auf `ECONNREFUSED 172.19.0.9:8000` (15:51:05 UTC, Server im Startvorgang), danach keine weiteren Proxy-Fehler.

### 3.2 Alert-Stats-Polling bei nicht erreichbarem Server

- **Schwere:** Niedrig (korrekt implementiert, aber sichtbar in Logs)
- **Detail:** `alert-center.store.ts` pollt `/api/v1/notifications/alerts/stats` alle 30 Sekunden (Konstante `STATS_POLL_INTERVAL_MS = 30_000`). Waehrend des Server-Ausfalls wurden 2 HTTP-Proxy-Fehler auf diesem Endpoint geloggt (15:37:37, 15:38:22, 15:49:37, 15:50:37 UTC). Der Store hat keine Retry-Backoff-Logik — er pollt mit fester 30s-Frequenz unabhaengig vom Verbindungsstatus.
- **Evidenz:** `src/shared/stores/alert-center.store.ts` Zeilen 31, 44, 189; `docker logs` zeigt HTTP-Proxy-Errors auf genau diesem Endpoint.
- **Risiko:** Bei laengerem Server-Ausfall erzeugt dies kontinuierliche Log-Eintraege. Kein Datenverlust, kein Crash.

### 3.3 TypeScript `: any`-Verwendungen (47 Treffer)

- **Schwere:** Niedrig (Code-Qualitaet, kein Runtime-Fehler)
- **Detail:** 47 explizite `: any`-Typen in `.ts` und `.vue` Dateien (Produktionscode, ohne Kommentare/Tests). Kein einziger `@ts-ignore` oder `@ts-expect-error` vorhanden — das ist positiv. Die `any`-Casts sind verteilt im Codebase und aktuell kein Quelle fuer Runtime-Fehler.
- **Evidenz:** `grep -rn ": any" El Frontend/src/ --include="*.ts" --include="*.vue"` = 47 Treffer.

### 3.4 `health/detailed` Endpoint erfordert Auth (401)

- **Schwere:** Niedrig (Konfigurationsfrage)
- **Detail:** `curl -s http://localhost:8000/api/v1/health/detailed` gibt `{"detail":"Could not validate credentials"}` zurueck. Der Endpoint ist auth-geschuetzt — externe Health-Checks (z.B. Monitoring-Skripte) koennen den WS-Status nicht ohne Token abfragen.
- **Evidenz:** Server-Log: `src.api.deps - WARNING - No authentication token provided`, `Request completed: GET /api/v1/health/detailed status=401`

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `docker compose ps` | Alle 12 Services running/healthy |
| `docker inspect` Startzeiten | Frontend: 15:31:54 UTC, Server: 15:50:59 UTC — 19min Luecke erklaert alle Proxy-Fehler |
| `curl http://localhost:8000/api/v1/health/live` | `{"success":true,"alive":true}` — Server aktuell online |
| Loki-Query `{compose_service="el-frontend"}` last 20min | Identische Eintraege wie Docker-Logs, keine Vue-Runtime-Errors gefunden |
| `vite.config.ts` Proxy-Konfiguration | `VITE_API_TARGET` / `VITE_WS_TARGET` per Env-Variable, korrekt auf `el-servador:8000` gesetzt |
| `@ts-ignore` / `@ts-expect-error` Scan | 0 Treffer — keine Suppressionen |
| `: any` Typ-Scan | 47 Treffer (Qualitaetsmetrik) |
| ESP-Store WS-Handler Zaehlung | 14 Handler in `setupWebSocket()` + Cleanup-Array `wsUnsubscribers` vorhanden |
| `setInterval`-Cleanup-Pattern | alert-center.store: Timer-Variable vorhanden (`statsPollTimer`); MultiSensorChart, ActuatorRuntimeWidget, ServerLogsTab: alle haben `clearInterval`-Cleanup |

---

## 5. Blind-Spot-Fragen (an User)

Da der Browser nicht direkt einsehbar ist:

1. **Werden im Browser aktuell Daten angezeigt?** (Sensor-Werte, ESP-Status im Dashboard) — beantwortet ob der WS nach dem Server-Neustart erfolgreich verbunden hat.
2. **Gibt es in der Browser-Console Fehler oder Warnungen?** (Vue-Komponenten-Fehler, fehlgeschlagene API-Calls) — Loki zeigt keine Vue-Errors, aber DOM-Ereignisse ohne `console.*` sind nicht abgedeckt.
3. **Hat das Dashboard nach dem Server-Neustart (~15:51 UTC) automatisch Daten nachgeladen?** — bewertet ob die WebSocket-Reconnect-Logik korrekt ausgefuehrt wird.

---

## 6. Bewertung & Empfehlung

- **Root Cause aller Logs-Fehler:** Server-Container startete 19 Minuten nach Frontend-Container. Alle `ENOTFOUND el-servador`-Fehler sind transient und selbstloesend — der aktuelle System-Zustand ist fehlerfrei.
- **Kein TypeScript-Build-Fehler**, kein Vue-Runtime-Crash, kein Build-Failure.
- **Kein Handlungsbedarf** fuer die gefundenen Fehler (alle transient/historisch).

**Optionale Verbesserungen (nicht dringend):**

| Verbesserung | Bereich | Prioritaet |
|-------------|---------|------------|
| `docker compose` `depends_on: el-servador` mit `condition: service_healthy` fuer `el-frontend` hinzufuegen | `docker-compose.yml` | Niedrig — verhindert kuenftige Start-Reihenfolge-Probleme |
| Exponential-Backoff fuer `statsPollTimer` wenn Server nicht erreichbar | `alert-center.store.ts` | Niedrig — reduziert Log-Rauschen bei Ausfaellen |

**Lastintensive Ops (Vorschlag, NICHT automatisch ausgefuehrt):**
- Soll ich `vue-tsc --noEmit` fuer einen vollstaendigen TypeScript-Check ausfuehren? (`docker compose exec el-frontend npx vue-tsc --noEmit`, dauert ca. 1-3 Minuten) — wuerde die 47 `: any`-Verwendungen im Kontext bewerten.
