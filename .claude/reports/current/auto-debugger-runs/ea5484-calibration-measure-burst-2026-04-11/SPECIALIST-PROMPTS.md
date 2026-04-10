# SPECIALIST-PROMPTS — EA5484 Measure-Burst (Post-Verify)

**Git (Pflicht)**  
- Arbeitsbranch: **`auto-debugger/work`**.  
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.  
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

---

## Block 1 — `frontend-dev` (PKG-01 nach Verify) — **ERLEDIGT**

**KONTEXT (historisch):** Kalibrier-Wizard konnte `POST …/measure` in kurzer Folge auslösen, weil `isMeasuring` im `finally` von `triggerLiveMeasurement` direkt nach HTTP endete. `SensorValueCard.vue` nutzte bereits eine ~2 s Sperre nach dem Versuch.

**AUFTRAG (war):** Mindestabstand zwischen aufeinanderfolgenden `sensorsApi.triggerMeasurement`-Aufrufen im Kalibrier-Wizard (`useCalibrationWizard.ts`), konsistent zu `SensorValueCard.vue` (ca. Zeilen 78–104). **Stand Doku:** umgesetzt auf `auto-debugger/work` (Cooldown + optionaler `sensors.ts`-Kommentar).

**DATEIEN (vollständige Pfade):**

- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\composables\useCalibrationWizard.ts`
- Referenz: `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\components\esp\SensorValueCard.vue`
- Optional Hygiene: `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\api\sensors.ts` (Kommentar Zeilennummer `sensors.py` korrigieren)

**OUTPUT / VERIFIKATION:**

```bash
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"
npx vue-tsc --noEmit
npx vitest run
```

**REGELN:** Tailwind + Design Tokens; keine neuen Icon-Pakete; WebSocket-Cleanup-Regeln bei neuen Subscriptions beachten (hier voraussichtlich nicht nötig).

---

## Block 2 — `server-dev` (PKG-02 — **NICHT STARTEN**, BLOCKER)

**KONTEXT:** `TASK-PACKAGES.md` PKG-02 ist **BACKLOG** bis Transport-Incident STEUER `STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md` geklärt ist.

**AUFTRAG:** Keine Umsetzung in diesem Lauf. Nach Freigabe: Rate-Limit-Design mit `pytest`, ohne REST-Breaking ohne separates Versionierungs-PKG (Steuer `forbidden`).

---

## Rollen-Reihenfolge

1. **frontend-dev** → PKG-01  
2. **server-dev** → erst nach Entblockierung PKG-02
