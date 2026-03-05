# Session Briefing — Sensor-Konfigurationspanel Roadmap

**Erstellt:** 2026-03-04  
**Kontext:** roadmap-sensor-konfig-panel-fixes-2026-03-04.md  
**Modus:** Briefing + System-Status

---

## 1. System-Status

| Check | Ergebnis |
|-------|----------|
| Docker Stack | ✅ Alle 11 Container Up (postgres, mqtt, el-servador, el-frontend, monitoring) |
| Backend Health | ✅ 200 OK (`/api/v1/health/live`) |
| AutoOps Health | ✅ 8/9 Checks passed, Auth OK |

**Vorbedingungen für Roadmap erfüllt:** Stack läuft, Backend erreichbar.

---

## 2. Roadmap-Zusammenfassung

**Ziel:** Sensor-Konfigurationspanel vollständig funktional machen (Subzone, sensorDbId, i2c_address, Cleanup).

| Phase | Schritte | Priorität | Agent |
|-------|----------|-----------|-------|
| **Phase 1** | Subzone: Merge statt Replace (1.1), subzone_id in Schema + create_or_update (1.2), GET mit subzone_id (1.3), Frontend Typ (1.4) | KRITISCH | server-dev → frontend-dev |
| **Phase 2** | sensorDbId aus Response (2.1), i2c_address als Integer (2.2) | HOCH | frontend-dev |
| **Phase 3** | Subzone-Cleanup bei Sensor-Löschen (S23) | MITTEL | server-dev |
| **Phase 4** | Grafana-Regel prüfen (optional) | NIEDRIG | — |

**Empfohlene Reihenfolge:** 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 → 3 → 4

---

## 3. Strategie-Empfehlung

### Nächste Schritte (Implementierung)

1. **server-dev** — Phase 1.1 + 1.2 + 1.3:
   - `SubzoneService._upsert_subzone_config`: Merge statt Replace bei bestehender Subzone
   - `SensorConfigCreate` + `create_or_update_sensor`: subzone_id verarbeiten
   - `GET /sensors/{esp_id}/{gpio}`: subzone_id anreichern (SubzoneRepository.get_subzone_by_gpio)

2. **frontend-dev** — Phase 1.4 + 2.1 + 2.2:
   - `SensorConfigCreate` Typ um subzone_id erweitern
   - Nach `createOrUpdate`: `sensorDbId.value = result.id`
   - `i2c_address` als Integer senden (parseInt mit radix 16)

3. **server-dev** — Phase 3:
   - `SubzoneService.remove_gpio_from_all_subzones(esp_id, gpio)` in `delete_sensor` aufrufen

### Bei Problemen

| Symptom | Agent |
|---------|-------|
| Subzone wird nicht gespeichert | server-debug (Logs: create_or_update_sensor, SubzoneService) |
| 422 bei I2C-Sensor Save | frontend-debug (Request Payload prüfen) |
| Verwaiste GPIO in Subzone | db-inspector (subzone_configs.assigned_gpios) |

---

## 4. Referenzen

| Dokument | Pfad |
|----------|------|
| Roadmap | `.claude/reports/current/roadmap-sensor-konfig-panel-fixes-2026-03-04.md` |
| Vollanalyse | `.claude/reports/current/VOLLANALYSE-SENSOR-KONFIG-PANEL-FULL-STACK-2026-03-04.md` |
| AutoOps Report | `El Servador/god_kaiser_server/src/autoops/reports/autoops_session_6a457c9b_*.md` |

---

*Briefing erstellt von system-control. Bereit für Dev-Agents (server-dev, frontend-dev).*
