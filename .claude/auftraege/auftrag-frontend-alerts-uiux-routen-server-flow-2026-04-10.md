# Auftrag — Frontend-Alerts: Routen, UI/UX-Vereinheitlichung, Server↔Client-Flow

**Datum:** 2026-04-10  
**Typ:** Verbesserung **schrittweise** (P0 Inventar → mindestens P1 oder BLOCKER; keine Big-Bang-UI-Revolution)  
**Branch:** ausschließlich `auto-debugger/work` (von `master`); kein `push` / kein `force` durch Agenten.

**Repo-Referenz (Orchestrierung & Systemdisziplin):** Vor Start kurz `.claude/reference/auto-debugger-sollworkflow-systemregeln.md` lesen — insbesondere: **PowerShell** Befehle mit **`;`** verketten (nicht `&&`); **Pattern vor Greenfield**; **ehrliche** Aussagen zu `vue-tsc` / Playwright; bei **Code-PKGs** `FEHLER-REGISTER.md` im jeweiligen Run-Ordner mitführen, sofern der Lauf unter `.claude/reports/current/auto-debugger-runs/<run_id>/` oder Incident-Ordner dokumentiert wird.

---

## 1. Problembereich (spezifisch, Orchestrator-Flow bleibt erhalten)

Im **El Frontend** existieren **mehrere Zugänge** zu **Alerts / Benachrichtigungen** (Drawer, TopBar-/Hardware-Widgets, Listen, **Stats-Polling**, **WebSocket-Inbox**, **REST**). Risiken:

- **Inkonsistente UX:** dieselbe Aktion (z. B. Ack aktiver Meldung) **unterschiedlich** oder **ohne** sichtbare **Finalität** (kein Feedback bei `false`/Netzwerkfehler).
- **Zwei Ketten verwechseln:** persistierte **Inbox / ISA-18.2 / `notification_*`** vs. **transientes `error_event`** — unterschiedliche Server-/WS-Semantik, gleiche Erwartung „eine Wahrheit“ (vgl. `docs/analysen/` IST-Observability, falls vorhanden).
- **Polling vs. WS:** kurz divergierende Counts/Liste ohne **Degraded-** oder **Sync-**Feedback.
- **Bausteine nicht zusammenspielen:** Stores (`notification-inbox`, `alert-center`, … — **Namen im Repo verifizieren**), `src/api/`, `src/components/notifications/` — **SSOT pro Concern** schärfen, **keine** zweite parallele „Alert-Sprache“ ohne Paket-Absprache.

**Einordnung:** Fachlicher Schwerpunkt für **Frontend + API/WS-Klarheit**; passt in **TASK-PACKAGES** / **SPECIALIST-PROMPTS** eines Orchestrator-Laufs. **Keine** Umgehung von **verify-plan** / `VERIFY-PLAN-REPORT.md`, wenn aus diesem Auftrag **implementierbare Pakete** für Folge-Code entstehen.

---

## 2. Leitprinzipien (AutomationOne, Operator-UI)

1. **Finalität sichtbar:** `accepted → pending → terminal` mit `success` | `failed` | `timeout` | `partial` — **niemals** stilles Store-`false` ohne **Toast, Inline-State oder Badge**.
2. **Zwei Ketten getrennt kommunizieren:** Inbox/Notifications vs. **error_event** — Labels, Einstiege oder bewusste Konsolidierung **nur** wenn im Paket definiert.
3. **Signalhierarchie:** Lagebild → Detail → Forensik (IDs, `x-request-id` optional im Fehlerpfad).
4. **Degradation:** WS weg / nur Poll — sichtbarer Zustand, **keine** stummen Count-Lügen.
5. **Design-Disziplin:** **Tailwind + Design-Tokens** (`var(--color-*)`, `var(--space-*)`); **Icons nur `lucide-vue-next`** — **keine** Emojis als Icon-Ersatz. RGBA-Rohtöne vs. Token-Mix: **angleichen** oder **einen Satz** im Paket/PR begründen.
6. **Composition API:** `<script setup lang="ts">`; geteilter State in **Pinia**; API nur über **`src/api/`**.
7. **WebSocket:** Listener in **`onUnmounted`** abmelden (keine Leaks bei Routenwechsel).
8. **E2E / Agenten-tauglich:** **`data-testid` additiv**; in **Listen pro Zeile eindeutig** (z. B. Suffix mit Entitäts-ID), sonst bricht Playwright bei mehreren Zeilen.
9. **Pattern vor Greenfield:** nächstliegende bestehende Komponente/Composable/Store erweitern — nicht neue parallele Drawer-/Widget-Pfade erfinden.

---

## 3. Vollständiger Flow (jede Teilaufgabe benennen oder dokumentierte Abweichung)

| Schicht | Prüfpunkte |
|---------|-------------|
| **El Servador** | `.../notifications/...` Ack, Resolve, Active, Stats; Statuscodes, Fehlerbody; optional **`x-request-id`** für Toasts. |
| **WebSocket** | `notification_new`, `notification_updated`, `error_event` — **Semantik in UI nicht vermischen** ohne klares Label. |
| **Stores** | Wer führt **Liste**, **Stats**, **Ack/Resolve**; Race Poll↔WS; **eine** konsistente Strategie nach Refresh. |
| **Komponenten** | Drawer, Widgets, TopBar: **gleiche** Store-API, **gleiches** Feedback für gleiche Aktion. |

**Cross-Cutting:** HTTP-**`request_id`** und MQTT-/synthetische Correlation-IDs **nicht** in der UI oder in Operator-Texten **blind** zusammenlegen — nur wo fachlich korrekt (IST-Doku beachten).

---

## 4. Verifikation (Pflicht je bearbeiteter Schicht)

| Schicht | Mindest-Check vor „fertig“-Behauptung |
|---------|--------------------------------------|
| **Frontend** | `npx vue-tsc --noEmit` (im `El Frontend`-Kontext wie in `AGENTS.md`). Wenn **rot durch fremde Dateien**: minimal fixen oder **BLOCKER** mit Pfadliste — **nicht** ignorieren. |
| **Playwright** | **Nur** mit laufendem Stack (`global-setup`, Backend, ggf. `docker compose` laut Repo-Doku). **Ohne** Stack: **nicht** „E2E grün“ behaupten — höchstens „Szenario angelegt, Lauf ausstehend“. |
| **Backend** (falls angefasst) | Gezielt `pytest` / `ruff` für berührte Pfade. |
| **Firmware** (falls angefasst) | `pio run`; kein `String`-Pfad nach Pattern des Repos. |

**Docker-Logs:** nur bei Integrations-/E2E-Problemen; gezielt `docker compose logs` pro Service; **eine Evidenzzeile** ins **FEHLER-REGISTER** oder in die Matrix-Fußnoten.

---

## 5. Arbeitspakete (Reihenfolge; an Repo-Ist anpassen)

### P0 — Inventar (**Pflicht, zuerst**)

- **Markdown-Matrix** mit Spalten: **UI-Oberfläche** | **Route/Kontext** | **Store(s)** | **API-Calls** | **WS-Events** | **Inkonsistenz / Risiko** | **Priorität (P1–P4)** | **Konkrete Repo-Pfade** (Read/Grep/Glob belegt).
- **Ablage (kanonisch):** `docs/analysen/INVENTAR-frontend-alerts-routen-uiux-2026-04-10.md` **oder** — wenn Teil eines Orchestrator-Runs — unter `.claude/reports/current/auto-debugger-runs/<run_id>/INVENTAR-….md`. **Nicht** zwei gleichwertige Vollständige parallel ohne Kurzverweis „canonical = …“.

### P1 — Finalität Ack/Resolve (**Priorität für erstes Umsetzungspaket**)

- Einheitliches UI-Feedback bei **fehlgeschlagenem** Ack/Resolve und Netzwerkfehler **überall**, wo dieselbe Aktion existiert (mindestens **NotificationDrawer** + alle direkten Duplikate laut P0).
- Optional: **x-request-id** im Fehlertoast.

### P2 — Zwei-Ketten-Klarheit (UX)

- Operator-knappe Unterscheidung Inbox vs. **error_event** (Badge, Tab, Section-Titel o. ä.) — kein Marketing-Fließtext.

### P3 — Polling vs. WS

- Kurzer Code-Kommentar + minimale UI („Live“ / „zuletzt aktualisiert“), wenn Counts und Liste divergieren können.

### P4 — data-testid + Referenz-Playwright

- Additive testids; **ein** Szenario unter `El Frontend/tests/e2e/…`, das **P1** absichert — **Lauf nur mit Stack** behaupten.

**Hinweis:** Wenn aus P1–P4 **TASK-PACKAGES.md** für Folge-Implementierung entsteht: danach **verify-plan**-Logik aus `.claude/skills/verify-plan/SKILL.md` anwenden und **`VERIFY-PLAN-REPORT.md`** schreiben, **bevor** breite Dev-Delegation ohne Gate.

---

## 6. Artefakte bei Code-Änderungen (P1+)

- **`FEHLER-REGISTER.md`** im selben Run-Ordner wie andere Orchestrator-Artefakte (sofern Lauf unter `auto-debugger-runs/<run_id>/` o. ä.): **eine Zeile Evidence** pro relevantem Symptom/Fehler während der Umsetzung.
- **Änderungsliste** + Abgleich mit **Inventar-Matrix** (welche Zeile adressiert).

---

## 7. Akzeptanzkriterien (gesamt)

1. **P0:** Matrix existiert; Pfad im Abschluss genannt; **nur** repo-belegte Pfade.  
2. **P1 oder BLOCKER:** Entweder **P1** messbar umgesetzt (Finalität) **oder** **BLOCKER** mit exaktem Grund, fehlendem Pfad/Test-Setup, Folgepaket-ID.  
3. **Mindestens eine** weitere Matrix-Zeile ist für P2–P4 **eingeplant** oder als **nicht nötig** mit **einem Satz** begründet.  
4. **Server↔Client:** Jede Code-Änderung an UI nennt **explizit** mindestens **einen** REST- und **einen** WS-Aspekt (oder BLOCKER „kein WS betroffen“ mit Begründung).  
5. **Keine** dritte parallele Alert-Hauptnavigation ohne Deprecation-Plan.  
6. **vue-tsc:** ausgeführt oder BLOCKER dokumentiert.  
7. **Playwright:** nur ehrliche Aussagen (Stack ja/nein).  
8. **verify-plan:** Wenn **TASK-PACKAGES** aus diesem Auftrag für Umsetzung gedacht sind — Gate **vor** weiterer Produkt-Implementierung wie Repo-Regeln.

---

## 8. Nicht-Ziele

- Kein komplettes Redesign ohne P0.  
- Keine REST/MQTT/WS/DB-Breaking-Changes ohne separates Gate.  
- Keine Aufweichung von Safety-Server-Logik durch reine UI.

---

## 9. Agent-Prompt (Copy-Paste)

Du arbeitest im AutomationOne-Checkout auf Branch `auto-debugger/work`. Lies `.claude/reference/auto-debugger-sollworkflow-systemregeln.md` (Kurzcheck). Bearbeite diesen Auftrag `auftrag-frontend-alerts-uiux-routen-server-flow-2026-04-10.md`:

1. **P0:** Vollständige Matrix (Abschnitt 5); Ablage unter kanonischem Pfad (Abschnitt 5); nur **evidenzbasierte** Dateipfade.  
2. **P1:** Umsetzen **oder** BLOCKER dokumentieren; bei Umsetzung **FEHLER-REGISTER** führen (Abschnitt 6) und **vue-tsc** ausführen.  
3. Abschnitte **2–4** und **7** einhalten (Lucide, Tokens, `onUnmounted`, eindeutige `data-testid`, zwei Ketten).  
4. Abschluss: **Änderungsliste**, Matrix-Pfad, **Operator-Kurzanleitung** (welche UI wann), offene PKGs / BLOCKER.

**Shell:** PowerShell — `;` statt `&&`. **Git:** kein `push`, kein `force`.
