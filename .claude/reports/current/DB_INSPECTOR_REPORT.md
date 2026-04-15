# DB Inspector Report

**Erstellt:** 2026-04-10 (Session, lokal Docker)  
**Modus:** B (Spezifisch: ESP-Neuverbindung nach UI-Löschung / Soft-Delete vs. Heartbeat-Auto-Register)  
**Quellen:** `automationone-postgres` (psql), `automationone-server` (alembic), `curl.exe` → `/api/v1/health/live`, Korrelation mit `logs/server/god_kaiser.log` (vorherige Analyse: `IntegrityError` duplicate `device_id`)

---

## 1. Zusammenfassung

Die Datenbank ist erreichbar und konsistent mit dem Server-Log-Fehler: **`ESP_EA5484` existiert weiterhin** in `esp_devices` mit **`status = deleted`** und **`deleted_at` gesetzt** (Soft-Delete um ~20:13 UTC). Der eindeutige Index auf `device_id` bleibt dadurch belegt; ein paralleler **INSERT** beim Heartbeat-Auto-Register schlägt fehl. Das ist **kein** Docker-/Postgres-Ausfall, sondern **Anwendungslogik vs. Soft-Delete-Zustand**. Sensor-Konfigurationen sind weiterhin an dieselbe `esp_devices`-Zeile gebunden (4 Zeilen in `sensor_configs`).

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | `pg_isready` → accepting connections |
| pg_isready | OK | `docker exec automationone-postgres pg_isready -U god_kaiser -d god_kaiser_db` |
| automationone-server / Alembic | OK | `python -m alembic current` → `ea85866bc66e (head)` |
| API Health | OK | `GET /api/v1/health/live` → HTTP 200 (`curl.exe`) |

---

## 3. Befunde

### 3.1 `esp_devices` – Statusverteilung

- **Schwere:** Kontextabhängig (für Re-Connect nach Soft-Delete: **Hoch**)

| status  | count |
|---------|-------|
| deleted | 47    |
| online  | 3     |

### 3.2 Gerät `ESP_EA5484` (Kernbefund)

- **Schwere:** **Hoch** für erneute Registrierung per „Neues Gerät“-Pfad

| Spalte | Wert |
|--------|------|
| `id` | `63f776d4-d0fc-4191-b4e3-58c1d77ebb4d` |
| `device_id` | `ESP_EA5484` |
| `status` | `deleted` |
| `deleted_at` | `2026-04-10 20:13:15.681438+00` |
| `last_seen` (vor Delete) | `2026-04-10 20:12:26.401342+00` |

**Interpretation:** UI-Löschung entspricht **Soft-Delete**; die Zeile bleibt, **`device_id` bleibt unique**. Heartbeat-Pfad, der nur aktive Zeilen lädt (`include_deleted=False`), sieht „kein Gerät“ und versucht **INSERT** → **UniqueViolation** (bereits im Server-Log um 20:24:59 dokumentiert).

### 3.3 Abhängige Daten `sensor_configs`

- **Schwere:** Mittel (Erwartung: nach Soft-Delete können Konfigurationen noch existieren, da keine Zeilenlöschung)

```text
sensor_configs für ESP_EA5484 (Join über esp_id): 4
```

Soft-Delete entfernt die Parent-Zeile nicht; CASCADE greift typischerweise bei **hard** `DELETE`, nicht bei `UPDATE deleted_at`.

---

## 4. Extended Checks (eigenständig durchgeführt)

| Check | Ergebnis |
|-------|----------|
| `pg_isready` | OK |
| `SELECT status, COUNT(*) FROM esp_devices GROUP BY status` | siehe 3.1 |
| Zielgerät `ESP_EA5484` inkl. `deleted_at` | Soft-deleted, siehe 3.2 |
| `sensor_configs` für dieses Gerät | 4 Zeilen |
| `alembic current` im Server-Container | `ea85866bc66e (head)` |
| `/api/v1/health/live` | 200 |

**Hinweis PowerShell:** `curl` ist Alias für `Invoke-WebRequest`; für Health-Checks `curl.exe` verwenden.

---

## 5. Bewertung & Empfehlung

- **Root Cause (DB-Sicht):** `ESP_EA5484` ist **soft-deleted**, belegt weiterhin **`device_id`**; paralleler INSERT für dieselbe ID ist durch **`ix_esp_devices_device_id`** ausgeschlossen.

- **Nächste Schritte (ohne DELETE hier ausgeführt – Skill-Regel):**
  1. **Server-Fix (Dev):** Heartbeat: Lookup mit `include_deleted=True`, bei `deleted_at IS NOT NULL` **Reaktivierung** (Felder zurücksetzen, Status z. B. `pending_approval`/`online` je Policy) statt neuem INSERT.
  2. **Operativ (einmalig, mit Backup/Bestätigung):** Entweder Zeile **hart löschen** (nur wenn gewollt und CASCADE/FKs verstanden) **oder** per **UPDATE** `deleted_at = NULL`, `status` anpassen – **nur nach expliziter Freigabe**, da Daten- und Sicherheitsimplikationen.

- **Kein Handlungsbedarf:** Postgres-Container, Migration-HEAD, API-Liveness.

---

*Ende Report — DB Inspector, nur SELECT/Read-Only, keine DELETE-/Schema-Änderungen.*
