# Auftrag Epic 1 — 01: Logic-Regel-`priority` — kanonische Semantik (Schema, Doku, Tests)

**Datum:** 2026-04-05 (Überarbeitung nach `/verify-plan`)  
**Epic:** 1 (Vertrag, Korrelation, Finalität)  
**Bezug Ist-Analyse:** AP-F (I1)

---

## Verify-Plan — Kurzfassung

**Plan:** Eine kanonische Semantik — **kleinere Zahl = höhere Ausführungs- und Konfliktpriorität**; Anpassung von **OpenAPI-Texten** (Pydantic `Field(description=…)`), **Doku** und **irreführenden Test-Kommentaren**; **ohne** Änderung der SQL-Sortierung (`priority.asc()`), **ohne** Datenmigration, **ohne** neue REST-Routen, **ohne** Docker.

**Verifizierte Kernpfade (existieren, Laufzeit bereits konsistent):**

| Modul | Befund |
|-------|--------|
| `src/schemas/logic.py` | **`LogicRuleCreate.priority`:** `description="Rule priority (1=lowest, 100=highest)"` — **widerspricht** der Laufzeit (Lesart: größere Zahl = wichtiger). |
| `src/db/repositories/logic_repo.py` | `get_enabled_rules`: `order_by(CrossESPLogic.priority.asc())`; Docstring „lower priority number = higher priority“ — **mit Ziel abgestimmt** (ggf. Feinschliff Wortlaut „Ausführung/Konflikt“). |
| `src/services/logic/safety/conflict_manager.py` | Klassen-Docstring: niedrigere Zahl = höher — **kein Logik-Change nötig**. |
| `src/services/logic_engine.py` | `_execute_actions` / `rule_priority`: „lower number = higher priority“ — **vereinbar** mit Plan. |

---

## Problem (Ist, präzise)

1. **Nur das Schema** suggeriert fälschlich „100 = höchste Priorität“ im Sinne von **größere Zahl gewinnt im Konflikt**.  
2. **`LogicRuleUpdate.priority`** hat aktuell **keine** `description` — generiertes OpenAPI bleibt dort erklärungslos.  
3. **`LogicRuleResponse.priority`** nur knapp „Rule priority“ — **nicht** dieselbe kanonische Langform wie Create.  
4. **`tests/e2e/test_logic_engine_real_server.py`** (`test_priority_resolution`): Kommentare nennen **priority=80 als „HIGH“** und **20 als „LOW“** — das ist zur **echten** Semantik **invertiert** (20 sollte die **höhere** Ausführungspriorität haben). Assertions können trotzdem grün sein; die **Texte** verwirren Maintainer und widersprechen dem Vertrag.

**Folge:** Operatoren, API-Leser und Entwickler können Regeln **falsch** interpretieren — reines Vertragsproblem, kein MQTT.

---

## Ziel (Soll)

Eine **einzige kanonische** Beschreibung für `CrossESPLogic.priority` über **Create, Update, Response** und **Tests**:

- **Kleinere Zahl = höhere Priorität** bei **Konfliktauflösung** und **typischer Ausführungsreihenfolge** (wie `order_by(..., asc())` und `ConflictManager`).  
- Numerische Beispiele in `examples` **dürfen** unverändert bleiben (z. B. 80 und 20); im **description**-Text muss klarstehen: **welche Zahl im Zweifel gewinnt** (die **kleinere**).

**Produktentscheidung (verbindlich):** Laufzeit bleibt maßgeblich; **keine** DB-Migration der gespeicherten Werte.

**Begründung:** Umstellung von `asc()` auf `desc()` wäre migrations- und verhaltensbreaking für alle bestehenden Regeln.

---

## Einschränkungen

- **Keine** Änderung von `order_by(CrossESPLogic.priority.asc())`.  
- **Keine** Umbenennung des Feldes ohne separaten Migrationsauftrag.  
- **Keine** Änderung der Konfliktalgorithmen außerhalb von **Doku/Kommentaren** (optional Enum-Docstring siehe unten).

---

## Umsetzungsschritte (technisch, nummeriert)

### 1. `src/schemas/logic.py` — vollständiger `priority`-Umfang

- **`LogicRuleCreate.priority`:** `description` ersetzen durch kanonischen Text (kein „1=lowest, 100=highest“ im Sinne von „größer gewinnt“). Vorschlag sinngemäß:  
  *„Priorität für Konfliktauflösung und Reihenfolge: **niedrigere Zahl = höhere Priorität** (wichtigere Regel). Typischer Bereich 1–100.“*  
- **`LogicRuleUpdate.priority`:** dieselbe **`description`** ergänzen (wie Create), damit PATCH in OpenAPI erklärt ist.  
- **`LogicRuleResponse.priority`:** **dieselbe** kanonische Formulierung wie Create/Update (nicht nur „Rule priority“).  
- **`examples` / JSON-Beispiele:** Zahlen können bleiben; optional ein Satz in der Description, z. B. dass **20 vor 80** läuft/gewinnt, wenn beide konkurrieren — **nur** wenn es fachlich zu euren Testdaten passt.

### 2. `src/services/logic/safety/conflict_manager.py`

- Klassen- und Methoden-Docstrings **nur** bei Bedarf **Feinschliff** (einheitliche Begriffe „Ausführungspriorität“, „Konflikt“).  
- **Optional (empfohlen):** `ConflictResolution`-Enum: Klassen- oder Member-Docstring für **`HIGHER_PRIORITY_WINS`**, z. B. dass „höhere Priorität“ hier die **niedrigere Zahlenpriorität** meint (verhindert Verwechslung mit „höhere Zahl im Feld“). **Keine** Umbenennung des Enum-Werts nötig.

### 3. `src/db/repositories/logic_repo.py`

- Docstring von `get_enabled_rules` kurz auf **Konflikt + Reihenfolge** prüfen; Widerspruch zum Schema darf nicht entstehen.

### 4. `src/services/logic_engine.py`

- Stellen mit `rule.priority` in Logs/Kommentaren: gleiche Begrifflichkeit wie Schema.

### 5. OpenAPI-Artefakt `openapi.json`

- **IST (Verify-Plan):** Unter `god_kaiser_server` (und projektweit) wurde **kein** committetes `openapi.json` gefunden.  
- **Anweisung:** Schritt **entfällt**, solange ihr **kein** OpenAPI-JSON ins Repo legt.  
- **Falls** ihr später einen Export einführt (CI oder manuell): diesen Auftrag als Referenz nutzen und **dann** einmalig committen — im PR vermerken.

### 6. Tests und Kommentare (Pflicht)

- **`tests/e2e/test_logic_engine_real_server.py`** — `test_priority_resolution`: alle Kommentare/Docstrings zu „HIGH“/„LOW“ so anpassen, dass **20 = höhere Priorität (gewinnt Konflikt)** und **80 = niedrigere Priorität** **oder** neutral „Rule A priority=80“, „Rule B priority=20“ **ohne** falsche HIGH/LOW-Labels.  
- **`tests/integration/test_api_logic.py`** und weitere: nur anfassen, wenn dort **widersprüchliche** Prioritätsbegriffe stehen.  
- **Assertions:** nur ändern, wenn nach Korrektur der **fachlichen** Erwartung ein Test wirklich das falsche Verhalten prüft (Verify-Plan: aktueller Test prüft nicht zwingend den Konfliktsieger — Ziel dieses Auftrags ist **kein** neues Verhalten, nur **kein irreführender Text**).

### 7. Changelog (Pflicht, konkreter Pfad)

- **IST:** Weder `god_kaiser_server/CHANGELOG.md` noch ein eindeutiges Server-Changelog.  
- **SOLL für diesen Auftrag:** Neue Datei **`El Servador/god_kaiser_server/CHANGELOG.md`** anlegen (Format [Keep a Changelog](https://keepachangelog.com/) minimal: Überschrift, Abschnitt `### Changed`, ein Bullet).  
  Erster Eintrag sinngemäß: *Logic rule `priority`: OpenAPI-Feldbeschreibungen an Laufzeitsemantik angeglichen (niedrigere Zahl = höhere Priorität); E2E-Testkommentare bereinigt.*  
- **Alternative** (nur wenn ihr strikt **keine** neue Root-Datei wollt): stattdessen Abschnitt in einer **bestehenden** zentralen Server-Doku unter `god_kaiser_server/docs/` — dann im PR **explizit** den gewählten Pfad nennen. Standard für diesen Auftrag bleibt **`CHANGELOG.md` im Server-Root**.

### 8. Kurzdoku Operatoren (empfohlen)

- Eine kurze Datei **`god_kaiser_server/docs/logic-rule-priority.md`** (oder ein Abschnitt in bestehender Logic-Doku): 5–10 Zeilen, kanonische Semantik + Verweis auf API.

### 9. Referenz außerhalb `src/` (optional, nicht blockierend)

- **`.claude/reference/api/REST_ENDPOINTS.md`:** falls dort `priority`-Beispiele ohne Semantik stehen — **einen Satz** ergänzen oder im selben PR `/updatedocs`-Workflow; **nicht** Blocker für Abnahme dieses Auftrags, aber für End-to-End-Konsistenz sinnvoll.

---

## Abnahmekriterien (hart)

- [ ] **`LogicRuleCreate`**, **`LogicRuleUpdate`**, **`LogicRuleResponse`:** `priority` trägt überall die **gleiche** kanonische `description` (Update nicht leer).  
- [ ] In `schemas/logic.py` **kein** Text mehr der Form **`1=lowest, 100=highest`** im alten, irreführenden Sinn.  
- [ ] `grep` über `god_kaiser_server/src` und `god_kaiser_server/tests` nach `100=highest` / `1=lowest` / vergleichbaren Formulierungen — **kein** Widerspruch zur Semantik „kleiner gewinnt“ (Ausnahme: zitierte Historie in CHANGELOG, die den **Fix** beschreibt).  
- [ ] **`test_logic_engine_real_server.py`:** keine invertierten HIGH/LOW-Kommentare mehr zu 80 vs. 20.  
- [ ] Alle relevanten Logic-Tests grün (`pytest` für betroffene Module).  
- [ ] **`El Servador/god_kaiser_server/CHANGELOG.md`** existiert mit Eintrag **oder** dokumentierte Alternative unter `docs/` (siehe Schritt 7).  
- [ ] **Kein** committetes `openapi.json` erforderlich; falls ihr keines habt, in PR-Text ein Satz „OpenAPI-Export entfällt (kein Artefakt im Repo).“

---

## Was dieser Auftrag absichtlich nicht tut

- Frontend (Vue) — eigener Auftrag.  
- Migration bestehender `priority`-Werte in der DB.  
- Änderung der numerischen Konfliktlogik im `ConflictManager`.

---

## Zusammenfassung für den ausführenden Agenten

> Setze die kanonische Semantik **kleinere `priority`-Zahl = höhere Priorität** in **`schemas/logic.py`** für **Create, Update und Response** durch; bereinige **E2E-Testkommentare** in `test_logic_engine_real_server.py`; optional Enum-Hinweis **`HIGHER_PRIORITY_WINS`**; lege **`god_kaiser_server/CHANGELOG.md`** an (oder dokumentierte Alternative); **kein** `openapi.json`-Schritt ohne Artefakt im Repo.

---

*Ende Auftrag 01 (überarbeitet).*
