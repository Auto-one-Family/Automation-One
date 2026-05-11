# Server Cleanup Master-Plan — TM-Verifikation 2026-05-04

> **TM-Auftrag (Robin, 2026-05-04):** Vollstaendige Codebase-Verifikation der 6 Cleanup-Issues
> AUT-224..AUT-229, Konsistenz-Pruefung, Erweiterungen, ordentliche Strukturierung,
> stabile Reihenfolge, Linear-Issue-Updates.
>
> **Methodik:** 6 parallele meta-analyst Sub-Agents pro Cleanup-Bereich gegen `master` + `auto-debugger/work`.
> Keine Implementierung — reine Analyse + Plan + Issue-Korrekturen.

---

## 1. Executive Summary

| Issue | Befund | Korrektur-Bedarf |
|-------|--------|------------------|
| AUT-224 (API) | Alle 5 Cluster bestaetigt + erweitert (kaiser.py 2 Stellen statt 1, debug.py 29 zusaetzlich) | Erweitern + Cross-Link zu AUT-228 |
| AUT-225 (MQTT) | Verschaerft: **0 von 20 Handlern** erben von BaseMQTTHandler (Issue sagt 17+) | Erweitern + Empfehlung "loeschen" |
| AUT-226 (Sensor-Lib) | C1 HIGH SECURITY: BME280-Rohwerte unverarbeitet in DB. C2/C3 falsch | **Korrigieren:** C2 raus, C3 downgraden |
| AUT-227 (DB) | D1 ok, D3 erweitert (9 statt 2 Enum-Spalten), **D2 PHANTOM** | **Klaeren:** D2-Migration existiert weder auf master noch auf auto-debugger/work |
| AUT-228 (Errors) | Alle 4 bestaetigt + erweitert. **E4 = HIGH SECURITY RISK** | Erweitern + E4 als P0 ausgliedern |
| AUT-229 (Tests) | F1 falsch: notifications.py IST getestet. F2 PHANTOM | **Korrigieren:** F1, F2 abhaengig von D2/C2 |

**Zwei kritische Quer-Befunde:**

1. **~~Phantom-Issues~~ KORREKTUR (2026-05-05):** AUT-227 D2, AUT-226 C2 und AUT-229 F2 sind **KEINE Phantome**. `sensor_kind` existiert vollstaendig: Migration (`add_multispeq_sensor_kind_virtual_status`), Model (`sensor.py:278`), DB-Constraint (`CHECK IN ('continuous','snapshot')`), Frontend-Types + 4 Widgets mit `isSnapshot`. MultispeQ-Typen sind in `sensor_type_registry.py:83-107` registriert. **Tatsaechliche Luecke:** `sensor_kind` fehlt in Pydantic-Schemas (`SensorConfigResponse/Create/Update`) und in `_model_to_response()` — die API gibt das Feld nie zurueck, daher ist Frontend-`isSnapshot` immer `false`. Siehe `.claude/reports/current/SENSOR_KIND_ANALYSIS.md`.

2. **Verstecktes Security-P0:** API-Key-Validation in `deps.py:353-359` akzeptiert jeden String mit Prefix `esp_*`/`god_*` ohne DB-Lookup. `api_keys`-Tabelle existiert nicht. AUT-224 A5 und AUT-228 E4 sind das **gleiche Problem**, sollten als ein Security-Ticket konsolidiert werden.

---

## 2. Cross-Issue-Overlaps (verbindlich)

| Overlap | Issues | Konsequenz |
|---------|--------|------------|
| **deps.py vs dependencies.py** | AUT-224 A5 = AUT-228 E4 | Konsolidieren als ein Issue. Beide loesen sich gleichzeitig. |
| **Publisher()-Init vs client.publish()-Bypass** | AUT-224 A3 + AUT-225 B2 | Gleiche Dateien (actuators.py, sensors.py, debug.py, zone_service.py, subzone_service.py). Zusammen migrieren — eine Migration `Publisher() + .client.publish(hardcoded)` -> `injected publisher.publish_<topic>()`. |
| **~~sensor_kind / MultispeQ Phantom~~ KORRIGIERT** | AUT-226 C2 + AUT-227 D2 + AUT-229 F2 | Kein Phantom. DB+Frontend vollstaendig. Luecke: Pydantic-Schemas + `_model_to_response()` geben `sensor_kind` nicht zurueck. Fix: Schema-Felder + Mapper ergaenzen. |
| **send_command Publisher-Path** | AUT-228 E1 + AUT-225 B2 | Wenn B2 Publisher-Returns aendert, beeinflusst es E1's `rejection_reason` Mapping. |

---

## 3. Verbindliche Reihenfolge (4 Phasen, 1 Klaerung)

### Phase 0 — ~~KLAERUNG~~ GEKLAERT (2026-05-05)

**0a) ~~Phantom-Befunde mit Robin abklaeren~~ ERLEDIGT:**

- ~~AUT-227 D2:~~ Migration `add_multispeq_sensor_kind_virtual_status` existiert auf `auto-debugger/work`. Model-Feld `sensor.py:278`. DB-Constraint aktiv. **Status: Done.** Neuer Fix-Bedarf: Schema-Exposition (SensorConfigResponse + _model_to_response).
- ~~AUT-226 C2:~~ MultispeQ-Typen (phi2, fv_fm, npqt, lef, par_internal, ppfd, chlorophyll_spad, leaf_temp, anthocyanin_index) sind in `sensor_type_registry.py:83-107` (SENSOR_TYPE_MAPPING + VIRTUAL_SENSOR_TYPES) registriert. **Status: Done.** Offener Punkt: MultispeQ-SensorConfigs erhalten `sensor_kind='continuous'` statt `'snapshot'` (Import-Endpoint setzt Wert nicht).
- ~~AUT-229 F2:~~ Frontend vollstaendig (SensorKind-Type, 4 Widgets mit isSnapshot). Tests fehlen (0 Coverage). **Status: Offen fuer Test-Coverage, nicht blockiert durch D2/C2.**

**0b) Empfehlung neue Issues anlegen:**

- **AUT-NEW-1 (P0 Security):** API-Key-Validation DB-backed — gemeinsam aus AUT-224 A5 und AUT-228 E4. Eigenes Issue, weil Security != Refactoring.
- **AUT-NEW-2 (Improvement):** Service-Layer-Bypass — 77 direkte Repository-Instanzen in 9 Routern. Out-of-Scope fuer AUT-224 A2, aber strukturell relevant. Eigenes Issue, sonst Scope-Creep.

### Phase 1 — Quick Wins (niedriges Risiko, eigenstaendig)

| # | Issue/Cluster | Warum jetzt | Agent |
|---|---------------|-------------|-------|
| 1 | **AUT-226 C1 (erweitert auf BME280 temp+pressure+humidity)** | **HIGH SECURITY:** Rohwerte landen unverarbeitet in DB, kein Range-Check, falsche %RH-Werte (z.B. 32768 statt 50%). | server-dev |
| 2 | **AUT-NEW-1 (API-Key Security)** = AUT-224 A5 + AUT-228 E4 | HIGH Security, einfachster Fix-Pfad: `sensor_processing.py:32` ist **einziger** Importer von `dependencies.py`. | server-dev + db-inspector |
| 3 | **AUT-225 B3 (TopicBuilder erweitern)** | Vorbedingung fuer A3+B2-Migration. Niedriges Risiko, kein Verhalten geaendert. | mqtt-dev |
| 4 | **AUT-227 D3 (erweitert auf 9 Enum-Spalten)** | DB-Constraints sind reine Migrations, keine Code-Aenderung. Pre-Check `SELECT DISTINCT ...` vor jedem Constraint. | server-dev + db-inspector |

### Phase 2 — Strukturell (mittleres Risiko, abhaengig von Phase 1)

| # | Issue/Cluster | Abhaengigkeiten | Agent |
|---|---------------|-----------------|-------|
| 5 | **AUT-225 B2 + AUT-224 A3 zusammen** | Phase 1.3 (TopicBuilder) muss durch | mqtt-dev -> server-dev |
| 6 | **AUT-225 B4 (DiscoveryHandler entfernen)** | ESP32-Firmware nutzt Topic NICHT mehr (verifiziert) — sicher | server-dev |
| 7 | **AUT-228 E1 (cmd_result rejection_reason)** | Phase 2.5 (Publisher-Returns) | server-dev + frontend-dev (Co-Migration) |
| 8 | **AUT-228 E3 (KaiserNotFoundException)** | Slots 5790/5791. 5 Stellen statt 1 in kaiser.py | server-dev |
| 9 | **AUT-224 A1 (response_model Pydantic)** | Schemas existieren bereits, mechanische Migration | server-dev |
| 10 | **AUT-224 A4 (Kaiser-Router KaiserService)** | E3 muss durch (gleiche Datei) | server-dev |
| 11 | **AUT-227 D1 (assigned_subzones)** | Pre-Check DB: `SELECT count(*) FROM sensor_configs WHERE jsonb_array_length(assigned_subzones::jsonb) > 0;` | db-inspector -> server-dev |
| 12 | **AUT-228 E2 (broad except)** | Reduziert sich nach D1-Cleanup (Subzone-Pfade) | server-dev |
| 13 | **AUT-224 A2 (DB-Queries -> Services)** | `error_service.py` neu, koordinieren mit AUT-229 F3 | server-dev |
| 14 | **AUT-225 B1 — ENTSCHEIDUNG** | **Empfehlung: BaseMQTTHandler loeschen** (0/20 Adoption, Migration-Kosten zu hoch) | server-dev |

### Phase 3 — Tests (nach Code-Aenderungen)

| # | Issue/Cluster | Reihenfolge-Begruendung | Agent |
|---|---------------|------------------------|-------|
| 15 | **AUT-229 F3 (audit_backup + audit_retention)** | Eigenstaendig, kritisch (Daten-Retention) | server-dev |
| 16 | **AUT-229 F1 (kaiser + plugins + sequences + zone_context + diagnostics REST)** | Sicherheitsrelevant. **Korrektur:** notifications.py + zones.py rausnehmen aus Issue (sind getestet). | server-dev |
| 17 | **AUT-229 F2 (VIRTUAL_SENSOR_TYPES + BME280 + CO2 + Light + Flow)** | Phantom-Anteil raus. NICHT abhaengig von D2/C2 — Coverage fuer existierende Typen ergaenzen. | server-dev |
| 18 | **AUT-229 F4 (Test-Struktur)** | Kosmetisch | server-dev |

### Phase 4 — Erweitert (out-of-scope der 6 Issues)

- **AUT-NEW-2 (Service-Layer-Bypass)**: 77 Repo-Direktnutzungen — strukturell, separates Issue.
- **MultispeQ-Pipeline (AUT-211..222)**: Nach Klaerung Phase 0a — falls Code geplant aber noch nicht da, in MultispeQ-Issues integrieren statt in Cleanup.

---

## 4. Issue-Korrekturen (verbindlich)

### AUT-226

- **C1 erweitern:** BME280 hat NICHT NUR Humidity-Lücke, sondern auch `bme280_temp` und `bme280_pressure` ohne Processor (Mapping geht ins Leere). Empfehlung: BME280TemperatureProcessor + BME280PressureProcessor als Subclasses von BMP280-Pendants (Bosch-Chip-Familie).
- **~~C2 entfernen~~ KORREKTUR (2026-05-05):** MultispeQ-Typen EXISTIEREN in `sensor_type_registry.py:83-107` (SENSOR_TYPE_MAPPING + VIRTUAL_SENSOR_TYPES + _MULTISPEQ_VALUE_DEFS). Tatsaechliches Problem: MultispeQ-SensorConfigs erhalten `sensor_kind='continuous'` (DB-Default) statt `'snapshot'`, weil Import-Endpoint den Wert nicht setzt.
- **C3 downgraden:** `vpd` ist by-design VIRTUAL (Berechnung in `vpd_calculator.py`). Kein Bug. Maximal Doku-Kommentar in `sensor_type_registry.py`.

### AUT-227

- **~~D2 BLOCKIEREN~~ KORREKTUR (2026-05-05):** Migration `add_multispeq_sensor_kind_virtual_status` existiert vollstaendig (VARCHAR(20), CHECK-Constraint, Model-Feld). **D2 = Done.** Neues Sub-Issue: `SensorConfigResponse/Create/Update` + `_model_to_response()` um `sensor_kind`-Feld ergaenzen (API gibt Wert nicht zurueck → Frontend-`isSnapshot` immer false).
- **D3 erweitern:** 9 zusaetzliche Enum-Spalten ohne CheckConstraint:
  - `sensor.py:94` interface_type
  - `sensor.py:184` operating_mode
  - `sensor.py:259` + `actuator.py:191` config_status
  - `sensor.py:378` processing_mode
  - `sensor.py:384` quality
  - `sensor.py:407` + `actuator.py:341, 465` data_source
  - `actuator.py:299` state
  - `actuator.py:416` command_type
  - `sensor_type_defaults.py:71` operating_mode

### AUT-228

- **E1 Klassennamen-Korrektur:** `ActuatorSendCommandResult` (nicht `ActuatorCommandResult`).
- **E1 erweitert:** Service kennt intern bereits 3 Failure-Pfade (`SAFETY_REJECTED` L537, `ESP_NOT_FOUND` L600, `_persist_publish_failure` L658) — werden als generisches `success=False` zurueckgegeben. Mapping existiert, wird nur nicht propagiert.
- **E3 erweitert:** kaiser.py hat **5 HTTPExceptions** statt 1 (Z. 73, 100, 121, 126, 164). Vorgeschlagene Slots: KaiserNotFoundException (5790), KaiserAlreadyExistsException (5791).
- **E4 ausgliedern als AUT-NEW-1.**

### AUT-229

- **F1 Korrektur:** `notifications.py` IST getestet (5 Test-Files). `zones.py` ist gut abgedeckt. Beide aus der Liste streichen.
- **F1 erweitert:** 14 weitere ungetestete Router (ai, audit, backups, component_export, dashboards, debug, device_context, errors, intent_outcomes, logs, schema_registry, sensor_type_defaults, users, zone) — eigenes Issue oder Phase-3-Erweiterung.
- **F2 KORREKTUR (2026-05-05):** Frontend-Implementierung vollstaendig (SensorKind-Type `types/index.ts:231`, 4 Widgets mit `isSnapshot`). 0 Test-Coverage fuer `sensor_kind`. Tests schreiben NACH Schema-Fix (Fix 1+2), sonst false-green. VIRTUAL_SENSOR_TYPES + BME280/CO2/Light/Flow-Coverage ist davon unabhaengig und sofort testbar.
- **F3 Service-Coverage erweitern:** 21 weitere ungetestete Services (ai_service, dashboard_service, kaiser_service, logic_service, ...).

### AUT-225

- **B1 Empfehlung verschaerfen:** 0/20 Inheritance-Rate. Empfehlung **loeschen** statt migrieren — Migration-Kosten hoch, Mehrwert ungewiss (bestehende Handler stabil).
- **B3 erweitern:** weitere hardcoded Topics: `scheduler.py:1632`, `simulation/actuator_handler.py:280`, `actuators.py:1051`.
- **B4 sicher:** ESP32-Firmware publiziert NICHT mehr auf legacy Discovery-Topic (verifiziert in `El Trabajante/src/`). Removal risikofrei.

### AUT-224

- **A4 erweitern:** kaiser.py hat **2 Stellen** mit direkter Repo-Nutzung (Z. 117 UND Z. 158), nicht nur eine.
- **A2 erweitern:** `debug.py:29` hat ebenfalls direkte SQLAlchemy-Imports — gleiches Anti-Pattern.

---

## 5. Risiken (verbindlich)

| Risiko | Mitigation |
|--------|------------|
| **BME280 Datenkorruption (existierend)** | C1-Fix beseitigt nicht historische falsche Daten. DB-Audit empfehlen: `SELECT count(*) FROM sensor_data WHERE sensor_kind ILIKE 'bme280%' AND quality='error';` plus visuelle Pruefung der Werte. |
| **API-Key-Migration: ESP-Auth-Bruch** | Feature-Flag `LEGACY_API_KEY_PREFIX_ALLOWED=true`. Logging der Legacy-Verwendung. Sunset nach Migration. |
| **PATCH-Endpoints `body.items()` -> Pydantic** | `model_dump(exclude_unset=True)` zwingend, sonst Verhaltensaenderung (None-Loeschen-Logik). |
| **assigned_subzones DROP** | Pre-Check: `SELECT count(*) FROM sensor_configs WHERE jsonb_array_length(assigned_subzones::jsonb) > 0;` Default `[]` — historisch wahrscheinlich leer. |
| **CheckConstraint Drift** | Vor Migration: `SELECT DISTINCT <column>` pro Spalte. Falls ungueltige Werte: zuerst migrieren, dann constrainen. |
| **DiscoveryHandler-Removal** | Politisch nur, wenn Robin Firmware-Kompatibilitaets-Garantie aufgibt. Technisch risikofrei. |
| **BaseMQTTHandler-Removal** | Toter Code — risikofrei. Falls Migration gewuenscht: verify-plan-Gate fordern. |
| **Frontend-Vertraeglichkeit (E1 + E3)** | Frontend erwartet `detail` aus HTTPException. Typisierte Exceptions liefern `to_dict()` mit `error_code`/`numeric_code`. Frontend-Side-by-side-Migration. |
| **sensor_kind API-Gap (NEU 2026-05-05)** | Frontend-`isSnapshot` ist immer `false` weil `SensorConfigResponse` kein `sensor_kind`-Feld hat. MultispeQ-Widgets zeigen falsches UI (Linechart statt Scatter). Fix: Schema + `_model_to_response()` ergaenzen. Kleiner Fix, grosser UI-Impact. |

---

## 6. Verifikationsplan (per Phase)

Pro Phase ist die Verifikation aus `.claude/CLAUDE.md` Pflicht:

```
ESP32 Firmware:    cd "El Trabajante" && pio run -e seeed
Server Backend:    cd "El Servador/god_kaiser_server" && pytest --tb=short -q
Server Lint:       cd "El Servador/god_kaiser_server" && ruff check .
Frontend Build:    cd "El Frontend" && npm run build
Frontend Lint:     cd "El Frontend" && npx vue-tsc --noEmit
Docker:            docker compose ps
```

Pro Phase **plus** verify-plan-Gate aus `.claude/skills/verify-plan/SKILL.md`.

---

## 7. Naechste Schritte

1. **Robin klaeren:** Phantom-Behauptungen D2/C2/F2 (10 min).
2. **Robin entscheiden:** AUT-NEW-1 (Security) und AUT-NEW-2 (Service-Layer) als eigene Issues anlegen?
3. **Linear-Updates** (parallel): Kommentare an AUT-224..AUT-229 mit Verweis auf diesen Master-Plan.
4. **Phase-1-Start (nach Klaerung):** AUT-226 C1 zuerst (HIGH Security — falsche Daten in DB).
5. **TM-Briefing-Update** (`.technical-manager/TECHNICAL_MANAGER.md`): Cleanup-Block in "Aktive Prioritaeten" einfuegen.

---

*Erstellt: 2026-05-04 — TM-Verifikation 6 paralleler meta-analyst Sub-Agents gegen master + auto-debugger/work.*
*Verlinkt aus: AUT-224, AUT-225, AUT-226, AUT-227, AUT-228, AUT-229.*
