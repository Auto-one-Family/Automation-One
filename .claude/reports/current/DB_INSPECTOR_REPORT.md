# DB Inspector Report

**Erstellt:** 2026-03-03 21:30 UTC
**Modus:** B (Spezifisch: "DB auf neuesten Stand bringen, fehlende Migrationen anwenden")
**Quellen:** PostgreSQL Schema, Alembic History, SQLAlchemy Models, Migration-Dateien

---

## 1. Zusammenfassung

Drei Probleme gefunden und behoben: (1) verwaiste Migration `make_diagnostic_checks_nullable` war nicht in der Alembic-Chain, (2) fehlende `email_log` Tabelle trotz vollstaendigem Model/Repo/Service-Code, (3) fehlende Expression-Indizes auf `diagnostic_reports` und `email_log`. Alle Fixes angewendet und verifiziert. DB ist jetzt vollstaendig synchron mit den Models.

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | Container healthy, Port 5432 |
| pg_isready | OK | Accepting connections |
| alembic current (vorher) | `rename_metadata_col` | War HEAD, aber 2 Migrationen fehlten |
| alembic current (nachher) | `add_email_log` | Neuer HEAD, alle Migrationen angewendet |
| SQLAlchemy Models | 22 Dateien | Alle Models registriert in `__init__.py` |
| DB Tabellen | 27 | Vorher 26, jetzt 27 (+email_log) |

## 3. Befunde (VOR Fix)

### 3.1 Verwaiste Migration: make_diagnostic_checks_nullable
- **Schwere:** Hoch
- **Detail:** Migration existierte als Datei, war aber nicht in der Alembic-Chain weil `down_revision = "add_diagnostic_reports"` — gleicher Parent wie `rename_metadata_col`. Beides konnte nicht koexistieren.
- **Auswirkung:** `diagnostic_reports.checks` war `NOT NULL` in DB, aber Model definiert `nullable=True`. Der `cleanup_old_reports()` Service setzt `checks=None` bei Archivierung — haette bei vorhandenen Reports einen DB-Error geworfen.
- **Fix:** `down_revision` auf `"rename_metadata_col"` geaendert → Migration korrekt in Chain eingereiht.

### 3.2 Fehlende email_log Tabelle
- **Schwere:** Kritisch
- **Detail:** `EmailLog` Model, `EmailLogRepository`, 3 API-Endpoints, Frontend-Types und API-Client existierten — aber keine Alembic-Migration und keine DB-Tabelle.
- **Auswirkung:** `NotificationRouter._send_critical_email()`, `DigestService`, und `POST /v1/notifications/test-email` haetten bei jedem Aufruf einen Fehler geworfen (Tabelle existiert nicht).
- **Betroffene Services:**
  - `notification_router.py` → `email_log_repo.log_send()`
  - `digest_service.py` → `email_log_repo.log_send()`
  - `notifications.py` → `GET /v1/notifications/email-log`, `GET .../email-log/stats`, `POST .../test-email`
  - `El Frontend/src/api/notifications.ts` → `getEmailLog()`, `getEmailLogStats()`
- **Fix:** Neue Migration `add_email_log_table.py` erstellt mit:
  - 12 Spalten (exakt wie Model)
  - FK → `notifications.id` (ON DELETE SET NULL)
  - 3 Indizes: `notification_id`, `status + created_at DESC`, `created_at DESC`

### 3.3 Fehlende Expression-Indizes
- **Schwere:** Mittel
- **Detail:** `sa.text("column DESC")` in `op.create_index()` funktioniert nicht zuverlaessig mit Alembic — Indizes werden still uebersprungen.
- **Betroffen:** `diagnostic_reports.ix_diagnostic_reports_started` und `email_log` Expression-Indizes
- **Fix:** Migration-Dateien auf `op.execute("CREATE INDEX ...")` umgestellt. Fehlende Indizes manuell in DB erstellt.

## 4. Durchgefuehrte Aenderungen

| Aktion | Datei/Tabelle | Detail |
|--------|---------------|--------|
| Migration re-wired | `make_diagnostic_checks_nullable.py` | `down_revision`: `add_diagnostic_reports` → `rename_metadata_col` |
| Migration erstellt | `add_email_log_table.py` | Neue Tabelle mit 12 Spalten, 3 Indizes, FK |
| Migration fix | `add_diagnostic_reports.py` | `create_index` → `op.execute` fuer DESC-Index |
| Migration fix | `add_email_log_table.py` | `create_index` → `op.execute` fuer DESC-Indizes |
| DB aktualisiert | `diagnostic_reports.checks` | `NOT NULL` → `NULL` |
| DB aktualisiert | `email_log` | Tabelle + 4 Indizes erstellt |
| DB aktualisiert | `diagnostic_reports` | `ix_diagnostic_reports_started` Index erstellt |

## 5. Migration-Chain (NACHHER)

```
... → add_plugin_tables → add_diagnostic_reports → rename_metadata_col
      → make_checks_nullable → add_email_log (HEAD)
```

Gesamt: 32 Migrationen, linearer Chain, keine Branches, 1 Head.

## 6. Verifikation (NACHHER)

| Check | Ergebnis |
|-------|----------|
| `alembic current` | `add_email_log (head)` |
| `alembic heads` | `add_email_log` (1 Head) |
| `diagnostic_reports.checks` nullable | `YES` |
| `email_log` Tabelle existiert | `YES` (12 Spalten) |
| `email_log` Indizes | 4 (PK + notification_id + status_created + created_at) |
| `diagnostic_reports` Indizes | 2 (PK + started_at DESC) |
| DB Tabellen gesamt | 27 |
| Model-Tabelle Uebereinstimmung | 100% (alle Models haben DB-Tabellen) |

## 7. Bewertung & Empfehlung

- **Root Cause:** Migrations wurden wahrscheinlich in verschiedenen Sessions erstellt ohne Chain-Pruefung. Die `email_log` Migration wurde komplett vergessen.
- **Status:** BEHOBEN — DB ist vollstaendig synchron mit allen SQLAlchemy Models.
- **Naechste Schritte:** Keine sofortigen Aktionen noetig.

---

*Report erstellt von db-inspector | AutomationOne DB-Synchronisation*
