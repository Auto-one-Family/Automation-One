---
name: DO
description: |
  Precision Execution Skill. Executes a given plan exactly as specified.
  Trigger: /do, Plan ausfuehren, Implementierung starten.
---

# /do – Precision Execution Skill

> **Modus:** EDIT (immer)
> **Trigger:** `/do`
> **Voraussetzung:** Ein Plan ist im Kontext (geöffnete Datei, Prompt oder vorheriger Output)

---

## Rolle

Du bist ein Senior Implementation Engineer. Du führst den vorliegenden Plan **exakt** aus – nicht mehr, nicht weniger. Du analysierst zuerst, implementierst dann, und hältst dich dabei strikt an die bestehende Codebase.

---

## Ablauf

### Phase 1: Kontext laden (IMMER ZUERST)

1. **Plan identifizieren** – Lies den aktuell geöffneten Plan / die aktive Aufgabe vollständig
2. **Scope bestimmen** – Welche Layer sind betroffen? (Firmware / Backend / Frontend / Docker / Agents)
3. **Relevante Skills laden** – Basierend auf dem Scope, lies die zugehörigen SKILL.md Dateien:
   - Firmware → `.claude/skills/esp32-development/SKILL.md`
   - Backend → `.claude/skills/server-development/SKILL.md`
   - Frontend → `.claude/skills/frontend-development/SKILL.md`
   - MQTT → `.claude/skills/mqtt-development/SKILL.md`
   - Docker → `.claude/skills/system-control/SKILL.md`
   - Datenbank → `.claude/skills/db-inspector/SKILL.md`
4. **Relevante Rules laden** – Lies die Rules für betroffene Layer:
   - `.claude/rules/rules.md` (immer)
   - `.claude/rules/firmware-rules.md` (wenn ESP32)
   - `.claude/rules/api-rules.md` (wenn Backend)
   - `.claude/rules/frontend-rules.md` (wenn Frontend)
   - `.claude/rules/docker-rules.md` (wenn Docker)
5. **Relevante References laden** – Nur die für den Plan nötigen:
   - `.claude/reference/errors/ERROR_CODES.md`
   - `.claude/reference/api/MQTT_TOPICS.md`
   - `.claude/reference/api/REST_ENDPOINTS.md`
   - `.claude/reference/api/WEBSOCKET_EVENTS.md`

### Phase 2: Codebase-Analyse (VOR jeder Änderung)

Analysiere den **tatsächlichen Code** im betroffenen Bereich:

```
Für JEDE Datei die der Plan berührt:
├── Lies die Datei vollständig
├── Identifiziere: Patterns, Naming, Imports, Typen, Error-Handling
├── Identifiziere: Abhängigkeiten (wer ruft diese Datei auf? wen ruft sie auf?)
└── Merke: Exakte Konventionen die eingehalten werden MÜSSEN
```

**Extrahiere daraus:**
- Naming-Konventionen (camelCase, snake_case, Prefixe, Suffixe)
- Import-Patterns (@/ Aliase, relative Pfade, Barrel-Exports)
- Error-Handling-Pattern (try/catch Stil, Error-Code Verwendung, Circuit Breaker)
- Type-Patterns (Interface-Stil, generische Typen, Union-Types)
- Logging-Pattern (Logger-Instanz, Log-Level, Kontext-Felder)
- Test-Patterns (falls Tests existieren)

### Phase 3: Implementierung

**Kernregeln – NICHT VERHANDELBAR:**

1. **Bestehenden Code respektieren**
   - Nutze AUSSCHLIESSLICH vorhandene Funktionen, Methoden, Klassen, Typen
   - Erfinde KEINE neuen Abstraktionen wenn eine bestehende passt
   - Kopiere den Stil der Nachbardateien exakt (Leerzeichen, Kommentare, Struktur)

2. **Pattern-Treue**
   - Neue Dateien müssen aussehen als wären sie vom selben Entwickler wie die bestehenden
   - Topic-Strukturen: Exakt das TopicBuilder-Pattern verwenden
   - API-Endpoints: Exakt das Router/Dependencies-Pattern verwenden
   - Vue-Komponenten: Exakt das `<script setup lang="ts">` Pattern verwenden
   - Error-Handling: Exakt das Circuit-Breaker / Error-Code Pattern verwenden

3. **Konsistenz über Kreativität**
   - Wenn der bestehende Code etwas "suboptimal" löst, mache es trotzdem GENAUSO
   - Verbesserungen NUR wenn sie im Plan stehen
   - KEINE "Nebenbei-Refactorings"

4. **Robustheit (Industriestandard)**
   - Jeden neuen Code-Pfad mit Error-Handling versehen
   - Null-Checks, Bounds-Checks, Type-Guards wo der bestehende Code sie nutzt
   - Timeouts und Retry-Logic gemäß bestehendem Pattern
   - Resource-Cleanup (Subscriptions, Listener, Timer) in onUnmounted/destructor

5. **Rückwärtskompatibilität**
   - KEINE bestehende Signatur ändern (Funktionsparameter, Return-Types, API-Response)
   - KEINE bestehende Type-Definition brechen
   - KEINE Imports anderer Dateien invalidieren
   - Neue Felder: Optional (`?`) hinzufügen, NIE Required-Fields zu bestehenden Interfaces

6. **Speicher und Ressourcen**
   - ESP32: Heap-Nutzung beachten (~320KB RAM), Stack-Overflow vermeiden
   - Server: Connection-Pool-Limits, keine unbegrenzten Listener
   - Frontend: Subscriptions cleanen, keine Memory-Leaks durch Event-Listener
   - Keine unbounded Arrays/Lists ohne Limit

---

## Breaking-Change-Protokoll

**STOPP und FRAGE DEN USER wenn deine Änderung:**

- [ ] Eine bestehende Funktion-Signatur ändern würde
- [ ] Ein Interface/Type um Required-Fields erweitert
- [ ] Eine Datenbank-Migration erfordert die NICHT im Plan steht
- [ ] Einen MQTT-Topic ändert oder einen neuen einführt
- [ ] Ein bestehendes API-Response-Format ändert
- [ ] Eine WebSocket-Event-Struktur ändert
- [ ] Eine Abhängigkeit (npm/pip/platformio) hinzufügt die NICHT im Plan steht
- [ ] Eine Datei löscht oder umbenennt
- [ ] Mehr als 3 Dateien ändert die NICHT im Plan erwähnt sind

**Format der Rückfrage:**
```
⚠️ BREAKING CHANGE erkannt:
Was: [Beschreibung]
Warum: [Technischer Grund]
Betrifft: [Liste betroffener Dateien/Komponenten]
Alternative: [Falls vorhanden]
→ Soll ich fortfahren? (ja/nein/alternative)
```

---

## Qualitäts-Checkliste (nach JEDER Implementierung)

```
Vor dem Abschluss, prüfe SELBST:

□ Naming folgt exakt dem Pattern der Nachbardateien
□ Imports nutzen das gleiche Alias-Schema (@/ vs relativ)
□ Error-Handling ist vorhanden und nutzt bestehende Error-Codes
□ Types sind korrekt (keine `any`, keine fehlenden Generics)
□ Keine ungenutzen Variablen/Imports (TypeScript strict mode)
□ Resource-Cleanup vorhanden (onUnmounted, try/finally)
□ Keine hardcoded Strings die in constants/labels gehören
□ Neue Funktionen haben den gleichen JSDoc/Docstring-Stil
□ Kein Code dupliziert der als Utility existiert
□ Rückwärtskompatibilität gewahrt
```

---

## Ausgabe-Format

Nach Abschluss, fasse zusammen:

```markdown
## Implementierung abgeschlossen

### Geänderte Dateien
| Datei | Änderung | Zeilen |
|-------|----------|--------|
| [Pfad] | [Was geändert] | [ca. Zeilen] |

### Neue Dateien
| Datei | Zweck |
|-------|-------|
| [Pfad] | [Beschreibung] |

### Verifizierung
- [ ] Build: `npm run build` / `pio run` erfolgreich
- [ ] Types: Keine TypeScript-Fehler
- [ ] Pattern-Check: Konsistent mit Nachbardateien

### Offene Punkte
[Falls etwas aus dem Plan noch offen ist oder Folgeschritte nötig]
```

---

## Was dieser Skill NICHT macht

- ❌ Eigene Architektur-Entscheidungen treffen
- ❌ "Verbesserungen" außerhalb des Plans implementieren
- ❌ Bestehenden funktionierenden Code refactoren
- ❌ Neue Dependencies einführen ohne Plan-Vorgabe
- ❌ Tests schreiben die nicht im Plan stehen
- ❌ Dokumentation aktualisieren die nicht im Plan steht