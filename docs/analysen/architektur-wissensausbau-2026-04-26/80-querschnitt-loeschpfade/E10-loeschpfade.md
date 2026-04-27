# E10 — Löschpfade, Restore und Audit-Logs

> **Etappe:** E10 — Querschnittsthema Lösch-Strategie
> **Datum:** 2026-04-26
> **Basis:** Direktes Code-Reading aus `src/db/models/`, `src/api/v1/`, `src/db/repositories/`
> **Verifikationsstatus:** Alle SQLAlchemy-Cascade-Definitionen aus Code gelesen (nicht geraten)

---

## 1. Überblick Lösch-Strategie

Das System verwendet eine **gemischte Lösch-Strategie** — kein einheitlicher Ansatz über alle Entitäten:

| Strategie | Tabellen | Begründung |
|-----------|----------|------------|
| **Soft-Delete** | `esp_devices`, `zones` | Historische Daten und Referenzen erhalten |
| **Hard-Delete** | alle anderen Tabellen | `sensor_configs`, `actuator_configs`, `subzone_configs`, `user_accounts`, `notifications`, `audit_logs` (Retention), `subzone_configs` |
| **SET NULL** | `sensor_data.esp_id`, `actuator_states.esp_id`, `actuator_history.esp_id` | Messdaten bleiben erhalten, FK wird entkoppelt |
| **CASCADE** | `sensor_configs`, `actuator_configs`, `subzone_configs` (via ESP-Gerät) | Konfiguration gehört zum Gerät |

**Rationale (aus Code-Kommentaren):** `T02-Fix1` — `sensor_data` soll nach Geräte-Soft-Delete erhalten bleiben. Historische Messwerte haben eigenständigen Wert für Analysen und Audit.

---

## 2. Vollständige Löschpfade-Matrix

| Entität | DELETE-Endpunkt | Methode | Was wird gelöscht | Was bleibt | Cascade |
|---------|-----------------|---------|-------------------|------------|---------|
| **ESP-Gerät** | `DELETE /v1/esp/devices/{esp_id}` | Soft-Delete | `deleted_at` gesetzt, `status='deleted'` | `sensor_data`, `actuator_states`, `actuator_history` (SET NULL) | `sensor_configs`, `actuator_configs`, `subzone_configs` werden cascade-gelöscht |
| **Zone** | `DELETE /v1/zones/{zone_id}` | Soft-Delete | `deleted_at` gesetzt, `status='deleted'` | Zone-Datensatz bleibt sichtbar für Admin | Keine automatische Cascade auf `subzone_configs` (E2-Inkonsistenz) |
| **Sensor-Config** | `DELETE /v1/sensors/{esp_id}/{config_id}` | Hard-Delete | `sensor_configs`-Eintrag | `sensor_data` (explizit nicht gelöscht) | Kein Cascade — sensor_data hat kein FK auf sensor_configs |
| **Aktuator-Config** | `DELETE /v1/actuators/{esp_id}/{gpio}` | Hard-Delete | `actuator_configs`-Eintrag | `actuator_states`, `actuator_history` (SET NULL) | Kein automatischer Cascade — state/history bleibt mit esp_id |
| **User** | `DELETE /v1/users/{user_id}` | Hard-Delete | `user_accounts`-Eintrag | — | `notifications` CASCADE, `notification_preferences` CASCADE |
| **Audit-Log** | `POST /v1/audit/retention/cleanup` | Hard-Delete (Retention) | Ältere `audit_logs` nach Policy | Backup-Dateien (optional) | Keine Cascade |
| **Subzone** | (kein dedizierter Endpunkt gefunden) | — | — | — | Über Zone-Archiv deaktiviert |

---

## 3. ESP-Gerät löschen (Cascade-Detail)

### 3.1 API-Endpunkt

```
DELETE /v1/esp/devices/{esp_id}
Rolle: OperatorUser (Operator + Admin)
HTTP-Status: 204 No Content
```

### 3.2 Soft-Delete-Mechanismus

Der Repository-Aufruf `esp_repo.soft_delete(esp_id, deleted_by=current_user.username)` setzt:
- `esp_devices.deleted_at = datetime.now(timezone.utc)`
- `esp_devices.deleted_by = current_user.username`
- `esp_devices.status = 'deleted'`

Das Gerät ist danach für alle normalen Abfragen unsichtbar (`ESPRepository._not_deleted()` filtert `deleted_at IS NULL`). Für Audit-Zwecke gibt es den Parameter `include_deleted=True`.

### 3.3 Cascade-Pfad beim ESP-Gerät-Soft-Delete

Der Soft-Delete des ESP-Geräts **triggert keinen automatischen DB-Cascade** (weil das Gerät physisch nicht gelöscht wird). Die zugehörigen Configs werden aber durch die **SQLAlchemy-Relationship-Definition** mit `cascade="all, delete-orphan"` behandelt — dies greift jedoch nur beim physischen Löschen, nicht beim Soft-Delete.

**Tatsächlicher Ablauf im API-Handler (`api/v1/esp.py:delete_device`):**

1. Simulation stoppen (falls `MOCK_ESP32`)
2. Offene Alerts auto-resolven via `notif_repo.resolve_alerts_for_device(esp_id)`
3. Soft-Delete des Geräts setzen

**Was danach in der DB bleibt / passiert:**

| Tabelle | Verhalten | Begründung |
|---------|-----------|------------|
| `esp_devices` | Bleibt (soft-deleted) | Audit-Trail |
| `sensor_configs` | **Bleiben** (keine Cascade bei Soft-Delete!) | Nur bei physischem DELETE cascaded |
| `actuator_configs` | **Bleiben** (keine Cascade bei Soft-Delete!) | Nur bei physischem DELETE cascaded |
| `subzone_configs` | **Bleiben** (keine Cascade bei Soft-Delete!) | Nur bei physischem DELETE cascaded |
| `sensor_data` | Bleibt, `esp_id = NULL` wird gesetzt (SET NULL bei physischem Delete) | `T02-Fix1`: Messdaten erhalten |
| `actuator_states` | Bleibt, `esp_id` wird SET NULL | Zustandshistorie erhalten |
| `actuator_history` | Bleibt, `esp_id` wird SET NULL | Befehlshistorie erhalten |

> [!ANNAHME] Cascade auf Configs bei Soft-Delete
>
> **Basis:** SQLAlchemy `cascade="all, delete-orphan"` auf `ESPDevice.sensors`, `.actuators`, `.subzones` greift nur bei `session.delete(device)`, nicht bei Soft-Delete (nur Feld-Setzen). Der API-Code in `esp.py` ruft `soft_delete()` auf, das nur Felder setzt — kein `session.delete()`.
> **Zu verifizieren:** E11-Agent soll prüfen, ob `sensor_configs`, `actuator_configs`, `subzone_configs` nach Soft-Delete eines ESP-Geräts tatsächlich in der DB verbleiben — oder ob es eine andere Löschmechanik gibt (z.B. `delete_mock_device` macht explizites `session.execute(delete(SensorConfig)...)`).

**Besonderheit Mock-ESP:** `delete_mock_device()` im ESP-Repository macht ein **explizites Hard-Delete** von `sensor_configs` und `actuator_configs` via direktem SQL-Statement — bevor das Gerät soft-deleted wird. Real-ESPs haben diesen Schritt nicht.

### 3.4 SQLAlchemy-Relationship-Definitionen (aus `db/models/esp.py`)

```python
sensors: Mapped[list["SensorConfig"]] = relationship(
    "SensorConfig",
    back_populates="esp",
    cascade="all, delete-orphan",
)

actuators: Mapped[list["ActuatorConfig"]] = relationship(
    "ActuatorConfig",
    back_populates="esp",
    cascade="all, delete-orphan",
)

subzones: Mapped[list["SubzoneConfig"]] = relationship(
    "SubzoneConfig",
    back_populates="esp",
    cascade="all, delete-orphan",
)
```

### 3.5 FK-Definitionen der abhängigen Tabellen

```python
# sensor_configs.esp_id
ForeignKey("esp_devices.id", ondelete="CASCADE")

# actuator_configs.esp_id
ForeignKey("esp_devices.id", ondelete="CASCADE")

# subzone_configs.esp_id
ForeignKey("esp_devices.device_id", ondelete="CASCADE")

# sensor_data.esp_id
ForeignKey("esp_devices.id", ondelete="SET NULL")  # T02-Fix1

# actuator_states.esp_id
ForeignKey("esp_devices.id", ondelete="SET NULL")  # T02-Fix1

# actuator_history.esp_id
ForeignKey("esp_devices.id", ondelete="SET NULL")  # T02-Fix1
```

> [!INKONSISTENZ] I6-A: Soft-Delete verhindert DB-Cascade für Configs
>
> **Beobachtung:** `sensor_configs`, `actuator_configs` und `subzone_configs` haben `ondelete="CASCADE"` auf der FK-Definition. Dies greift aber nur bei physischem `DELETE FROM esp_devices WHERE id = ...`. Beim Soft-Delete (nur `deleted_at` setzen) bleibt die DB-Zeile bestehen und Postgres löst keinen Cascade aus. Das API macht für Real-ESPs kein explizites Config-Cleanup — folglich bleiben `sensor_configs` etc. nach Soft-Delete eines Real-ESP in der DB liegen.
> **Korrekte Stelle:** Abschnitt 2 (Löschpfad-Matrix) und Abschnitt 3.3
> **Empfehlung:** Entweder explizites Config-Cleanup im Soft-Delete-Handler analog zu `delete_mock_device()`, oder dokumentieren, dass verwaiste Configs nach Soft-Delete gezielt per Admin-Query bereinigt werden müssen.
> **Erst-Erkennung:** E10, 2026-04-26

---

## 4. Zone löschen (Soft-Delete + Subzone-Problem)

### 4.1 API-Endpunkt

```
DELETE /v1/zones/{zone_id}
Rolle: OperatorUser
HTTP-Status: 200 (ZoneDeleteResponse)
```

### 4.2 Voraussetzungen für Löschung

Bevor ein Soft-Delete durchgeführt wird, prüft der Handler:
- `esp_repo.get_by_zone(zone_id)` — falls Geräte noch zugewiesen sind, wird mit HTTP 400 abgebrochen.
- Nur Zonen ohne aktive Geräte können gelöscht werden.

### 4.3 Soft-Delete-Mechanismus

`zone_repo.soft_delete(zone_id, deleted_by=current_user.username)` setzt:
- `zones.status = 'deleted'`
- `zones.deleted_at = datetime.now(timezone.utc)`
- `zones.deleted_by = current_user.username`

### 4.4 Zone-Archiv-Pfad (Vorstufe zum Löschen)

Neben dem Löschen gibt es einen **Archiv-Flow** (`POST /v1/zones/{zone_id}/archive`):
- Setzt `zones.status = 'archived'`
- Deaktiviert alle Subzones via `subzone_repo.deactivate_by_zone(zone_id)` — setzt `is_active=False` in `subzone_configs`
- Geräte müssen **vor dem Archivieren** bereits manuell umgezogen werden

Beim **Soft-Delete** gibt es dagegen **keinen Subzone-Deaktivierungsschritt** (nur beim Archivieren).

### 4.5 Was passiert mit Subzones?

| Vorgang | Subzones-Verhalten |
|---------|-------------------|
| **Zone archivieren** | `subzone_configs.is_active = False` für alle Subzones der Zone |
| **Zone soft-delete** | **Keine Aktion** — Subzones bleiben in DB mit `parent_zone_id = gelöschte Zone` |
| **Zone wiederherstellen** | Subzones bleiben deaktiviert (manuelles Reaktivieren nötig) |

> [!INKONSISTENZ] E2: Zone Soft-Delete ohne Subzone-Cascade
>
> **Beobachtung:** Beim Soft-Delete einer Zone (`DELETE /v1/zones/{zone_id}`) werden die zugehörigen `subzone_configs`-Einträge weder gelöscht noch deaktiviert. Sie verweisen dann auf eine Zone mit `status='deleted'`. Der Archiv-Pfad (`POST /archive`) deaktiviert Subzones via `subzone_repo.deactivate_by_zone()`, der Lösch-Pfad nicht.
> **Korrekte Stelle:** Abschnitt 4 (Zone löschen) und Abschnitt 2 (Matrix)
> **Empfehlung:** Im Soft-Delete-Handler von Zonen analog zum Archiv-Pfad `subzone_repo.deactivate_by_zone(zone_id)` aufrufen, damit verwaiste Subzones nicht aktiv bleiben.
> **Erst-Erkennung:** E2 (vorbekannt), vollständig dokumentiert E10, 2026-04-26

### 4.6 Konkretes Problem-Szenario

```
1. Zone "gewaechshaus_a" mit 3 Subzones erstellen
2. Alle ESP-Geräte aus Zone entfernen
3. Zone soft-deleten
→ subzone_configs mit parent_zone_id='gewaechshaus_a' bleiben in DB
→ is_active=True (aktiv, obwohl Zone gelöscht)
→ Logic-Engine könnte verwaiste Subzones referenzieren
```

### 4.7 Zone-Modell: Keine SQLAlchemy-Relationship zu Subzones

Das `Zone`-Model (`db/models/zone.py`) definiert **keine `relationship`** zu `SubzoneConfig`. Die Zone-Entity ist isoliert modelliert — `subzone_configs.parent_zone_id` ist ein einfacher String-Wert ohne FK-Constraint auf `zones.zone_id`.

> [!ANNAHME] Kein FK-Constraint zwischen subzone_configs.parent_zone_id und zones.zone_id
>
> **Basis:** `Zone`-Modell hat keine Relationship zu `SubzoneConfig`. `SubzoneConfig.parent_zone_id` ist `String(50)` ohne explizit sichtbaren `ForeignKey()`-Aufruf im Modell-Code. Es könnte eine Alembic-Migration einen solchen Constraint hinzugefügt haben.
> **Zu verifizieren:** E11-Agent soll in den Alembic-Migrations prüfen, ob `subzone_configs.parent_zone_id` einen FK-Constraint auf `zones.zone_id` hat.

---

## 5. Sensor löschen

### 5.1 API-Endpunkt

```
DELETE /v1/sensors/{esp_id}/{config_id}
Rolle: OperatorUser
HTTP-Status: 200 (gibt gelöschte Config zurück)
Identifikation: UUID (config_id) statt GPIO — löst MultipleResultsFound-Problem
```

### 5.2 Delete-Pipeline (aus Code-Kommentar: `T08-Fix-D`)

Der Handler führt folgende Schritte aus:
1. `sensor_repo.delete(sensor.id)` — hard-delete des `sensor_configs`-Eintrags
2. Prüfen ob weitere Sensoren auf demselben GPIO verbleiben (Multi-Value-Support)
3. Falls keine weiteren Sensoren: Subzone-Cleanup (`remove_gpio_from_all_subzones`)
4. `esp_repo.rebuild_simulation_config()` — Mock-Cache aktualisieren
5. `db.commit()`
6. Subzone-Counts synchronisieren
7. APScheduler-Job entfernen (wenn kein Sensor mehr auf GPIO)
8. Simulation-Job entfernen (Mock-ESPs)
9. Aktualisierte Config via MQTT an ESP32 senden
10. WebSocket-Event `sensor_config_deleted` broadcasten

### 5.3 sensor_data-Verhalten

`sensor_data` wird **explizit nicht gelöscht** — der Code-Kommentar in `sensors.py` lautet:

> `"Sensor deleted: {esp_id} config_id={config_id} GPIO {gpio} type={deleted_sensor_type} by {current_user.username}"` — pipeline: `DB delete → rebuild_simulation_config → scheduler stop → WS event`. `sensor_data rows are intentionally preserved (historical data).`

Da `sensor_data.esp_id` ein FK mit `ondelete="SET NULL"` auf `esp_devices.id` ist — und `sensor_data` **keinen FK auf `sensor_configs`** hat — bleiben die historischen Messdaten vollständig erhalten, auch ohne die Config.

> [!INKONSISTENZ] I6-B: sensor_data ist nach Sensor-Config-Deletion anonym
>
> **Beobachtung:** Nach dem Löschen einer `sensor_configs`-Zeile gibt es keine direkte Verknüpfung mehr zwischen `sensor_data`-Zeilen und der gelöschten Config. Die `sensor_data` hat `esp_id` und `gpio` — kann also noch einem Gerät zugeordnet werden — aber welcher Config die Zeile gehörte, ist nicht mehr ermittelbar (besonders relevant bei Multi-Value-Sensoren mit gleichem GPIO). `device_name` ist als Snapshot-Feld vorhanden, aber `sensor_config_id` fehlt in `sensor_data`.
> **Korrekte Stelle:** Abschnitt 5.3 und Abschnitt 10 (Daten-Retention)
> **Empfehlung:** `sensor_data` könnte ein optionales `sensor_config_id`-Snapshot-Feld erhalten, das beim Insert gesetzt wird und nach Config-Delete NULL bleibt (analog zu `device_name`).
> **Erst-Erkennung:** E10, 2026-04-26

---

## 6. User löschen

### 6.1 API-Endpunkt

```
DELETE /v1/users/{user_id}
Rolle: AdminUser (nur Admin)
HTTP-Status: 204 No Content
Self-Deletion blockiert: Ja (ValidationException wenn user_id == current_user.id)
```

### 6.2 Hard-Delete

User wird physisch gelöscht: `user_repo.delete(user)` → `session.delete(user)`.

### 6.3 Cascade-Pfad

| Tabelle | Cascade-Verhalten | FK-Definition |
|---------|-------------------|---------------|
| `notification_preferences` | CASCADE — wird gelöscht | `ForeignKey("user_accounts.id", ondelete="CASCADE")` PK |
| `notifications` | CASCADE — werden gelöscht | `ForeignKey("user_accounts.id", ondelete="CASCADE")` |
| `notifications.acknowledged_by` | SET NULL | `ForeignKey("user_accounts.id", ondelete="SET NULL")` |

### 6.4 Was bleibt nach User-Deletion

| Tabelle | Verhalten |
|---------|-----------|
| `audit_logs` | Bleiben — `source_id` für User-Events ist Username-String, kein FK |
| `esp_devices.approved_by` | Bleibt als String-Feld erhalten (kein FK auf user_accounts) |
| `esp_devices.deleted_by` | Bleibt als String-Feld erhalten (kein FK auf user_accounts) |
| `zones.deleted_by` | Bleibt als String-Feld erhalten (kein FK auf user_accounts) |
| `actuator_history.issued_by` | Bleibt als String-Feld erhalten (kein FK auf user_accounts) |

**Wichtige Beobachtung:** Aktionsfelder wie `approved_by`, `deleted_by`, `issued_by` sind als `String`-Felder ohne FK modelliert — Username-Snapshots. Sie überleben User-Deletion problemlos.

> [!ANNAHME] User-Delete Cascade auf notifications vollständig
>
> **Basis:** `notification.user_id` hat `ForeignKey("user_accounts.id", ondelete="CASCADE")`. Bei physischem User-Delete werden alle Notifications des Users gelöscht.
> **Zu verifizieren:** E11-Agent soll prüfen ob alle anderen Tabellen die `user_id` als FK referenzieren — hier wurden nur `notifications` und `notification_preferences` gefunden.

---

## 7. Restore-Mechanismen

### 7.1 Was kann wiederhergestellt werden

| Objekt | Restore möglich? | Mechanismus |
|--------|------------------|-------------|
| **Soft-deleted ESP-Gerät** | Ja, manuell | `status`, `deleted_at`, `deleted_by` zurücksetzen — kein dedizierter API-Endpunkt vorhanden |
| **Soft-deleted Zone** | Ja, via API | `POST /v1/zones/{zone_id}/reactivate` (setzt `status='active'`) |
| **Hard-deleted Sensor-Config** | Nein | Muss neu angelegt werden |
| **Hard-deleted User** | Nein | Muss neu angelegt werden |
| **Audit-Logs** | Ja, via Backup | `POST /v1/audit/backups/{backup_id}/restore` |

### 7.2 Zone-Restore

`POST /v1/zones/{zone_id}/reactivate` ist implementiert:
- Setzt `zones.status = 'active'`
- Subzones werden **nicht** automatisch reaktiviert (Code-Kommentar: "User must manually reactivate subzones")
- Voraussetzung: Zone muss `status='archived'` haben (nicht `'deleted'`)

> [!INKONSISTENZ] I6-C: Kein Restore-Endpunkt für soft-deleted ESP-Geräte
>
> **Beobachtung:** Es gibt `POST /v1/zones/{zone_id}/reactivate` für Zonen, aber **keinen analogen Endpunkt** für soft-deleted ESP-Geräte. Der `esp_repo.soft_delete()`-Mechanismus ist vorhanden, aber ein Reverse-Mechanismus (`undelete_device`) fehlt in API und Repository. Historisch gelöschte Geräte können nur direkt per DB-Query reaktiviert werden.
> **Korrekte Stelle:** Abschnitt 7.1 (Restore-Tabelle)
> **Empfehlung:** `POST /v1/esp/devices/{esp_id}/restore` analog zu Zone-Reactivate implementieren.
> **Erst-Erkennung:** E10, 2026-04-26

### 7.3 Audit-Log-Restore

Vollständig implementiert via Retention-Service:
- Backup wird als JSON-Datei vor jedem Cleanup angelegt
- `POST /v1/audit/backups/{backup_id}/restore` liest Backup und re-inserted Events
- Duplikate werden übersprungen
- Nach erfolgreichem Restore: Backup optional löschen (`delete_after_restore=True`)

---

## 8. Audit-Logging

### 8.1 Audit-Tabelle

`audit_logs` — implementiert, mit eigenem Repository und API-Router (`/v1/audit`).

**Modell-Design:** Immutable by design — "Entries should never be modified or deleted (except via automated retention policy)." (Kommentar in `db/models/audit_log.py`)

### 8.2 Geloggte Event-Typen (AuditEventType-Konstanten)

**Config-Events:**
- `config_response`, `config_published`, `config_failed`

**Auth-Events:**
- `login_success`, `login_failed`, `logout`, `token_revoked`

**Security-Events:**
- `permission_denied`, `api_key_invalid`, `rate_limit_exceeded`

**Device-Lifecycle-Events:**
- `device_discovered`, `device_approved`, `device_rejected`, `device_online`, `device_rediscovered`, `lwt_received`

**Operational Events:**
- `emergency_stop`, `service_start`, `service_stop`, `device_registered`, `device_offline`

**Actuator-Events:**
- `actuator_command`, `actuator_command_failed`

**Error-Events:**
- `mqtt_error`, `database_error`, `validation_error`, `api_error`

### 8.3 Was wird NICHT geloggt (Lücken)

Die folgenden Aktionen generieren **keinen Audit-Log-Eintrag** (aus Code-Analyse):

| Aktion | Audit vorhanden? |
|--------|-----------------|
| ESP-Gerät soft-delete | Nein — kein `AuditLogRepository.log_device_event()` im Delete-Handler |
| Sensor-Config anlegen/ändern/löschen | Nein |
| Zone erstellen/löschen | Nein |
| User erstellen/löschen | Nein |
| ESP approve/reject | **Ja** — explizit implementiert via `audit_repo.log_device_event()` |
| Actuator command | **Ja** — via `log_actuator_command()` |

> [!INKONSISTENZ] I6-D: Audit-Lücke bei ESP-Delete und Sensor/Zone-CRUD
>
> **Beobachtung:** Kritische Aktionen wie ESP-Gerät-Soft-Delete, Sensor-Config-Löschen, Zone-Löschen und User-CRUD generieren keinen `audit_logs`-Eintrag. Nur Device-Approve/Reject und Actuator-Commands sind vollständig geloggt. ESP-Delete und User-Delete sind sicherheitskritische Aktionen ohne Audit-Trail.
> **Korrekte Stelle:** Abschnitt 8 (Audit-Logging)
> **Empfehlung:** Im Delete-Handler von ESP-Geräten, Sensoren und Zonen `AuditLogRepository.log_device_event()` mit einem neuen `AuditEventType.DEVICE_DELETED`-Eintrag aufrufen.
> **Erst-Erkennung:** E10, 2026-04-26

### 8.4 Audit-Retention

Die `audit_logs`-Tabelle hat eine konfigurierbare Retention-Policy (`AuditRetentionService`):
- Konfigurierbar per Severity (`severity_days`)
- Default: konfigurierbar via `MaintenanceSettings`
- `emergency_stop`-Events können von Cleanup ausgenommen werden (`preserve_emergency_stops`)
- Täglicher Auto-Cleanup um 03:00 UTC (wenn aktiviert)
- Vor Cleanup: JSON-Backup wird angelegt (optional)

### 8.5 Audit-Log-Indexes (Performance)

```python
Index("ix_audit_logs_created_at", "created_at")
Index("ix_audit_logs_severity_created_at", "severity", "created_at")
Index("ix_audit_logs_source_created_at", "source_type", "source_id", "created_at")
```

---

## 9. Frontend-Lösch-Flow

### 9.1 ESP-Gerät löschen

**Komponenten:** `ESPCard.vue`, `DeviceDetailView.vue`

```
ESPCard.vue → emit('delete', espId)
     ↓
DeviceDetailView.vue → emit('delete', deviceId)
     ↓
Eltern-Komponente → API-Call DELETE /v1/esp/devices/{esp_id}
```

Der Button in `ESPCard.vue` hat einen `deleteLoading`-State, der während des Requests gesetzt wird (pessimistic approach — Button wird disabled). Kein Confirmation-Dialog in `ESPCard.vue` selbst sichtbar — dieser liegt in der aufrufenden Komponente.

> [!ANNAHME] Confirmation-Dialog-Implementierung
>
> **Basis:** `ESPCard.vue` emittiert nur `('delete', espId)` — der Delete-Button triggert nur das Event. Die eigentliche Confirmation (Dialog, Modal) muss in der Eltern-Komponente implementiert sein. Code der Parent-Komponente wurde nicht vollständig gelesen.
> **Zu verifizieren:** E11-Agent soll prüfen in welcher Komponente der Confirmation-Dialog für ESP-Delete implementiert ist.

### 9.2 Sensor löschen

**Komponente:** `EditSensorModal.vue`, `DeviceDetailView.vue`

Der Delete-Sensor-Endpunkt erwartet `config_id` (UUID), nicht GPIO — dies ist die `T08-Fix-D`-Lösung für Multi-Value-Sensoren auf demselben GPIO.

### 9.3 Zone löschen

**Kein direkter Confirmation-Dialog bestätigt** — Zone-Delete-Endpunkt gibt HTTP 400 zurück wenn Geräte noch zugewiesen sind. Das Frontend muss dies als Fehlerfall behandeln.

### 9.4 Error-Handling-Pattern

- **Pessimistic Delete:** Button wird disabled während des API-Calls, State wird nur bei Erfolg aktualisiert
- **WebSocket-Events:** Nach erfolgreichem Sensor-Delete: `sensor_config_deleted`-Event wird gebroadcastet → Frontend-Stores entfernen den Eintrag
- **Fehlerfall:** HTTP-Fehler vom Server werden als Exception geworfen und im Frontend als Toast/Alert angezeigt

---

## 10. Daten-Retention (sensor_data, logs)

### 10.1 sensor_data

`sensor_data` hat **keine eingebaute automatische Retention** als Default. Der `SensorDataCleanup`-Maintenance-Job existiert, ist aber standardmäßig **deaktiviert**:

```python
# cleanup.py: safety check
if not self.settings.sensor_data_retention_enabled:
    logger.info(
        "Sensor data cleanup is DISABLED. "
        "Set SENSOR_DATA_RETENTION_ENABLED=true to activate."
    )
    return {"status": "disabled", ...}
```

**Konfiguration:** `SENSOR_DATA_RETENTION_ENABLED` (env var, Standard: `False`)

**Schlussfolgerung:** Im Default-Betrieb wächst `sensor_data` unbegrenzt. Historische Daten werden nie automatisch gelöscht.

### 10.2 actuator_history

Analog zu `sensor_data` — kein automatischer Cleanup dokumentiert im Maintenance-Job. `ActuatorHistory` hat denselben `data_source`-Index wie `sensor_data` (Performance-optimiert für Abfragen), aber kein Cleanup-Job ist aus dem Code erkennbar.

> [!ANNAHME] Kein Actuator-History-Cleanup
>
> **Basis:** `cleanup.py` im Maintenance-Jobs-Ordner behandelt `SensorData`, `ActuatorHistory` und `ESPHeartbeatLog` (Imports sichtbar am Dateianfang). Die vollständige `cleanup.py` wurde nur bis Zeile 80 gelesen.
> **Zu verifizieren:** E11-Agent soll den vollständigen `cleanup.py` lesen und prüfen ob `ActuatorHistory` und `ESPHeartbeatLog` eigene Cleanup-Jobs haben.

### 10.3 notification_logs

`notifications` hat **kein Retention-System** vergleichbar mit `audit_logs`. Notifications werden nur durch User-Aktionen archiviert (`is_archived=True`) oder beim User-Delete cascade-gelöscht.

> [!INKONSISTENZ] E3: notifications ohne Retention-Mechanismus
>
> **Beobachtung:** `notifications` wächst unbegrenzt (außer User-Delete-Cascade). Ein automatischer Cleanup-Mechanismus wie bei `audit_logs` fehlt. Die bekannte E3-Inkonsistenz (kein `device_id`-FK) verstärkt das Problem — verwaiste Notifications für gelöschte Geräte bleiben in der DB (mit `extra_data.esp_id` als JSON-String, kein FK).
> **Korrekte Stelle:** Abschnitt 10 (Daten-Retention)
> **Empfehlung:** Analog zu `AuditRetentionService` einen `NotificationRetentionService` implementieren, der alte/resolved Notifications nach konfigurierbarer Zeit löscht.
> **Erst-Erkennung:** E3 (vorbekannt: kein device_id FK), Retention-Lücke neu: E10, 2026-04-26

### 10.4 audit_logs

`audit_logs` ist das **einzige** Log-System mit vollständiger Retention-Infrastruktur:
- Policy-basierter Cleanup (per Severity konfigurierbar)
- JSON-Backup vor Deletion
- Restore-Funktion
- Manual-Cleanup via API
- Auto-Cleanup via Scheduler (täglich 03:00 UTC, wenn aktiviert)

### 10.5 esp_heartbeat_log

`ESPHeartbeatLog` ist im Maintenance-Job-Import enthalten (`from src.db.models.esp_heartbeat import ESPHeartbeatLog`). Details des Cleanup-Verhaltens nicht aus dem verfügbaren Code-Abschnitt bestätigbar.

> [!ANNAHME] ESPHeartbeatLog hat Retention-Job
>
> **Basis:** `ESPHeartbeatLog` ist im Import-Statement von `cleanup.py` vorhanden — deutet auf einen Cleanup-Job hin.
> **Zu verifizieren:** E11-Agent soll den vollständigen `cleanup.py` lesen.

---

## 11. Bekannte Inkonsistenzen (Zusammenfassung)

### I6: Soft-Delete nur bei esp_devices und zones

**Vollständige Analyse:**

Die Soft-Delete-Strategie deckt nur zwei von ~32 Tabellen ab. Alle anderen Entitäten werden physisch gelöscht (hard-delete). Dies hat folgende Konsequenzen:

| Konsequenz | Betroffene Entität | Schweregrad |
|------------|-------------------|-------------|
| Sensor-Configs bleiben nach ESP-Soft-Delete in DB | `sensor_configs` | MEDIUM |
| Kein Restore-Pfad für gelöschte Sensor-Configs | `sensor_configs` | MEDIUM |
| Kein Restore-Pfad für gelöschte User | `user_accounts` | MEDIUM |
| Verwaiste Notifications nach Gerät-Soft-Delete | `notifications.extra_data.esp_id` | LOW |
| Audit-Logs ohne ESP-Delete-Eintrag | `audit_logs` | MEDIUM |

**Warum nur esp_devices und zones?**

- `esp_devices`: Wegen `sensor_data`-Preservation (`T02-Fix1`) — historische Messdaten sollen nicht verloren gehen.
- `zones`: Als logische Hierarchie-Entität, die Referenzpunkt für Geräte ist (`T13-R1`).

Andere Entitäten (Sensoren, User, etc.) wurden pragmatisch als hard-delete implementiert, da ihr Daten-Erhalt weniger kritisch ist.

### E2: zones Soft-Delete ohne Cascade für Subzones

Vollständig in Abschnitt 4 dokumentiert. Das Problem:
1. Zone-Archivierung deaktiviert Subzones korrekt
2. Zone-Soft-Delete macht **dasselbe nicht**
3. Subzones verweisen danach auf eine gelöschte Zone, bleiben aber `is_active=True`

**Szenario:** Eine ESP-Konfiguration, die per `parent_zone_id` eine gelöschte Zone referenziert, könnte von der Logic-Engine falsch interpretiert werden.

---

*Erstellt von: E10-Agent, 2026-04-26*
*Quelldateien: `src/db/models/esp.py`, `src/db/models/zone.py`, `src/db/models/sensor.py`, `src/db/models/actuator.py`, `src/db/models/subzone.py`, `src/db/models/notification.py`, `src/db/models/audit_log.py`, `src/db/models/user.py`, `src/api/v1/esp.py`, `src/api/v1/zones.py`, `src/api/v1/sensors.py`, `src/api/v1/users.py`, `src/api/v1/audit.py`, `src/db/repositories/esp_repo.py`, `src/db/repositories/zone_repo.py`, `src/db/repositories/audit_log_repo.py`, `src/services/maintenance/jobs/cleanup.py` (teilweise)*
