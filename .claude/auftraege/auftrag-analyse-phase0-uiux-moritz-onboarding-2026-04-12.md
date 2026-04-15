# Analyseauftrag: Phase 0 — UI/UX-Onboarding-Paket (externer Designer)

**Typ:** Analyse (IST-Dokumentation, keine Feature-Implementierung)  
**Datum:** 2026-04-12  
**Zielgruppe:** Produktowner und externer UI/UX-Partner (Onboarding vor erster Arbeitssession)  
**Hinweis zur Benennung:** „Phase A“ im Gespraech meint hier die **Startklarheitsphase** (Discovery-Onboarding): Produktbild, Begriffe, keine Tiefenarbeit an einzelnen Screens.

---

## 1. Ziel

Erzeuge **ein** konsolidiertes Markdown-Dokument im **Ziel-Repo**, das alle **fuer externes UI/UX-Onboarding noetigen** Informationen **evidenzbasiert** aus diesem Repository belegt (Router, Views, sichtbare Labels, grobe Nutzerwege). Kein Ratehmen: Jede Aussage zur Navigation oder zum Produktumfang ist mit **Repo-Nachweis** (Dateipfad + Kurzbeleg: Route-String, `name:` im Router, oder UI-String im Template) zu versehen.

**Lieferpfad (verbindlich):**  
`docs/analysen/ANALYSE-phase0-uiux-moritz-onboarding-2026-04-12.md`  
(Ordner `docs/analysen/` anlegen, falls fehlend.)

---

## 2. Eingebetteter Fachkontext (ohne externe Quellen)

Diese Regeln stammen aus dem Produktkontext und gelten fuer die **Formulierung** des Berichts (nicht fuer Code-Aenderungen):

- **Drei Schichten:** Firmware (ESP32-Geraete), Server (API, MQTT, Persistenz), Web-Frontend (Operator-Dashboard). Der externe Designer arbeitet primaer am **Frontend**, muss aber wissen, wo **Echtzeit** und **Sicherheit** eine Rolle spielen (Aktoren, Regeln, Verbindungsstatus).
- **Operator-Cockpit, keine Consumer-App:** Lagebild zuerst, Diagnose danach; Verbindungs-/Sync-Zustaende sollen im Bericht als **sichtbare UI-Elemente** benannt werden (wo im Code sie herkommen — nur beschreiben, nicht aendern).
- **Konfiguration vs. Wissens-Ansicht:** Sensor- und Aktor-**Konfiguration** gehoert zur **Hardware-/Geraetewelt** (Zoom-Level mit Detail). Ein separater **Komponenten-** oder **Sensor-Katalog** kann **Wissens-/Uebersichtscharakter** haben — im Bericht klar trennen, was ein **Neuling** wo erwarten wuerde.
- **Legacy explizit markieren:** Alte Dashboard-Routen oder „Legacy“-Views im Router **nennen** und im Bericht als **nicht ausbauen / Ersetzung geplant** kennzeichnen, damit kein externes Design auf Auslauf investiert.
- **Begriffe Zone / Subzone:** Im Bericht ein kurzes **Glossar** (Alltagssprache, max. ein Absatz je Begriff) — **ohne** API-Endpunkt-Namen als Pflicht; wenn API-Namen im Code nur als technische Spalten vorkommen, fuer das Glossar in Klartext uebersetzen.

---

## 3. Scope (was der Bericht enthalten muss)

### 3.1 Abschnitt „Produkt auf einen Blick“ (Zielnutzer, Tabs, Reifegrad)

- **Zielnutzer:** Betreiber/Gewaechshausfuehrung (1 kurzer Absatz, aus UI-Wording und vorhandener Doku im Repo abgeleitet, nicht erfunden).
- **Hauptnavigation:** Liste der **Top-Level-Routen** / Sidebar-Eintraege, die ein Nutzer sieht — aus Router und Navigationskomponenten.
- **Kernaussagen „fertig vs. in Arbeit“:** Aus `README`, `CLAUDE.md`, `docs/`-Statusdateien oder Kommentaren in `STATUS`-aehnlichen Dateien **nur** uebernehmen, was im Repo wirklich steht; fehlt so etwas, **Luecke benennen** statt erfinden.

### 3.2 Abschnitt „Was Moritz im Produkt wahrnimmt“ (tabellarisch)

Tabelle mit Spalten mindestens: **Bereich / Route oder Tab** — **Nutzeraktion (1 Satz)** — **Erwartetes Nutzergefuehl (1 Satz)** — **Evidenz (Pfad)**.  
Mindestens abdecken (sofern im Code vorhanden; wenn nicht vorhanden: Zeile mit „nicht gefunden“):

- Hardware- oder Geraete-Ansicht mit Zoom/Stufen
- Monitor-Ansicht (Sensor/Aktor-Lagebild)
- Dashboard-Builder vs. Dashboard-Anzeige (falls getrennt)
- Logik/Regeln-Ansicht
- Einstellungen/Konto falls vorhanden
- Postfach/Benachrichtigungen falls als eigene Flache erkennbar

### 3.3 Glossar **Zonen / Sensoren / Aktoren / Regeln** (max. 1 Absatz je Begriff)

Definitionen **nur** aus Code-Kommentaren, bestehenden `docs/`-Texten oder UI-Labels ableiten. Widersprueche zwischen UI-Label und technischem Hilfetext **explizit** als „Inkonsistenz-Ist“ markieren.

### 3.4 Abschnitt „Willkommens-Checkliste fuer Robin“ (5–8 Bulletpoints)

Operative Liste: was vor der ersten Session mit einem Designer geklaert werden sollte (Zugang, Demo-Umgebung, NDA, Screenshots, Testnutzer) — **Inhalt** aus vorhandenen Projektanweisungen im Repo; wenn nichts vorhanden: **Platzhalter-Luecken** mit „fehlt im Repo“.

### 3.5 Technischer Anhang (kurz, evidenzlastig)

- **Schaetzung Komponenten-/View-Umfang:** Anzahl Vue-Dateien unter `frontend/` (oder tatsaechlichem Pfad) via Zaehlung; grobe Kategorien (Devices, Monitor, Dashboard, Logic, Shared).
- **Design-Tokens:** wo zentrale Styles liegen (z. B. `tokens.css`), ohne Designbewertung.
- **Tests, die UI stabilisieren:** Vitest/Playwright-Pfade nennen, falls vorhanden.

---

## 4. Explizit nicht Teil dieses Auftrags

- Keine Code-Aenderungen, kein Refactoring, keine neuen Features.
- Keine UI-Mockups oder Figma-Dateien.
- Keine Performance-Messung und kein Security-Audit (nur verweisen, falls im Repo bereits dokumentiert).

---

## 5. Arbeitsweise im Ziel-Repo

1. Router- und Navigationsdateien finden (`Glob`/`Grep` nach `createRouter`, `routes:`, `path:`).
2. Pro Hauptflaeche: Einstiegskomponente und **eine** typische Kindkomponente nennen (Pfad).
3. Alle **Namen und Routen** aus dem Code zitieren (Backticks), nicht aus dem Gedaechtnis.
4. Bericht speichern unter dem Lieferpfad in Abschnitt 1.

---

## 6. Akzeptanzkriterien (messbar)

- [ ] Datei `docs/analysen/ANALYSE-phase0-uiux-moritz-onboarding-2026-04-12.md` existiert.
- [ ] Enthaelt alle Unterabschnitte aus Abschnitt 3 (3.1–3.5).
- [ ] Mindestens **12** Evidenzzeilen (Pfad + Beleg) verteilt ueber 3.1–3.3 und Anhang.
- [ ] **Keine** Verweise auf Pfade oder Ordner **ausserhalb** dieses Git-Repositorys.
- [ ] Am Ende: **„Follow-up-Vorschlaege“** (max. 5 Stichpunkte) fuer spaetere **Implementierungs**- oder **Tiefen-Analyse**-Auftraege — klar getrennt von diesem Analyse-IST-Bericht.

---

## Agent-Prompt (Copy-Paste)

```
Lies den Auftrag in .claude/auftraege/auftrag-analyse-phase0-uiux-moritz-onboarding-2026-04-12.md vollstaendig.
Arbeite nur im Auto-one-Repository. Erstelle docs/analysen/ANALYSE-phase0-uiux-moritz-onboarding-2026-04-12.md gemaess Abschnitt 3–6.
Keine Code-Aenderungen. Jede Navigations- und Produktaussage mit Repo-Evidenz (Dateipfad + Kurzbeleg) versehen.
```
