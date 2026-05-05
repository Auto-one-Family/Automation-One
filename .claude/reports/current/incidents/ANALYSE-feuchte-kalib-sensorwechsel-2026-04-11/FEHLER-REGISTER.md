# FEHLER-REGISTER — ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11

**Regel:** Ein Eintrag pro **bestätigter** Hypothese oder BLOCKER; Verify = messbar.

| ID | Evidenz | Hypothese (Ursache vs. Symptom) | Fix (thematisch) | Verify |
|----|---------|-----------------------------------|------------------|--------|
| E-01 | Postgres: `sensor_configs` für **ESP_EA5484** ohne `moisture`; gleichzeitig `sensor_data` mit `moisture` auf GPIO 32/33 (max. Timestamp 2026-04-10 12:31 UTC) | **Symptom:** Telemetrie ohne passende Config-Zeile — Ingest läuft im „ohne Config“-Pfad (`sensor_handler` WARN) | PKG-HW-01: Delete/Re-Config-Kette und Gerätezustand klären; ggf. erzwungener Config-Resync | SQL-Join `sensor_configs`↔`sensor_data` + Server-Log WARN-Rate |
| E-02 | STDDEV(`processed_value`) 2h: EA5484 GPIO **32** ≈ **283**, **6B27C8** GPIO **33** ≈ **3.37** | **Symptom:** extreme Schwankung auf EA5484/32 vs. stabile Referenz — **nicht** allein „Kalibrier-Formel“, solange **Config/ GPIO-Mix** unklar ist | Zuerst E-01/E-03; dann PKG-CAL-02 | Gleiche SQL-Aggregate nach Fix (Regression) |
| E-03 | `calibration_sessions`: EA5484 mehrere **APPLIED** auf GPIO **32**; `sensor_configs` aktuell **ohne** moisture | **Hypothese:** Session-Apply und persistierte Config **abweichend** (anderes Volume, manuelles Löschen, oder zweites System) | PKG-CAL-01 + Audit: nach Apply muss `sensor_configs` Zeile existieren | Abfrage nach Apply + API GET Sensorliste |
| E-04 | Baseline-Bericht + dieser Lauf: parallele **GPIO 32** (Warnung config not found) und **33** (Pi-Enhanced in Logs) | **Hypothese:** zweiter Kanal / Altlast erzeugt **scheinbare** Oszillation und verwässert Diagnose | PKG-HW: ein führendes GPIO pro Feuchte-Physik; Dokumentation Operator | MQTT-Logger Filter pro GPIO |

**BLOCKER (kein Live-Fix in diesem Analyse-Lauf):** Keine — **Evidence** aus Postgres und Code-Pfaden ist reproduzierbar; Hardware-Ersatz/Verkabelung nur als empirischer Faktor im Bericht.
