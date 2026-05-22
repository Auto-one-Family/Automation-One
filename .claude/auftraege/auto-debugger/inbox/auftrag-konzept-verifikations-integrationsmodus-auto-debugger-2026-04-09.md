# Auftrag (Analyse + Konzept): Verifikations- & Integrationsmodus für auto-debugger

**Datum:** 2026-04-09  
**Typ:** Analyseauftrag mit Lieferobjekt „Konzeptdokument + Spezifikationsvorschläge“ (kein impliziter Code-Umfang).  
**Ziel:** Erweiterung des bestehenden **auto-debugger** um einen neuen, strikt regelbasierten Ablauf für **aufwändige, gemischte Branch-Änderungen** und **Endnutzer-relevante Features** — ohne die bekannten KI-Fehler (zu schnelles Neuimplementieren, parallele Patterns, große unkontrollierte Diffs).

---

## 1. Rolle und Abgrenzung

**Bestehend:** auto-debugger wird über **STEUER-*.md** in `.claude/auftraege/auto-debugger/inbox/` gesteuert; Fokus Log-/Fehleranalyse und Artefaktverbesserung nach Policy (Branch `auto-debugger/work`, eingeschränktes Git, keine Breaking Changes ohne Gate).

**Neu zu konzipieren:** Ein Modus (Arbeitsname frei wählbar, Vorschläge: `integration_verify`, `branch_reconcile`, `feature_verify`) der:

- **Branch-/Diff-Wahrheit** und **bereits erstellte Verifikationsberichte** respektiert: Wurde ein Change-Set in einem früheren Lauf schon verifiziert, ist **zuerst** der Bericht zu **validieren** (Aktualität, Vollständigkeit, Widersprüche zum aktuellen `master` bzw. Zielbranch), **danach** nur noch die **verbleibenden** Diffs/Fragestellungen.
- **Immer genau ein Hauptproblem/Feature** pro Lauf fokussiert (kein „nebenbei noch drei Refactors“).
- **Vorhandene Code-Patterns haben Vorrang:** Wenn die Branch-Idee gut ist, aber die Codebase bereits ein **besser passendes** Pattern hat, ist die Aufgabe **Idee extrahieren → IST-Pattern analysieren → saubere Umstellung/Anpassung** statt Import fremder Struktur.
- **Endgerät (ESP) darf genutzt werden**, aber nur **zielgerichtet** zur Bestätigung einer **konkret benannten** Nutzeraktion oder eines **konkret benannten** Systempfads — nicht als generischer Smoke-Test ohne Hypothese.

**Abgrenzung zum reinen Log-Debugger:** Dieser Modus ist **feature- und architekturtragend** (Was tut der Endnutzer? Passt die Änderung zu Router/Store/MQTT-Contract?), nutzt aber **weiterhin** Docker-/Container-Logs und bestehende Observability, um **IST** zu belegen.

---

## 2. Eingebetteter Fachkontext (KI-typische Fehler — Kurz)

Diese Punkte sind **verbindliche Annahmen** für das zu schreibende Konzept (Begründung für Gates und Reihenfolge):

1. **Vibe Coding / Rewrite-Drift:** Modelle neigen dazu, ohne ausreichenden Repo-Kontext „neu und elegant“ zu bauen statt bestehende Module zu erweitern — führt zu Duplikaten, widersprüchlichen Patterns und schwer reviewbaren Diffs.  
2. **Halluzinationen / veraltete APIs:** Ohne IST-Anchoring (Suche, Lesen der echten Signaturen, Tests) steigt das Risiko fiktiver APIs.  
3. **Governance-Engpass:** Schnelle Änderungen ohne kleine Pakete überlasten Review/CI — der Prozess muss **klein, sequentiell, messbar** sein.  
4. **Pattern-First:** Wenn eine Idee bereits im Code existiert (anders benannt/verteilt), ist **Konsolidierung** das Ziel, nicht ein zweites Parallel-System.

---

## 3. Gewünschter Ablauf (als Spezifikation ausformulieren)

Du sollst im **Konzeptdokument** den folgenden Ablauf **präzisieren** (Phasennamen, Ein-/Ausgaben, Artefakte, Abbruchbedingungen), inkl. Vorschlag wie er an **YAML-Frontmatter** der STEUER-Datei andockt:

### Phase A — Scope & Hypothese (1 Problem)

- Eingabe: Branch-Name oder Diff-Referenz, optional Link zu früherem Bericht / Run-ID.  
- Ausgabe: **eine** klare Hypothese („Diese Branch-Änderung soll X für den Endnutzer verbessern, indem …“).  
- Verbot: mehrere unabhängige Ziele im selben Lauf.

### Phase B — Evidence: IST ohne Raten

- **Git:** erlaubt nur gemäß eingebetteter Policy (Status, diff, log — kein push/force).  
- **Code:** gezieltes Lesen der **betroffenen** Pfade; Pflicht: **Suche nach existierenden Patterns** (Composable, Service, Router, MQTT-Handler, Store-Actions — je nach Schicht).  
- **Laufzeit:** wenn nötig **Docker-Logs** (oder vereinbarte Log-Quellen) für **eine** konkrete Fragestellung.  
- Dokumentation: kurze **IST-Notiz** (was passiert heute wirklich).

### Phase C — Branch-Ideen klassifizieren

Pro erkanntem Change aus dem Branch:

- **Übernehmbar** (passt zu Pattern + Contracts),  
- **Idee gut / Struktur schlecht** (Re-Implement im Haus-Pattern),  
- **Verworfen** (bricht Contracts, Safety, oder dupliziert ohne Mehrwert),  
- **BLOCKER** (braucht menschliche Produkt/Architektur-Entscheidung).

### Phase D — Plan (Gesamtimplementierungsplan)

- Ein **vollständiger** Plan als **sortierte** Liste von Paketen: **beste/einfachste zuerst**, jeweils mit Risiko, Testidee, Rollback-Idee.  
- Pakete so schneiden, dass **ein Spezialisten-Agent** pro Paket sinnvoll arbeiten kann.

### Phase E — verify-plan Gate (PFLICHT vor jeder Implementierungsdelegation)

**Regel:** Bevor ein Paket an einen Implementierungs-Agenten geht:

1. **verify-plan** (eigenes Profil oder fester Prompt-Block — im Konzept festlegen) **muss** den **konkreten Auftragstext** lesen.  
2. verify-plan **dokumentiert** Verbesserungen **direkt im Auftrag** (gleicher Wortlaut / gleiche Datei): präzisere Akzeptanzkriterien, fehlende Tests, Risiko, Pattern-Verweis, „nicht tun“.  
3. Erst **danach** wird der Auftrag ausgeführt.

### Phase F — Implementierung & Verifikation (nur nach Gate)

- Paketweise: umsetzen → Tests/CI → kurze Evidence (Log-Ausschnitt, Screenshot, API-Response — je nach Paket).  
- **Echtes ESP:** nur wenn für dieses Paket ein **messbarer** Nachweis nötig ist (z. B. Sensorpfad, Aktor-Finalität), mit dokumentierter Schrittfolge.

### Phase G — Outbox-Schlussbericht

**Pflichtpfad:** `.claude/auftraege/auto-debugger/outbox/`  
Dateiname-Vorschlag im Konzept festlegen (z. B. `BERICHT-<run_id>-<YYYY-MM-DD>.md`).

**Inhalt des Berichts (Pflichtfelder):**

- Welche **Branch-Changes** wurden betrachtet (Dateien/Module, nicht Romane).  
- Welche **Klassifikation** sie erhielten (aus Phase C).  
- Welches **Pattern** als kanonisch erkannt wurde und **warum**.  
- Welchen **Ansatz** du gewählt hast (Re-Implement vs. Merge-Idee vs. verworfen).  
- **Was** du getan hast (Pakete, PR-artige Liste) und **wie** verifiziert wurde.  
- **Offene Punkte** / BLOCKER für menschliche Entscheidung.

---

## 4. Orchestrierung mit vorhandenen Agenten

Im Konzept **explizit** festhalten:

- **Welche** bestehenden Auto-one-Agenten (Backend, Frontend, Firmware, DevOps, … laut `CLAUDE.md`) für welche Pakettypen vorgesehen sind.  
- Wie **Kontextweitergabe** minimal gehalten wird (nur relevante Pfade + IST-Notiz + verify-plan-geprüfter Auftrag).  
- Dass **Skills** und Regeln aus dem Repo (Auftragserstellung, SensorConfigPanel-Regeln, Safety/Finalität, usw.) **nicht umgangen** werden dürfen — der neue Modus **bindet** sie ein, statt neue Parallelregeln zu erfinden.

---

## 5. Lieferobjekte (Akzeptanzkriterien)

1. **Konzeptdokument** (Markdown) an einem von dir vorgeschlagenen **repo-lokalen** Pfad unterhalb der Auto-one-Wurzel, z. B. `docs/analysen/KONZEPT-auto-debugger-verifikations-integrationsmodus-2026-04-09.md` — Inhalt vollständig **ohne** Verweise auf externe Strategie-Repositories oder Pfade außerhalb von Auto-one.  
2. **Delta zur bestehenden STEUER-VORLAGE:** Vorschlag neuer/erweiterter YAML-Felder (`run_mode`-Wert oder Zusatzfelder), `scope`/`forbidden`/`done_criteria`-Beispiele für diesen Modus.  
3. **verify-plan:** Spezifikation (Wer? Ein Agent? Prompt-Template? Pflichtabschnitt in jedem Implementierungsauftrag?) + **Beispiel** für ein fiktives Mini-Paket.  
4. **Minimaler Migrationsplan:** Was muss im auto-debugger-Agentenprofil / Runbook ergänzt werden, damit der Modus **aktivierbar** ist (auch wenn Implementation in Folge-Aufträgen erfolgt).  
5. **Kein** stillschweigender Code-Umfang: Wenn du Code vorschlägst, klar als **Folge-Auftrag** mit eigenen AK trennen.

---

## 6. Agent-Prompt (Copy-Paste)

```text
Du arbeitest im Auto-one-Repository. Lies diesen Auftrag vollständig.

Aufgabe: Konzipiere den neuen auto-debugger-Modus „Verifikation & Integration“ für gemischte Branch-Änderungen und endnutzerrelevante Features.

Anforderungen:
- Pattern-First: immer IST-Code und bestehende Patterns vor Neuentwurf.
- Ein Problem pro Lauf; Evidence über Git/Diff, gezieltes Lesen, Docker-Logs nur für eine klare Frage.
- Wenn frühere Verifikationsberichte existieren: zuerst Bericht validieren, dann Restdiffs.
- Gesamtplan mit Paketen; vor jeder Implementierung verify-plan-Pflicht mit Bearbeitung im selben Auftragstext.
- Outbox-Berichtspfad: .claude/auftraege/auto-debugger/outbox/ mit verpflichtendem Inhaltsschema aus dem Auftrag.

Lieferobjekte: Konzept-MD im Repo, STEUER-YAML-Delta-Vorschlag, verify-plan-Spezifikation + Beispiel, Migrationsplan für Agent/Runbook. Keine externen Repo-Pfade. Kein git push.

Schreibe am Ende eine kurze Checkliste, wie Robin den Modus in einer STEUER-Datei aktivieren würde.
```

---

## 7. Erledigt-Kriterium für diesen Auftrag

Robin kann aus deinen Lieferobjekten **ohne Rückfragen** (1) eine STEUER-Datei für den neuen Modus entwerfen, (2) verify-plan verbindlich einbinden, (3) Outbox-Berichte einheitlich benennen und (4) Folge-Implementierungsaufträge paketweise ableiten.
