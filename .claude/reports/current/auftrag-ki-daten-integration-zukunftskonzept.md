# Auftrag: KI-Daten-Integration — Zukunftsfaehiges Gesamtkonzept

**Ziel-Repo:** auto-one
**Kontext:** Baut auf dem Komponenten-Tab Wissensinfrastruktur-Auftrag (K1-K4 + D0) auf. Ergaenzt, vertieft und schliesst alle identifizierten Luecken fuer eine zukunftsfaehige, evolutionsfaehige KI-Integration.
**Prioritaet:** Strategisch (Roadmap-Dokument, kein sofort-umsetzbar-Zwang)
**Datum:** 2026-03-03
**Forschungsbasis:** 28 Praxis-Quellen + 16 wissenschaftliche Papers + 6 neue Semantic Scholar Papers (2025)
**Abhaengigkeiten:** Komponenten-Tab Wissensinfrastruktur (K1-K4) MUSS VORHER oder PARALLEL laufen

---

## Robins Vision

> "Jede einzelne Komponente nochmal genau pruefen und vervollstaendigen, sodass ein zukunftsfaehiges Konzept entsteht an dem man auch immer weiterarbeiten kann — je nach Kontext was man gerade in Produktion hat."

---

## Komponentenanalyse: Was K1-K4 GUT macht und was FEHLT

### K1 — Flache Inventar-Tabelle: SOLIDE, 3 Luecken

**Was gut ist:**
- ThingsBoard Entity Table Widget als Industriestandard korrekt gewaehlt
- useZoneGrouping.ts als Datenquelle, kein neues Backend noetig
- Spalten-Visibility, Filter, Sortierung, Pagination — alles drin
- DeviceDetailPanel als SlideOver — gutes UX-Pattern

**Was fehlt:**

| # | Luecke | Warum wichtig | Aufwand |
|---|--------|---------------|---------|
| K1-L1 | **Semantic Search** — natuerlichsprachliche Suche ("alle Temperatursensoren mit Wartung faellig") | Freitext-Suche matcht nur exakte Strings, keine Semantik. KI-Nutzbarkeit erfordert natuerliche Sprache | ~4h |
| K1-L2 | **AI Health Score** — pro Geraet ein berechneter Gesundheits-Score (0-100) | Offline-Dauer, Fehlerrate, Alter, Wartungsstatus → ein Score. Fuer Dashboard-Priorisierung und Anomalie-Erkennung | ~3h |
| K1-L3 | **Predictive Maintenance Indicator** — "voraussichtlich X Tage bis Ausfall" | Basierend auf Runtime-Stats + historischen Ausfallmustern. Nicht ML sondern regelbasiert (Phase 1) | ~2h |

### K2 — Schema-Registry: GUT KONZIPIERT, 5 Luecken

**Was gut ist:**
- JSON Schema pro Geraetetyp ist der richtige Ansatz
- Frontend-only fuer V1 ist pragmatisch
- Basis-Schema mit Vererbung (allOf) ist korrekt
- SchemaForm.vue als leichtgewichtige Formular-Generierung

**Was fehlt:**

| # | Luecke | Warum wichtig | Aufwand |
|---|--------|---------------|---------|
| K2-L1 | **Schema-Versionierung** — `_schema_version` Feld in jedem JSONB-Dokument | Wenn neue Felder dazukommen (Kalibrierungs-Offset, Genauigkeit, Datenblatt-URL), muessen alte Daten migriert werden. Ohne Versionsnummer weiss niemand welches Format vorliegt | ~2h |
| K2-L2 | **Lazy Migration Pattern** — Automatische Migration beim ersten Lesen alter Daten | Batch-Migrationen locken die DB. Lazy Migration (beim API-Read ein `migrate_metadata()` aufrufen) ist performanter und sicherer | ~3h |
| K2-L3 | **Backend-Validierung** — `python-jsonschema` Validierung beim JSONB-Write | Aktuell wird nur im Frontend validiert. Wenn ein MCP-Server oder API-Client Metadaten schreibt, gibt es keine Validierung. Backend-Validierung als optionaler Guard | ~3h |
| K2-L4 | **WoT Thing Model Mapping** — JSON Schema → WoT Thing Model Konvertierung | Die Schema-Registry definiert Geraetetypen lokal. WoT Thing Model ist der W3C-Standard fuer maschinenlesbare Geraetebeschreibungen. Ein Export-Adapter der Schema-Registry-Eintraege in WoT TM uebersetzt schafft Standard-Compliance | ~4h |
| K2-L5 | **Backend Schema-Registry API** — `GET /api/v1/schema-registry/{device_type}` | Damit neue Sensortypen ohne Frontend-Deploy hinzugefuegt werden koennen. MCP-Server und externe Agenten koennen das Schema direkt abfragen | ~4h |

### K3 — Zone-Context: GUTE BASIS, 4 Luecken

**Was gut ist:**
- Zone als eigenstaendige Daten-Entitaet (nicht auf Sensor-Ebene) ist forschungsbestaetigt (CEA Digital Twin Papers P2-P4)
- JSONB `custom_data` fuer Erweiterbarkeit
- Anbau-Zyklus-Archivierung (`cycle_history`) ist vorausschauend
- REST-API mit Upsert ist pragmatisch

**Was fehlt:**

| # | Luecke | Warum wichtig | Aufwand |
|---|--------|---------------|---------|
| K3-L1 | **KPI-Berechnungen** — VPD-Erreichung, DLI-Tracking, Wachstumsrate | Zone-Context speichert statische Daten (Pflanzenanzahl, Sorte), aber keine berechneten KPIs. KI braucht beides: Kontext + Performance-Metriken | ~4h |
| K3-L2 | **Rezept/SOP-Verknuepfung** — welche Naehrstoffe bei welcher Phase | Pro Wachstumsphase gibt es optimale Parameter (EC, pH, Temperatur, Licht). Diese als "Rezept" pro Zone speichern ermoeglicht Soll/Ist-Vergleiche | ~3h |
| K3-L3 | **Photo-Dokumentation** — Fotos pro Zone/Zyklus als visuelle Dokumentation | Pflanzengesundheit, Schaedlinge, Erntezustand — Fotos sind fuer KI-Analyse (Computer Vision) und fuer menschliche Dokumentation wichtig | ~5h |
| K3-L4 | **Temporaler Kontext** — Wetter-/Jahreszeiten-Integration fuer Gewaechshaeuser | Fuer nicht-klimatisierte Raeume beeinflussen Aussentemperatur und Lichtverhaeltnisse die Sensor-Readings. Kontext fuer KI-Anomalie-Erkennung | ~3h |

### K4 — AI-Ready Export: GRUNDSTEIN, 6 KRITISCHE Luecken

**Was gut ist:**
- WoT-TD-inspiriertes JSON Format
- MCP-Tool-Mapping Tabelle als Vorarbeit
- Trennung Component Export + Zone Export + System Description

**Was fehlt — hier ist der groesste Handlungsbedarf:**

| # | Luecke | Warum wichtig | Aufwand |
|---|--------|---------------|---------|
| K4-L1 | **Embedding-Infrastruktur (pgvector)** — Sensor-Metadaten als Vektoren in PostgreSQL | RAG-Pipeline braucht Vektor-Suche. pgvector als PostgreSQL-Extension nutzt bestehende Infrastruktur. Kein Chroma/Pinecone noetig | ~4h |
| K4-L2 | **RAG-Pipeline Architektur** — Wie ein LLM tatsaechlich die Daten konsumiert | K4 exportiert JSON aber sagt nicht WIE ein LLM darauf zugreift. RAG-Pipeline: Embedding → Retrieval → Prompt Assembly → LLM → Response | ~8h |
| K4-L3 | **MCP-Server Implementation** — nicht nur "Vorbereitung" sondern konkreter Server | ThingsPanel-MCP und Home Assistant MCP Server zeigen: Ein funktionierender MCP-Server braucht 5-10 Tools, Resources, und Prompts. Die "Vorbereitung" in K4.3 reicht nicht | ~12h |
| K4-L4 | **Real-Time Streaming Export** — WebSocket/SSE fuer Live-Daten | Der Export ist aktuell REST-only (Request/Response). Fuer KI-Agenten die kontinuierlich reagieren muessen braucht es einen Streaming-Kanal | ~4h |
| K4-L5 | **Natural Language Query Interface** — "Wie ist die Temperatur in Zone A?" direkt beantworten | Der MCP-Server exponiert Tools, aber es fehlt ein natuerlichsprachliches Query-Interface das auch ohne MCP-Client funktioniert (z.B. als REST-Endpoint oder Chat-UI) | ~6h |
| K4-L6 | **Multi-Sensor-Korrelation im Export** — Nicht nur einzelne Sensoren sondern Muster | "VPD-Trend der letzten 24h" braucht Temp + Humidity kombiniert. Der Export liefert einzelne Sensoren, aber keine Cross-Sensor-Analysen | ~4h |

---

## Neues Layer-Modell: 5 Schichten fuer KI-Integration

Basierend auf der Forschungsanalyse (LUMEN Paper 2025, IoT-MCP 2025, IoT-ASE 2025, PGDT 2025) ergibt sich ein 5-Schichten-Modell:

```
┌──────────────────────────────────────────────────────────┐
│ Layer 4: Feedback & Learning                             │
│ User-Bestaetigungen, Modell-Verbesserung, Active Learning│
├──────────────────────────────────────────────────────────┤
│ Layer 3: Interaction (MCP Server, RAG, NLQ)              │
│ Natuerlichsprachliche Abfragen, Agent-Steuerung          │
├──────────────────────────────────────────────────────────┤
│ Layer 2: Intelligence (Anomalie, Prediction, Empfehlung) │
│ Isolation Forest, Prophet, Zone-KPIs, Health Scores      │
├──────────────────────────────────────────────────────────┤
│ Layer 1: Semantic Layer (Knowledge Graph, Ontologie)     │
│ Brick Schema, WoT TD, Embeddings, Schema-Versioning     │
├──────────────────────────────────────────────────────────┤
│ Layer 0: Data Foundation (K1-K3 aus bestehendem Auftrag) │
│ Inventar-Tabelle, Schema-Registry, Zone-Context          │
└──────────────────────────────────────────────────────────┘
```

### Warum dieses Modell zukunftsfaehig ist

- **Layer 0** ist der bestehende Auftrag (K1-K3) — wird gerade implementiert
- **Layer 1-4** koennen INKREMENTELL ergaenzt werden je nach Bedarf
- Jeder Layer hat klare Ein-/Ausgaben und kann unabhaengig weiterentwickelt werden
- Neue Sensortypen → nur Layer 0 (Schema-Registry) + Layer 1 (Embedding) aendern
- Neue KI-Modelle → nur Layer 2 aendern
- Neue Interaktionswege → nur Layer 3 aendern

---

## Layer 0: Data Foundation — Ergaenzungen zu K1-K4

> K1-K3 bleiben wie im bestehenden Auftrag. Hier nur die ERGAENZUNGEN.

### L0.1: Schema-Versionierung (ergaenzt K2)

**Datei:** `El Servador/god_kaiser_server/src/utils/metadata_migration.py` (**NEU**)

Jedes JSONB-Metadaten-Dokument bekommt ein `_schema_version` Feld:

```python
CURRENT_SCHEMA_VERSIONS = {
    "sensor_metadata": 1,
    "actuator_metadata": 1,
    "device_metadata": 1,
    "zone_context": 1,
}

def migrate_metadata(data: dict, entity_type: str) -> dict:
    """Lazy Migration: Migriert JSONB-Daten auf aktuelle Schema-Version.

    Wird beim API-Read aufgerufen. Aendert die DB nur wenn noetig.
    """
    version = data.get("_schema_version", 0)
    target = CURRENT_SCHEMA_VERSIONS[entity_type]

    if version >= target:
        return data

    # Migrations-Chain (analog zu Alembic, aber fuer JSONB)
    if entity_type == "sensor_metadata":
        if version < 1:
            data.setdefault("accuracy", {})
            data.setdefault("datasheet_url", None)
            data["_schema_version"] = 1

    return data
```

**Regeln:**
1. Neue Felder IMMER optional mit Default
2. Felder NICHT umbenennen — deprecated markieren, neues Feld hinzufuegen
3. Migration erfolgt lazy (beim Lesen), nicht als Batch

### L0.2: Backend Schema-Registry API (ergaenzt K2)

**Datei:** `El Servador/god_kaiser_server/src/api/v1/schema_registry.py` (**NEU**)

> **IST-Zustand:** Device-Schemas existieren aktuell NUR im Frontend unter `El Frontend/src/config/device-schemas/` (base.schema.json, sensor/*.schema.json, actuator/*.schema.json). Das Backend hat KEIN `config/device-schemas/` Verzeichnis.
>
> **Router-Registrierung:** Muss in `src/api/v1/__init__.py` importiert und via `api_v1_router.include_router(schema_registry_router)` eingebunden werden. Der `api_v1_router` wird in `main.py` mit `prefix="/api"` gemountet — daher wird der finale Pfad: `/api/v1/schema-registry/...`

```python
router = APIRouter(prefix="/v1/schema-registry", tags=["schema-registry"])

@router.get("/")
async def list_schemas() -> list[DeviceSchemaResponse]:
    """Alle verfuegbaren Geraetetyp-Schemas."""

@router.get("/{device_type}")
async def get_schema(device_type: str) -> DeviceSchemaResponse:
    """Schema fuer einen bestimmten Geraetetyp."""

@router.post("/{device_type}/validate")
async def validate_metadata(device_type: str, data: dict) -> ValidationResult:
    """Validiert Metadaten gegen das Schema."""
```

**Schema-Dateien:** Muessen ins Backend kopiert/synchronisiert werden. Aktuell existieren sie NUR unter `El Frontend/src/config/device-schemas/` mit folgender Struktur:
- `base.schema.json` — Basis-Schema
- `sensor/` — bmp280, ds18b20, ec, light, moisture, ph, sht31 (Frontend: `getSchemaForDevice()`, `getRegisteredDeviceTypes()` in `index.ts`)
- `actuator/` — pwm, relay
- `index.ts` — Frontend-Loader (Category `sensor` | `actuator`, Multi-Value-Aufloesung z. B. sht31_temp → sht31)

**Entscheidung noetig:** Entweder (A) Schemas ins Backend kopieren unter `El Servador/god_kaiser_server/config/device-schemas/` als Single Source of Truth, Frontend laedt ueber API — oder (B) Backend liest zur Laufzeit aus dem Frontend-Build. Empfehlung: Option A.

### L0.3: Zone-KPI-Berechnungen (ergaenzt K3)

**Datei:** `El Servador/god_kaiser_server/src/services/zone_kpi_service.py` (**NEU**)

> **IST-Zustand:** `zone_id` ist im gesamten System ein `String` (nicht UUID). `ZoneContext`-Modell hat Felder: `zone_id` (unique), `zone_name`, `plant_count`, `variety`, `substrate`, `growth_phase`, `planted_date`, `expected_harvest`, `responsible_person`, `work_hours_weekly`, `notes`, `custom_data` (JSONB), `cycle_history` (JSONB). Properties: `plant_age_days`, `days_to_harvest`.

```python
class ZoneKPIService:
    """Berechnet Zone-Level KPIs aus Sensor-Daten + Zone-Context."""

    async def calculate_vpd(self, zone_id: str) -> VPDResult:
        """VPD aus aktuellen Temp + Humidity Sensoren der Zone."""

    async def calculate_dli(self, zone_id: str) -> DLIResult:
        """Daily Light Integral aus Lichtsensor-Zeitreihe (24h)."""

    async def calculate_growth_progress(self, zone_id: str) -> GrowthProgress:
        """Fortschritt im Anbauzyklus basierend auf planted_date + expected_harvest."""

    async def get_zone_health_score(self, zone_id: str) -> float:
        """Aggregierter Score (0-100) aus allen Sensor-Health-Scores der Zone."""
```

**API-Endpunkt:** `GET /api/v1/zone/context/{zone_id}/kpis` — liefert berechnete KPIs in Echtzeit.

> **IST-Zustand (2026-03-03):** `ZoneKPIService` und Endpoint sind **bereits implementiert**.
> - Service: `El Servador/god_kaiser_server/src/services/zone_kpi_service.py`
> - Router: `El Servador/god_kaiser_server/src/api/v1/zone_context.py` (Prefix `/v1/zone/context`, Route `/{zone_id}/kpis`)
> - Methoden: `calculate_vpd()`, `calculate_dli()`, `calculate_growth_progress()`, `get_zone_health_score()`, `get_all_kpis()`
> - L0.3 Ergaenzungen beziehen sich auf optionale Erweiterungen (z. B. KPI-Caching, WebSocket-Broadcast `zone_kpi_update`).

---

## Layer 1: Semantic Layer — NEU

### L1.1: pgvector Embedding-Infrastruktur

**Warum pgvector statt Chroma/Pinecone:**
AutomationOne nutzt bereits PostgreSQL. pgvector als Extension braucht keinen neuen Service — nur `CREATE EXTENSION vector;` und eine neue Tabelle. Fuer den AutomationOne-Massstab (50-200 Komponenten) ist pgvector ideal.

**Paper-Beleg:** IoT-ASE (2025) zeigt 92% Retrieval-Accuracy mit RAG ueber IoT-Daten. MiniRAG (2025) bestaetigt: Leichtgewichtige RAG-Pipelines funktionieren auch auf Edge-Devices.

**Migration:**

```sql
-- Alembic Migration
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE component_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,  -- 'sensor', 'actuator', 'zone', 'esp'
    entity_id VARCHAR(255) NOT NULL,
    embedding vector(384),  -- all-MiniLM-L6-v2 Dimensionalitaet
    text_content TEXT NOT NULL,  -- Menschenlesbarer Text der embedded wurde
    metadata JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_type, entity_id)
);

CREATE INDEX idx_component_embeddings_vector
    ON component_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10);
```

**Embedding-Service:**

**Datei:** `El Servador/god_kaiser_server/src/services/embedding_service.py` (**NEU**)

```python
from sentence_transformers import SentenceTransformer

class EmbeddingService:
    """Generiert und verwaltet Vektor-Embeddings fuer IoT-Metadaten."""

    def __init__(self):
        # all-MiniLM-L6-v2: 384 Dimensionen, lokal, kein API-Key
        self.model = SentenceTransformer('all-MiniLM-L6-v2')

    def generate_component_text(self, component: ComponentExport) -> str:
        """Erzeugt einen menschenlesbaren Text aus Sensor-Metadaten.

        Beispiel:
        'SHT31-D Temperature and Humidity Sensor by Sensirion.
         I2C address 0x44, installed in Zone Bluete-A.
         Measures temperature (±0.3°C) and humidity (±2%RH).
         Online since 2025-11-15, uptime 2400 hours.
         Next maintenance: 2026-04-01.'
        """

    async def update_embedding(self, entity_type: str, entity_id: str):
        """Aktualisiert das Embedding fuer eine Entitaet.

        Wird aufgerufen bei:
        - Metadaten-Aenderung (JSONB Update Trigger)
        - Zone-Context-Aenderung
        - Periodisch (alle 5 Minuten fuer Runtime-Stats)
        """

    async def semantic_search(self, query: str, limit: int = 10) -> list[SearchResult]:
        """Semantische Suche ueber alle Komponenten.

        'Sensoren mit hoher Fehlerrate' → findet Sensoren mit error_rate_24h > 0.01
        'Bluete-Zone Temperatur' → findet SHT31 und BMP280 in Bluete-Zonen
        """
```

**Embedding-Modell-Wahl:**

| Modell | Dimensionen | Groesse | Latenz | Eignung |
|--------|-------------|---------|--------|---------|
| `all-MiniLM-L6-v2` | 384 | 80MB | <10ms | **Empfohlen** — lokal, schnell, ausreichend fuer IoT-Metadaten |
| `text-embedding-3-small` (OpenAI) | 1536 | API | ~100ms | Besser fuer Semantik, aber API-abhaengig |
| `nomic-embed-text-v1.5` | 768 | 274MB | ~20ms | Gut, aber groesser als noetig |

**Empfehlung:** `all-MiniLM-L6-v2` — laeuft auf dem Server ohne externe Abhaengigkeit, 384 Dimensionen sind fuer den Massstab optimal.

### L1.2: WoT Thing Description Export

**Ergaenzt K4.2** — Der AI-Ready JSON Export wird um einen W3C-konformen WoT TD Export erweitert.

> **IST-Zustand:** `src/api/v1/component_export.py` implementiert BEREITS einen WoT-TD-inspirierten Export mit 5 Endpoints:
> - `GET /api/v1/export/components` — Alle Komponenten als AI-Ready JSON
> - `GET /api/v1/export/components/{id}` — Einzelne Komponente
> - `GET /api/v1/export/zones` — Alle Zonen mit Kontext
> - `GET /api/v1/export/zones/{zone_id}` — Zone mit allen Komponenten + Kontext
> - `GET /api/v1/export/system-description` — Vollstaendige Systembeschreibung
>
> Der WoT-Export-Service sollte auf diesen bestehenden Export aufbauen und ihn um W3C-konforme `@context`- und `@type`-Felder erweitern, NICHT als komplett parallele Implementierung.

**Datei:** `El Servador/god_kaiser_server/src/services/wot_export_service.py` (**NEU**)

```python
class WoTExportService:
    """Exportiert AutomationOne-Geraete als W3C WoT Thing Descriptions."""

    def sensor_to_td(self, sensor: SensorConfig, esp: ESPDevice) -> dict:
        """Konvertiert einen Sensor in eine WoT Thing Description 2.0.

        ACHTUNG: SensorConfig-Felder heissen `sensor_name` (nicht `name`)
        und `sensor_type` (nicht `type`). Siehe src/db/models/sensor.py.
        """
        return {
            "@context": "https://www.w3.org/2022/wot/td/v1.1",
            "@type": "saref:Sensor",
            "id": f"urn:automationone:{esp.id}:{sensor.gpio}",
            "title": sensor.sensor_name,
            "description": self._generate_description(sensor),
            "properties": self._sensor_properties(sensor),
            "events": self._sensor_events(sensor),
            "links": [
                {"rel": "zone", "href": f"/api/v1/zone/{esp.zone_id}"},
                {"rel": "schema", "href": f"/api/v1/schema-registry/{sensor.sensor_type}"}
            ]
        }

    def zone_to_system_description(self, zone_id: str) -> dict:
        """Zone als WoT System Description (Mashup aller enthaltenen Things).

        Forschungsbeleg: Paper P7 (Siebold 2020) — WoT System Description
        aggregiert mehrere Thing Descriptions zu einem System.
        """
```

**API-Endpunkte (ergaenzen K4.1):**

| Methode | Endpoint | Format |
|---------|----------|--------|
| GET | `/v1/export/wot/things` | WoT Thing Description Array |
| GET | `/v1/export/wot/things/{id}` | Einzelne WoT TD |
| GET | `/v1/export/wot/system` | WoT System Description (alle Zonen) |
| GET | `/v1/export/wot/directory` | WoT Thing Directory (Verzeichnis) |

### L1.3: Knowledge Graph Mapping (PostgreSQL-basiert)

**Kein Neo4j.** PostgreSQL's relationale Struktur IST bereits ein impliziter Graph:

> **IST-Zustand DB-Modelle (verifiziert):**
> - `ESPDevice` → hat `zone_id` (String), `master_zone_id` (String, Optional)
> - `SensorConfig` → hat `esp_id` (FK → esp_devices.id)
> - `ZoneContext` → hat `zone_id` (unique String)
> - `AIPredictions` → hat `target_esp_id` (FK → esp_devices.id), `target_zone_id` (String)
> - Subzone-Modell existiert (`src/db/models/subzone.py`)

```
zone_contexts (K3, pro zone_id) ←→ esp_devices.zone_id
esp_devices → subzone_configs (SubzoneConfig)
esp_devices → sensor_configs → sensor_data
esp_devices → actuator_configs → actuator_states / actuator_history
zone_contexts → (kein FK; zone_id als logische Verknuepfung)
sensor_configs / actuator_configs → alert_config (JSONB) → NotificationRouter
```
**Hinweis:** Es gibt keine Tabelle `zones`; Zonen sind `zone_id`-Werte in `esp_devices` bzw. Eintraege in `zone_contexts`.

**Was ergaenzt wird:** Ein GraphQL-oder JSON-LD-Export der diese Relationen als traversierbaren Graph exponiert:

**Datei:** `El Servador/god_kaiser_server/src/api/v1/knowledge_graph.py` (**NEU**)

```python
router = APIRouter(prefix="/v1/knowledge-graph", tags=["knowledge-graph"])

@router.get("/")
async def get_full_graph() -> KnowledgeGraphResponse:
    """Kompletter System-Graph als JSON-LD.

    Nodes: Zones, ESPs, Sensors, Actuators, Rules
    Edges: contains, monitors, controls, triggers, feeds
    """

@router.get("/traverse")
async def traverse(start: str, relation: str, depth: int = 2) -> list[GraphNode]:
    """Graph-Traversierung ab einem Startknoten.

    Beispiel: start='zone:bluete-a', relation='contains', depth=2
    → Zone → ESPs → Sensoren/Aktoren
    """

@router.get("/query")
async def natural_language_query(q: str) -> GraphQueryResult:
    """Natuerlichsprachliche Graph-Query.

    'Welche Sensoren haengen am gleichen ESP wie Pumpe-01?'
    → Parst Query → Graph-Traversierung → Antwort
    """
```

**Forschungsbeleg:** LUMEN Paper (ACM TIOT 2025) — "Models IoT systems as knowledge graphs, capturing device relationships and metadata." AutoKGQA (2025) — "Domain-specific prompting significantly enhances query accuracy."

---

## Layer 2: Intelligence — NEU

### L2.1: Online Anomaly Detection (pro MQTT-Message)

**Warum Online statt Batch:**
Isolation Forest (in der Roadmap erwaehnt) arbeitet als Batch-Algorithmus (periodisch). Fuer Echtzeit-Erkennung ("Sensor meldet ploetzlich 99°C") braucht es eine Online-Methode.

**Forschungsbeleg:**
- ETDFAD (2025): TinyML + Federated Learning fuer real-time anomaly detection auf ESP32, Isolation Forest trainiert in 1.2-6.4 Sekunden, Detection in <16ms
- ISS-DIF (2025): Deep Isolation Forest mit 99.3% Accuracy auf IoT-Daten
- PGTAD (2025): Lightweight GRU-Autoencoder, F-Score 0.92 auf IoT-Traffic

**Zweistufige Implementierung:**

**Stufe 1 — Z-Score Sliding Window (sofort einsetzbar, in sensor_handler.py):**

> **IST-Zustand `sensor_handler.py`:** Klasse `SensorDataHandler` mit Methoden: `handle_sensor_data()`, `_evaluate_thresholds_and_notify()`, `_check_physical_range()`, `_validate_payload()`, `_detect_data_source()`, `_trigger_pi_enhanced_processing()`. Die Anomalie-Erkennung sollte in `handle_sensor_data()` NACH der Validierung und VOR der Threshold-Evaluation eingefuegt werden.

```python
# In bestehender sensor_handler.py (MQTT Handler)
class SlidingWindowAnomalyDetector:
    """Online Anomalie-Erkennung per Sliding Window Z-Score.

    Berechnet pro Sensor einen laufenden Mittelwert und Standardabweichung
    ueber die letzten N Messwerte. Wenn der neue Wert > 3 Sigma abweicht
    → Anomalie-Flag.
    """

    def __init__(self, window_size: int = 60):
        self.windows: dict[str, deque] = {}

    def check(self, sensor_id: str, value: float) -> AnomalyResult:
        window = self.windows.setdefault(sensor_id, deque(maxlen=self.window_size))

        if len(window) < 10:
            window.append(value)
            return AnomalyResult(is_anomaly=False)

        mean = statistics.mean(window)
        std = statistics.stdev(window)
        z_score = abs(value - mean) / std if std > 0 else 0

        window.append(value)

        return AnomalyResult(
            is_anomaly=z_score > 3.0,
            z_score=z_score,
            expected_range=(mean - 3*std, mean + 3*std),
            severity="critical" if z_score > 5 else "warning" if z_score > 3 else "normal"
        )
```

**Stufe 2 — Isolation Forest Batch (alle 5 Minuten):**

```python
# Neuer Service: ai_anomaly_service.py
class AIAnomalyService:
    """Batch Anomalie-Erkennung mit Isolation Forest.

    Laeuft als APScheduler-Task alle 5 Minuten.
    Analysiert aggregierte Metriken der letzten Stunde pro Sensor.
    """

    async def run_detection(self):
        for zone in await self.get_zones():
            features = await self.build_feature_matrix(zone)
            # Multi-Sensor Features: [temp, humidity, vpd, co2, light]
            anomalies = self.isolation_forest.predict(features)

            for anomaly in anomalies:
                await self.notification_bridge.route(anomaly)
```

### L2.2: Notification Bridge (Anomalie → Phase 4A Pipeline)

**KRITISCHE LUECKE:** Phase 4A Notification-Stack ist komplett implementiert (NotificationRouter, EmailService, DigestService, 9 Endpoints). Isolation Forest existiert als Konzept in der Roadmap. Die **Verbindung fehlt**.

**Datei:** `El Servador/god_kaiser_server/src/services/ai_notification_bridge.py` (**NEU**)

> **ACHTUNG — Bestehende Notification-API beachten:**
> - Schema ist `NotificationCreate` (aus `src/schemas/notification.py`), NICHT `Notification`
> - Feld heisst `body`, NICHT `message`
> - `source`-Validator erlaubt NUR: `logic_engine`, `mqtt_handler`, `grafana`, `sensor_threshold`, `device_event`, `autoops`, `manual`, `system` → **`"ai_anomaly_service"` muss VORHER zu `NOTIFICATION_SOURCES` hinzugefuegt werden**
> - `category`-Validator erlaubt NUR: `connectivity`, `data_quality`, `infrastructure`, `lifecycle`, `maintenance`, `security`, `system` → **`"ai_anomaly"` muss VORHER zu `NOTIFICATION_CATEGORIES` hinzugefuegt werden**
> - `AlertSuppressionService` hat KEINE Methode `is_suppressed()` — stattdessen: `is_sensor_suppressed(sensor_config)` die ein **SensorConfig-Model** erwartet (nicht sensor_id String)

```python
from src.schemas.notification import NotificationCreate

class AINotificationBridge:
    """Verbindet KI-Ergebnisse mit der Phase 4A Notification-Pipeline.

    Anomalie → AlertSuppressionService pruefen
              → NotificationRouter.route() aufrufen
              → Inbox + Email

    VORBEDINGUNG: In src/schemas/notification.py muessen ergaenzt werden:
      NOTIFICATION_SOURCES += ["ai_anomaly_service"]
      NOTIFICATION_CATEGORIES += ["ai_anomaly"]
    """

    async def route_anomaly(self, anomaly: AnomalyResult):
        # 1. ai_predictions-Tabelle fuellen (Modell existiert: src/db/models/ai.py → AIPredictions)
        prediction = await self.save_prediction(anomaly)

        # 2. Alert-Suppression pruefen (Phase 4A.7)
        # ACHTUNG: is_sensor_suppressed() erwartet ein SensorConfig-Model, keinen String
        sensor_config = await self.sensor_repo.get_by_id(anomaly.sensor_config_id)
        if sensor_config:
            is_suppressed, reason = await self.suppression_service.is_sensor_suppressed(sensor_config)
            if is_suppressed:
                return

        # 3. Notification erstellen und routen (channel optional, default "websocket")
        notification = NotificationCreate(
            channel="websocket",
            category="ai_anomaly",
            severity=anomaly.severity,
            title=f"Anomalie: {anomaly.sensor_name}",
            body=anomaly.explanation,
            source="ai_anomaly_service",
            correlation_id=str(anomaly.prediction_id),
        )
        await self.notification_router.route(notification)
```

### L2.3: Kontextsensitive Schwellwerte

**Problem:** Statische Schwellwerte (warning_high=30°C) ignorieren den Wachstumskontext. In Woche 1 Vegetation ist 30°C problematisch, in Woche 8 Bluete ist 28°C schon zu viel.

**Loesung:** Zone-Context (K3) → dynamische Schwellwerte:

```python
# zone_aware_thresholds.py
PHASE_THRESHOLDS = {
    "vegetative": {
        "temperature": {"warning_high": 30, "critical_high": 35, "optimal": (22, 28)},
        "humidity": {"warning_high": 75, "optimal": (55, 70)},
        "vpd": {"optimal": (0.8, 1.2)},
    },
    "flower_early": {
        "temperature": {"warning_high": 28, "critical_high": 32, "optimal": (20, 26)},
        "humidity": {"warning_high": 65, "optimal": (45, 60)},
        "vpd": {"optimal": (1.0, 1.5)},
    },
    "flower_late": {
        "temperature": {"warning_high": 26, "critical_high": 30, "optimal": (18, 24)},
        "humidity": {"warning_high": 55, "optimal": (35, 50)},
        "vpd": {"optimal": (1.2, 1.6)},
    },
}

class ZoneAwareThresholdService:
    """Passt Alarm-Schwellwerte basierend auf Wachstumsphase an."""

    async def get_thresholds(self, zone_id: str) -> dict:
        context = await self.zone_context_repo.get(zone_id)
        phase = context.growth_phase or "vegetative"
        return PHASE_THRESHOLDS.get(phase, PHASE_THRESHOLDS["vegetative"])
```

### L2.4: Component Health Score

**Datei:** `El Servador/god_kaiser_server/src/services/health_score_service.py` (**NEU**)

```python
class HealthScoreService:
    """Berechnet einen Gesundheits-Score (0-100) pro Geraet.

    Faktoren (gewichtet):
    - Online-Status (30%): Online = 100, Offline < 5min = 80, > 1h = 0
    - Fehlerrate 24h (25%): 0 Fehler = 100, >1% = 50, >5% = 0
    - Datenqualitaet (20%): quality='excellent' = 100, 'good' = 80, ...
    - Wartungsstatus (15%): >30 Tage bis Wartung = 100, <7 = 50, ueberfaellig = 0
    - Alter/Uptime (10%): <1000h = 100, >5000h = 60, >10000h = 30
    """
```

**API:** `GET /v1/components/{id}/health` → `{ "score": 87, "factors": {...} }`
**Inventar-Tabelle (K1):** Neue optionale Spalte "Health" mit farbigem Badge (gruen/gelb/rot).

---

## Layer 3: Interaction — NEU

### L3.1: MCP-Server Implementation

**Forschungsbeleg:**
- IoT-MCP (2025): 100% Tool-Call-Erfolgsrate, 205ms Antwortzeit, 22 Sensortypen
- ThingsPanel-MCP: Funktionierender IoT-MCP-Server mit Docker-Deployment
- Home Assistant MCP: MCP Server als offizielle Integration
- EMQX MCP: Claude + MQTT Integration ueber MCP

**Architektur:** Eigener Python MCP-Server (FastMCP oder mcp-sdk):

**Datei:** `El Servador/mcp_server/` (**NEUES Verzeichnis**)

```python
# mcp_server/server.py
from mcp import Server, Tool, Resource

server = Server("automationone-mcp")

# === TOOLS ===

@server.tool("get_all_sensors")
async def get_all_sensors(zone: str | None = None) -> list[dict]:
    """Alle Sensoren auflisten, optional nach Zone gefiltert."""

@server.tool("get_sensor_value")
async def get_sensor_value(sensor_id: str) -> dict:
    """Aktuellen Wert eines Sensors abfragen."""

@server.tool("get_zone_context")
async def get_zone_context(zone_id: str) -> dict:
    """Zone-Kontext mit Pflanzen, Substrat, Phase abfragen."""

@server.tool("search_components")
async def search_components(query: str) -> list[dict]:
    """Semantische Suche ueber alle Komponenten (nutzt pgvector)."""

@server.tool("get_anomalies")
async def get_anomalies(timerange: str = "24h") -> list[dict]:
    """Aktuelle Anomalien abfragen."""

@server.tool("set_actuator")
async def set_actuator(actuator_id: str, state: bool) -> dict:
    """Aktor steuern (mit Safety-Check)."""

@server.tool("get_zone_kpis")
async def get_zone_kpis(zone_id: str) -> dict:
    """Zone-KPIs abfragen (VPD, DLI, Health Score, Growth Progress)."""

@server.tool("get_system_health")
async def get_system_health() -> dict:
    """Gesamtsystem-Gesundheit abfragen."""

@server.tool("query_history")
async def query_history(sensor_id: str, hours: int = 24) -> list[dict]:
    """Historische Sensordaten abfragen."""

@server.tool("get_recommendations")
async def get_recommendations(zone_id: str) -> list[dict]:
    """KI-Empfehlungen fuer eine Zone (VPD-Optimierung, Bewaesserung, etc.)."""

# === RESOURCES ===

@server.resource("system://overview")
async def system_overview() -> str:
    """Gesamtsystem als menschenlesbarer Text fuer LLM-Kontext."""

@server.resource("zone://{zone_id}/summary")
async def zone_summary(zone_id: str) -> str:
    """Zone-Zusammenfassung als natuerlichsprachlicher Text."""

# === PROMPTS ===

@server.prompt("diagnose")
async def diagnose_prompt(issue: str) -> str:
    """Diagnose-Prompt fuer IoT-Probleme."""
    return f"""Du bist ein IoT-Experte fuer AutomationOne.
    Analysiere folgendes Problem: {issue}
    Nutze die verfuegbaren Tools um Sensordaten, Zone-Kontext und Anomalien abzufragen.
    Gib eine strukturierte Diagnose mit Ursache und Empfehlung."""
```

**Deployment:** Als separater Docker-Service (SSE-Transport) oder als `stdio`-Server fuer Claude Desktop/Code.

### L3.2: RAG-Pipeline fuer natuerlichsprachliche Queries

**Fuer den Massstab von AutomationOne (50-200 Sensoren) gilt:**

Bei <500 Komponenten ist klassisches RAG overengineered. Stattdessen: **Context Injection Pattern** — alle relevanten Metadaten direkt in den LLM-Prompt packen.

```python
class IoTContextBuilder:
    """Baut einen komprimierten Kontext-Block fuer LLM-Queries.

    Bei 50-100 Sensoren passt der gesamte System-Status
    in ~2000 Tokens — kein RAG noetig.
    """

    async def build_context(self, focus_zone: str | None = None) -> str:
        zones = await self.get_zones(focus_zone)

        context_parts = []
        for zone in zones:
            context_parts.append(f"## Zone: {zone.name}")
            context_parts.append(f"Phase: {zone.context.growth_phase}, "
                                 f"Pflanzen: {zone.context.plant_count}x {zone.context.variety}")

            for sensor in zone.sensors:
                status = "✓" if sensor.status == "online" else "✗"
                context_parts.append(
                    f"  {status} {sensor.name} ({sensor.type}): "
                    f"{sensor.current_value}{sensor.unit} "
                    f"[Health: {sensor.health_score}/100]"
                )

        return "\n".join(context_parts)
```

**Wann echtes RAG hinzukommt:** Ab >500 Komponenten oder wenn historische Daten (Wochen/Monate) abgefragt werden sollen. Dann greift pgvector fuer Embedding-basiertes Retrieval.

### L3.3: Natural Language Query REST-Endpoint

**Datei:** `El Servador/god_kaiser_server/src/api/v1/ai.py` (**EXISTIERT bereits als leerer Stub**)

> **IST-Zustand:** `ai.py` existiert mit `prefix="/ai"` und ist in `api/v1/__init__.py` registriert. Die App mountet `api_v1_router` in `main.py` mit `prefix="/api"` (ohne `/v1`), daher ist der aktuelle NLQ-Pfad **`/api/ai/query`**.
>
> **Prefix fuer Konsistenz:** Alle anderen v1-Router nutzen Prefix `/v1/...` (z. B. `zone_context`: `/v1/zone/context`). **Empfehlung:** In `ai.py` Prefix von `"/ai"` auf `"/v1/ai"` aendern, damit der finale Pfad **`/api/v1/ai/query`** lautet und in `.claude/reference/api/REST_ENDPOINTS.md` konsistent gefuehrt werden kann.
>
> **Geplante Endpoints im Stub (noch nicht implementiert):** `POST /recommendation`, `GET /predictions`, `POST /predictions/{id}/approve`, `POST /predictions/{id}/reject`, `POST /send_batch` — bei NLQ-Implementation mit beruecksichtigen.

```python
# In bestehendem ai.py — Prefix von "/ai" auf "/v1/ai" aendern:
router = APIRouter(prefix="/v1/ai", tags=["ai"])

@router.post("/query")
async def natural_language_query(request: AIQueryRequest) -> AIQueryResponse:
    """Natuerlichsprachliche Abfrage an das System.

    Beispiele:
    - 'Wie ist die Temperatur in Zone Bluete-A?'
    - 'Welche Sensoren haben eine hohe Fehlerrate?'
    - 'Ist die Bewaesserung in Zone Veg-B noetig?'
    - 'Wann ist die naechste Wartung faellig?'

    Rueckgabe: Strukturierte Antwort mit Quelle (welche Sensoren abgefragt)
    und Konfidenzniveau.
    """
```

**Erstimplementierung:** Regelbasiert (kein LLM noetig fuer V1):
- Pattern Matching auf bekannte Frage-Typen
- Direkte DB-Queries statt LLM-Interpretation
- LLM-Integration als optionaler "Advanced Mode" in V2

---

## Layer 4: Feedback & Learning — ZUKUNFT

### L4.1: User-Feedback-Loop

Wenn KI eine Anomalie meldet oder eine Empfehlung gibt → User kann bestaetigen oder ablehnen:

```python
@router.post("/v1/ai/feedback")
async def submit_feedback(feedback: AIFeedbackRequest):
    """User-Feedback zu KI-Ergebnissen.

    Wird gespeichert fuer:
    - Anomalie-Schwellwert-Anpassung (zu viele False Positives → Schwelle erhoehen)
    - Empfehlungs-Qualitaet-Tracking
    - Zukuenftiges Active Learning
    """
```

### L4.2: Historische Modell-Verbesserung

**Nicht jetzt implementieren** — aber im Datenmodell vorbereiten:

```sql
CREATE TABLE ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID REFERENCES ai_predictions(id),
    feedback_type VARCHAR(50),  -- 'confirmed', 'rejected', 'adjusted'
    user_comment TEXT,
    adjusted_value JSONB,  -- z.B. {"correct_threshold": 28}
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Vorbedingungen: Dependencies & Stubs

> **SYSTEM-CHECK (2026-03-03):** Folgende Abhaengigkeiten fehlen aktuell in `El Servador/god_kaiser_server/pyproject.toml` und muessen VOR der Implementierung hinzugefuegt werden:

| Dependency | Benoetigt fuer | Phase | Befehl |
|-----------|----------------|-------|--------|
| `python-jsonschema` | L0.2 Backend Schema-Validierung | A | `poetry add jsonschema` |
| `pgvector` | L1.1 Embedding-Infrastruktur (SQLAlchemy-Bindings) | B | `poetry add pgvector` |
| `sentence-transformers` | L1.1 Embedding-Service | B | `poetry add sentence-transformers` |
| `scikit-learn` | L2.1 Isolation Forest (Stufe 2) | C | `poetry add scikit-learn` |

> **Bestehende Stubs die genutzt werden koennen:**
>
> - `src/services/ai_service.py` — existiert als leerer Stub (nur Docstring: "AI/God Layer Integration Service - Phase 3 - Priority: MEDIUM - Status: PLANNED"). L2-Services (Anomalie, Health Score, KPI) sollten entweder HIER implementiert werden oder diesen Stub referenzieren.
> - `src/api/v1/ai.py` — Router-Stub mit `prefix="/ai"` (keine Endpoints). Geplante Endpoints im Docstring: `POST /recommendation`, `GET /predictions`, `POST /predictions/{id}/approve`, `POST /predictions/{id}/reject`.
> - `src/db/models/ai.py` — `AIPredictions`-Tabelle ist implementiert: `id`, `prediction_type`, `target_esp_id`, `target_zone_id`, `input_data`, `prediction_result`, `confidence_score`, `model_version`, `timestamp`, `prediction_metadata` (Spaltenname ist `prediction_metadata`, nicht `metadata`). Kann direkt fuer L2.2 Notification Bridge genutzt werden.
> - `src/db/repositories/ai_repo.py` — Repository existiert.

---

## Implementierungs-Reihenfolge: Was WANN

```
Phase A — Data Foundation (parallel zu K1-K4)
═══════════════════════════════════════════════
L0.0 Dependencies installieren      (~0.5h) ← poetry add jsonschema (fuer L0.2)
L0.1 Schema-Versionierung           (~2h) ← Mit K2 zusammen
L0.2 Backend Schema-Registry API    (~4h) ← Mit K2 zusammen + Schemas ins Backend kopieren
                                             + Router in __init__.py registrieren
L0.3 Zone-KPI-Berechnungen          (bereits implementiert) ← ZoneKPIService + GET /api/v1/zone/context/{zone_id}/kpis vorhanden; optional: KPI-Cache, WS-Broadcast

Phase B — Semantic Layer (nach K4)
════════════════════════════════════
L1.0 Dependencies installieren      (~0.5h) ← poetry add pgvector sentence-transformers
L1.1 pgvector + Embedding-Service   (~6h) ← PostgreSQL Extension + Service + Alembic Migration
L1.2 WoT TD Export                  (~4h) ← Ergaenzt K4 (baut auf component_export.py auf)
L1.3 Knowledge Graph API            (~4h) ← Auf bestehender DB + Router in __init__.py registrieren

Phase C — Intelligence (nach Phase B)
══════════════════════════════════════
L2.0 Notification-Schema erweitern  (~0.5h) ← VORBEDINGUNG: "ai_anomaly_service" zu NOTIFICATION_SOURCES,
                                               "ai_anomaly" zu NOTIFICATION_CATEGORIES in schemas/notification.py
L2.1 Online Anomaly Detection       (~4h) ← In sensor_handler.py (SensorDataHandler)
L2.2 Notification Bridge            (~2h) ← Verbindet Phase 4A + KI (nutzt NotificationCreate, AlertSuppressionService)
L2.3 Kontextsensitive Schwellwerte  (~3h) ← Nutzt K3 Zone-Context (ZoneContext.growth_phase)
L2.4 Component Health Score         (~3h) ← Fuer K1 Inventar-Tabelle

Phase D — Interaction (nach Phase C)
═════════════════════════════════════
L3.1 MCP-Server (10 Tools)          (~12h) ← Eigener Docker-Service (El Servador/mcp_server/ — NEU)
L3.2 Context Injection / RAG        (~4h)  ← Fuer MCP-Server Kontext
L3.3 NLQ REST-Endpoint              (~6h)  ← In bestehendem ai.py Stub (Prefix "/ai" → "/v1/ai" aendern)

Phase E — Feedback (Zukunft)
════════════════════════════
L4.1 Feedback-Loop                  (~3h)
L4.2 Modell-Verbesserung            (~8h)

GESAMT-SCHAETZUNG: ~66.5h (Phase A-D: ~53.5h inkl. Dependency-Setup, L0.3 bereits implementiert; Phase E: ~11h)
```

**Primaer-Empfehlung:** Phase A (10h) parallel zu K1-K4 implementieren. Phase B+C (23h) als naechster Sprint nach K4. Phase D (22h) als eigener Sprint. Phase E spaeter.

---

## Forschungsbasis (neu identifiziert)

### Neue Papers (Semantic Scholar, 2025)

| Paper | Venue | Kernaussage | Relevanz |
|-------|-------|-------------|----------|
| **LUMEN** — Multi-Agent LLMs + Knowledge Graphs for IoT Enhancement | ACM TIOT 2025 | Multi-Agent LLM System mit Knowledge Graph fuer IoT Observability. Spezialisierte Agents kollaborieren dynamisch. | Zeigt exakt das Architektur-Pattern fuer AutomationOne MCP-Server |
| **AutoKGQA** — Zero-shot QA in CPS-IoT | FMSys 2025 | Domain-spezifisches Prompting verbessert KGQA fuer IoT signifikant. Auch kleine LLMs performen gut mit richtigem Prompting. | Bestaetigt: Frontend-Schema-Registry als Domain-Wissen fuers Prompting nutzen |
| **IoT-ASE** — Agentic Search Engine for Real-Time IoT Data | arXiv 2025 | RAG + LLM fuer Echtzeit-IoT-Suche. 92% Retrieval-Accuracy. | Bestaetigt RAG-Ansatz fuer IoT-Metadaten-Suche |
| **Sacha Inchi RAG Chatbot** — LoRa IoT + RAG for Agriculture | IC3INA 2025 | RAG-Chatbot fuer Praezisions-Landwirtschaft. 90% Success bei komplexen Queries. 1.4s Latenz. | Direkt uebertragbar auf AutomationOne |
| **ISS-DIF** — Deep Isolation Forest for IoT Anomaly Detection | JCMSE 2025 | Intelligent Deep Isolation Forest mit 99.3% Accuracy auf IoT-Sensordaten | Bestaetigt Isolation Forest als richtige Wahl |
| **PGTAD** — Lightweight GRU for IoT Time Series Anomaly | IEEE Access 2025 | F-Score 0.92, 480K Pakete/s auf Jetson Nano | Zeigt Edge-Deployment-Moeglichkeiten |
| **ETDFAD** — TinyML + FL Anomaly Detection | ICECONF 2025 | Isolation Forest auf ESP32: Training 1.2-6.4s, Detection <16ms | Bestaetigt TinyML-Machbarkeit auf ESP32 |
| **MCP Bridge** — Lightweight RESTful Proxy for MCP | arXiv 2025 | RESTful Proxy fuer MCP-Server. Risk-based Execution. Docker Isolation. | Relevant fuer AutomationOne MCP-Server Architektur |
| **Multilingual LLM Digital Twin** — Agriculture | ICESC 2025 | LLM + IoT Knowledge Graph + Edge AI fuer Landwirtschaft. 93.1% Advisory Accuracy. 2.3s Latenz auf Raspberry Pi. | Bestaetigt Edge-Deployment + Knowledge Graph Ansatz |

### Bestehende Papers (aus Repo)

| Paper | Venue | Nutzung in diesem Auftrag |
|-------|-------|---------------------------|
| Smart Districts KG+LLM (Huck 2025) | J. Physics | Layer 1 Knowledge Graph Design |
| PGDT (2025) | ICEIS | Layer 2 Predictive Model |
| CEA DT Architecture (2021) | Applied Sciences | Layer 0 Zone-Context Validierung |
| DigiHortiRobot (2025) | Future Internet | Layer 1 FIWARE/Asset-Modell |
| dMCP (2025) | WCSP | Layer 3 MCP Policy Generation |
| WoT TD Lifecycle (2018) | IoT ACM | Layer 1 Schema-Versioning |
| WoT System Description (2020) | Coins | Layer 1 Zone→System Aggregation |
| EnergiQ (2025) | Italian Nat. Conf. | Layer 2+3 Pipeline-Pattern |

### Praxis-Quellen (neu)

| Quelle | URL | Relevanz |
|--------|-----|----------|
| ThingsPanel MCP Server | github.com/ThingsPanel/thingspanel-mcp | Referenz-Implementation IoT-MCP |
| ThingsBoard MCP Server | thingsboard.io/blog/introducing-thingsboard-mcp | Industriestandard IoT-MCP |
| Home Assistant MCP Integration | home-assistant.io/integrations/mcp_server/ | Consumer-IoT MCP Pattern |
| EMQX + Claude MCP | emqx.com/en/blog/integrating-claude-with-mqtt | MQTT → MCP Bridge |
| Confluent Schema Registry Best Practices | docs.confluent.io | Schema-Evolution Patterns |
| MCP Best Practices | modelcontextprotocol.info/docs/best-practices/ | MCP Architektur-Guide |
| Edge AI TinyML on ESP32 | drcodes.com | TinyML Anomaly Detection auf ESP32 |
| Digikey Edge AI ESP32 Tutorial | digikey.be/en/maker/projects/ | Praktische Edge AI Implementierung |

---

## Wie man damit weiterarbeitet (je nach Kontext)

### Wenn aktuell in Produktion: Cannabis-Anbau

**Sofort relevant:**
- L2.3 Kontextsensitive Schwellwerte (Wachstumsphasen)
- L0.3 Zone-KPIs (VPD, DLI)
- K3 Zone-Context (Pflanzenanzahl, Sorte, Substrat)
- L2.1 Online Anomaly Detection (Sensor-Ausfaelle sofort erkennen)

### Wenn aktuell in Produktion: IoT-Gaertner-Dienstleistung

**Sofort relevant:**
- K1 Inventar-Tabelle (Kunden-Hardware-Ueberblick)
- L2.4 Component Health Score (Wartungsplanung)
- L3.1 MCP-Server (KI-gestuetzte Diagnose vor Ort)
- L0.2 Backend Schema-Registry (neue Sensortypen ohne Frontend-Deploy)

### Wenn aktuell in Entwicklung: Bachelorarbeit

**Sofort relevant:**
- L1.1 pgvector Embeddings (Datenanalyse-Grundlage)
- L1.3 Knowledge Graph (Interoperabilitaet, Paper-Vergleiche)
- L1.2 WoT TD Export (Standardkonformitaet)
- L2.1+L2.2 Anomalie-Erkennung + Notification (Ergebnisse fuer Arbeit)

### Wenn nichts in Produktion: Hardware-Test-Vorbereitung

**Sofort relevant:**
- K1-K4 (Grundlagen implementieren)
- L0.1 Schema-Versionierung (von Anfang an richtig machen)
- L2.1 Online Anomaly Detection (Testlauf-Fehler sofort erkennen)
- L2.2 Notification Bridge (Alerts bei HW-Test-Problemen)

---

## Akzeptanzkriterien (Gesamt)

### Phase A — Data Foundation Ergaenzungen
- [ ] JSONB-Dokumente haben `_schema_version` Feld
- [ ] Lazy Migration Pattern funktioniert bei Schema-Upgrade
- [ ] Backend Schema-Registry API liefert Schemas fuer alle Geraetetypen
- [x] Zone-KPIs (VPD, DLI, Growth Progress) werden korrekt berechnet — **bereits implementiert** (ZoneKPIService, GET /api/v1/zone/context/{zone_id}/kpis)

### Phase B — Semantic Layer
- [ ] pgvector Extension installiert, `component_embeddings` Tabelle existiert
- [ ] Embedding-Service generiert Vektoren fuer alle Sensoren/Aktoren
- [ ] Semantische Suche findet relevante Komponenten bei natuerlichsprachlicher Query
- [ ] WoT TD Export liefert valide W3C-konforme Thing Descriptions
- [ ] Knowledge Graph API traversiert Zonen → ESPs → Sensoren korrekt

### Phase C — Intelligence
- [ ] Online Z-Score Anomalie-Erkennung laeuft bei jedem MQTT-Message
- [ ] Anomalien werden automatisch an Phase 4A Notification-Pipeline geroutet
- [ ] Kontextsensitive Schwellwerte passen sich an Wachstumsphase an
- [ ] Component Health Score wird pro Geraet berechnet und in Inventar-Tabelle angezeigt

### Phase D — Interaction
- [ ] MCP-Server laeuft als Docker-Service und exponiert 10+ Tools
- [ ] Claude/LLM kann ueber MCP Sensordaten abfragen und Aktoren steuern
- [ ] NLQ REST-Endpoint beantwortet einfache Fragen regelbasiert

### Phase E — Feedback (Zukunft)
- [ ] User-Feedback-Tabelle existiert
- [ ] Feedback zu Anomalien wird gespeichert

---

## Offene Architektur-Entscheidungen

1. **Embedding-Modell:** `all-MiniLM-L6-v2` (384dim, lokal) vs. `nomic-embed-text-v1.5` (768dim, besser aber groesser). Empfehlung: MiniLM fuer V1, Upgrade spaeter bei Bedarf.

2. **MCP-Transport:** STDIO (fuer Claude Desktop) vs. SSE (fuer Docker-Service) vs. beides. Empfehlung: SSE als Docker-Service (gleicher Host wie El Servador), STDIO als Alternative.

3. **LLM fuer NLQ-Endpoint:** Claude API vs. lokales Modell (Ollama + Qwen3). Empfehlung: V1 regelbasiert (kein LLM), V2 Claude API, V3 optional lokal.

4. **Edge AI auf ESP32:** TinyML Anomalie-Erkennung direkt auf dem ESP32 oder nur serverseitig? Empfehlung: Serverseitig fuer V1 (einfacher), ESP32 TinyML als Forschungs-Addon spaeter (ETDFAD Paper zeigt Machbarkeit: <16ms Detection).

5. **Knowledge Graph Format:** JSON-LD (W3C-konform) vs. einfaches JSON (leichter). Empfehlung: Einfaches JSON fuer internen Gebrauch, JSON-LD nur im WoT-Export.

---

## Wissensbasis

> **Hinweis:** Die folgenden Pfade sind **TM-externe Pfade** (claude.ai Projekte), NICHT Repo-Pfade. Sie existieren nicht im AutomationOne-Repository.

| Typ | Dokument | Pfad (TM-extern, claude.ai) |
|-----|----------|-----------------------------|
| Vorgaenger-Auftrag | Komponenten-Tab Wissensinfrastruktur (K1-K4) | `arbeitsbereiche/automation-one/auftrag-komponenten-tab-wissensinfrastruktur.md` |
| Praxis-Recherche | IoT Component Inventory & AI-Ready Metadata (28 Quellen) | `wissen/iot-automation/iot-component-inventory-ai-metadata-infrastructure-2026.md` |
| Forschung | IoT Metadata, AI-Integration & CEA Digital Twins (8 Papers) | `wissen/iot-automation/forschung-iot-metadata-ai-integration-cea-2026.md` |
| Roadmap | Phase 4 System-Integration | `arbeitsbereiche/automation-one/roadmap-phase4-system-integration.md` |
| Status | AutomationOne Status | `arbeitsbereiche/automation-one/STATUS.md` |
| Dieser Auftrag | KI-Daten-Integration Zukunftskonzept | `arbeitsbereiche/automation-one/auftrag-ki-daten-integration-zukunftskonzept.md` |

> **Repo-interne Referenzen fuer die Umsetzung:**
>
> | Dokument | Repo-Pfad |
> |----------|-----------|
> | REST Endpoints | `.claude/reference/api/REST_ENDPOINTS.md` |
> | MQTT Topics | `.claude/reference/api/MQTT_TOPICS.md` |
> | WebSocket Events | `.claude/reference/api/WEBSOCKET_EVENTS.md` |
> | Architektur-Abhaengigkeiten | `.claude/reference/patterns/ARCHITECTURE_DEPENDENCIES.md` |
> | Error Codes | `.claude/reference/errors/ERROR_CODES.md` |
> | Docker Reference | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` |

---

## Pruefstand (Frontend / Server / DB / ESP32) — 2026-03-03

Dieses Dokument wurde gegen die bestehende Codebase geprueft (frontend-development, server-development, db-inspector, esp32-development):

| Bereich | Geprueft | Korrekturen |
|---------|----------|-------------|
| **Server** | API-Mount `prefix="/api"`, Router-Prefixes, ZoneKPIService, ZoneContext, SensorConfig/ESPDevice-Felder, NotificationCreate (`body`, `channel`), AlertSuppressionService `is_sensor_suppressed(sensor_config)`, AIPredictions `prediction_metadata`, component_export prefix `/v1/export` | L0.3 als implementiert markiert; L2.2 `channel` ergaenzt; AIPredictions-Spaltenname dokumentiert; ai-Router-Pfad erlaeutert |
| **DB** | Tabellen `esp_devices`, `zone_contexts`, `sensor_configs`, `sensor_data`, `ai_predictions`; keine Tabelle `zones` | L1.3 Graph-Beschreibung auf echte Tabellen/FKs umgestellt |
| **Frontend** | device-schemas unter `src/config/device-schemas/`, index.ts, Sensor-/Actuator-Typen | L0.2 Schema-Liste und Frontend-Referenz praezisiert |
| **ESP32** | Kein direkter Bezug im Konzept (KI/Export serverseitig); ETDFAD/TinyML optional in Offene Entscheidungen erwaehnt | — |

---

## Implementierungsstatus Code — 2026-03-03 (Auftrag zuende ausgefuehrt)

Folgende Teile wurden im Repo **umgesetzt** (El Servador):

| Phase | Item | Status | Datei / Aenderung |
|-------|------|--------|-------------------|
| **L2.0** | Notification-Schema KI | Implementiert | `src/schemas/notification.py`: `NOTIFICATION_SOURCES` += `ai_anomaly_service`, `NOTIFICATION_CATEGORIES` += `ai_anomaly` |
| **L0.1** | Schema-Versionierung + Lazy Migration | Implementiert | `src/utils/metadata_migration.py`: `CURRENT_SCHEMA_VERSIONS`, `migrate_metadata()` |
| **L0.2** | Backend Schema-Registry API | Implementiert | `src/api/v1/schema_registry.py`: GET `/v1/schema-registry/`, GET `/{device_type}`, POST `/{device_type}/validate`; `pyproject.toml`: jsonschema; Router in `api/v1/__init__.py` registriert |
| **L0.3** | Zone-KPIs | Bereits vorher implementiert | `src/services/zone_kpi_service.py`, GET `/api/v1/zone/context/{zone_id}/kpis` |
| **L2.2** | AI Notification Bridge | Implementiert | `src/services/ai_notification_bridge.py`: `AnomalyResult`, `AINotificationBridge.route_anomaly()` (AIPredictions + Suppression + NotificationRouter) |
| **L2.3** | Kontextsensitive Schwellwerte | Bereits vorher implementiert | `src/services/zone_aware_thresholds.py`, Nutzung in `sensor_handler.py` |
| **L2.4** | Component Health Score | Implementiert | `src/services/health_score_service.py`: `HealthScoreService.get_score()`; `src/schemas/esp.py`: `ComponentHealthScoreResponse`; GET `/v1/esp/devices/{esp_id}/health/score` in `esp.py` |
| **L3.3** | NLQ REST-Endpoint | Implementiert | `src/api/v1/ai.py`: Prefix `/v1/ai`, POST `/query` (regelbasiert), `AIQueryRequest` / `AIQueryResponse` |

**Noch nicht implementiert (Roadmap bleibt):** L1.1 pgvector/Embedding, L1.2 WoT TD Export, L1.3 Knowledge Graph API, L2.1 Online Anomaly (Z-Score im sensor_handler), L3.1 MCP-Server, L3.2 RAG/Context Injection, Phase E Feedback. Optional: `migrate_metadata()` beim Lesen von JSONB in API-Layer aufrufen (L0.1 Nutzung).
