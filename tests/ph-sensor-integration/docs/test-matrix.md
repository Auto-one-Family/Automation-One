# pH Sensor Test Matrix

| Step | Issue | Script | Layer | Key Assertion | Status |
|------|-------|--------|-------|---------------|--------|
| S1 | AUT-374 | s1-setup-config-verify.py | Frontend + Server | pH config in DB, DS18B20 linked via temp_sensor_config_id, ESP heartbeat confirms config push | [~] In Progress (script ready, HW run pending) |
| S2 | AUT-375 | s2-calibration-sim.py | Cross-Layer | 2-point calibration APPLIED, slope ≥ 56.2 mV/pH, calibration session state machine correct | [x] Done 2026-05-12 — 9/10 Pass, 1 Warning (on-demand verify → S3) |
| S3 | AUT-376 | s3-ondemand-measure.py | Cross-Layer | On-demand measure delivers pH value with ATC, sensor_data persisted, WS event received | [~] In Progress (script implemented, HW run pending) |
| S4 | AUT-377 | s4-latency-error.py | Server + Firmware | 5x measure baseline latency <5s p95, error rate 0% under normal load | [ ] offen |
| S5 | AUT-378 | s5-abort-scenarios.py | Cross-Layer | Aborted sessions expire correctly, no zombie sessions, re-trigger works | [ ] offen |
| S6 | AUT-379 | s6-stress-test.py | Firmware | Serial measurements without crash, MQTT queue not overloaded | [ ] offen |
| S7 | AUT-380 | s7-delete-readd.py | Server + DB | sensor_data rows survive sensor delete (FK → NULL), re-add creates clean config | [ ] offen |
| S8 | AUT-381 | s8-zone-switch.py | Server + DB | Historical sensor_data retains zone_id snapshot after zone reassignment | [ ] offen |

## Dependencies

- S2 requires S1 completed (pH config + temp link in place)
- S3 requires S2 completed (calibration APPLIED — P4-GUARD blocks uncalibrated measure)
- S4 requires S3 (at least one successful measure)
- S5 can run after S1 (calibration abort) or after S3 (measure abort)
- S6 requires S3 (measure flow verified)
- S7 requires S2 (calibration data to test integrity)
- S8 requires S3 (at least 3 measurements in Zone A)
