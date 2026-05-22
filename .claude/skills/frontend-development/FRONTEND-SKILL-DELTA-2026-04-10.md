# Frontend-Development-Skill — Delta (2026-04-10)

Ziel: Zieloptimierung des Skills gemaess Auftrag (Phasen A–D). Alle Pfade relativ zur Repo-Wurzel `Auto-one/`.

---

## Phase A — Bestandsaufnahme

### A.1 Skill-Datei

- **Skill:** `.claude/skills/frontend-development/SKILL.md`
- **Weitere Datei desselben Skills:** `.claude/skills/frontend-development/CHANGELOG.md` (Versions-Historie; keine verschachtelten Detail-SKILL-Dateien)

### A.2 Vergleichstabelle (vorher: explizit vs. lückenhaft)

| Bereich | Bereits im Skill explizit (Beleg) | Fehlte oder war ungenau (Beleg für Korrektur) |
|--------|-----------------------------------|-----------------------------------------------|
| Vue-Komponenten (Views, shared) | Ordner `El Frontend/src/components/`, View-Hierarchien (Section 3); Design unter `shared/design/` | Exakte Komponentenzahl driftete; jetzt „~145+“ und Hinweis auf wachsenden `tests/unit`-Bestand |
| Pinia Stores | Tabellen zu Stores und Konventionen (Section 5) | **Pfade:** Viele Stores lagen fälschlich unter `stores/xy.ts` statt `shared/stores/*.store.ts` — belegt durch `El Frontend/src/shared/stores/index.ts` und Dateiliste |
| API-Clients / Typen | `api/` Module, `types/` (Section 4, 7) | Modulanzahl „28“ → tatsächlich **29** `.ts`-Dateien in `El Frontend/src/api/` |
| Routing / Navigation | Section 10, Lazy-Loading, Redirects | Vite-Proxy im Skill wich von `El Frontend/vite.config.ts` ab (`localhost:8000` + `VITE_*_TARGET`) |
| Charts | chart.js, vue-chartjs, Plugins (Section 1) | — (bereits korrekt); ergänzt: externe Doku-Referenz im Phase-B-Abschnitt unten |
| Layout / Dashboard | GridStack, CustomDashboardView (Section 3) | gridstack-Version im Skill vs. `package.json` — angeglichen (^12.4.2) |
| WebSocket | `services/websocket.ts`, useWebSocket (Section 6) | — |
| Tests | Vitest, MSW, Beispielbaum | **Falsch:** jsdom; **IST:** `happy-dom` in `El Frontend/vitest.config.ts`; **E2E:** Playwright unter `El Frontend/tests/e2e/` laut `package.json` — Skill behauptete „E2E nicht vorhanden“ |
| Design-Tokens / CSS | tokens.css, Section 11 | **Falsch:** `src/style.css` als Einstieg; **IST:** `El Frontend/src/main.ts` importiert `./styles/main.css` → `tokens.css` |
| Legacy-Routen | Section 10 Redirects | Ergänzt: expliziter Verweis auf `LEGACY_REDIRECT_PATTERNS` / deprecated `monitor/dashboard` in `El Frontend/src/router/index.ts` |

### A.3 Kernaussagen aus zentraler Projektdoku

Aus **`.claude/CLAUDE.md`** (nur übernommen, was dort steht):

- Verifikation Frontend: `cd "El Frontend" && npm run build` und `npx vue-tsc --noEmit`.
- Kompakt: Sensor-Konfiguration **nur** in HardwareView; **Komponenten-Tab** (`/sensors`) = Wissensdatenbank.
- Regeln: server-zentrisch, Patterns erweitern, Build verifizieren.

---

## Phase B — Recherche (Web, stack-spezifisch)

Kurzfassung mit Bezug zu **diesem** Repo:

| Thema | Quellen (2–5) | Übernehmen / Ablehnen |
|-------|----------------|------------------------|
| **Chart.js + vue-chartjs** | [vue-chartjs Guide](https://vue-chartjs.org/guide/), [Chart.js Doku](https://www.chartjs.org/docs/latest/), [vue-chartjs API](https://vue-chartjs.org/api/) | **Übernehmen:** Konfiguration von Achsen, Plugins und `Chart.register` folgt Chart.js; Vue-Wrapper nur für Komponenten-Lifecycle. **Ablehnen:** ECharts/Apache/Plotly parallel einführen — nicht im `package.json`. |
| **GridStack Dashboard** | [gridstackjs.com](https://gridstackjs.com/), [GridStack API](https://gridstackjs.com/doc/html/classes/GridStack.html), [README gridstack/gridstack.js](https://github.com/gridstack/gridstack.js/blob/master/README.md) | **Übernehmen:** Spalten/Optionen (`column`, Layout-Modi) nach offizieller API; Dashboard-Editor (`CustomDashboardView.vue`) bleibt Single-Stack. **Ablehnen:** Zweites Grid-Framework. |
| **Pinia + Vue 3** | [Pinia Dokumentation](https://pinia.vuejs.org/), [Vue 3 Composition API](https://vuejs.org/guide/extras/composition-api-faq.html) | **Übernehmen:** Setup-Stores und klare Store-Grenzen passen zu `shared/stores/`. **Ablehnen:** Vuex oder globale Singletons neben Pinia. |
| **Vitest + Vue** | [Vitest Konfiguration](https://vitest.dev/config/), [Environment happy-dom](https://vitest.dev/guide/environment.html) | **Übernehmen:** `environment: 'happy-dom'` wie in `vitest.config.ts`; Canvas-Mocks in `tests/setup.ts` für Chart.js. **Ablehnen:** Annahme jsdom ohne Repo-Check. |

---

## Phase C — Synthese (Skill + Codebase)

- **Stack-Anker** und **korrigierte Pfade** in `SKILL.md` Section 1 und 5 eingefügt, damit Agenten nicht gegen die echte Ordnerstruktur arbeiten.
- **Tests:** Skill beschreibt jetzt Vitest/happy-dom, Playwright-Pfade und npm-Scripts aus `El Frontend/package.json`.
- **Agenten-Abschnitt 19:** verdichtet IST-Regeln (`.cursor/rules/frontend.mdc`, Router-Legacy, Konfiguration nur Hardware) zu einer kurzen Checkliste.

---

## Phase D — Umsetzung im Skill

- Neuer Abschnitt **„19. Coding-Agenten: typische Fehler und Soll-Verhalten“** in `SKILL.md` (checklistenartig, ohne generisches Tutorial-Fluten).

---

## PR-Review-Checkliste (Frontend-Änderungen durch Agenten)

1. **Scope:** Nur Auftragsdateien; keine mitgelieferten Refactors in Nachbar-Modulen.
2. **Imports:** Nur `@/…`, keine `../../`-Ketten.
3. **State:** Pinia aus `shared/stores/` bzw. `stores/esp.ts`; keine direkten `axios`-Calls in Views.
4. **Styling:** Tailwind + `var(--color-*)` / Tokens; kein Light-Mode; keine Hex-Farben in neuem UI.
5. **Realtime:** WS-Handler in `onUnmounted` abmelden.
6. **Routing:** Keine neuen Features auf deprecated Redirects (`router/index.ts`).
7. **Konfiguration Sensoren/Aktoren:** Panels nur im Hardware-Flow, nicht im Inventar `/sensors` (siehe CLAUDE.md + Skill Section 3).
8. **Checks:** `npm run build` und `npm run type-check` im Ordner `El Frontend/`.
9. **Tests:** Bei Logikänderungen passende `tests/unit/**/*.test.ts` anpassen oder ergänzen; UI-Flows ggf. Playwright berühren.
10. **Icons:** nur `lucide-vue-next` (Projektregel).

---

*Ende Delta*
