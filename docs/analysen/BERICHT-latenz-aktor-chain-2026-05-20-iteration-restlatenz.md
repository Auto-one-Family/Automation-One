# Restlatenz Iteration - kausale Isolation + ein Minimalfix

## Kurzfazit (gelb)
- `t6_t5` bleibt stabil bei `p95=0` (weiterhin gruen fuer den bereits bestaetigten Fix).
- Restlatenz wird weiterhin durch `t1_t0` und `t7_t6` dominiert.
- A/B zur Instrumentierung wurde auf Live-System mit je 5 Wiederholungen gefahren; ein kausal positiver Effekt konnte **nicht** belegt werden.
- Ein explorativer Minimalfix-Kandidat wurde deshalb nicht deployed (revertiert).

## Verifizierter deployed/flash/runtime Stand
- Backend-Container: `sha256:217a3cf8dce28112f6cf43e5d8ac0ec58647c899215b84069964c2566f2e740f|2026-05-20T12:55:22.677385028Z|/home/robin/autoone/El Servador/god_kaiser_server/src:/app/src:bind;/home/robin/autoone/logs/server:/app/logs:bind;/home/robin/autoone/backups:/app/backups:bind;`
- API Health: `healthy`, Version `2.0.0`, Environment `production` (`/api/v1/health`, `/api/v1/health/detailed`)
- ESP Runtime: `ESP_EA5484` `status=online`, `last_seen=2026-05-20T12:58:36.952117Z` (`/api/v1/esp/devices/ESP_EA5484`)
- Firmware-Feld: `firmware_version=null` (kein Flash-Wechsel in dieser Iteration belegt)

## Korrigierte segmentierte Analyse t0..t7 (p50/p95/max)

### Baseline fuer Restlatenz (Pre/Post/Verify2 aus Aktor-Chain-Laeufen)
- Quelle Pre: `/home/robin/autoone/logs/current/hardware/actuator-chain-20260520T112910Z/e2e_summary.json`
- Quelle Post1: `/home/robin/autoone/logs/current/hardware/actuator-chain-20260520T113509Z-postfix/e2e_summary.json`
- Quelle Verify2: `/home/robin/autoone/logs/current/hardware/actuator-chain-20260520T121512Z-verify2/e2e_summary.json`

| Lauf | t1_t0 p50/p95/max | t7_t6 p50/p95/max | t6_t5 p50/p95/max |
|---|---:|---:|---:|
| Pre | 4904 / 7966 / 9282 | 2498 / 4007 / 4546 | 1498 / 5768 / 6417 |
| Post1 | 6325 / 9376 / 11655 | 4253 / 6406 / 6676 | 0 / 0 / 0 |
| Verify2 | 7092 / 10489 / 10554 | 4889 / 6490 / 7555 | 0 / 0 / 0 |

### A/B Instrumentierung (identische Last, je 5 Wiederholungen, 40 Samples Profil)
- Profil A (voll): `/home/robin/autoone/logs/current/hardware/ab-latency-A-full-20260520T124147Z/ab_profile_A_results.json`
- Profil B (minimal Kandidat): `/home/robin/autoone/logs/current/hardware/ab-latency-B-minimal-20260520T124843Z/ab_profile_B_results.json`
- Vergleich: `/home/robin/autoone/logs/current/hardware/ab-latency-comparison-20260520T1255Z.json`

| Profil | api_roundtrip p50/p95/max | t1_t0 p50/p95/max | t7_t6 p50/p95/max |
|---|---:|---:|---:|
| A | 6684 / 10823 / 13276 | 4784 / 7451 / 9831 | 4944 / 6704 / 9693 |
| B | 8240 / 11809 / 13854 | 5825 / 8594 / 10814 | 5430 / 6805 / 6947 *(n=6)* |

Bewertung A/B:
- `t1_t0` und API-Latenz wurden in B nicht besser.
- `t7_t6` in B ist wegen Sample-Drift (`A n=40`, `B n=6`) nicht kausal vergleichbar.
- Ergebnis daher: **OFFEN (kein kausal positiver Instrumentierungs-Fix belegt)**.

## Heatmap dominanter Segmente
- Verify2 Heatmap: `t1_t0` > `t7_t6` > `t3_t2` (`/home/robin/autoone/logs/current/hardware/actuator-chain-20260520T121512Z-verify2/e2e_summary.json`)
- Dominanzfolge:
  1) `t1_t0` (`p95=10489`)
  2) `t7_t6` (`p95=6490`)
  3) `t3_t2` (`p95=5520`)

## Top-10 Outlier inkl. kompletter Kette
- Primarquelle: `/home/robin/autoone/logs/current/hardware/actuator-chain-20260520T121512Z-verify2/outliers_top10.json`
- Belegbundle (Log+DB): `/home/robin/autoone/logs/current/hardware/actuator-chain-20260520T121512Z-verify2/outliers_top10_evidence_bundle.json`

1. `ca6e68de-8ac0-442e-97c5-6437b7227691` S2 direct total `19655` | `t1_t0=10455`, `t2_t1=-1523`, `t3_t2=5010`, `t4_t3=850`, `t5_t4=2`, `t6_t5=-1`, `t7_t6=4862`
2. `a33de994-873f-47b7-a390-a8306db98470` S3 rule total `18791` | `t1_t0=null`, `t2_t1=null`, `t3_t2=5369`, `t4_t3=298`, `t5_t4=-295`, `t6_t5=0`, `t7_t6=6034`
3. `c8eefb34-6081-4ba5-8ec0-a010d6f37278` S3 direct total `18433` | `t1_t0=10358`, `t2_t1=-3248`, `t3_t2=3550`, `t4_t3=1746`, `t5_t4=297`, `t6_t5=0`, `t7_t6=5730`
4. `7469bfb3-f15b-4924-be35-858dfa41448b` S2 direct total `17012` | `t1_t0=9531`, `t2_t1=-2655`, `t3_t2=5258`, `t4_t3=8`, `t5_t4=-299`, `t6_t5=0`, `t7_t6=5169`
5. `53f1ccc4-6e41-46b4-b378-136010cbb1ed` S3 rule total `16597` | `t1_t0=null`, `t2_t1=null`, `t3_t2=null`, `t4_t3=null`, `t5_t4=null`, `t6_t5=-3`, `t7_t6=null`
6. `08b25f66-1704-4177-b99b-de3e0be9e55a` S2 direct total `15743` | `t1_t0=10554`, `t2_t1=-5035`, `t3_t2=5030`, `t4_t3=7`, `t5_t4=1171`, `t6_t5=0`, `t7_t6=4016`
7. `14a74b94-c378-4748-9224-68d0e7589315` S2 direct total `14461` | `t1_t0=6078`, `t2_t1=-2081`, `t3_t2=4113`, `t4_t3=307`, `t5_t4=301`, `t6_t5=0`, `t7_t6=5743`
8. `19ecca14-453a-4af2-a213-78b384eb220c` S1 direct total `14417` | `t1_t0=8916`, `t2_t1=-4381`, `t3_t2=4084`, `t4_t3=298`, `t5_t4=906`, `t6_t5=0`, `t7_t6=4594`
9. `fe06910b-00cf-433e-849d-f903bf7aab99` S2 direct total `14407` | `t1_t0=7194`, `t2_t1=-3227`, `t3_t2=5875`, `t4_t3=583`, `t5_t4=-1162`, `t6_t5=0`, `t7_t6=5144`
10. `f654d3b7-411d-4359-9ab6-b5dff9f93dba` S1 direct total `14375` | `t1_t0=5644`, `t2_t1=-885`, `t3_t2=4722`, `t4_t3=577`, `t5_t4=-572`, `t6_t5=0`, `t7_t6=4889`

## Root-Cause-Kette primaer/sekundaer

### Primaer
1. `t1_t0` (API-Pfad) bleibt Haupttreiber.
2. `t7_t6` bleibt zweiter Haupttreiber, aber mit unstabiler Erfassungsabdeckung in B-Profil.

### Sekundaer
1. `t3_t2` steigt unter Last (vor allem S2/S3-Outlier).
2. Queue-/Inbox-Druck korreliert mit Peaks (`queue_pressure`, `inbound_inbox_evict`) in Outlier-Logs.

## Fix-Liste (Ursache, Aenderung, Risiko, Verifikation)
1. Ursache: moeglicher Instrumentierungs-Overhead durch `_agent_debug_log` im `send_command`-Pfad.
   - Aenderung: testweise Gate in `actuator_service.py` eingebaut.
   - Risiko: verminderte Debug-Tiefe.
   - Verifikation: A/B 5x+5x gezeigt **keine belastbare Verbesserung**; `t7` in B unvollstaendig.
   - Entscheidung: **nicht deployed**; Aenderung reverteirt.
   - Nachweis: `/home/robin/autoone/logs/current/hardware/ab-latency-fix-decision-20260520T1256Z.json`

## Non-Regression Resultate
- Artefakt: `/home/robin/autoone/logs/current/hardware/nonreg-latency-iteration-20260520T1302Z.json`
- Gesamt: `PASS`
- Sensor read/publish: `PASS`
  - Sensor-List API `200`, neue Sensorzeile in DB (join `sensor_data` + `esp_devices`) nach Publish.
- Config push/ack: `PASS`
  - Aktuator-Update `200`, `correlation_id=8f84bcbd-76a7-48ca-bcde-68a28256c135`, terminales Config-Outcome vorhanden.
- ESP heartbeat/state: `PASS`
  - Device/Health jeweils `200`, `status=online`, `last_seen` aktuell.
- Rule enable/disable/test/execute: `PASS`
  - Toggle off/on `200/200`, Test `200`, Execution-History-Eintrag vorhanden.

## Offene Risiken + priorisierte naechste Schritte
1. **OFFEN:** `t7_t6` kausal nicht sauber trennbar, weil A/B-Profil B Stage-Sample-Drift erzeugt hat (`n=6` statt `n=40`).
   - Naechster Schritt: A/B erneut mit garantiert stabilem WS-Client-Stage-Stream (Healthcheck auf `client_stage`-Rate vor jedem Repeat).
2. **OFFEN:** `t1_t0` intern noch nicht in Subphasen separiert.
   - Naechster Schritt: temporaere Substage-Messung im API-Pfad (`lookup`, `safety`, `context`, `publish`, `persist`, `ws`) nur fuer Reprofenster.
3. **OFFEN:** Queue-Pressure-Einfluss auf Outlier ist korrelativ, noch nicht kausal isoliert.
   - Naechster Schritt: Lastkontrolle per konstantem Sensor-Publish-Profil + getrennte Messserie mit gedrosselter Inbox-Last.
4. **OFFEN:** Iterationsziel "ein kausal positiver Minimalfix" in dieser Runde nicht erreicht.
   - Guardrail-konforme Entscheidung: kein ungeklaertes Runtime-Tuning deployen.
