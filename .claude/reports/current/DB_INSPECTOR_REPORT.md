# DB Inspector Report

**Erstellt:** 2026-03-07
**Modus:** B (Spezifisch: "Database Cleanup - Frischer Start")
**Quellen:** Alle 29 Tabellen in god_kaiser_db

---

## 1. Zusammenfassung
Vollstaendiger Cleanup der Datenbank durchgefuehrt. Alle Laufzeit- und Mock-Daten wurden entfernt.
User-Account (admin), Sensor-Type-Defaults, Notification-Preferences und Plugin-Configs wurden beibehalten.
DB ist bereit fuer frischen Start.

## 2. Analysierte Quellen
| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | Container healthy, 6h uptime |
| pg_isready | OK | Accepting connections |

## 3. Durchgefuehrter Cleanup

### 3.1 Beibehaltene Tabellen
| Tabelle | Rows | Grund |
|---------|------|-------|
| user_accounts | 1 | admin@example.de (Admin-User) |
| sensor_type_defaults | 11 | Sensor-Definitionen (9 Typen) |
| notification_preferences | 1 | User-Einstellung |
| plugin_configs | 4 | Plugin-Konfiguration |
| alembic_version | 1 | Migration-Tracking |

### 3.2 Geleerte Tabellen (TRUNCATE CASCADE)
| Tabelle | Vorher | Nachher |
|---------|--------|---------|
| esp_devices | 1 (Mock #D29D) | 0 |
| sensor_configs | 2 | 0 |
| sensor_data | 43 | 0 |
| esp_heartbeat_logs | 14 | 0 |
| audit_logs | 13 | 0 |
| notifications | 12 | 0 |
| token_blacklist | 4 | 0 |
| dashboards | 1 | 0 |
| subzone_configs | 1 | 0 |
| zones | 1 | 0 |
| cross_esp_logic | 0 | 0 |
| actuator_configs/states/history | 0 | 0 |
| ai_predictions | 0 | 0 |
| diagnostic_reports | 0 | 0 |
| email_log | 0 | 0 |
| esp_ownership | 0 | 0 |
| kaiser_registry | 0 | 0 |
| library_metadata | 0 | 0 |
| logic_execution_history | 0 | 0 |
| plugin_executions | 0 | 0 |
| system_config | 0 | 0 |
| zone_contexts | 0 | 0 |

## 4. Hinweise
- Server Auto-Discovery hat nach erstem TRUNCATE sofort Mock-ESP re-registriert. Zweiter TRUNCATE hat ihn entfernt.
- Falls Mock-ESP-Simulation laeuft, werden neue Eintraege automatisch erstellt.
- DB-Groesse nach Cleanup: 9.8 MB (Schema + Indizes)

## 5. Bewertung
- **Status:** Cleanup erfolgreich
- **Naechste Schritte:** Keine. DB ist bereit fuer frischen Start.
