# ADR-009: Backup-Authentifizierung ueber Docker Secret (PGPASSFILE)

**Status:** Accepted (2026-04-22)

**Entscheidungstreffer:** server-dev + db-inspector (AUT-112)

---

## Context

Der geplante `pg_dump`-Backup-Lauf konnte bei rotiertem DB-Passwort fehlschlagen, wenn
Backup-Credentials und Runtime-DB-Credentials auseinanderlaufen.

Im Ist-Zustand war `DB_BACKUP_PG_PASSWORD` nicht immer explizit gesetzt und konnte auf
einen unsicheren Default zurueckfallen. Das erzeugt:

- fehlgeschlagene Backups,
- zusaetzliches Alarm-Rauschen,
- unklare Secret-Ownership.

---

## Decision

Wir fuehren ein zweistufiges Auth-Pattern ein:

1. **Development-Default:** `DB_BACKUP_PG_PASSWORD` wird in Compose direkt aus
   `${POSTGRES_PASSWORD}` gespiegelt (eine Quelle, keine Duplikate).
2. **Production-Preferred:** `DB_BACKUP_PGPASSFILE` zeigt auf ein Docker Secret
   (PGPASSFILE/.pgpass-Format), damit kein Klartextpasswort als Container-Env exponiert ist.

`DatabaseBackupService` priorisiert `DB_BACKUP_PGPASSFILE` vor `DB_BACKUP_PG_PASSWORD`.

---

## Rationale

- **Fail-safe:** Verhindert stille Credential-Drifts zwischen DB und Backup-Pfad.
- **Rotation-freundlich:** Secret kann ohne Codeaenderung rotiert werden.
- **Rueckwaertskompatibel:** Dev-Setups laufen weiter ueber Env.
- **Security:** Produktions-Secret nicht per `docker inspect` als Env sichtbar.

---

## Consequences

### Positive

- Klarer Auth-Pfad fuer geplante Backups.
- Bessere Incident-Diagnose durch eindeutige Backup-Auth-Logs.
- Geringes Risiko fuer bestehende lokale Workflows.

### Negative / Akzeptierte Risiken

- Lokale Dev-Setups nutzen weiterhin Env-Secrets (bewusster Trade-off fuer Einfachheit).
- Production braucht Secret-Provisioning-Disziplin.

---

## Implementation Status

- [x] `docker-compose.yml`: `DB_BACKUP_*` an `el-servador` injiziert
- [x] `config.py`: Passwort-Default entfernt, `DB_BACKUP_PGPASSFILE` ergaenzt
- [x] `database_backup_service.py`: PGPASSFILE-Priorisierung + Retry-Handling
- [x] `scripts/docker/backup.sh`: Retry + strukturierte Logs + klarer Exit-Code
- [x] `loki-alert-rules.yml`: BackupAuthFailure und ApplicationDBConnectionError getrennt

---

## References

- `docker-compose.yml`
- `El Servador/god_kaiser_server/src/core/config.py`
- `El Servador/god_kaiser_server/src/services/database_backup_service.py`
- `scripts/docker/backup.sh`
- `docker/grafana/provisioning/alerting/loki-alert-rules.yml`
