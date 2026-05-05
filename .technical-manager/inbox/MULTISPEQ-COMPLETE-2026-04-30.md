# MultispeQ/PhotosynQ + Pflanzen-Wissensschicht — Implementierung abgeschlossen

**Datum:** 2026-04-30  
**Branch:** `auto-debugger/work`  
**Status:** Alle 12 Issues committed, alle auf "In Review" in Linear

---

## Commit-Übersicht (12 Commits, chronologisch)

| Commit | Issue | Beschreibung |
|--------|-------|-------------|
| `5c39c4c1` | AUT-211 + AUT-222 | Wave 1: sensor_kind + virtual ESP + plants entity |
| `1a913b91` | AUT-214 | Logic Engine metadata_filter condition evaluator |
| `b5ca1098` | AUT-218 | Frontend Snapshot-Kennzeichnung in Widget-Komponenten |
| `51061b20` | AUT-212 | MultispeQ parser library + MULTI_VALUE_SENSORS registry |
| `e0789fcc` | AUT-217 | Ingress-Endpoint POST /multispeq/import + IngestService |
| `0898e298` | AUT-219 | Cannabis-Trigger LPAP-01/02 CSC-01/02 GO-01/02/03 (enabled=false) |
| `5e623143` | AUT-213 | Frontend Audits-Tab + Upload-Modal + API-Client |
| `d472b28f` | AUT-215 | GET /aggregates + GET /correlation Endpoints |
| `d6aa514e` | AUT-221 | Plant-Tab + Plant-Detail-Panel (Frontend) |
| `56ee8466` | AUT-221 | Plant CRUD-Endpoints + lifecycle-event + WS-Broadcast (Server) |
| `4d2f3585` | AUT-220 | comparison-boxplot + correlation-scatter Dashboard-Widgets |
| `0e5772f1` | AUT-216 | Operator-Anleitung MultispeQ-Messprotokoll + Upload |

---

## USER-HAND (manuelle Schritte erforderlich)

### CRITICAL: Datenbank

1. **`alembic upgrade head`** — 2 neue Migrationen aktivieren:
   - `add_multispeq_sensor_kind_virtual_status` (sensor_kind + CHECK constraint)
   - `add_plants_entity_lifecycle_events` (plants, plants_cannabis_extension, plant_lifecycle_events, sensor_data.plant_id)

2. **Rollback-Test:** `alembic downgrade -1` + `alembic upgrade head` verifizieren

3. **Python-Pakete:** `pip install qrcode pillow` im Server-Container (für QR-Code-PNG-Generation in plants.py)

### Cannabis-Trigger aktivieren (NACH Baseline-Kampagne)

4. **Seed-Skript ausführen:** `poetry run python scripts/seed_multispeq_triggers.py`
   - 7 Trigger werden als `enabled=False` eingespielt
   - Trigger manuell aktivieren ERST nach 30 gesunden Messungen (Woche 3 Blütephase)
   - **HINWEIS:** Trigger-Conditions verwenden Platzhalter `esp_id="MOCK_MULTISPEQ"`. Nach Aktivierung auf reales virtuelles MultispeQ-Device mappen.

### PhotosynQ-Projekt-Setup (Operator-seitig)

5. Im PhotosynQ-Projekt Custom-Field `AutomationOne-Plant-ID` anlegen (Anleitung: `docs/operator/multispeq-upload-anleitung.md`)

### OQ-2 (offene Frage — TM-Entscheidung)

6. `kaiser_id` auf `plants.kaiser_id` ist aktuell `VARCHAR(50) nullable` — konsistent mit `esp_devices.kaiser_id`. Falls formal eine Tenant-Tabelle eingeführt wird, ist eine Alembic-Migration für FK-Constraint nötig. Derzeit kein Blocking-Issue.

---

## Architektur-Übersicht (neu implementiert)

```
PhotosynQ App
    ↓ CSV/JSON Export
POST /api/v1/sensors/multispeq/import
    ↓ IngestService (multispeq_ingest_service.py)
        ├── parse_photosynq_measurement() [parser.py]
        ├── Plant-Matching via AutomationOne-Plant-ID Custom-Field
        ├── Dedup: measurement_id SHA-256 + ON CONFLICT DO NOTHING
        ├── INSERT sensor_data (9 Typen × Messung, sensor_kind='snapshot')
        ├── Logic Engine evaluate_sensor_data() [fire-and-forget]
        │       └── metadata_filter_evaluator.py [7 Operatoren]
        │       └── Cannabis-Trigger LPAP-01/02 CSC-01/02 GO-01/02/03 [enabled=false]
        └── WS-Broadcast sensor_data events

GET /api/v1/sensors/multispeq/aggregates  → Boxplot-Daten (percentile_cont)
GET /api/v1/sensors/multispeq/correlation → Scatter-Daten (x/y aus sensor_metadata)

GET/POST/PATCH/DELETE /api/v1/plants/    → Plant-CRUD (QR-Code PL-XXXXXXXX)
POST /api/v1/plants/{id}/lifecycle-event → WS-Broadcast plant_lifecycle_update
GET  /api/v1/plants/{id}/measurements   → Phi2-Zeitreihe für Plant-Panel

Frontend:
- SensorsView: 3 Tabs (Inventar | Pflanzen | Audits)
- Plant-Detail-Panel: 4 Sektionen (Stammdaten, Lifecycle, MultispeQ-Chart, Audit)
- Audits-Tab: Upload-Formular + needs_review-Zuordnung
- Dashboard: BoxplotWidget + CorrelationScatterWidget
- Snapshot-Kennzeichnung in allen bestehenden Widgets (SensorCard, HistoricalChart, etc.)
```

---

## Sensor-Typen (9 MultispeQ-Typen, GPIO 200-208)

| GPIO | sensor_type | Einheit | Bereich |
|------|-------------|---------|---------|
| 200 | phi2 | Φ | [0, 1] |
| 201 | fv_fm | Fv/Fm | [0, 1] |
| 202 | npqt | NPQt | [0, 10] |
| 203 | lef | µmol e⁻/m²/s | [0, 500] |
| 204 | par_internal | µmol/m²/s | [0, 2500] |
| 205 | ppfd | µmol/m²/s | [0, 2500] |
| 206 | chlorophyll_spad | SPAD | [0, 100] |
| 207 | leaf_temp | °C | [-10, 60] |
| 208 | anthocyanin_index | ARI | [0, 5] |

---

## Neue Dateien/Module (vollständige Liste)

### Server
- `src/integrations/multispeq/parser.py` — Parse + Validate + Expand
- `src/integrations/multispeq/tests/test_parser.py` — 13 Unit-Tests
- `src/services/multispeq_ingest_service.py` — IngestService + ImportSource
- `src/api/v1/multispeq.py` — Import-Endpoint + Aggregat/Korrelation + assign-plant
- `src/db/models/plant.py` — Plant, PlantCannabisExtension, PlantLifecycleEvent
- `src/db/repositories/plant_repo.py` — PlantRepository
- `src/schemas/plant.py` — Plant-Schemas + LifecycleEventCreate/Response
- `src/api/v1/plants.py` — Plant-CRUD + lifecycle-event + zone-summary
- `src/services/logic/conditions/metadata_filter_evaluator.py` — 7 Operatoren
- `src/db/models/logic_validation.py` — MetadataFilterCondition Pydantic-Schema
- `scripts/seed_multispeq_triggers.py` — 7 Cannabis-Trigger
- `alembic/versions/add_multispeq_sensor_kind_virtual_status.py`
- `alembic/versions/add_plants_entity_lifecycle_events.py`
- `docs/operator/multispeq-upload-anleitung.md`

### Frontend
- `src/api/multispeq.ts` — MultispeQ API-Client
- `src/api/plants.ts` — Plants API-Client
- `src/shared/stores/plants.store.ts` — Plants Pinia Store
- `src/components/plants/PlantDetailPanel.vue` — SlideOver Panel
- `src/components/plants/PlantCreateModal.vue` — Create-Formular
- `src/components/plants/PlantPhaseChangeModal.vue` — Phase-Wechsel
- `src/components/plants/plantLabels.ts` — Deutsche Labels
- `src/components/dashboard-widgets/BoxplotWidget.vue` — Boxplot-Widget
- `src/components/dashboard-widgets/CorrelationScatterWidget.vue` — Scatter-Widget
- `src/integrations/multispeq/parser.py` — Parser

### Modifiziert (wesentlich)
- `src/sensors/sensor_type_registry.py` — 9 MultispeQ-Typen + MULTI_VALUE_SENSORS
- `src/mqtt/handlers/heartbeat_handler.py` — virtual-Status-Guards
- `src/services/logic_engine.py` + `logic_service.py` — MetadataFilterEvaluator registriert
- `src/views/SensorsView.vue` — 3 Tabs (Inventar | Pflanzen | Audits)
- `src/types/index.ts` — Plant, PlantPhase, sensor_kind, MultispeQ-Typen
- `src/utils/sensorDefaults.ts` — 9 neue Einträge
- `src/composables/useDashboardWidgets.ts` — 2 neue Widget-Typen an 5 Stellen
- `src/shared/stores/dashboard.store.ts` — WidgetType-Union +2
