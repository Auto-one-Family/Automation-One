# Auftrag T10-Fix-E: Orphaned sensor_configs Cleanup (Altlasten)

> **Bezug:** T10-Verifikationsbericht Phase 10/15 — NB-T09-08 Altlasten
> **Prioritaet:** NIEDRIG — funktionale Altlasten, kein aktiver Bug
> **Bereich:** El Servador (Backend) — einmaliges Cleanup-Script + Praeventions-Check
> **Datum:** 2026-03-08
> **Abhaengigkeit:** Keine — kann unabhaengig umgesetzt werden

---

## Problem (IST)

### 9 verwaiste sensor_configs von 2 frueher geloeschten Devices

Bei der T10-Verifikation wurden 9 orphaned `sensor_configs` gefunden, die zu bereits soft-deleted Devices gehoeren:

| Device (soft-deleted) | Orphaned Configs |
|----------------------|-----------------|
| MOCK_3917D1BC | 6 sensor_configs |
| MOCK_4B2668C2 | 3 sensor_configs |
| **Gesamt** | **9 Orphans** |

Diese Orphans entstanden VOR dem T09-Fix-B, der das Cascade-Delete fuer sensor_configs bei Device-Loeschung korrekt implementiert hat. Seit dem Fix werden bei neuen Device-Deletes die sensor_configs physisch mitgeloescht (T10 Phase 10 bestaetigte: 0 residual configs nach Device-Delete).

**Auswirkung:**
- Keine direkte Funktionsstoerung — die Orphans gehoeren zu geloeschten Devices und tauchen nirgendwo im Frontend auf
- Sie verstoerzen aber DB-Integritaets-Checks und koennten bei zukuenftigen Queries stoeren
- Potenzieller Health-Check-Rauscher: wenn der Health-Check ueber ALLE sensor_configs iteriert, prueft er auch die Orphans und erzeugt "Device not found"-Warnungen

---

## SOLL-Zustand

### 1. Einmaliges Cleanup-Script

```python
# El Servador/god_kaiser_server/scripts/cleanup_orphaned_configs.py
# [Korrektur verify-plan: Pfad war scripts/ (root) — richtig ist El Servador/god_kaiser_server/scripts/
#  wo alle Server-Scripts liegen (init_db.py, cleanup_old_data.py, etc.)]
"""
Einmaliges Cleanup: sensor_configs loeschen, deren esp_device
soft-deleted ist (deleted_at IS NOT NULL).

Dieses Script ist EINMALIG auszufuehren. Nach Ausfuehrung sollte
die Anzahl 0 sein. Zukuenftiges Cascade-Delete ist seit T09-Fix-B
korrekt implementiert.
"""
import asyncio
import sys
from pathlib import Path

# [Korrektur verify-plan: sys.path Setup noetig — Pattern aus init_db.py]
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# [Korrektur verify-plan: func fehlte im Import — wird fuer func.count() benoetigt]
from sqlalchemy import select, delete, func

# [Korrektur verify-plan: Modul heisst db.models.esp, NICHT db.models.esp_device]
from src.db.models.esp import ESPDevice
from src.db.models.sensor import SensorConfig
# [Korrektur verify-plan: ActuatorConfig Import fehlte komplett]
from src.db.models.actuator import ActuatorConfig
from src.db.session import get_session
from src.core.logging_config import get_logger

logger = get_logger(__name__)

async def cleanup_orphaned_sensor_configs():
    # [Korrektur verify-plan: Session-Setup fehlte — async context manager Pattern]
    async for session in get_session():
        # 1. Finde alle soft-deleted Devices
        deleted_devices = await session.execute(
            select(ESPDevice.id).where(ESPDevice.deleted_at.isnot(None))
        )
        deleted_ids = [row[0] for row in deleted_devices.all()]

        if not deleted_ids:
            print("Keine soft-deleted Devices gefunden. Nichts zu tun.")
            return

        # 2. Zaehle betroffene sensor_configs
        orphan_count = await session.execute(
            select(func.count()).select_from(SensorConfig).where(
                SensorConfig.esp_id.in_(deleted_ids)
            )
        )
        count = orphan_count.scalar()
        print(f"Gefunden: {count} orphaned sensor_configs fuer {len(deleted_ids)} deleted Devices")

        if count == 0:
            print("Keine Orphans. Cleanup nicht noetig.")
            return

        # 3. Loeschen
        result = await session.execute(
            delete(SensorConfig).where(SensorConfig.esp_id.in_(deleted_ids))
        )
        await session.commit()
        print(f"Geloescht: {result.rowcount} orphaned sensor_configs")

        # 4. Auch actuator_configs pruefen (gleiche Situation moeglich)
        orphan_actuators = await session.execute(
            select(func.count()).select_from(ActuatorConfig).where(
                ActuatorConfig.esp_id.in_(deleted_ids)
            )
        )
        act_count = orphan_actuators.scalar()
        if act_count > 0:
            result2 = await session.execute(
                delete(ActuatorConfig).where(ActuatorConfig.esp_id.in_(deleted_ids))
            )
            await session.commit()
            print(f"Geloescht: {result2.rowcount} orphaned actuator_configs")

# [Korrektur verify-plan: Ausfuehrungs-Entrypoint fehlte]
if __name__ == "__main__":
    asyncio.run(cleanup_orphaned_sensor_configs())
```

### 2. Health-Check Filter (Praevention)

> **[Korrektur verify-plan]:** Dieser Filter ist BEREITS implementiert.
> `sensor_health.py` (Zeile 227) filtert bereits `device.deleted_at is not None`
> und fuegt solche Devices zu `offline_esp_ids` hinzu → deren Sensoren werden geskippt.
> Pfad: `El Servador/god_kaiser_server/src/services/maintenance/jobs/sensor_health.py`
>
> Die AutoOps `health_check.py` arbeitet ueber die REST-API (nicht DB direkt) und
> ist daher nicht betroffen — sie sieht nur aktive Devices via `client.list_devices()`.
>
> **Empfehlung:** Kein Code-Change noetig. Nur verifizieren dass der bestehende
> Filter in `sensor_health.py` nach dem Orphan-Cleanup weiterhin korrekt funktioniert.

---

## Was NICHT gemacht wird

- Kein Aendern des Cascade-Delete-Mechanismus (funktioniert seit T09-Fix-B korrekt fuer NEUE Deletes)
- Keine Migration — das ist ein Runtime-Script, kein Schema-Change
- Kein Loeschen der soft-deleted Devices selbst (die bleiben fuer Audit-Zwecke)
- Kein Loeschen von sensor_data (bleibt erhalten via FK SET NULL)

---

## Akzeptanzkriterien

1. **Nach Script-Ausfuehrung:** `SELECT COUNT(*) FROM sensor_configs WHERE esp_id IN (SELECT id FROM esp_devices WHERE deleted_at IS NOT NULL)` = **0**
2. **sensor_data erhalten:** Anzahl sensor_data-Rows unveraendert (derzeit ~985)
3. **Aktive Configs unveraendert:** Sensor-Configs fuer aktive Devices bleiben vollstaendig
4. **Idempotent:** Script kann mehrfach ausgefuehrt werden ohne Schaden (0 Deletes beim zweiten Lauf)

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `El Servador/god_kaiser_server/scripts/cleanup_orphaned_configs.py` | NEU — einmaliges Cleanup-Script |
| ~~`health_check.py`~~ | ~~Filter fuer deleted_at Devices~~ [verify-plan: ENTFAELLT — Filter bereits in `sensor_health.py:227` implementiert] |
