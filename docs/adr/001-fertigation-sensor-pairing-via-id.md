# ADR-001: Fertigation Sensor-Pairing via direkter Config-ID (ohne Rollen-Semantik)

**Status:** Accepted (2026-04-14)  
**Entscheidungs-Datum:** 2026-04-14  
**Betroffene Komponenten:** FertigationPairWidget, useFertigationKPIs, WidgetConfigPanel, Backend Sensor-Endpoints

---

## Context

### Ausgangslage

Das AutomationOne-Framework speichert Sensor-Konfigurationen mit folgenden Strukturen:

**SensorConfig (DB-Modell, sensor.py):**
```python
@dataclass
class SensorConfig:
    id: UUID                        # Sensor-Config-ID (eindeutig pro Sensor)
    esp_id: str
    gpio: int
    sensor_type: str                # 'ec', 'ph', 'temperature', etc.
    sensor_name: str                # User-Label
    sensor_metadata: dict           # Flexible JSON: {"unit": "mS/cm", "description": "..."} 
    # ^ KÖNNTEN measurement_role hier speichern, derzeit leer für Rollen
```

**Bestehende Sensor-Metadata (sensor.py:209-214):**
```python
sensor_metadata = dict(request.metadata or {})
if request.description is not None:
    sensor_metadata["description"] = request.description
if request.unit is not None:
    sensor_metadata["unit"] = request.unit
```

Das `sensor_metadata` Feld ist flexibel (JSON) und könnte als Behälter für ein `measurement_role` Feld dienen (z.B. `"measurement_role": "fertigation_inflow"`).

### Anforderung: Fertigation-Widget

Das Fertigation-Widget (FertigationPairWidget.vue) muss zwei Sensoren des gleichen Typs (z.B. EC oder pH) als Inflow-/Runoff-Paar darstellen:

- **Inflow:** EC/pH des zugeführten Wassers  
- **Runoff:** EC/pH des ablaufenden Wassers  
- **Differenz:** Runoff - Inflow (Indikator für Nährstoff-Akkumulation oder -Mangel)

### Design-Alternativen

#### Alternative 1: Rollen-Semantik im Backend (NICHT GEWÄHLT)

**Ansatz:** Server validiert `measurement_role` in `sensor_metadata`, erlaubt nur bestimmte Paarungen.

```python
# In sensor_handler.py / sensor_service.py
VALID_PAIRING_ROLES = {
    ('fertigation_inflow', 'fertigation_runoff'),
    ('fertigation_inflow_ec', 'fertigation_runoff_ec'),
    ('fertigation_inflow_ph', 'fertigation_runoff_ph'),
}

async def validate_fertigation_pair(inflow_id: UUID, runoff_id: UUID) -> ValidationResult:
    inflow = await repo.get_by_id(inflow_id)
    runoff = await repo.get_by_id(runoff_id)
    
    inflow_role = (inflow.sensor_metadata or {}).get('measurement_role')
    runoff_role = (runoff.sensor_metadata or {}).get('measurement_role')
    
    if (inflow_role, runoff_role) not in VALID_PAIRING_ROLES:
        return ValidationResult.failure(f"Invalid pair: {inflow_role} + {runoff_role}")
    return ValidationResult.success()
```

**Vorteile:**
- Server kennt valide Paarungen, lehnt ungültige ab
- Explizite Semantik: Sensor weiß seine Rolle

**Nachteile:**
- Erfordert Migrations-Logik: alle existierenden Sensoren mit `measurement_role` markieren
- Engere Kopplung: Sensor-Modell muss Anwendungslogik (Fertigation) kennen
- Schwerer zu erweitern: neue Anwendungen (z.B. "Vergleich Zone A vs Zone B") erfordern neue Rollen
- Nicht idempotent: `measurement_role` ändert sich nicht automatisch, wenn Anwendungs-Kontext ändert

#### Alternative 2: Flexible Config-basierte Zuordnung (GEWÄHLT)

**Ansatz:** Dashboard-Widget speichert nur zwei Sensor-Config-IDs; keine serverseitige Validierung der Paarung.

```typescript
// WidgetConfigPanel: Admin wählt zwei Sensor-Config-IDs
const config = {
  inflowSensorId: 'sensor-config-uuid-1',
  runoffSensorId: 'sensor-config-uuid-2',
  sensorType: 'ec'  // Sanity-Check: beide müssen EC sein
}

// useFertigationKPIs.ts: Lädt beide Sensoren, berechnet Differenz
const readings1 = await sensorsApi.queryData({ sensor_config_id: inflowSensorId })
const readings2 = await sensorsApi.queryData({ sensor_config_id: runoffSensorId })
const difference = readings2.value - readings1.value
```

**Vorteile:**
- Keine DB-Migration, keine Änderungen am SensorConfig-Modell
- Flexibel: gleiche Sensoren können in verschiedenen Kontexten genutzt werden (Fertigation, Zone-Vergleich, etc.)
- Frontend trägt die Kontrolle: Dashboard-Admin konfiguriert Paarungen per UI
- Einfach zu erweitern: neue Widget-Typen können gleiche Sensoren re-kombinieren
- Chart-agnostisch: MultiSensorChart.vue kann beliebige Sensorpaare darstellen

**Nachteile:**
- Kein serverseitiger Schutz vor unsinnigen Paarungen (z.B. zwei Inflow-Sensoren)
- Dashboard-Admin trägt volle Verantwortung für logische Konsistenz
- Keine dezentralisierten Validierungs-Fehler (erst zur Laufzeit sichtbar)

#### Alternative 3: Hybrid (NICHT GEWÄHLT)

**Ansatz:** Backend speichert optional `measurement_role`, Frontend ignoriert es, nutzt reine ID-Paare.

Komplexität ohne Nutzen: entweder Rollen oder nicht.

---

## Decision

**Wir implementieren Alternative 2: Flexible Config-basierte Zuordnung (reine Sensor-Config-ID-Paarung).**

### Begründung

1. **Minimal Invasive:** Keine Änderungen am Core SensorConfig-Modell, keine Migrationen
2. **Separation of Concerns:** Sensor-Konfiguration ≠ Anwendungslogik (Fertigation-Kontext)
3. **Zukunftssicher:** Neue Widget-Typen und Anwendungsfälle erfordern keine Backend-Änderungen
4. **Frontend-Kontrolle:** Dashboard-Admin kann Paarungen flexibel anpassen
5. **Operativ bewährt:** Multi-Sensor-Chart folgt gleichem Pattern (beliebige Sensoren kombinierbar)

---

## Consequences

### Positive

1. **Schnelle Implementierung:** Widget kann heute deployed werden ohne Backend-Änderungen
2. **Benutzer-Freundlich:** Admin-UI (WidgetConfigPanel) zeigt alle EC/pH-Sensoren, Admin wählt zwei
3. **Erweiterbar:** Zukünftige Widgets (Zone-Vergleiche, Cross-ESP-Analysen) folgen gleichem Pattern
4. **Test-freundlich:** Unit-Tests mocken zwei beliebige Sensoren

### Negative / Kompensierungen

| Risiko | Auswirkung | Mitigation |
|--------|-----------|-----------|
| Admin wählt zwei Inflow-Sensoren (Logik-Fehler) | Widget zeigt Differenz = 0 | Onboarding-Doc für Dashboard-Config klarstellen; Optional: UI Hint "Wähle einen Inflow + einen Runoff" |
| Admin ändert Sensor-Typ nach Konfiguration (z.B. wechselt EC ↔ pH) | Chart-Unit Fehler, KPI-Vergleich unsinnig | Widget-Validierung: beide müssen `sensorType` matchen, Fehler anzeigen |
| Dezentralisierte Fehler: Logik-Probleme erst sichtbar bei Laufzeit | Debugging-Aufwand | Logging in useFertigationKPIs.ts (createLogger) + Error-State im Widget (Zeile 197-203) |
| Keine zentrale Dokumentation von gültigen Paarungen | Chaos bei vielen Dashboards | ADR-001 dokumentieren, WidgetConfigPanel Tooltip hinzufügen |

### Backend Änderungen: KEINE (bewusst)

- SensorConfig-Modell bleibt unverändert
- `/sensors/data` Endpoint bleibt unchanged
- MQTT sensor_handler.py bleibt unchanged
- Keine Alembic-Migration erforderlich

### Frontend Änderungen: MINIMAL

- FertigationPairWidget.vue: ✓ Implementiert (PropTypes, Chart-Integration)
- useFertigationKPIs.ts: ✓ Implementiert (Trend-Calc, Health-Status)
- WidgetConfigPanel.vue: ERWEITERN (Fertigation-Config-Sektion hinzufügen)
  ```typescript
  const isFertigationPair = computed(() => props.widgetType === 'fertigation-pair')
  // In Zone 3 (erweitert) Inflow/Runoff Sensor-Picker zeigen
  ```

---

## Validation & Review

### Code-Review Checkpoints

- [ ] FertigationPairWidget Props: `inflowSensorId`, `runoffSensorId` sind Strings (Sensor-Config-UUIDs)
- [ ] useFertigationKPIs: nutzt `sensorsApi.queryData({ sensor_config_id })` ohne Rollen-Check
- [ ] WidgetConfigPanel: zeigt Sensor-Picker für beide IDs (sensorType 'ec' oder 'ph')
- [ ] Error-Handling: Widget zeigt graceful Error wenn Sensoren nicht existieren
- [ ] Types: SensorDataQuery + SensorDataResponse haben `sensor_config_id` Query-Param

### Test-Cases

| Szenario | Expected | Test-Typ |
|----------|----------|----------|
| Admin wählt zwei EC-Sensoren | Widget rendert, Chart zeigt beide | Integration |
| Admin wählt EC + pH (Typ-Mismatch) | Error: "Sensor types must match" | Unit |
| Sensor-Daten fehlen (API 404) | KPI shows `dataQuality='error'` | Unit |
| WS-Update nur für Inflow | Runoff-Wert bleibt, Differenz recalc | Unit |
| Trend-History < 3 Readings | `differenceTrend = null` | Unit |

### Deployment-Strategie

1. Feature-Branch: `feature/fertigation-widget-adr001`
2. Code-Review mit Fokus auf error-handling und type-safety
3. Unit-Tests + Integration-Tests (mit Mock-Sensoren)
4. Release: Feature-Flag für Dashboard-Admins (nicht erzwungen, optional)

---

## Related Decisions

- **ADR-???:** Sensor-Metadata-Struktur (Falls später zentrale Rollen-Katalog hinzukommt)
- **FertigationPairWidget Integration Reference:** `docs/FERTIGATION_WIDGET_INTEGRATION.md`

---

## Alternatives Considered (Rejected)

| Alternative | Rejection Grund |
|-------------|-----------------|
| Server-seitige Rollen-Validierung | Zu invasiv, erfordert Migration; besser Frontend-Kontrolle |
| Härtere Validierung (z.B. GPIO-Konflikt-Check) | Out of Scope; Sensor-Config erlaubt bereits beliebige GPIOs |
| Neuanlegen von speziellen "Fertigation-Sensor"-Typ | Unnötige DB-Komplexität; EC/pH sind generische Typen |

---

## References

- **Implementierung:** `El Frontend/src/components/dashboard-widgets/FertigationPairWidget.vue`
- **Composable:** `El Frontend/src/composables/useFertigationKPIs.ts`
- **Config-UI:** `El Frontend/src/components/dashboard-widgets/WidgetConfigPanel.vue`
- **Integration Ref:** `docs/FERTIGATION_WIDGET_INTEGRATION.md`
- **SensorConfig Model:** `El Servador/god_kaiser_server/src/db/models/sensor.py`
- **Sensor API:** `El Servador/god_kaiser_server/src/api/v1/sensors.py` (GET /v1/sensors/data)

