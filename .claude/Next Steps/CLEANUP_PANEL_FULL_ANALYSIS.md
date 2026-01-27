# Bereinigung & Aufbewahrung - Vollständige Analyse

**Projekt:** AutomationOne Framework
**Erstellt:** 2026-01-27
**Zielgruppe:** Manager-Team, Frontend-Entwickler, System Architects
**Status:** Vollständig analysiert

---

## Executive Summary

Diese Dokumentation bietet eine **vollständige Analyse** des Cleanup-Panels ("Bereinigung & Aufbewahrung") im AutomationOne Framework. Sie deckt alle Aspekte ab: Frontend-Komponenten, Backend-APIs, Services, Datenbank-Schema, Konfiguration und Berechtigungen.

### Kernerkenntnisse

| Aspekt | Details |
|--------|---------|
| **Frontend-Komponenten** | 4 Vue-Components (CleanupPanel, AutoCleanupStatusBanner, CleanupPreview, PreviewEventCard) |
| **REST API Endpoints** | 14 Cleanup/Retention/Backup-relevante Endpoints |
| **Backend Services** | 4 Services (AuditRetentionService, AuditBackupService, MaintenanceService, Cleanup Jobs) |
| **Betroffene DB-Tabellen** | 4 Tabellen (audit_logs, sensor_data, esp_heartbeat_logs, actuator_history) |
| **Konfigurierbare Einstellungen** | 40+ Settings via .env + SystemConfig |
| **Berechtigungs-Level** | Admin-Only (Cleanup), User (Statistics) |

### Architektur-Überblick

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend (El Frontend)                                                  │
│  Vue 3 / TypeScript                                                     │
│  Components: CleanupPanel.vue, AutoCleanupStatusBanner.vue, ...         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ REST API / WebSocket
┌─────────────────────────────────────────────────────────────────────────┐
│  Backend API (El Servador)                                               │
│  FastAPI / Python                                                       │
│  Endpoints: /api/v1/audit/retention/*, /api/v1/audit/backups/*         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Service Layer
┌─────────────────────────────────────────────────────────────────────────┐
│  Services                                                                │
│  AuditRetentionService: Cleanup-Logik mit 5-Phasen-Modell              │
│  AuditBackupService: JSON-basierte Backups                              │
│  MaintenanceService: Scheduler für automatische Jobs                    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Database Layer
┌─────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL                                                              │
│  Tabellen: audit_logs, sensor_data, esp_heartbeat_logs, actuator_history│
│  Backups: JSON-Dateien in god_kaiser_server/backups/audit_logs/         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Frontend Komponenten

### 1.1 Hauptkomponente: CleanupPanel.vue

| Element | Details |
|---------|---------|
| **Datei** | `El Frontend/src/components/system-monitor/CleanupPanel.vue` |
| **Zeilen** | 1-1694 |
| **Typ** | Modal-Dialog (Teleport) |
| **Design** | Industrial-Grade, Glassmorphism, Iridescent Gradient |

#### Props & Events

| Prop/Event | Typ | Richtung | Beschreibung |
|------------|-----|----------|--------------|
| `show` | `boolean` | Props | Steuert Modal-Sichtbarkeit |
| `close` | Event | Emit | Schließt das Panel |
| `cleanup-success` | Event | Emit | Cleanup erfolgreich (trägt CleanupResult) |
| `restore-success` | Event | Emit | Backup-Restore erfolgreich |

#### State (ref/reactive)

| Variable | Typ | Beschreibung |
|----------|-----|--------------|
| `isLoadingStats` | `ref<boolean>` | Statistik-Laden-State |
| `isLoadingBackups` | `ref<boolean>` | Backup-Liste-Laden-State |
| `isRunningCleanup` | `ref<boolean>` | Cleanup-Execution-State |
| `isRestoringBackup` | `ref<string \| null>` | Backup-ID während Restore |
| `statistics` | `ref<AuditStatistics \| null>` | Statistik-Daten |
| `backups` | `ref<BackupInfo[]>` | Liste der Backups |
| `retentionConfig` | `ref<RetentionConfig \| null>` | Aktuelle Retention-Config |
| `autoCleanupStatus` | `ref<AutoCleanupStatus \| null>` | Auto-Cleanup Status |
| `cleanupResult` | `ref<CleanupResult \| null>` | Cleanup-Ergebnis |
| `retentionForm` | `ref<RetentionConfigUpdate>` | Formular-State |
| `confirmCleanup` | `ref<boolean>` | Bestätigungs-Dialog |

### 1.2 Unterkomponenten

| Komponente | Datei | Beschreibung |
|------------|-------|--------------|
| **AutoCleanupStatusBanner** | `AutoCleanupStatusBanner.vue` | Status-Banner (Aktiv/Inaktiv/Loading) |
| **CleanupPreview** | `CleanupPreview.vue` | Intelligente Vorschau (0-5/6-20/21+ Fallunterscheidung) |
| **PreviewEventCard** | `PreviewEventCard.vue` | Einzelne Event-Karte |

### 1.3 API-Aufrufe (Frontend)

| Funktion | Endpoint | Method | Beschreibung |
|----------|----------|--------|--------------|
| `loadAutoCleanupStatus` | `/audit/retention/status` | GET | Auto-Cleanup Status |
| `loadStatistics` | `/audit/statistics?time_range=24h` | GET | Audit-Statistiken |
| `loadBackups` | `/audit/backups?include_expired=true` | GET | Backup-Liste |
| `loadRetentionConfig` | `/audit/retention/config` | GET | Retention-Konfiguration |
| `runCleanup (dry_run=true)` | `/audit/retention/cleanup?dry_run=true&include_preview_events=true&preview_limit=20` | POST | Vorschau-Cleanup |
| `runCleanup (dry_run=false)` | `/audit/retention/cleanup?dry_run=false` | POST | Echtes Cleanup |
| `saveRetentionConfig` | `/audit/retention/config` | PUT | Config speichern |
| `restoreBackup` | `/audit/backups/{backupId}/restore?delete_after_restore=true` | POST | Backup wiederherstellen |
| `deleteBackup` | `/audit/backups/{backupId}` | DELETE | Backup löschen |

### 1.4 UI-Struktur

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🗄️ Bereinigung & Aufbewahrung                                     ✕    │
│    Ereignis-Datenbank verwalten                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─ STATUS-BANNER ─────────────────────────────────────────────────────┐│
│ │ ⊗ Automatische Bereinigung ist INAKTIV              [🔄] [Aktivieren]││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│ ── MANUELLE BEREINIGUNG (JETZT) ─────────────────────────────────────  │
│                                                                         │
│ ┌─ AKTUELLE DATEN ────────────────────────────────────────────────────┐│
│ │ GESAMT     ZU BEREINIGEN    SPEICHER     FEHLER                     ││
│ │   25            0            10 KB         11                        ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│ ┌─ SCHNELLAKTIONEN ───────────────────────────────────────────────────┐│
│ │ [👁 Vorschau]                    [🗑 Bereinigen]                      ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│ ┌─ BACKUPS ─────────────────────────────────────────────[ 1 VERFÜGBAR ]│
│ │ 📦 #0e6ec7e4        │ 100 Events · vor 33 Min │ [↩️] [🗑]            ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│ ┌─ AUFBEWAHRUNGSRICHTLINIE ──────────────────────────────────[INAKTIV]┐│
│ │ ☐ Automatische Bereinigung aktivieren                               ││
│ │ Standard-Aufbewahrung (Tage): [1]    Max. Einträge: [0]             ││
│ │ Info: [14]  Warnung: [30]  Fehler: [90]  Kritisch: [365]            ││
│ │ ☑ Notfall-Stopp-Events niemals löschen               [Speichern]    ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│                                                        [Schließen]     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Backend API Endpoints

### 2.1 Cleanup Endpoints

| Endpoint | Method | Request | Response | Auth | Beschreibung |
|----------|--------|---------|----------|------|--------------|
| `/api/v1/audit/retention/cleanup` | POST | `dry_run`, `include_preview_events`, `preview_limit` | `CleanupResponse` | Admin | Manuelles Cleanup nach Retention-Policy |
| `/api/v1/audit/backups/cleanup` | POST | - | `{deleted_count, message}` | Admin | Löscht abgelaufene Backups |

### 2.2 Retention Policy Endpoints

| Endpoint | Method | Request | Response | Auth | Beschreibung |
|----------|--------|---------|----------|------|--------------|
| `/api/v1/audit/retention/status` | GET | - | `AutoCleanupStatusResponse` | User | Status: enabled, last_run, next_run, preview |
| `/api/v1/audit/retention/config` | GET | - | `RetentionConfigResponse` | User | Aktuelle Retention-Konfiguration |
| `/api/v1/audit/retention/config` | PUT | `RetentionConfigUpdate` | `RetentionConfigResponse` | Admin | Aktualisiert Retention-Policy |

### 2.3 Backup Endpoints

| Endpoint | Method | Request | Response | Auth | Beschreibung |
|----------|--------|---------|----------|------|--------------|
| `/api/v1/audit/backups` | GET | `include_expired` | `BackupListResponse` | Admin | Alle Backups auflisten |
| `/api/v1/audit/backups/{backup_id}` | GET | - | `BackupInfo` | Admin | Backup-Details |
| `/api/v1/audit/backups/{backup_id}/restore` | POST | `delete_after_restore` | `BackupRestoreResponse` | Admin | Backup wiederherstellen |
| `/api/v1/audit/backups/{backup_id}` | DELETE | - | `{deleted, backup_id}` | Admin | Backup löschen |

### 2.4 Statistics Endpoints

| Endpoint | Method | Response | Auth | Beschreibung |
|----------|--------|----------|------|--------------|
| `/api/v1/audit/statistics` | GET | `AuditStatisticsResponse` | User | Statistiken: total, by_severity, storage_estimate |
| `/api/v1/audit/error-rate` | GET | `{rate, ...}` | User | Error-Rate für Zeitraum |

### 2.5 Pydantic Schemas

| Schema | Felder | Verwendet in |
|--------|--------|--------------|
| **CleanupResponse** | `deleted_count`, `deleted_by_severity`, `duration_ms`, `dry_run`, `errors`, `backup_id`, `preview_events` | POST cleanup |
| **RetentionConfigResponse** | `enabled`, `default_days`, `severity_days`, `max_records`, `batch_size`, `preserve_emergency_stops` | GET/PUT config |
| **BackupInfo** | `backup_id`, `created_at`, `expires_at`, `expired`, `event_count`, `metadata` | GET backups |
| **BackupRestoreResponse** | `backup_id`, `restored_count`, `skipped_duplicates`, `backup_deleted` | POST restore |
| **AuditStatisticsResponse** | `total_count`, `count_by_severity`, `storage_estimate_mb`, `pending_cleanup_count` | GET statistics |

---

## 3. Backend Services & Logik

### 3.1 AuditRetentionService

**Datei:** `El Servador/god_kaiser_server/src/services/audit_retention_service.py`

| Methode | Parameter | Beschreibung |
|---------|-----------|--------------|
| `get_config()` | - | Lädt aktuelle Retention-Konfiguration |
| `set_config()` | `enabled`, `default_days`, `severity_days`, ... | Aktualisiert Konfiguration |
| `cleanup()` | `dry_run`, `create_backup`, `include_preview_events` | 5-Phasen Cleanup |
| `get_statistics()` | `error_cutoff_time` | Dashboard-Statistiken |

### 3.2 5-Phasen Cleanup-Modell

```
Phase 1: COUNT & COLLECT
    ├─→ Zähle Events pro Severity älter als Cutoff
    └─→ Sammle Preview-Events für UI

Phase 2: BACKUP CREATION (wenn dry_run=false)
    ├─→ Erstelle JSON-Backup mit allen zu löschenden Events
    └─→ Speichere Metadaten (Operation, User, Config)

Phase 3: BATCH DELETION
    ├─→ Lösche in Batches (verhindert DB-Locks)
    ├─→ Commit nach jedem Batch
    └─→ Rollback bei Error, Continue zu nächstem

Phase 4: MAX RECORDS LIMIT
    └─→ Lösche älteste Records wenn max_records überschritten

Phase 5: AUDIT TRAIL
    ├─→ Erstelle audit_cleanup_executed Event
    └─→ Speichere last_cleanup Timestamp
```

### 3.3 AuditBackupService

**Datei:** `El Servador/god_kaiser_server/src/services/audit_backup_service.py`

| Methode | Beschreibung |
|---------|--------------|
| `create_backup()` | Erstellt JSON-Backup in `backups/audit_logs/{id}.json` |
| `restore_backup()` | Stellt Events wieder her (prüft Duplikate, Expiration) |
| `list_backups()` | Listet alle Backups (mit Expiration-Status) |
| `delete_backup()` | Löscht Backup-Datei |
| `cleanup_expired_backups()` | Automatische Bereinigung abgelaufener Backups |

**Backup-Eigenschaften:**
- Format: JSON (UTF-8, Indent 2)
- Speicherort: `god_kaiser_server/backups/audit_logs/{backup_id}.json`
- Expiration: 24 Stunden (konfigurierbar)
- Max Backups: 50 gleichzeitig

### 3.4 MaintenanceService & Cleanup Jobs

**Jobs (via APScheduler):**

| Job | Trigger | Intervall | Default Status |
|-----|---------|-----------|----------------|
| `cleanup_sensor_data` | Cron | Täglich 03:00 UTC | DISABLED |
| `cleanup_command_history` | Cron | Täglich 03:30 UTC | DISABLED |
| `cleanup_orphaned_mocks` | Interval | Stündlich | ENABLED (warn-only) |
| `cleanup_heartbeat_logs` | Cron | Täglich | ENABLED (7 Tage) |

---

## 4. Datenbank Schema

### 4.1 Betroffene Tabellen

| Tabelle | Wird bereinigt | Retention Default | Backup vor Löschung |
|---------|----------------|-------------------|---------------------|
| `audit_logs` | Ja (DISABLED) | 30 Tage | Ja (JSON) |
| `sensor_data` | Ja (DISABLED) | 30 Tage | Nein |
| `esp_heartbeat_logs` | Ja (ENABLED) | 7 Tage | Nein |
| `actuator_history` | Ja (DISABLED) | 14 Tage | Nein |

### 4.2 audit_logs Schema

| Spalte | Typ | Index | Beschreibung |
|--------|-----|-------|--------------|
| `id` | UUID | PK | Event-ID |
| `created_at` | DateTime | ix_audit_logs_created_at | KRITISCH für Retention |
| `event_type` | String(50) | Ja | config_response, login, etc. |
| `severity` | String(20) | Ja | info, warning, error, critical |
| `source_type` | String(30) | Ja | esp32, user, system, mqtt |
| `source_id` | String(100) | Ja | ESP-ID, User-ID, etc. |
| `message` | Text | - | Beschreibungstext |
| `details` | JSON | - | Event-spezifische Daten |

### 4.3 Backup-Storage (Dateisystem)

```
god_kaiser_server/backups/audit_logs/
├── a1b2c3d4-e5f6-4a5b-9c8d-7e6f5a4b3c2d.json
└── ...

Backup-JSON-Struktur:
{
  "backup_id": "uuid",
  "created_at": "ISO-8601",
  "expires_at": "ISO-8601",
  "event_count": 1234,
  "metadata": {...},
  "events": [{...}, ...]
}
```

---

## 5. Konfigurierbare Einstellungen

### 5.1 Aufbewahrungsrichtlinien (Frontend-sichtbar)

| Einstellung | Typ | Default | Bereich | Beschreibung |
|-------------|-----|---------|---------|--------------|
| Automatische Bereinigung aktivieren | bool | `false` | - | Safety-First: DISABLED |
| Standard-Aufbewahrung (Tage) | int | 30 | 1-3650 | Globale Retention |
| Max. Einträge (0=unbegrenzt) | int | 0 | 0-∞ | Hard Limit |
| Info Retention | int | 14 | 1-3650 | Tage für Info-Events |
| Warnung Retention | int | 30 | 1-3650 | Tage für Warning-Events |
| Fehler Retention | int | 90 | 1-3650 | Tage für Error-Events |
| Kritisch Retention | int | 365 | 1-3650 | Tage für Critical-Events |
| Notfall-Stopp niemals löschen | bool | `true` | - | Emergency Stops geschützt |

### 5.2 Severity-basierte Retention-Logik

```
DEFAULT_RETENTION_CONFIG = {
    "INFO":      14 Tage   → Schnell bereinigen
    "WARNING":   30 Tage   → Moderate Aufbewahrung
    "ERROR":     90 Tage   → Längere Aufbewahrung für Debugging
    "CRITICAL": 365 Tage   → 1 Jahr für Compliance
}

WICHTIG: default_days wirkt als MAXIMUM-Constraint:
- Wenn default_days=30 und severity_error=90 → nutze 30
- Wenn default_days=1 und severity_info=14 → nutze 1
```

### 5.3 Safety-First Konfiguration

| Feature | Default | Beschreibung |
|---------|---------|--------------|
| Cleanup DISABLED | `true` | User muss explizit aktivieren |
| Dry-Run aktiv | `true` | Nur zählen, nicht löschen |
| Confirmation erforderlich | `true` | Warnung vor erstem Cleanup |
| Emergency-Stops geschützt | `true` | Können nicht gelöscht werden |
| Max Records/Run | 100.000 | Verhindert Über-Löschung |
| Alert wenn >10% gelöscht | `true` | Warnung bei großen Löschungen |

---

## 6. Berechtigungen

### 6.1 Rollen-Matrix

| Aktion | Admin | Operator | User |
|--------|-------|----------|------|
| Cleanup-Status ansehen | ✅ | ❌ | ❌ |
| Retention-Config ansehen | ✅ | ❌ | ✅ |
| Retention-Config ändern | ✅ | ❌ | ❌ |
| Manuell bereinigen (Dry-Run) | ✅ | ❌ | ❌ |
| Manuell bereinigen (Echt) | ✅ | ❌ | ❌ |
| Backups auflisten | ✅ | ❌ | ❌ |
| Backup wiederherstellen | ✅ | ❌ | ❌ |
| Backup löschen | ✅ | ❌ | ❌ |
| Statistics ansehen | ✅ | ✅ | ✅ |

### 6.2 Auth-Endpoints

| Endpoint | Auth-Level | Check |
|----------|------------|-------|
| `POST /audit/retention/cleanup` | AdminUser | `require_admin()` |
| `PUT /audit/retention/config` | AdminUser | `require_admin()` |
| `GET /audit/backups` | AdminUser | `require_admin()` |
| `POST /audit/backups/{id}/restore` | AdminUser | `require_admin()` |
| `DELETE /audit/backups/{id}` | AdminUser | `require_admin()` |
| `GET /audit/statistics` | ActiveUser | `get_current_user()` |
| `GET /audit/retention/status` | ActiveUser | `get_current_user()` |

---

## 7. Backup-System

### 7.1 Erstellung

- **Wann:** Automatisch vor Audit Log Cleanup (wenn `create_backup=true`)
- **Speicherort:** `god_kaiser_server/backups/audit_logs/{backup_id}.json`
- **Format:** JSON (UTF-8, Indent 2)
- **Expiration:** 24 Stunden
- **Max Backups:** 50 gleichzeitig

### 7.2 Wiederherstellung

1. Backup-Metadaten laden
2. Expiration prüfen (abgelaufene Backups können nicht restored werden)
3. Events aus JSON laden
4. Duplikate prüfen (Event-IDs)
5. Events in DB einfügen
6. Audit-Log Entry erstellen
7. Optional: Backup nach Restore löschen (`delete_after_restore=true`)
8. WebSocket: `events_restored` Event an Frontend

### 7.3 Automatische Bereinigung

- Abgelaufene Backups (>24h) werden automatisch gelöscht
- Trigger: Täglich via MaintenanceService
- Endpoint: `POST /audit/backups/cleanup`

---

## 8. Code-Referenzen

### Frontend

| Komponente | Datei | Zeilen |
|------------|-------|--------|
| CleanupPanel | `El Frontend/src/components/system-monitor/CleanupPanel.vue` | 1-1694 |
| AutoCleanupStatusBanner | `AutoCleanupStatusBanner.vue` | 1-439 |
| CleanupPreview | `CleanupPreview.vue` | 1-368 |
| PreviewEventCard | `PreviewEventCard.vue` | 1-155 |
| Audit API Types | `El Frontend/src/api/audit.ts` | 55-225 |
| Audit API Functions | `El Frontend/src/api/audit.ts` | 231-501 |

### Backend API

| Endpoint | Datei | Zeilen |
|----------|-------|--------|
| Cleanup | `El Servador/.../api/v1/audit.py` | 802-851 |
| Retention Config | `audit.py` | 750-800 |
| Retention Status | `audit.py` | 704-747 |
| Backups | `audit.py` | 1047-1210 |
| Statistics | `audit.py` | 636-681 |

### Backend Services

| Service | Datei | Zeilen |
|---------|-------|--------|
| AuditRetentionService | `audit_retention_service.py` | 59-882 |
| AuditBackupService | `audit_backup_service.py` | 71-446 |
| MaintenanceService | `maintenance/service.py` | 31-604 |
| Cleanup Jobs | `maintenance/jobs/cleanup.py` | 28-702 |

### Datenbank

| Model | Datei | Zeilen |
|-------|-------|--------|
| AuditLog | `db/models/audit_log.py` | 26-241 |
| SystemConfig | `db/models/system.py` | 15-94 |
| SensorData | `db/models/sensor.py` | 234-357 |
| ESPHeartbeatLog | `db/models/esp_heartbeat.py` | 26-187 |

### Konfiguration

| Config | Datei | Zeilen |
|--------|-------|--------|
| MaintenanceSettings | `core/config.py` | 305-575 |
| Default Retention | `audit_retention_service.py` | 44-56 |
| Default Backup | `audit_backup_service.py` | 64-68 |

---

## 9. Zusammenfassung

### Design-Prinzipien

1. **Safety-First:** Alle Cleanup-Features sind per Default DISABLED
2. **Dry-Run Default:** Vorschau bevor echte Löschung
3. **Backup vor Löschung:** Automatische JSON-Backups
4. **Severity-basierte Retention:** Unterschiedliche Aufbewahrung je nach Wichtigkeit
5. **Batch-Processing:** Verhindert DB-Locks bei großen Datenmengen
6. **Audit-Trail:** Alle Cleanup-Operationen werden dokumentiert

### Wichtige Sicherheitsmerkmale

- Emergency-Stop Events werden NIEMALS gelöscht
- Max 100.000 Records pro Cleanup-Run
- Alert bei >10% Löschung
- 24h Backup-Fenster für Restore
- Admin-Only Berechtigungen für destruktive Operationen

### Typischer Workflow

```
1. Admin öffnet Cleanup-Panel
2. Status-Banner zeigt: "Automatische Bereinigung INAKTIV"
3. Admin klickt "Vorschau" → dry_run=true zeigt was gelöscht würde
4. Admin prüft Preview-Events
5. Admin klickt "Bereinigen" → Bestätigungs-Dialog
6. System erstellt automatisch Backup
7. System löscht Events in Batches
8. Erfolgs-Meldung mit Backup-ID
9. Bei Fehler: Admin kann Backup wiederherstellen
```

---

**Ende der Dokumentation**

**Letzte Aktualisierung:** 2026-01-27
