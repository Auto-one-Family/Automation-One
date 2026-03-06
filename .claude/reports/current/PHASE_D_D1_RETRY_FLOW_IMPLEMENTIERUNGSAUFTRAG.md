# Phase D — D1: Retry-Flow Implementierungsauftrag

**Erstellt:** 2026-03-06  
**Basis:** PHASE_D_KALIBRIERUNG_IST_ANALYSE_BERICHT.md, Phase D Übersicht  
**Status:** Implementiert (2026-03-06)  
**Priorität:** HOCH  
**Geschätzter Aufwand:** ~2–3h

---

## 1. Ziel

CalibrationStep und SensorConfigPanel-Kalibrierung haben einen **expliziten "Erneut versuchen"-Button** pro Step, wenn der Lesevorgang fehlschlägt. Verbesserte UX gegenüber implizitem Retry (erneuter Klick auf denselben Button).

---

## 2. Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `El Frontend/src/components/calibration/CalibrationStep.vue` | Expliziter Retry-Button bei readError |
| `El Frontend/src/components/esp/SensorConfigPanel.vue` | Optional: "Wert lesen" + Retry (siehe 4.2) |
| `El Frontend/src/composables/useCalibration.ts` | Optional: readError-State für SensorConfigPanel |

---

## 3. CalibrationStep.vue — Detaillierte Änderung

### 3.1 IST-Zustand

- Button "Wert lesen" ruft `readCurrentValue()` → `sensorsApi.queryData()`
- Bei Fehler: `readError.value = '...'`, Fehlermeldung wird angezeigt
- User kann erneut "Wert lesen" klicken (implizit Retry)
- **Gap:** Kein expliziter "Erneut versuchen"-Button; gleicher Button bleibt, UX unklar

### 3.2 SOLL-Verhalten

- Wenn `readError` gesetzt: Zusätzlich zum Fehlertext einen **"Erneut versuchen"**-Button anzeigen
- Klick auf "Erneut versuchen" → ruft `readCurrentValue()` erneut auf (gleiche Logik)
- Button neben oder unter der Fehlermeldung, gleicher Stil wie "Wert lesen" (sekundär/outline)

### 3.3 Konkrete Code-Änderung

**Template (Zeile ~89):**

```vue
<!-- Vorher -->
<div v-if="readError" class="calibration-step__error">{{ readError }}</div>

<!-- Nachher -->
<div v-if="readError" class="calibration-step__error-row">
  <span class="calibration-step__error">{{ readError }}</span>
  <button
    class="calibration-step__retry-btn"
    :disabled="isReading"
    @click="readCurrentValue"
  >
    Erneut versuchen
  </button>
</div>
```

**CSS ergänzen:**

```css
.calibration-step__error-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.calibration-step__retry-btn {
  padding: 0.375rem 1rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--color-warning, #fbbf24);
  background: transparent;
  color: var(--color-warning, #fbbf24);
  cursor: pointer;
  transition: all 0.15s;
}

.calibration-step__retry-btn:hover:not(:disabled) {
  background: rgba(251, 191, 36, 0.1);
}

.calibration-step__retry-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Logik:** Keine Änderung an `readCurrentValue()` — `readError.value = null` wird bereits am Anfang gesetzt.

---

## 4. SensorConfigPanel — Optionale Erweiterung

### 4.1 IST-Zustand

- Kalibrierung nutzt `currentRawValue` aus WebSocket (watch auf espStore.devices)
- Kein "Wert lesen"-API-Call; Wert kommt live
- **Gap:** Bei ESP offline oder WebSocket-Verzögerung ist `currentRawValue` 0 oder veraltet

### 4.2 Empfehlung

**Option A (minimal):** Keine Änderung am SensorConfigPanel für D1.  
Begründung: SensorConfigPanel hat keinen expliziten Lese-Schritt; Retry bezieht sich auf "Wert lesen"-Fehler. CalibrationStep deckt den Hauptfall ab.

**Option B (konsistent):** "Wert lesen"-Button in SensorConfigPanel-Kalibrierung hinzufügen (analog CalibrationStep), mit Retry bei Fehler.  
- Nutzt `sensorsApi.queryData()` bei Klick
- Zeigt bei Fehler "Erneut versuchen"
- Optional: `useCalibration` um `readError`, `isReading`, `readCurrentValue` erweitern (oder lokal in SensorConfigPanel)

**Entscheidung:** Für D1 reicht **Option A**. SensorConfigPanel-Retry kann in D1.1 oder später erfolgen, wenn gewünscht.

---

## 5. Akzeptanzkriterien

- [x] CalibrationStep: Bei Fehler nach "Wert lesen" erscheint "Erneut versuchen"-Button
- [x] Klick auf "Erneut versuchen" führt erneuten API-Call aus
- [x] Während Lesevorgang ist "Erneut versuchen" disabled
- [x] Nach erfolgreichem Retry verschwindet Fehler und Retry-Button
- [x] Design: Retry-Button sekundär (outline), nicht primär
- [x] `npm run build` erfolgreich
- [x] Keine Regression bei bestehender Kalibrierung

---

## 6. Test-Hinweise

1. CalibrationWizard öffnen → Sensor wählen → Punkt 1
2. "Wert lesen" klicken bei offline ESP oder Netzwerkfehler → Fehler + "Erneut versuchen" sichtbar
3. "Erneut versuchen" klicken → erneuter Leseversuch
4. ESP online schalten / Fehler beheben → "Erneut versuchen" → Erfolg, Fehler verschwindet

---

## 7. Abhängigkeiten

- Keine Backend-Änderungen
- Keine API-Änderungen
- Nur Frontend (Vue-Komponente)

---

## 8. Nächste Schritte nach D1

- **D2:** Abbruch-Button (CalibrationWizard + SensorConfigPanel) — [x] implementiert (2026-03-06)
- **D3:** Backend update_calibration sensor_type (Multi-Value)
- **D4:** EC-Presets (1413/12880) in CalibrationWizard — [x] implementiert (2026-03-06)
