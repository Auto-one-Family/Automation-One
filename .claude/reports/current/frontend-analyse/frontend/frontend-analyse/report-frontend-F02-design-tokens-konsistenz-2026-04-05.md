# Report Frontend F02: Design-System, Tokens, Stilkonsistenz

Datum: 2026-04-05  
Scope: `El Frontend/src/shared/design/**`, `El Frontend/src/styles/**`, `El Frontend/tailwind.config.js`, betroffene `.vue` mit Hardcoded-Farben

## 1) Ergebnis auf einen Blick

- Token-Basis ist vorhanden und stark: `src/styles/tokens.css` definiert die Kern-Hierarchie (Background, Text, Accent, Status, Glass, Spacing, Radius, Z-Index).
- Es gibt aber signifikante Drift in produktiven UI-Flaechen: **185 Hex-Treffer in `src/`**, davon viele ausserhalb reiner Token-Definition.
- Besonders kritisch sind Sicherheits-/Operator-Flaechen (Not-Aus, Confirm-Dialog-Varianten, Monitor/Events), in denen Statusfarben teilweise direkt statt semantisch gemappt werden.
- Der groesste Teil der Drift liegt in zwei Formen:
  - **Direkte Hex-Werte** in Komponenten/CSS (echte visuelle Drift)
  - **Fallback-Hex in `var(--token, #xxxxxx)`** (geringeres Risiko, aber Doppelquellen-Risiko)
- Pattern-Layer ist klar erkennbar (Primitive -> Pattern/Compound -> View), wird farblich aber nicht durchgaengig token-getrieben konsumiert.

## 2) Token-Hierarchie (semantisch vs. technisch)

## 2.1 Technische Basis (Source of Truth)

- Primaere Farb- und UI-Tokens: `El Frontend/src/styles/tokens.css`
  - Background: `--color-bg-*`
  - Text: `--color-text-*`
  - Intent/Status: `--color-success`, `--color-warning`, `--color-error`, `--color-info`
  - Status-Feingranular: `--color-status-good|warning|alarm|offline`
  - Glass/Tiefe: `--glass-*-l1|l2|l3` + Aliase `--glass-*`
  - Semantische Aliase: `--color-border`, `--color-surface-hover`

## 2.2 Laufzeit-/JS-Ableitung

- `El Frontend/src/utils/cssTokens.ts` spiegelt CSS-Tokens in JS (Chart.js, Canvas) und hat Fallback-Hex.
- `El Frontend/src/utils/chartColors.ts` und `El Frontend/src/utils/zoneColors.ts` enthalten eigene Hex-Paletten (designnah, aber parallel zur CSS-Tokenschicht).

## 2.3 Tailwind-Ebene

- `El Frontend/tailwind.config.js` dupliziert viele Farbwerte aus `tokens.css` als eigene Source.
- Risiko: Bei Design-Aenderung muessen mindestens zwei Quellen synchron gehalten werden (`tokens.css` + Tailwind-Konfig, teils zusaetzlich Utils).

## 3) Quantifizierung Hardcoded-Farbdrift (`#rrggbb`)

Methodik:
- Striktes Hex-Muster `#rgb|#rrggbb|#rrggbbaa`.
- Unterschieden zwischen:
  - **Direkt** = harte Hex-Nutzung (hohes Driftpotenzial)
  - **Fallback** = `var(--token, #hex)` (mittleres Driftpotenzial, Doppelquelle)

| Bereich | Hex gesamt | davon Fallback | davon Direkt | UI-Kritikalitaet |
|---|---:|---:|---:|---|
| `components/system-monitor` | 91 | 38 | 53 | Hoch (Operator-Live-Ansicht) |
| `components/esp` | 35 | 14 | 21 | Hoch (Device-Steuerung) |
| `shared/design` | 47 | 35 | 12 | Hoch (Design-System-Kern) |
| `views` | 36 | 18 | 18 | Hoch (globale Monitor-/Dashboard-Views) |
| `components/charts` | 17 | 11 | 6 | Mittel (Visualisierung) |
| `components/dashboard` | 20 | 11 | 9 | Mittel |
| `components/rules` | 9 | 0 | 9 | Mittel-Hoch (Regel-Editor) |
| `components/safety` | 2 | 0 | 2 | **Sehr hoch** (Not-Aus) |
| `utils` | 40 | 0 | 40 | Mittel (JS-Designquelle, nicht direkt UI) |

Hinweis:
- `src/styles/tokens.css` (29 Treffer) ist **keine Drift**, sondern gewollte Token-Quelle.
- `src/styles/main.css` und `src/styles/forms.css` enthalten nur wenige direkte Hex-Stellen, aber globalen Einfluss.

## 4) Mapping: UI-Status -> Token/Farbwert

| UI-Status | Soll-Token | Soll-Wert (aktuell) | Beobachtung in Nutzung |
|---|---|---|---|
| Erfolg/OK | `--color-success` | `#34d399` | Teilweise korrekt, teils direkte Gruen-Hex in Event-/Badge-Styling |
| Warnung | `--color-warning` | `#fbbf24` | Teils korrekt, teils direkte Amber-Varianten (`#f59e0b`, `#f5b014`) |
| Fehler/Kritisch | `--color-error` | `#f87171` | Teils korrekt, teils direkte Rot-Varianten (`#f43f5e`, `#f55a5a`, `#fca5a5`) |
| Info/Aktiv | `--color-info` / `--color-accent*` | `#60a5fa` / `#3b82f6` | In Charts/Tooltips oft direkt verdrahtet |
| Text Primaer/Sekundaer/Muted | `--color-text-*` | `#eaeaf2` / `#8585a0` / `#484860` | Stark genutzt, aber mit vielen Fallback-Hex dupliziert |
| Sensor-Status gut/warn/alarm/offline | `--color-status-*` | `#22c55e` / `#eab308` / `#ef4444` / `#6b7280` | Teilweise sauber (RangeSlider), teilweise Komponenten-spezifische Direktwerte |

## 5) Pattern-Layer-Karte (Primitive -> Compound -> View)

## 5.1 Primitive Layer

- `shared/design/primitives/*` (BaseButton, BaseInput, BaseSelect, BaseToggle, BaseModal, RangeSlider ...)
- Grundmuster fuer Fokus/Disabled vorhanden; `RangeSlider` nutzt semantische Status-Tokens, hat aber direkte Border-Hex.

## 5.2 Compound/Pattern Layer

- `shared/design/patterns/*` (ConfirmDialog, ContextMenu, ToastContainer, ErrorState, EmptyState)
- Hier sitzen viele Fallbacks und mehrere direkte Hover-/Text-Hex, die in produktive Flows ausstrahlen.

## 5.3 View Layer

- `views/*` und fachliche Komponenten (`system-monitor`, `esp`, `rules`, `dashboard`)
- Hoechste Driftwirkung, da dort visuelle Semantik fuer Operator-Entscheidungen sichtbar wird.

## 6) Fokus-/Kontrast-/Disabled-Bewertung (kritische Oberflaechen)

## 6.1 Positiv

- Globales Fokusmuster in `src/styles/main.css` (`.btn:focus-visible`, `.input:focus`) ist konsistent.
- `ConfirmDialog` und `ZoneSwitchDialog` definieren sichtbare `:focus-visible` Outlines.
- Disabled-Zustaende in Primitives sind systematisch vorhanden.

## 6.2 Risiken

- **Safety-Button (Not-Aus)**: Kein expliziter `:focus-visible`-Stil in der Komponente; Keyboard-Fokus-Feedback kann untergehen.
- **Action-Buttons in Dialogen**: `min-height: 40px` statt 44px-Touchziel in mehreren Dialog-Styles.
- **Kontrastdrift durch Direktwerte**: Hover-/Gradient-Varianten sind teils nicht tokenisiert, damit nicht zentral kontrastkontrollierbar.

## 7) Hotspot-Liste mit Priorisierung (P0/P1/P2)

## P0 (sofortiges Risiko)

1. `El Frontend/src/components/safety/EmergencyStopButton.vue`  
   - Komponente: Not-Aus-Button/Overlay  
   - Drift: Direkte Rot-/Text-Hex (`#fca5a5`, `#fee2e2`) + mehrere fixe RGBA-Rotabstufungen  
   - Risiko: Sicherheitskritische Semantik nicht voll tokenzentriert; erschwert zentrale A11y/Kontrast-Steuerung.

## P1 (hoch)

2. `El Frontend/src/components/system-monitor/UnifiedEventList.vue`  
   - Komponente: Event-Kategorien und Severity-Visualisierung  
   - Drift: Direkte Kategorienfarben (`#10b981`, `#f59e0b`, `#8b5cf6`) plus Mischformen mit Token-Fallback  
   - Risiko: Operator-Interpretation (Kategorie vs. Severity) kann bei Theme-/Token-Aenderung auseinanderlaufen.

3. `El Frontend/src/shared/design/patterns/ConfirmDialog.vue`  
   - Komponente: globales Confirm-Muster  
   - Drift: mehrere direkte Hover-/Textwerte (`#4d94f8`, `#f5b014`, `#f55a5a`, `#fff`)  
   - Risiko: zentrale UX-Komponente mit uneinheitlicher Farbableitung.

4. `El Frontend/src/views/MonitorView.vue`  
   - Komponente: Charts/Tooltip/Legend in L2/L3  
   - Drift: feste CHART_COLORS + feste Tooltip-/Tick-Hex (`#8585a0`, `#eaeaf2`, `#484860`)  
   - Risiko: Visualisierungssemantik driftet von Tokens; hoher Sichtbarkeitsgrad.

5. `El Frontend/src/views/SystemMonitorView.vue`  
   - Komponente: Stats/FAB-Highlighting  
   - Drift: Gradient-Mischung mit festen Endfarben (`#f43f5e`, `#f59e0b`)  
   - Risiko: Error/Warning-Gradienten nicht voll zentral steuerbar.

## P2 (mittel)

6. `El Frontend/src/components/rules/RuleFlowEditor.vue`  
   - Drift: feste Node-/Minimap-Farben (z. B. `#22d3ee`, `#c084fc`, `#707080`)  
   - Risiko: Inkonsistente Regel-Visualpalette, aber geringere Sicherheitsauswirkung.

7. `El Frontend/src/utils/chartColors.ts` und `El Frontend/src/utils/zoneColors.ts`  
   - Drift: eigene Hex-Paletten ausserhalb CSS-Tokens  
   - Risiko: Architekturelle Doppelquelle statt unmittelbarer UI-Fehler.

8. `El Frontend/src/shared/design/primitives/RangeSlider.vue`  
   - Drift: direkte Border-Hex (`#b91c1c`, `#a16207`)  
   - Risiko: lokal begrenzt, funktional derzeit stabil.

## 8) Akzeptanzkriterien-Check

- Jede Driftstelle priorisiert (P0/P1/P2): **Erfuellt**.
- Sichtbar, welche Drifts sofortiges Risiko erzeugen (Fehlinterpretation/A11y): **Erfuellt** (`P0`/`P1` oben).

## 9) Verwendete Quellstellen

- `El Frontend/src/styles/tokens.css`
- `El Frontend/src/styles/main.css`
- `El Frontend/tailwind.config.js`
- `El Frontend/src/shared/design/patterns/ConfirmDialog.vue`
- `El Frontend/src/shared/design/primitives/RangeSlider.vue`
- `El Frontend/src/components/safety/EmergencyStopButton.vue`
- `El Frontend/src/components/system-monitor/UnifiedEventList.vue`
- `El Frontend/src/views/MonitorView.vue`
- `El Frontend/src/views/SystemMonitorView.vue`
- `El Frontend/src/components/rules/RuleFlowEditor.vue`
- `El Frontend/src/utils/cssTokens.ts`
- `El Frontend/src/utils/chartColors.ts`
- `El Frontend/src/utils/zoneColors.ts`
