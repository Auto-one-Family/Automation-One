# Paket 04: ESP32 Schreib- und Restore-Strategie (P1.4)

## 1) Ziel

Analyse der NVS-Schreibpfade, Trigger, Guardrails und Restore-Mechanik fuer Reboot/Power-Loss-Robustheit.

ID-Schema:
- Schreibstrategie: `FW-STR-XXX`

## 2) NVS-Schreibpfade (FW-STR-XXX)

| ID | Write-Pfad | Trigger | Write-Haeufigkeit / Burst-Risiko | Atomare Grenze (aus Evidenz) | Fehlerverhalten | Evidenz |
|---|---|---|---|---|---|---|
| FW-STR-001 | Sensor-Config persistieren (`saveSensorConfig`) | Config-Ingestion/Apply fuer Sensorobjekte | mittel bis hoch bei Config-Bursts | pro Sensor/Config-Apply (Detail offen) | bei Queue/Parse-Fail kann Apply ausbleiben | sicher |
| FW-STR-002 | Approval-/Lifecycle-State persistieren (`approved persistieren`, State-Repair) | ACK `approved/online`, Boot-Repair-Pfad | niedrig (ereignisgetrieben) | vermutlich einzelner State-Write | Persistenzfehler fuehrt zu Drift (Trigger-Matrix explizit) | sicher |
| FW-STR-003 | Offline-Rule-Blob persistieren | Config-Apply fuer Offline-Regeln | mittel (bei Rule-Aenderungen) | blob-basiert, beim Load CRC/Size-validiert | CRC/Size-Fail -> Regeln auf 0, wartet Config-Push | sicher |
| FW-STR-004 | Rule-Aktivstatus (`is_active`) Spiegelung | Rule-Transitionen in OFFLINE_ACTIVE | potenziell hoch bei flap/flatternden Inputs | partiell (Status je Rule/Aktor) | NVS-Write-Fail kann stale Rule-State hinterlassen | sicher |
| FW-STR-005 | Provisioning/WiFi-Config persistieren | Portal Submit / Recovery | niedrig bis mittel | config-satzweise (Details offen) | save-fail -> inkonsistenter Provisioning-Zustand moeglich | teilweise |
| FW-STR-006 | Boot-/Safe-Mode Marker | Bootsequenz/Bootloop-Schutz | niedrig, aber reboot-nah | einzelne Marker/Counter (Details offen) | inkonsistentes Verhalten bei write-fail moeglich | teilweise |

## 3) Guardrails je Write-Pfad

| Guardrail | Status im IST | Evidenz / Luecke |
|---|---|---|
| write-on-change | **teilweise** | Approval/Rule-Transitions sind eventgetrieben; explizite no-op-Erkennung fuer alle Config-Felder nicht durchgaengig belegt |
| no-op vermeiden | **offen** | in den Paket-02/03-Dokumenten nicht systematisch belegt |
| valid-before-commit | **teilweise bis sicher** | Config-Parse/Validierung vorhanden; Rule-Blob hat CRC/Size-Checks beim Restore |
| atomare Mehrfeld-Commits | **offen** | keine harte Aussage zur Transaktionsgrenze ueber Sensor+Rule+Lifecycle kombiniert |
| fallback bei Write-Fail | **teilweise** | dokumentiert: Drift-Risiken, Rule-Count-Reset bei Blob-Fehler; kein universeller Rollback beschrieben |
| write-throttle/debounce | **offen** | bei Rule-`is_active` und Config-Burst als Risiko benannt, aber kein globaler Schutz nachgewiesen |

## 4) Restore-Strategie (Boot-Reihenfolge aus Quellen abgeleitet)

1. **Boot-Start + Safe GPIO**
   - Minimierung unsicherer Aktorzustaende vor tieferem Restore.
2. **Persistierter Lifecycle/Provisioning-State**
   - State-Repair (`SAFE_MODE_PROVISIONING` -> `BOOT` unter Guard) und Bootloop-Latch-Entscheidung.
3. **WiFi/MQTT-Connect und Registration Gate**
   - Connectivity wird aufgebaut, aber Safety-Overlay kann parallel in Offline-Logik bleiben.
4. **Config-/Rule-Restore fuer Core1-Owner**
   - Sensor-/Offline-Konfiguration aus NVS; bei Rule-Blob-Defekt fallback auf `rule_count=0`.
5. **Runtime-Neuaufbau**
   - Queues leer, Value-Cache leer/neu, `server_override` und temporale Zaehler reset.

## 5) Kritische Schreib-/Restore-Kopplungen

- **FW-STR-010:** Queue-Full vor Config-Apply verhindert Write und damit deterministischen Restore-Stand.
- **FW-STR-011:** Parse-Fail ohne garantiertes negatives `config_response` erzeugt Server/Firmware-Drift.
- **FW-STR-012:** Rule-Status-Teilpersistenz (`is_active`) ohne klaren Write-Throttle kann Flash-Burst-Risiko erzeugen.
- **FW-STR-013:** ACK-getriebene Zustandspersistenz ist robust, aber bei write-fail entsteht Boot-Drift.
- **FW-STR-014:** Runtime-Caches sind bewusst volatil; sichere Wiederanlaufbarkeit haengt damit staerker an NVS-Config-Konsistenz.

## 6) Bewertung fuer P1.4

- Das IST-System hat valide Persistenz-Anker (Config, Lifecycle, Rules), aber unvollstaendige Guardrail-Evidenz fuer globale No-op-/Throttle-/Atomik-Strategie.
- Die groesste operative Luecke ist nicht nur Write-Failure selbst, sondern fehlende durchgaengige Negativ-Rueckmeldung bei Config-Fehlerpfaden.
- Vor P1.5/P1.6 sollten Write-Last und Write-Granularitaet fuer Rule-Status und Burst-Config eindeutig quantifiziert werden.

