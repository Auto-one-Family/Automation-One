# TASK-PACKAGES — EA5484 Kalibrierungs-/Measure-Burst (Post-Verify)

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-artefact-ea5484-calibration-measure-burst-mqtt-load-2026-04-11.md`  
**run_id:** `ea5484-calibration-measure-burst-2026-04-11`  
**Aktueller Git-Branch (Lagebild):** `auto-debugger/work` — **Soll-Branch für alle Commits:** `auto-debugger/work`  
**Verify:** `VERIFY-PLAN-REPORT.md` (dieser Ordner); Post-Verify-Anpassung siehe Abschnitt „Verify-Deltas eingearbeitet“.

## Strategiewahl (ein Haupthebel)

Nach `verify-plan`: **Primär PKG-01 (Frontend)** — Mindestabstand / UX-Sperre im Kalibrier-Wizard analog `SensorValueCard`, **ohne** REST-Kontraktänderung. Serverseitiges Rate-Limit (PKG-02) bleibt **blockiert** bis Transport-Incident abgeschlossen (Querverweis STEUER `STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`).

---

## PKG-01 — Kalibrier-Wizard: Post-Trigger-Cooldown (Frontend) — **ERLEDIGT**

| Feld | Inhalt |
|------|--------|
| **Owner** | `frontend-dev` |
| **Risiko** | Niedrig — nur UI-Timing; keine Emergency-Stop-/Aktor-Confirm-Pfade berühren. |
| **Scope** | `El Frontend/src/composables/useCalibrationWizard.ts` (`triggerLiveMeasurement`), ggf. `CalibrationStep.vue` nur wenn Props nötig. |
| **IST (vor Umsetzung)** | `isMeasuring` wurde im `finally` unmittelbar nach HTTP-Response auf `false` gesetzt → schnelle Folgeklicks erzeugten erneut `POST …/measure`. |
| **SOLL** | Mindestintervall (z. B. **2000 ms** konsistent zu `SensorValueCard.vue`) **nach erfolgreichem** `triggerMeasurement`, bevor ein neuer Aufruf möglich ist; Fehlerpfad klarer UX-Text optional. |
| **Tests** | `cd "El Frontend" && npx vitest run` (bestehende Wizard-Tests erweitern oder neuen Unit-Test für Debounce/Cooldown-Logik). |
| **Akzeptanz** | (1) `npx vue-tsc --noEmit` fehlerfrei. (2) Manuell: Nach „Messung starten“ ist der Button für ≥2000 ms gesperrt, auch wenn HTTP <200 ms zurückkommt. (3) Keine Regression: `SensorValueCard` unverändertes Verhalten. (4) Commits **nur** auf `auto-debugger/work`. |

---

## PKG-02 — Server: optionales Rate-Limit `POST …/measure` (BACKLOG / BLOCKER)

| Feld | Inhalt |
|------|--------|
| **Owner** | `server-dev` |
| **BLOCKER** | Umsetzung erst nach Transport-/TLS-Incident-Klärung (`STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`), damit keine falsche Ein-Ursachen-Story. |
| **Scope** | `sensor_service.trigger_measurement` oder dedizierte Middleware — **429** + klare `detail`-Message nur nach API-Design-Freigabe (kein stiller Drop). |
| **Akzeptanz** | Separates Paket nach Freigabe; pytest für Limit-Grenzen; **kein** Breaking ohne Versionierungs-PKG (Steuer `forbidden`). |

---

## Verify-Deltas eingearbeitet (Kurz)

- Pfade `El Servador/god_kaiser_server/src/…` und `El Frontend/src/…` gegen Repo bestätigt.  
- `El Frontend/src/api/sensors.ts`: Kommentar zu `sensors.py:727-773` — **nachgezogen** in PKG-01 auf `sensors.py:1649-1695`.  
- Kein bestehendes Server-Rate-Limit für `measure` — PKG-02 explizit BACKLOG.
