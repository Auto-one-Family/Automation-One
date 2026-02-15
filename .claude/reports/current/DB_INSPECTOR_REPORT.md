# DB Inspector Report

**Erstellt:** 2026-02-15 (Cleanup für frischen Debug-Flow)
**Modus:** B (Spezifisch: "DB-Bereinigung für SHT31-ESP32 Debug, user_accounts erhalten")
**Quellen:** esp_devices, sensor_configs, sensor_data, actuator_*, esp_heartbeat_logs, audit_logs, token_blacklist, user_accounts

---

## 1. Zusammenfassung

Datenbank für einen **frischen Debug-Flow** bereinigt. Alle ESP-bezogenen Daten (7 Devices, 9190 sensor_data, 1785 heartbeat_logs) wurden gelöscht. **user_accounts** (1 Benutzer) und Konfigurationstabellen bleiben unverändert. Backup erstellt: `backups/automationone_20260215_123312.sql`.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | pg_isready accepting connections |
| Backup | OK | backups/automationone_20260215_123312.sql |
| user_accounts | ERHALTEN | 1 Benutzer (admin) |

---

## 3. Durchgeführte Bereinigung

### 3.1 Gelöscht (via DELETE/TRUNCATE)

| Aktion | Tabelle(n) | Vorher | Nachher |
|--------|------------|--------|---------|
| DELETE FROM esp_devices | esp_devices | 7 | 0 |
| CASCADE | sensor_configs, sensor_data, actuator_configs, actuator_states, actuator_history | - | 0 |
| CASCADE | esp_heartbeat_logs, subzone_configs, esp_ownership, ai_predictions | - | 0 |
| TRUNCATE | audit_logs | 188 | 0 |
| TRUNCATE | token_blacklist | 46 | 0 |
| TRUNCATE | logic_execution_history | - | 0 |

### 3.2 Erhalten (nicht gelöscht)

| Tabelle | Anzahl | Grund |
|--------|--------|-------|
| user_accounts | 1 | Benutzer müssen erhalten bleiben |
| system_config | - | System-Konfiguration |
| sensor_type_defaults | - | Referenzdaten |
| library_metadata | - | Library-Definitionen |
| kaiser_registry | - | Kaiser-Registry |
| cross_esp_logic | 0 | Bereits leer |
| subzone_configs | 0 | Per CASCADE mit esp_devices gelöscht |

---

## 4. Extended Checks

| Check | Ergebnis |
|-------|----------|
| pg_isready | OK - accepting connections |
| Backup | backups/automationone_20260215_123312.sql |
| Rollback | `docker exec ... psql ... -f backup.sql` (nach Restore-Script) |

---

## 5. Bewertung & Empfehlung

- **Status:** Cleanup erfolgreich. DB ist bereit für frischen Debug-Flow mit SHT31-ESP32.
- **Login:** admin / Admin123# (user_accounts erhalten)
- **Nächste Schritte:** ESP32 flashen → Backend Inspector → Frontend Inspector → Meta-Analyse

---

*Report gemäß db-inspector Skill. Cleanup-Reihenfolge: Backup → DELETE esp_devices → TRUNCATE audit_logs, token_blacklist, logic_execution_history.*
