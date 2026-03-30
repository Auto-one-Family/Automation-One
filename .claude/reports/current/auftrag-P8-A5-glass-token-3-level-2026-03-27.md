# Auftrag P8-A5 — Glass-Token 3-Level Tiefenhierarchie

**Typ:** Design-System — Frontend (CSS)
**Schwere:** MEDIUM
**Aufwand:** ~1-2h
**Ziel-Agent:** frontend-dev
**Abhaengigkeit:** Keine
**Roadmap:** `roadmap-P8-v2-implementation-2026-03-27.md`

---

## Kontext

AutomationOne ist ein IoT-Framework mit Vue 3 Dashboard. Das Design-System nutzt `src/styles/tokens.css` mit 129 Design-Tokens und semantischen Prefixes:
- `--color-*` — Farben (success, error, warning, neutral, accent, text-primary etc.)
- `--glass-*` — Glassmorphism (bg, bg-light, border, border-hover, shadow, shadow-glow)
- `--space-*` — Spacing (1 bis 12, in 4px-Schritten, kleinstes Token: `--space-1` = 4px)
- `--elevation-*` — Box-Shadows
- `--radius-*` — Border-Radius

**KEIN `--ao-*` Prefix** — das System nutzt semantische Prefixes ohne Namespace-Prefix.

Glassmorphism wird ueber `backdrop-filter: blur()` realisiert. Die Aesthetik ist Dark Mode mit subtilen Glas-Effekten. Wichtig: `tokens.css` Zeile 99 hat `--color-border: var(--glass-border)` — jede Aenderung an `--glass-border` kaskadiert auf alle Borders im System.

Zusaetzlich existiert `src/styles/glass.css` mit den Utility-Klassen `.glass-panel` und `.card-glass`. Beide haben aktuell hardcoded `backdrop-filter: blur(12px)`. Diese Klassen werden in 5 Dateien genutzt: LoginView, SetupView, BaseCard, BaseModal und einer weiteren Komponente.

---

## Problem

Alle Glass-Elemente nutzen dieselbe Blur-/Background-Stufe. Es gibt keine visuelle Tiefenhierarchie — Navigation, Widget-Cards und Modals sehen gleich "tief" aus. Das widerspricht dem Glassmorphism-Designprinzip: Tiefe entsteht durch unterschiedliche Translucency-Stufen je Ebene.

Dark Glassmorphism Best Practices (2026):
- Hintergrund-Panels (weiter weg = weniger Blur, weniger Weiss-Anteil) = subtiler
- Content-Cards (mittlere Ebene) = Standard-Staerke
- Overlays (vorderste Ebene = mehr Blur, mehr Opazitaet) = am staerksten
- `backdrop-filter: blur(12px)` ist der Sweet Spot fuer die mittlere Ebene
- `backdrop-filter` ist GPU-intensiv — auf Raspberry Pi (Mali GPU) bei vielen gleichzeitigen Elementen problematisch; max 50 Glass-Elemente pro Viewport als Faustregel
- Fallback fuer Geraete ohne `backdrop-filter`: Solid-Dark-Backgrounds mit leicht unterschiedlicher Opazitaet

---

## IST

In `src/styles/tokens.css`:
- Vorhanden: `--glass-bg: rgba(255, 255, 255, 0.02)` (IST-Wert)
- Vorhanden: `--glass-bg-light: rgba(255, 255, 255, 0.04)` — State-Variante (hover/active), kein eigenes Level
- Vorhanden: `--glass-border: rgba(255, 255, 255, 0.06)` (IST-Wert)
- Vorhanden: `--glass-border-hover: rgba(255, 255, 255, 0.12)` — Hover-Variante, kein eigenes Level
- Vorhanden: `--glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.4)` (IST-Wert)
- Vorhanden: `--glass-shadow-glow: 0 0 20px rgba(96, 165, 250, 0.2)` — Effekt-Variante, kein eigenes Level
- Vorhanden: `--backdrop-blur: 8px` und `--backdrop-blur-light: 4px` — fuer `.glass-overlay`, kein Level-Token
- **NICHT vorhanden:** `--glass-bg-l1/l2/l3`, `--glass-blur-l1/l2/l3`, `--glass-border-l1/l2/l3`, `--glass-shadow-l1/l2/l3`
- `--glass-blur` existiert **NICHT** als Token — Blur-Werte sind in Komponenten und glass.css hardcoded
- Kein `@supports not (backdrop-filter)` Fallback

In `src/styles/glass.css`:
- `.glass-panel`: hardcoded `backdrop-filter: blur(12px)`
- `.card-glass`: hardcoded `backdrop-filter: blur(12px)`
- Beide Klassen nutzen `--glass-bg` und `--glass-border` bereits als Token fuer background und border

Ausserdem: ~40 Stellen im Codebase haben hardcoded `backdrop-filter: blur(Xpx)` mit Werten 8px, 12px oder 16px in Component-scoped CSS. Diese werden in diesem Auftrag NICHT angefasst — das ist Phase 3 Scope.

---

## SOLL — 3 Glass-Levels

### Ziel

Drei visuelle Tiefenebenen durch neue Level-Tokens, ohne bestehende Komponenten zu brechen. L2 = exakt die aktuellen IST-Werte (kein visueller Bruch fuer alle Komponenten die `--glass-bg/border/shadow` nutzen). L1 subtiler, L3 staerker.

### Phase 1 — Neue Tokens in `tokens.css` (Pflicht)

```css
:root {
  /* Level 1: Hintergrund-Panels (Navigation, Tab-Bars, Section-Container) */
  --glass-bg-l1:     rgba(255, 255, 255, 0.01);
  --glass-blur-l1:   8px;
  --glass-border-l1: rgba(255, 255, 255, 0.04);
  --glass-shadow-l1: 0 4px 16px rgba(0, 0, 0, 0.2);

  /* Level 2: Content-Cards (Widgets, Zone-Tiles, Info-Cards) — IST-Werte */
  --glass-bg-l2:     rgba(255, 255, 255, 0.02);
  --glass-blur-l2:   12px;
  --glass-border-l2: rgba(255, 255, 255, 0.06);
  --glass-shadow-l2: 0 8px 32px rgba(0, 0, 0, 0.4);

  /* Level 3: Overlays (Modals, SlideOvers, Hover-Toolbars, Dropdowns) */
  --glass-bg-l3:     rgba(255, 255, 255, 0.06);
  --glass-blur-l3:   16px;
  --glass-border-l3: rgba(255, 255, 255, 0.12);
  --glass-shadow-l3: 0 12px 48px rgba(0, 0, 0, 0.5);

  /* Rueckwaertskompatibilitaet: Bestehende Tokens als Alias auf L2.
     Da L2 = IST-Werte aendern sich ALLE Komponenten die --glass-bg/border/shadow
     nutzen visuell NICHT. Kein Breaking Change. */
  --glass-bg:     var(--glass-bg-l2);
  --glass-border: var(--glass-border-l2);
  --glass-shadow: var(--glass-shadow-l2);
  /* NICHT aliasiert, bleiben unveraendert: */
  /* --glass-bg-light    (rgba 0.04, State-Variante fuer hover/active) */
  /* --glass-border-hover (rgba 0.12, Hover-Variante)                  */
  /* --glass-shadow-glow  (Effekt-Variante, kein Level-Token)           */
  /* --backdrop-blur      (8px, fuer .glass-overlay — Phase 3 Scope)   */
  /* --backdrop-blur-light (4px, fuer .glass-overlay — Phase 3 Scope)  */
}
```

**Beachten:** Da `--glass-border: var(--glass-border-l2)` und L2-Wert = IST-Wert (0.06), aendert sich auch `--color-border: var(--glass-border)` nicht. Die Alias-Kette ist sicher.

Die `--glass-blur-l1/l2/l3` Tokens sind **komplett neu** — es gibt keine bestehenden Blur-Tokens die kollidieren koennten (das bestehende `--backdrop-blur: 8px` gehoert zu `.glass-overlay`, nicht zu den Level-Tokens).

### Phase 1b — Performance-Fallback in `tokens.css` (Pflicht)

Der `@supports`-Block muss **beide** Vendor-Prefixe pruefen, weil Safari bis iOS 15 nur `-webkit-backdrop-filter` unterstuetzte:

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  :root {
    --glass-bg-l1:     rgba(17, 24, 39, 0.80);
    --glass-bg-l2:     rgba(17, 24, 39, 0.88);
    --glass-bg-l3:     rgba(17, 24, 39, 0.95);
    --glass-blur-l1:   0px;
    --glass-blur-l2:   0px;
    --glass-blur-l3:   0px;
    --glass-border-l1: rgba(255, 255, 255, 0.08);
    --glass-border-l2: rgba(255, 255, 255, 0.10);
    --glass-border-l3: rgba(255, 255, 255, 0.14);
  }
}
```

Fuer Geraete ohne `backdrop-filter` Support: Solid-Dark-Backgrounds mit leicht unterschiedlicher Opazitaet statt transparentem Glas. Auch fuer Raspberry Pi relevant falls blur aus Performance-Gruenden deaktiviert wird.

### Phase 2 — glass.css auf Token umstellen (Pflicht)

`src/styles/glass.css` — `.glass-panel` und `.card-glass` sollen die neuen L2-Tokens nutzen statt hardcoded `blur(12px)`:

```css
.glass-panel {
  background: var(--glass-bg);                         /* bereits Token */
  backdrop-filter: blur(var(--glass-blur-l2));          /* NEU: Token statt 12px */
  -webkit-backdrop-filter: blur(var(--glass-blur-l2));  /* Safari */
  border: 1px solid var(--glass-border);               /* bereits Token */
  box-shadow: var(--glass-shadow);                     /* bereits Token */
}

.card-glass {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur-l2));
  -webkit-backdrop-filter: blur(var(--glass-blur-l2));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}
```

Komponenten die L3 benoetigen (z.B. BaseModal) ueberschreiben `backdrop-filter` in ihrem eigenen scoped CSS.

### Phase 3 — 2 Pilot-Komponenten umstellen (Pflicht)

**L1-Pilot: `components/common/ViewTabBar.vue`** (bestaetigt existent)
- `background` auf `var(--glass-bg-l1)` umstellen
- `backdrop-filter: blur(var(--glass-blur-l1))` und `-webkit-backdrop-filter: blur(var(--glass-blur-l1))` setzen
- `border-color` auf `var(--glass-border-l1)` umstellen
- `box-shadow` auf `var(--glass-shadow-l1)` umstellen

**L2-Pilot: kein Aufwand noetig** — alle Komponenten die `--glass-bg/border/shadow` nutzen (InlineDashboardPanel, ZoneTileCard etc.) bekommen L2 automatisch ueber den Alias.

**L3-Pilot: `shared/design/primitives/BaseModal.vue`**
- `background` auf `var(--glass-bg-l3)` umstellen
- `backdrop-filter: blur(var(--glass-blur-l3))` und `-webkit-backdrop-filter: blur(var(--glass-blur-l3))` setzen
- `border-color` auf `var(--glass-border-l3)` umstellen
- `box-shadow` auf `var(--glass-shadow-l3)` umstellen

### Level-Zuordnung (Referenz)

| Glass-Level | Wo anwenden | Beispiel-Komponenten |
|---|---|---|
| **L1** | Hintergrund-Panels, Navigation, Tab-Bars | ViewTabBar, Section-Container, Header-Bars |
| **L2** | Widget-Cards, Zone-Tiles, Info-Cards, ESP-Cards | InlineDashboardPanel, ZoneTileCard, ESPCard, SensorCard (via Alias automatisch) |
| **L3** | Modals, SlideOvers, Hover-Toolbars, Dropdowns | BaseModal, WidgetConfigPanel SlideOver, InlineDashboardPanel Hover-Toolbar |

---

## Einschraenkungen

- `--glass-bg`, `--glass-bg-light`, `--glass-border`, `--glass-border-hover`, `--glass-shadow`, `--glass-shadow-glow` werden NICHT entfernt oder umbenannt
- `--glass-bg-light` und `--glass-border-hover` und `--glass-shadow-glow` werden NICHT auf Level-Tokens aliasiert — sie sind State-/Effekt-Varianten, keine Ebenen-Tokens
- `--backdrop-blur` und `--backdrop-blur-light` bleiben unveraendert (gehoeren zu `.glass-overlay`, nicht zu den Glass-Levels) — Phase 3 Scope
- Migration ist inkrementell: in Phase 3 dieses Auftrags nur ViewTabBar (L1) und BaseModal (L3) umstellen
- `.glass-overlay` wird in diesem Auftrag NICHT umgestellt
- Max 50 Glass-Elemente pro Viewport (Performance-Grenze)
- Keine neuen npm-Pakete
- Sub-10px font-sizes (9px, 10px fuer Badges) sind bewusst unter Token-Minimum (`--text-xs` = 11px) — NICHT aendern
- Alle ~40 hardcoded `backdrop-filter: blur(Xpx)` in Component-scoped CSS werden in diesem Auftrag NICHT angefasst

---

## Was NICHT gemacht wird

- Alle Komponenten sofort auf Level-Tokens umstellen — nur glass.css + 2 Pilot-Komponenten (ViewTabBar L1, BaseModal L3)
- Hardcoded `backdrop-filter` in Component-CSS ersetzen — das ist Phase 3 ("alle hardcoded backdrop-filter auf Tokens") in einem separaten Auftrag
- `.glass-overlay` auf Level-Tokens umstellen — separater Scope
- Farb-Hintergrund-Orbs (Gradient-Backgrounds) — spaeteres Design-Feature
- Component-Tokens (z.B. `--gauge-zone-good`) — eigener Token-Audit
- Dark-Mode Toggle — System ist nur Dark Mode

---

## Akzeptanzkriterien

- [ ] `tokens.css`: 3 Glass-Levels definiert (L1, L2, L3) mit je `--glass-bg-lX`, `--glass-blur-lX`, `--glass-border-lX`, `--glass-shadow-lX`
- [ ] L2-Werte entsprechen exakt den bisherigen IST-Werten: bg=0.02, border=0.06, shadow rgba(0,0,0,0.4), blur=12px
- [ ] `tokens.css`: `--glass-bg`, `--glass-border`, `--glass-shadow` als Alias auf L2 (keine Breaking Changes fuer alle Komponenten die diese Tokens nutzen)
- [ ] `tokens.css`: `--glass-bg-light`, `--glass-border-hover`, `--glass-shadow-glow`, `--backdrop-blur`, `--backdrop-blur-light` unveraendert
- [ ] `tokens.css`: `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` Fallback-Block mit Solid-Dark-Backgrounds vorhanden
- [ ] `glass.css`: `.glass-panel` und `.card-glass` nutzen `blur(var(--glass-blur-l2))` statt hardcoded `blur(12px)`; `-webkit-backdrop-filter` Vendor-Prefix ebenfalls gesetzt
- [ ] `ViewTabBar.vue` nutzt `--glass-bg-l1`, `--glass-blur-l1`, `--glass-border-l1`, `--glass-shadow-l1`
- [ ] `BaseModal.vue` nutzt `--glass-bg-l3`, `--glass-blur-l3`, `--glass-border-l3`, `--glass-shadow-l3`
- [ ] Visuell erkennbarer Tiefenunterschied: ViewTabBar (subtiler) < Widget-Cards (Standard) < BaseModal (staerker)
- [ ] Kein visuelles Breaking bei Komponenten die `--glass-bg`, `--glass-border`, `--glass-shadow` ohne Level-Suffix nutzen
- [ ] `--color-border: var(--glass-border)` Kaskade unveraendert (da L2 = IST kein visuelles Breaking)
