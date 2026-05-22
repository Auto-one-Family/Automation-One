# Verifikation Latenzkette t0..t7 (Post-Fix, konsolidiert)

## Kurzfazit
- **Status: Gelb**
- **Belastbar belegt:** Der kausale Fix auf `t6_t5` ist stabil (`p95=0` in zwei aufeinanderfolgenden Post-Fix-Laeufen).
- **Weiter offen:** End-to-End wird weiterhin primaer durch `t1_t0` und `t7_t6` dominiert.
- **Keine Annahmen:** Wo Evidenz fehlt, ist der Punkt als **OFFEN** markiert und mit gezieltem Messweg versehen.

## Aufgeraeumter Evidenz-Index (Single Source of Truth)
- Pre-Fix Vergleich: `logs/current/hardware/actuator-chain-20260520T112910Z`
- Post-Fix Lauf 1: `logs/current/hardware/actuator-chain-20260520T113509Z-postfix`
- Post-Fix Lauf 2 (neu): `logs/current/hardware/actuator-chain-20260520T121512Z-verify2`
- Direkter Laufvergleich: `logs/current/hardware/actuator-chain-20260520T121512Z-verify2/verify2_vs_postfix_baseline.json`

## Harte Belege zum gesetzten Fix
### Fix-Stelle (Code)
- `El Servador/god_kaiser_server/src/db/repositories/command_contract_repo.py`
- Wirkung: `terminal_at` wird nur noch beim ersten terminalen Zustand gesetzt.

### Vorher/Nachher (metrisch)
- Quelle pre-fix/post-fix: `actuator-chain-20260520T112910Z` vs `actuator-chain-20260520T113509Z-postfix` (`fix_effect_summary.json`)
  - S1 `t6_t5 p95`: `4791 -> 0`
  - S2 `t6_t5 p95`: `5197 -> 0`
- Stabilitaetscheck mit neuem Lauf: `actuator-chain-20260520T121512Z-verify2/segment_metrics_by_scenario.json`
  - S1 `t6_t5 p95`: `0`
  - S2 `t6_t5 p95`: `0`
  - S3 `t6_t5 p95`: `0`
  - S4 `t6_t5 p95`: `0`

## Neue Ergebnisse aus dem aktuellen Verifikationslauf (`verify2`)
### E2E pro Szenario
- Quelle: `actuator-chain-20260520T121512Z-verify2/e2e_summary.json`
- S1: p95 `14410`, max `14417`
- S2: p95 `18729`, max `19655`
- S3: p95 `18755`, max `18791`
- S4: p95 `11707`, max `12767`

### Segment-Hotspots (global)
- Quelle: `actuator-chain-20260520T121512Z-verify2/e2e_summary.json` (`heatmap`)
- `t1_t0` p95 `10489` (dominant)
- `t7_t6` p95 `6490` (dominant)
- `t3_t2` p95 `5520`
- `t6_t5` p95 `0` (Fix stabil)

### Delta gegen Post-Fix Lauf 1
- Quelle: `verify2_vs_postfix_baseline.json`
- Global:
  - `t6_t5 p95`: `0 -> 0` (stabil)
  - `t1_t0 p95`: `9376 -> 10489` (hoeher)
  - `t7_t6 p95`: `6406 -> 6490` (leicht hoeher)
- Szenarien:
  - S1 E2E p95 `14620 -> 14410` (leicht besser)
  - S2 E2E p95 `16952 -> 18729` (schlechter)
  - S3 E2E p95 `12368 -> 18755` (deutlich schlechter)
  - S4 E2E p95 `7653 -> 11707` (schlechter)

## Metriken selbst als potenzielle Latenzursache
### Was ist belegt
- Instrumentierung ist aktiv und liefert konsistente Stages (`t0..t7`) ueber zwei Post-Fix-Laeufe.
- Negative `t2_t1` bleiben vorhanden (in `verify2`: 14 Treffer), sind mit der aktuellen Stage-Definition vereinbar (`publish` vor API-Return innerhalb desselben Requests moeglich).

### OFFEN (nicht belegt, keine Annahme)
- Ob die aktuelle Instrumentierung/Logging selbst nennenswert Latenz erzeugt (z. B. Logger-I/O, Audit-Write-Frequenz), ist **nicht kausal belegt**.

### Gezielter Nachweisweg (naechster Schritt)
1. A/B-Lauf mit identischem Lastprofil:
   - A: volle Stage-Logs aktiv
   - B: Stage-Logs nur in-memory Counter (kein persistenter Write)
2. Vergleichskennzahlen:
   - `t1_t0`, `t7_t6`, E2E p95/max
3. Signifikanz:
   - mindestens 5 Wiederholungen je Profil, gleiche Reihenfolge/randomisiert
4. Abbruchregel:
   - wenn Differenz <5% und innerhalb Run-Varianz: "kein signifikanter Mess-Overhead"

## Outlier-Belege (aktueller Lauf)
- Quelle: `actuator-chain-20260520T121512Z-verify2/outliers_top10.json`
- Top 3:
  - `ca6e68de-8ac0-442e-97c5-6437b7227691` (`19655 ms`, S2)
  - `a33de994-873f-47b7-a390-a8306db98470` (`18791 ms`, S3, rule)
  - `c8eefb34-6081-4ba5-8ec0-a010d6f37278` (`18433 ms`, S3, direct)

## Non-Regression (aktualisiert)
- **Sensor read/publish:** OK (aktuelle Daten fuer `ESP_EA5484` in `sensor_data`)
- **ESP heartbeat/state:** OK (`esp_devices.status=online`, `last_seen` aktuell)
- **Rule execute:** OK (`logic_execution_history` neue erfolgreiche Eintraege)
- **Config push/ack:** OFFEN/Fehlerbild bestaetigt
  - Korrelations-ID: `cfg-nr-1779277125615`
  - Beobachtung: `accepted -> failed(COMMIT_FAILED)` bei `flow=config`
  - Bewertung: kein Beleg, dass dies durch den `t6`-Fix verursacht wurde; separat zu isolieren.

## Offene Punkte mit gezieltem Weg zur Aufloesung
1. **OFFEN:** Primaere Ursache fuer hohes `t1_t0`.
   - Messweg: Substages in `actuator_service` (`safety`, `context_load`, `publish_call`, `persist_publish_success`).
2. **OFFEN:** Primaere Ursache fuer hohes `t7_t6`.
   - Messweg: Frontend-Stages `ws_arrival -> store_apply -> render_commit` mit `correlation_id`.
3. **OFFEN:** `COMMIT_FAILED` im Config-Flow.
   - Messweg: gezielter Einzel-Run mit identischer Payload + DB/handler Trace + reconciliation-Check.
4. **OFFEN:** Vollstaendige `t7`-Abdeckung fuer alle Rule/NOOP-Ketten.
   - Messweg: Pruefen, warum in `verify2` noch `t7=null` Faelle auftreten und ob dies semantisch erwartet ist.
