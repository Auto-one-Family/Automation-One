# Report Frontend F02: Design-System, Tokens, Stilkonsistenz

Datum: 2026-04-06  
Scope: `El Frontend/src` inkl. Hotspots aus Auftrag F02

## 1) Drift-Baseline (Inventar)

Methodik (wie im Auftrag):
- `direkt hex`: `#[0-9a-fA-F]{3,8}`
- `fallback hex`: `var(--..., #xxxxxx)`
- `token-konform`: `var(--color-...)` ohne Hex-Fallback

Bereichsstatistik (Treffer aus reproduzierbaren Scans):

| Bereich | direkt hex | fallback hex | token-konform |
|---|---:|---:|---:|
| `src/components/system-monitor` | 53 | 38 | 568 |
| `src/components/esp` | 28 | 14 | 491 |
| `src/shared/design` | 12 | 35 | 150 |
| `src/views` | 18 | 18 | 518 |
| `src/utils` | 40 | 0 | 0 |

Kernaussage:
- Token-Nutzung ist breit vorhanden, aber Drift ist in Operator-/Safety-Hotspots real.
- Die kritische Drift ist nicht Menge allein, sondern Ort: Safety und Operator-Live-Ansichten.

## 2) Tabelle: Datei -> Verstosstyp -> Soll-Token -> Risiko -> Aufwand

| Prio | Datei | Verstosstyp | Soll-Token | Risiko | Aufwand |
|---|---|---|---|---|---|
| P0 | `src/components/safety/EmergencyStopButton.vue` | direkt hex (`#fca5a5`, `#fee2e2`) + fixe rotlastige RGBA-Stufen | `--color-error`, `--color-text-inverse`, `--backdrop-color`, `--color-warning-bg`/dedizierte Safety-Tints | Safety-Semantik kann mit Restsystem driften | M |
| P1 | `src/components/system-monitor/UnifiedEventList.vue` | direkte Kategorienfarben (`#10b981`, `#f59e0b`, `#8b5cf6`) + fallback hex | `--color-success`, `--color-warning`, `--color-mock` oder neue `--color-category-*` Tokens | Operator-Interpretation (Kategorie/Severity) uneinheitlich | M |
| P1 | `src/shared/design/patterns/ConfirmDialog.vue` | fallback-hex-Kaskaden + direkte Hover-Hex (`#4d94f8`, `#f5b014`, `#f55a5a`) | `--color-info`, `--color-warning`, `--color-error`, `--color-surface-hover`, `--color-text-inverse` | Globales Pattern verteilt Drift in viele Flows | S-M |
| P1 | `src/views/MonitorView.vue` | direkte Chart-/Tooltip-Hex (`#8585a0`, `#eaeaf2`, `#484860`) + lokale Palette | `tokens.text*` via `cssTokens.ts`, plus Chart-Token-Mapping | Live-Monitoring nicht aus SSOT abgeleitet | M |
| P1 | `src/views/SystemMonitorView.vue` | gemischte Gradients mit direktem End-Hex (`#f43f5e`, `#f59e0b`) | `--color-error`, `--color-warning`, neue Verlaufstokens | Operator-Header-States nicht zentral steuerbar | S-M |
| P2 | `src/utils/cssTokens.ts` | harte JS-Fallback-Hex in Accessors | CSS-only SSOT + zentrale Runtime-Fallback-Policy (z. B. leere Rueckgabe/diagnostic) | Doppelquelle bei Token-Aenderungen | M |
| P2 | `src/utils/chartColors.ts` | statische Hex-Palette | Token-gebundene Palette aus `cssTokens` | Chartfarben koennen von UI-Semantik entkoppeln | S |
| P2 | `src/utils/zoneColors.ts` | statische Hex-Palette inkl. Default-Gray | `--color-iridescent-*`, `--color-success`, `--color-warning`, `--color-text-muted` Mapping | Zone-Farben laufen ausserhalb der Token-Governance | M |

## 3) Token-Migrationsmatrix (Hardcoded/Fallback -> Ziel-Token)

| Ist-Muster | Ziel-Token | Bemerkung |
|---|---|---|
| `#fca5a5`, `#fee2e2` (Emergency Text) | `--color-error` / `--color-text-inverse` | Safety-Button nur semantisch steuern |
| `#10b981` (Sensors-Kategorie) | `--color-success` oder `--color-category-sensors` | Kategorie-Tokens explizit machen |
| `#f59e0b` (Actuators-Kategorie) | `--color-warning` oder `--color-category-actuators` | kein Amber-Bypass |
| `#8b5cf6` (System-Kategorie) | `--color-mock` oder `--color-category-system` | dedizierte Systemfarbe tokenisieren |
| `var(--color-info, #60a5fa)` | `var(--color-info)` | Fallback-Hex entfernen |
| `var(--color-warning, #fbbf24)` | `var(--color-warning)` | Fallback-Hex entfernen |
| `var(--color-error, #f87171)` | `var(--color-error)` | Fallback-Hex entfernen |
| `#4d94f8` (Confirm Hover Info) | `--color-accent-bright` oder `color-mix(in srgb, var(--color-info) ...)` | Hover aus Token ableiten |
| `#f5b014` (Confirm Hover Warning) | `color-mix(in srgb, var(--color-warning) ..., black)` | keine zweite Amber-Quelle |
| `#f55a5a`, `#f43f5e` (Error Gradients/Hover) | `color-mix(in srgb, var(--color-error) ..., black)` | Error-Semantik vereinheitlichen |
| `#8585a0`, `#eaeaf2`, `#484860` (Monitor Chart Text) | `tokens.textSecondary`, `tokens.textPrimary`, `tokens.textMuted` | JS/Chart strikt ueber Token-Accessor |

## 4) Governance-Regelwerk (Ja/Nein-Entscheidungslogik)

1. CSS-Komponenten (Vue `<style scoped>`):
   - Ja: `var(--color-*)`, `var(--glass-*)`, `var(--space-*)`.
   - Nein: direkte Hex/RGBA in Safety- und Operator-Flaechen.

2. Tailwind (`tailwind.config.js`):
   - Ja: Alias-Definitionen, die 1:1 die Semantik aus `tokens.css` spiegeln.
   - Nein: neue Farbwerte, die nicht in `tokens.css` existieren.

3. JS/TS (`utils`, Chart.js, Canvas):
   - Ja: Zugriff ueber `cssTokens.ts` und dokumentiertes Mapping.
   - Nein: freie Paletten fuer produktive Operator- und Safety-Semantik.

4. Fallbacks:
   - Ja: rein technische Fallbacks nur ausserhalb kritischer Flows und zentral dokumentiert.
   - Nein: komponentenlokale `var(--token, #hex)` in Confirm/Safety/Monitor-Hotspots.

5. Neue Farben:
   - Ja: zuerst in `tokens.css` definieren, dann in Tailwind/JS referenzieren.
   - Nein: direkte Einfuehrung in Komponenten.

## 5) A11y-Pruefmatrix (ConfirmDialog, EmergencyStop, UnifiedEventList, Monitor/SystemMonitor)

| Komponente | Fokus | Kontrast | Disabled | Befund | Prioritaet |
|---|---|---|---|---|---|
| `ConfirmDialog.vue` | vorhanden (`:focus-visible`) | teils direkt (z. B. `#1a1a2e`, `#fff`) | vorhanden (Button-Basis) | Fokus gut, Farblogik driftet | P1 |
| `EmergencyStopButton.vue` | kein expliziter `:focus-visible` Stil im File | starke Rotakzente, nicht voll tokenisiert | `:disabled` vorhanden | Keyboard-Fokus fuer Safety nicht klar genug | P0 |
| `UnifiedEventList.vue` | kein klarer eigener Fokusstil fuer `event-item` Klickzeilen | Kategorien/Severity teils direktfarbig | n/a (Listenelemente) | Operator-Farblesbarkeit von mehreren Quellen abhaengig | P1 |
| `MonitorView.vue` | Fokus v. a. in eingebetteten Controls, nicht zentral | Chart-Texte aus direkter Hex-Palette | n/a | Chart-Kontrast zentral schlecht regierbar | P1 |
| `SystemMonitorView.vue` | Fokus bei Buttons/Modal vorhanden | Gradient-Endfarben teils hardcoded | Disabled-Styles vorhanden | Kontraststeuerung nicht voll SSOT | P1 |

## 6) Vorher/Nachher-Migrationsbeispiele (mind. 5 kritische Komponenten)

1) `src/components/safety/EmergencyStopButton.vue` (P0)
- Ist: `color: #fca5a5;` / Hover `#fee2e2`.
- Soll: Text/Flaeche aus `--color-error`, `--color-text-inverse`, abgeleitete Tints ueber `color-mix`.
- Risiko: Safety-Bedeutung driftet bei Theme-/Token-Update.
- Aufwand: M.

2) `src/shared/design/patterns/ConfirmDialog.vue` (P1)
- Ist: `#4d94f8`, `#f5b014`, `#f55a5a`, `#fff`.
- Soll: Variant-Buttons nur aus semantischen Tokens + `color-mix`.
- Risiko: zentraler Pattern-Layer verteilt inkonsistente Zustandsfarben.
- Aufwand: S-M.

3) `src/components/system-monitor/UnifiedEventList.vue` (P1)
- Ist: Kategorie-Colors teils direkt (`#10b981`, `#f59e0b`, `#8b5cf6`).
- Soll: Kategorie-Tokens (oder klare Zuordnung auf bestehende Status-Tokens).
- Risiko: Kategorie/Semantik entkoppelt sich vom Design-System.
- Aufwand: M.

4) `src/views/MonitorView.vue` (P1)
- Ist: lokale `CHART_COLORS` + direkte Tooltip-/Axis-Hex.
- Soll: Palette und Texte komplett ueber `cssTokens.ts`.
- Risiko: Charts folgen nicht garantiert der globalen Farbgovernance.
- Aufwand: M.

5) `src/views/SystemMonitorView.vue` (P1)
- Ist: Gradients mit Hardcoded-Endfarben (`#f43f5e`, `#f59e0b`).
- Soll: Verlauf aus Token oder expliziten `--gradient-*` Tokens.
- Risiko: Fehler-/Warn-Visuals nicht zentral versionierbar.
- Aufwand: S-M.

## 7) Evidenz (konkrete Datei-/Symbolreferenzen)

- `src/styles/tokens.css`: SSOT fuer `--color-*`, `--glass-*`, Statusfarben.
- `tailwind.config.js`: zweite Farbquelle mit vielen direkten Hex-Definitionen.
- `src/utils/cssTokens.ts`: Runtime-Access mit hexbasierten Fallbacks.
- `src/utils/chartColors.ts`: feste Palette (`CHART_COLORS`) als Parallelquelle.
- `src/utils/zoneColors.ts`: feste Palette (`ZONE_COLORS`, `DEFAULT_ZONE_COLOR`).
- `src/components/safety/EmergencyStopButton.vue`: Safety-Button Textfarben direkt.
- `src/shared/design/patterns/ConfirmDialog.vue`: direkte Hover-/Textfarben + Fallback-Hex.
- `src/components/system-monitor/UnifiedEventList.vue`: direkte Kategoriefarben, gemischte Fallbacks.
- `src/views/MonitorView.vue`: direkte Chart-/Tooltip-Farben.
- `src/views/SystemMonitorView.vue`: gemischte Gradient-Endfarben.

## 8) Abschlussbewertung gegen Output-Vertrag

- Tabelle `Datei -> Verstosstyp -> Soll-Token -> Risiko -> Aufwand`: erfuellt.
- Token-Migrationsmatrix mit Hardcoded/Fallback -> Ziel-Token: erfuellt.
- Governance-Regelwerk mit Ja/Nein-Logik fuer CSS/Tailwind/JS: erfuellt.
- A11y-Pruefmatrix fuer geforderte Komponenten: erfuellt.
- Evidenz mit konkreten Dateireferenzen: erfuellt.

## 9) Update 2026-04-06 (Analyse + Fix abgeschlossen)

Umgesetzte Hotspot-Fixes (P0->P2):
- `El Frontend/src/components/safety/EmergencyStopButton.vue` (Safety-Semantik tokenisiert, Fokus explizit)
- `El Frontend/src/components/system-monitor/UnifiedEventList.vue` (Kategorie/Severity auf semantische Tokens)
- `El Frontend/src/views/MonitorView.vue` (Chart/Tooltip/Axis ueber Token-Accessor, lokale Fallbacks entfernt)
- `El Frontend/src/views/SystemMonitorView.vue` (Gradient-/Glow-Endfarben tokenisiert)
- `El Frontend/tailwind.config.js` (Hex-Palette -> semantische Token-Spiegel)
- `El Frontend/src/utils/zoneColors.ts` (Runtime-Policy ohne harte Hex-Defaultpalette)

Reproduzierbarer Scope-Status (nach Fix):

| Datei | direkt hex | fallback hex | token-konform |
|---|---:|---:|---:|
| `src/components/safety/EmergencyStopButton.vue` | 0 | 0 | 31 |
| `src/shared/design/patterns/ConfirmDialog.vue` | 0 | 0 | 22 |
| `src/components/system-monitor/UnifiedEventList.vue` | 0 | 0 | 92 |
| `src/views/MonitorView.vue` | 0 | 0 | 132 |
| `src/views/SystemMonitorView.vue` | 0 | 0 | 92 |
| `tailwind.config.js` | 0 | 0 | 44 |
| `src/utils/zoneColors.ts` | 0 | 0 | 0 |

Verifikation:
- `cd "El Frontend" && npx vue-tsc --noEmit` -> bestanden.
- `cd "El Frontend" && npx vite build` -> bestanden.

Governance-Entscheidungen (Nachlauf):
- CSS-Hotspots nur semantische Tokens (`--color-*`, `--glass-*`, `--space-*`) -> Ja.
- Tailwind als semantischer Token-Spiegel, keine neue Hex-Quelle -> Ja.
- JS/TS keine freie Produktiv-Palette in Safety-/Ops-Semantik -> Ja.
- Lokale `var(--token, #hex)`-Fallbacks in kritischen Hotspots -> entfernt.
