# Backup-Diagnose 2026-04-22 (AUT-112)

## Scope

- Issue: `AUT-112`
- Thema: `pg_dump Backup-Auth Fix + Secret-Rotation`
- Ziel: Ursache eingrenzen und reproduzierbare Verifikation dokumentieren.

## Ausgefuehrte Checks

### 1) Server-Logfenster

Befehl:

```bash
docker logs automationone-server --since 2026-04-22T01:55:00Z --until 2026-04-22T02:05:00Z
```

Ergebnis:

- Rueckgabecode `0`
- Keine Logzeilen im abgefragten Fenster vorhanden (lokale Umgebung hatte keine historischen Daten fuer dieses Zeitfenster).

### 2) PostgreSQL Auth Baseline

Befehl:

```bash
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT 1;"
```

Ergebnis:

- Rueckgabecode `0`
- Query erfolgreich (`1 row`), DB und User erreichbar.

### 3) Backup-relevante Container-Umgebung

Befehl:

```bash
docker exec automationone-server printenv
```

Relevante Beobachtung:

- `DATABASE_URL=postgresql+asyncpg://god_kaiser:password@postgres:5432/god_kaiser_db` vorhanden.
- `DB_BACKUP_PG_PASSWORD` nach Compose-Fix vorhanden (`password` in dieser lokalen Umgebung).
- Damit sind Runtime-DB-Credentials und Backup-Credentials jetzt aus derselben Quelle gespiegelt.

### 4) Backup-Lauf nach Fix (Service-Pfad)

Befehl:

```bash
docker exec automationone-server python -c "import asyncio; from src.core.config import DatabaseBackupSettings; from src.services.database_backup_service import DatabaseBackupService; svc = DatabaseBackupService(DatabaseBackupSettings()); info = asyncio.run(svc.create_backup()); print(info.filename, info.size_bytes)"
```

Ergebnis:

- Rueckgabecode `0`
- Backup erfolgreich erstellt: `backup_20260422_093020.sql.gz 7090626`
- Datei liegt auf Host unter `backups/database/`.

## Root Cause

Backup-Credentials waren nicht explizit an den `el-servador`-Container durchgereicht (`DB_BACKUP_PG_PASSWORD` fehlte), waehrend der Backup-Service das Passwort aus `DB_BACKUP_PG_PASSWORD` bezieht. Bei Passwortrotation kann damit ein Drift zwischen Laufzeit-DB-Credentials und Backup-Credentials entstehen. Der Drift ist durch die Compose-Spiegelung behoben.

## Umgesetzte Korrektur

- Compose injiziert nun `DB_BACKUP_PG_*` aus den `POSTGRES_*` Quellen.
- Backup-Service priorisiert optionales `DB_BACKUP_PGPASSFILE` (Docker Secret), nutzt sonst `DB_BACKUP_PG_PASSWORD`.
- Backup-Logs und Alerting wurden getrennt (BackupAuth vs App-DB-Error).

## Gate-Status (initial)

- **B-BKP-01 (Diagnose dokumentiert):** `PASS` (dieses Dokument)
- **B-BKP-02 (manueller Backup-Lauf Exit 0):** `PASS` (Service-Lauf erfolgreich mit erzeugter `.sql.gz`)
- **B-BKP-03 (einheitliche Secret-Quelle + Doku):** `PASS` (Compose/.env/ADR aktualisiert)
- **B-BKP-04 (Alert-Split):** `PASS` (Loki-Regeln getrennt; Betriebsverifikation nach Grafana-Reload)
- **B-BKP-05 (3 Naechte ohne Rauschen):** `PENDING` (operativer Nachlauf)
