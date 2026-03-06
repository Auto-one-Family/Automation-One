# Phase D — D4: EC-Presets (1413 / 12.880 µS/cm) Implementierungsauftrag

**Erstellt:** 2026-03-06  
**Reihe:** Roadmap Alert-Kalibrierung-Sensortypen, Phase D  
**Priorität:** MITTEL  
**Typ:** Frontend-Anpassung  
**Ziel-Repo:** auto-one (El Frontend)  
**Status:** Implementiert (2026-03-06)

---

## 1. Ziel

EC-Sensoren mit 2-Punkt-Kalibrierung: Nutzer können Preset-Paare per Dropdown wählen statt Werte manuell einzugeben. 1413 µS/cm und 12.880 µS/cm sind NIST-zertifizierte Kalibrierstandards (Atlas Scientific, Apera, Vernier).

---

## 2. IST-Analyse (vor Implementierung)

| Aspekt | Aktuell |
|--------|---------|
| CalibrationWizard EC | 2-Punkt (Punkt 1, Punkt 2) |
| Referenzwerte | sensorTypePresets.ec: point1Ref 1413, point2Ref 12880 (fest) |
| CalibrationStep | Props: suggestedReference, referenceLabel — User kann Referenz eingeben/ändern |

---

## 3. Implementierung (bereits umgesetzt)

### 3.1 CalibrationWizard.vue

**State:**
- `ecPreset: ref<EcPresetId>('1413_12880')` — Default: "1413 / 12.880 µS/cm"
- `EC_PRESETS = { '0_1413': { point1: 0, point2: 1413, label: '0 / 1413 µS/cm' }, '1413_12880': { point1: 1413, point2: 12880, label: '1413 / 12.880 µS/cm' } }`
- `EcPresetId = '0_1413' | '1413_12880' | 'custom'`

**Dropdown (nur bei sensor_type === 'ec'):**
- Label: "Kalibrierloesung"
- Optionen: "0 / 1413 µS/cm", "1413 / 12.880 µS/cm", "Eigene Werte"
- Anzeige in Phase point1 und point2
- BEM: `.calibration-wizard__ec-preset-row`, `.calibration-wizard__ec-preset`

**Logik:**
- `ecPointRefs` computed: Liefert point1/point2 aus Preset oder undefined bei Custom
- `getSuggestedReference(stepNumber)`: EC nutzt ecPreset; bei Custom undefined
- `getReferenceLabel(stepNumber)`: EC nutzt Preset-Labels; bei Custom sensorTypePresets
- `reset()`: ecPreset = '1413_12880'

### 3.2 CalibrationStep.vue

- Keine Änderung nötig — erhält `suggestedReference` und `referenceLabel` als Props
- Bei Preset: `suggestedReference` wird gesetzt; bei Custom: undefined → User gibt manuell ein
- watch auf `suggestedReference` aktualisiert `referenceValue` bei Preset-Änderung

---

## 4. Akzeptanzkriterien

- [x] Bei EC: Dropdown "Kalibrierlösung" mit "0 / 1413 µS/cm", "1413 / 12.880 µS/cm", "Eigene Werte"
- [x] Preset-Wahl setzt point1_ref und point2_ref korrekt
- [x] Default: "1413 / 12.880 µS/cm"
- [x] Bei "Eigene Werte": manuelle Eingabe wie bisher
- [x] BEM, Design-Tokens, konsistent mit D1/D2
- [x] vue-tsc und Vite Build ohne Fehler

---

## 5. Verifikation

- `npx vue-tsc --noEmit` — erfolgreich
- `npx vite build` — erfolgreich
- Manuell: EC-Kalibrierung starten → Preset wählen → Punkt 1/2 haben korrekte Referenz

---

## 6. Was nicht geändert wurde

- `SensorConfigPanel` / `useCalibration` — EC-Presets dort optional/später (eigener kleiner Auftrag)
- Backend — keine Änderung (calibration_points werden wie bisher gesendet)
- pH, moisture, temperature — unverändert

---

## 7. Referenzen

- `PHASE_D_KALIBRIERUNG_IST_ANALYSE_BERICHT.md` — A3 EC-Flow
- `auftrag-phaseD-implementierung-uebersicht.md` — D4 Beschreibung
- `wissen/iot-automation/sensortypen-kalibrierung-ui-retry-presets-recherche-2026.md` — NIST-Standards
