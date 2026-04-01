# Roadmap: Logic Engine UX-Redesign — 2026-04-01

> **Kontext:** Robin hat das Live-System getestet und 4 fundamentale UX-Probleme identifiziert. Diese Roadmap dokumentiert ALLE Findings und definiert die Reihenfolge fuer Frontend- und Backend-Analysen.
>
> **Quelle:** Robins Live-Beobachtungen (4 Punkte) + Screenshot-Analyse (5 Screenshots) + bestehendes Wissen (L0-L5 Roadmap, ED-3 Deep Dive, Memory)
>
> **Abgrenzung:** Diese Roadmap erweitert die bestehende `roadmap-logic-engine-produktion-2026-03-29.md` (L0-L5). L1-L5 bleiben gueltig und werden hier NICHT wiederholt. Diese Roadmap behandelt die UX/Architektur-Probleme die UEBER die bestehenden Findings (N1-N9) hinausgehen.
> [Warnung verify-plan: `roadmap-logic-engine-produktion-2026-03-29.md` existiert NICHT in `.claude/reports/current/` oder `archive/`. Die L0-L5-Details (N1-N9) sind nur in dieser Roadmap als Tabelle verfuegbar, nicht als eigenstaendiges Dokument. Falls Dev-Agents den L-Plan brauchen: Pfad korrigieren oder Datei wiederherstellen.]
>
> **Bezug zur bestehenden Roadmap:**
> - L0 Deep Dive (ERLEDIGT) → identifizierte N1-N9 (Backend-Haertung)
> - L1-L5 → Backend-Produktion (Hysterese-State, QoS, Tests)
> - **DIESE Roadmap → UX-Architektur-Redesign** (Frontend-Logik + Backend-Datenmodell)

---

## Robins Beobachtungen (woertlich zusammengefasst)

### Beobachtung 1: Einseitige Aktorsteuerung
> "Wenn ich >40 Grad einstelle, geht der Aktor AN aber nie wieder AUS. User muss eingeben koennen ob Aktor AN UND AUS geht. Bei >40 AN wird <40 AUS automatisch vorgeschlagen, User kann es aber abstellen sodass Aktor nur AN bleibt."

### Beobachtung 2: Multi-Node-Verbindungen funktionieren nicht
> "Ich kann nicht mehrere Sensor-Knoten und Aktor-Knoten logisch miteinander verknuepfen. Das System reagiert verwirrt darauf. AND/OR finde ich gut, aber es ist schwierig durchzublicken wenn nur die Haelfte funktioniert."

### Beobachtung 3: Hysterese nur halb funktional
> "Laesst zwei Aktoren-Einstellungen zu (Heizen/Kuehlen), aber nur EINE funktioniert. Kann den Knoten zu zwei Aktoren verbinden, aber nirgends einstellen wann welcher Aktor angesteuert werden soll."

### Beobachtung 4: Zu viele Sensor-Knotentypen
> "Links hat jeder Sensor einen eigenen Knoten. Einer wuerde reichen — 'Sensor'. Den muss der User eh noch konfigurieren."

---

## Alle Findings — Konsolidierte Uebersicht

### A. UX-Architektur-Probleme (NEU — aus Robins Beobachtungen)

| # | Finding | Schwere | Beobachtung | Kern-Problem |
|---|---------|---------|-------------|--------------|
| **UX-1** | Einseitige Aktorsteuerung bei einfachen Operatoren | **CRITICAL** | B1 | Einfache Operatoren (>, <, etc.) haben nur EIN Aktor-Kommando (AN oder AUS). Kein Mechanismus fuer automatische Gegenreaktion. User erstellt Regel ">40 → AN" und Aktor bleibt FUER IMMER an |
| **UX-2** | Graph-zu-Daten-Konvertierung verliert Topologie | **HIGH** | B2 | VueFlow-Graph wird zu flachen JSON-Arrays serialisiert (`trigger_conditions[]` + `actions[]`). Visuelle Verbindungen (welcher Sensor zu welchem Aktor) gehen verloren. ALLE Aktionen feuern wenn Bedingungen erfuellt — keine selektive Zuordnung |
| **UX-3** | Kein Action-Routing pro Bedingung | **HIGH** | B2, B3 | User verbindet Sensor A → Aktor 1 und Sensor B → Aktor 2 visuell, aber im Datenmodell feuern bei TRUE immer ALLE Aktoren. Keine Moeglichkeit "Bedingung X → nur Aktor Y" zu definieren |
| **UX-4** | Hysterese Dual-Modus (Heizen+Kuehlen) ist Phantom-Feature | **HIGH** | B3 | Config-Panel zeigt Kuehlung UND Heizung Felder. Backend prueft `activate_above + deactivate_below` ZUERST (Cooling-Modus hat Vorrang, `hysteresis_evaluator.py:225`). Wenn beide gesetzt: Heizung wird ignoriert. UI suggeriert Feature das nicht existiert |
| **UX-5** | Kein Aktor-Zuordnung bei Hysterese | **HIGH** | B3 | Hysterese-Knoten kann zu mehreren Aktoren verbinden, aber ALLE bekommen denselben Befehl (AN oder AUS). Kuehlung → Aktor A und Heizung → Aktor B ist unmoeglich |
| **UX-6** | Zu viele redundante Sensor-Knotentypen in Palette | **MEDIUM** | B4 | 8 Sensor-spezifische Knoten (Sensor, Feuchtigkeit, pH, Licht, CO2, Bodenfeuchte, EC, Fuellstand) die alle dasselbe tun — Sensor-Bedingung mit vorgefiltert-em Sensortyp. EIN generischer "Sensor"-Knoten reicht |
| **UX-7** | Aktor-Knoten hat nur EIN Kommando | **MEDIUM** | B1 | Aktor-Aktion bietet nur "Einschalten (ON)" oder "Ausschalten (OFF)" als Dropdown. Kein bedingtes "AN wenn Bedingung TRUE, AUS wenn FALSE" |
| **UX-8** | Compound-Regeln (AND/OR) verwirrend bei Mehrfach-Verbindung | **MEDIUM** | B2 | AND/OR-Knoten hat nur einen Eingang und einen Ausgang visuell. Multi-Input/Multi-Output ist unklar. System reagiert "verwirrt" bei komplexen Topologien |

### B. Bestehende Backend-Findings (aus L0-L5 — zur Vollstaendigkeit)

| # | Finding | Schwere | Status | Roadmap |
|---|---------|---------|--------|---------|
| **N1** | condition_index hardcoded 0 | HOCH | AUFTRAG (L2) | L2-BE-2 |
| **N2** | Hysterese-State nicht persistiert | HOCH | AUFTRAG (L2) | L2-BE-1 |
| **N3** | Kein Concurrency Lock | MITTEL | Akzeptiert | — |
| **N4** | DiagnosticsEval fehlt in LogicService | MITTEL | AUFTRAG (L4) | L4-BE-1 |
| **N5** | GPIO-Typ-Mismatch Hysterese | MITTEL | AUFTRAG (L2) | L2-BE-3 |
| **N6** | extractSensorConditions() ignoriert hysteresis | MITTEL | AUFTRAG (L2) | L2-FE-1 |
| **N7** | Number('') → 0 statt null | NIEDRIG | AUFTRAG (L2) | L2-FE-2 |
| **N8** | ESP QoS 0 Subscription | NIEDRIG | AUFTRAG (L1) | L1-FIX |
| **N9** | DelayExecutor blockiert | NIEDRIG | Akzeptiert | — |

### C. Offline-Rule-Wechselwirkungen

| # | Finding | Schwere | Beschreibung |
|---|---------|---------|--------------|
| **OL-1** | Offline-Rules nur Hysterese | INFO | ESP Offline-Mode-Manager nutzt nur Hysterese-Rules. Wenn Hysterese-Datenmodell sich aendert, muss `_extract_offline_rule()` in `config_builder.py` angepasst werden |
| **OL-2** | Dual-Mode Hysterese → Offline-Konflikt | **MEDIUM** | Wenn Hysterese zukuenftig Heizen UND Kuehlen gleichzeitig unterstuetzt, muss `_build_offline_rules()` ZWEI separate Offline-Rules pro Condition erzeugen (eine fuer Kuehlung, eine fuer Heizung) |
| **OL-3** | soil_moisture Alias-Luecke | **MEDIUM** | Server-Filter `split("_")[0]` → "soil" ∉ Filter-Set. Firmware `requiresCalibration()` strcmp-Mismatch. Offen |

---

## Kern-Analyse: Warum der Rule Builder fuer den User nicht funktioniert

### Das fundamentale Architektur-Problem

Der Rule Builder hat ein **visuelles Graph-Paradigma** (VueFlow, Node-Red-aehnlich) aber ein **flaches Listen-Datenmodell**:

```
VISUELL (was der User sieht):
  [Sensor A] ──► [AND/OR] ──► [Aktor 1]
  [Sensor B] ──►          ──► [Aktor 2]

DATENMODELL (was gespeichert wird):
  {
    "trigger_conditions": [ConditionA, ConditionB],  ← Flache Liste
    "actions": [ActionAktor1, ActionAktor2],          ← Flache Liste
    "compound_operator": "AND"                        ← Global
  }

AUSWERTUNG (was passiert):
  IF (ConditionA AND ConditionB) → Execute ALL Actions
  → Aktor 1 UND Aktor 2 schalten GLEICHZEITIG
  → Keine Zuordnung "Sensor A → nur Aktor 1"
```

**Das erklaert ALLE 4 Beobachtungen:**
1. Einseitige Steuerung → Datenmodell hat keine Inverse-Action
2. Multi-Node verwirrt → Graph-Topologie geht bei Serialisierung verloren
3. Hysterese Dual-Modus → Backend kann nur EIN Modus pro Condition, kein Routing zu verschiedenen Aktoren
4. Zu viele Knotentypen → Palette-Design-Problem, unabhaengig vom Datenmodell

---

## Loesungsansatz: Zwei Strategien

### Strategie A: Graph-Paradigma beibehalten, Datenmodell erweitern (EMPFOHLEN)

Das Datenmodell muss die Graph-Topologie abbilden koennen. Dafuer braucht es **Action-Routing** — jede Condition (oder Condition-Gruppe) kann eigene Actions haben.

**Vorteile:** User-Erwartung entspricht dem visuellen Graph. Node-Red-Pattern bewaehrt.
**Nachteile:** Backend-Datenmodell muss erweitert werden. Migration bestehender Regeln.

### Strategie B: Vereinfachtes Datenmodell, Graph nur als Visualisierung

Der Graph ist nur Darstellung. Die eigentliche Logik wird ueber ein klar strukturiertes Formular definiert: "WENN [Sensor] [Operator] [Wert] DANN [Aktor] [Befehl] SONST [Aktor] [Befehl]".

**Vorteile:** Einfacher zu implementieren. Weniger fehleranfaellig.
**Nachteile:** Weniger flexibel. Compound-Logik (AND/OR) schwerer abzubilden.

### Empfehlung: Hybridansatz (Strategie A mit Vereinfachung)

1. **Graph beibehalten** — aber das Datenmodell so erweitern dass Edges (Verbindungen) gespeichert werden
2. **Auto-Inverse** — bei einfachen Operatoren automatisch eine OFF-Action vorschlagen
3. **Palette vereinfachen** — EIN Sensor-Knoten statt 8
4. **Hysterese aufteilen** — Kuehlung und Heizung als SEPARATE Logik-Pfade mit eigener Aktor-Zuordnung

---

## Phasenplan

### Phase R1: IST-Analyse (DIESE Roadmap)
**Status:** AKTIV
**Ergebnis:** 2 gezielte Analyseauftraege (Frontend + Backend)

| Auftrag | Datei | Fokus |
|---------|-------|-------|
| **R1-FE** | `auftrag-R1-FE-logic-frontend-analyse.md` | RuleFlowEditor, RuleConfigPanel, RuleNodePalette, Graph-zu-Daten-Konvertierung, VueFlow-Edges |
| **R1-BE** | `auftrag-R1-BE-logic-backend-analyse.md` | Datenmodell (cross_esp_logic), Evaluator-Pipeline, Action-Routing, Offline-Rule-Extraktion |

### Phase R2: Datenmodell-Redesign (~4-6h)
**Abhaengigkeit:** R1-FE + R1-BE (Analyse-Ergebnisse)
**Ziel:** Neues Datenmodell das Graph-Topologie abbildet

Erwartete Aufgaben:
- `trigger_conditions` erweitern um Action-Routing (welche Condition triggert welche Action)
- Inverse-Action-Konzept definieren (auto-OFF bei einfachen Operatoren)
- Hysterese Dual-Modus richtig modellieren (zwei getrennte Pfade)
- DB-Migrations-Strategie fuer bestehende Regeln
- Offline-Rule-Extraktion anpassen (`_extract_offline_rule()`)

### Phase R3: Frontend-Vereinfachung (~6-8h)
**Abhaengigkeit:** R2
**Ziel:** Palette, Config-Panel und Graph-Serialisierung redesignen

Erwartete Aufgaben:
- Palette: 8 Sensor-Knoten → 1 generischer Sensor-Knoten + Zeitfenster + Diagnose (3 statt 10)
- Config-Panel: Auto-Inverse-Toggle bei einfachen Operatoren
- Config-Panel: Hysterese aufteilen — entweder Kuehlung ODER Heizung pro Knoten, nicht beides
- Graph-Serialisierung: Edges (Verbindungen) im Datenmodell abbilden
- Aktor-Knoten: Bidirektional (AN wenn TRUE, AUS wenn FALSE) als Option

### Phase R4: Backend-Anpassung (~3-5h)
**Abhaengigkeit:** R2
**Ziel:** Logic Engine versteht neues Datenmodell

Erwartete Aufgaben:
- `_evaluate_rule()` erweitern fuer Action-Routing
- Hysterese: Dual-Modus korrekt implementieren (zwei unabhaengige State-Machines)
- Inverse-Action im ActuatorActionExecutor
- Offline-Rule-Extraktion fuer neues Modell
- Tests fuer neue Datenstrukturen

### Phase R5: Verifikation + Polish (~2-3h)
**Abhaengigkeit:** R3 + R4
**Ziel:** Live-Test auf Pi 5

---

## Detail-Findings pro Beobachtung

### Finding UX-1: Einseitige Aktorsteuerung (CRITICAL)

**IST-Zustand (aus Screenshot image2_5.png):**
- Operator-Dropdown: 8 Optionen (>, >=, <, <=, =, !=, zwischen, Hysterese)
- Bei Auswahl z.B. "groesser als (>)" → User gibt Schwellwert ein (z.B. 40)
- Aktor-Knoten → Befehl: "Einschalten (ON)"
- **Ergebnis:** Sensor > 40 → Aktor AN. Sensor faellt auf 30 → Aktor bleibt AN fuer immer

**SOLL-Zustand:**
- Bei einfachen Operatoren (>, <, >=, <=): Automatisch Inverse-Action vorschlagen
  - User stellt ein: "> 40 → AN"
  - System ergaenzt automatisch: "<= 40 → AUS" (abschaltbar)
- Toggle im Config-Panel: "Automatische Gegenreaktion" (default: AN)
  - AN: System erstellt intern eine zweite Condition+Action fuer die Inverse
  - AUS: Aktor bleibt wie bisher (nur eine Richtung — fuer Spezialfaelle wie Alarme)

**Technischer Hintergrund warum das aktuell nicht geht:**
- Die Logic Engine wertet Regeln NUR aus wenn Bedingung = TRUE → Actions feuern
- Wenn Bedingung = FALSE → nichts passiert (ausser bei Hysterese-Deaktivierung)
- Es gibt keinen "ELSE"-Pfad im Evaluator
- Der Hysterese-Operator ist der EINZIGE der aktiv OFF sendet (ueber `_hysteresis_just_deactivated` Flag)

### Finding UX-2: Graph-Topologie geht verloren (HIGH)

**IST-Zustand:**
```
graphToRuleData() in RuleFlowEditor.vue serialisiert:
  - Alle Condition-Nodes → trigger_conditions[] (flache Liste)
  - Alle Action-Nodes → actions[] (flache Liste)
  - Edges (Verbindungen) → WERDEN NICHT GESPEICHERT

ruleToGraph() deserialisiert:
  - trigger_conditions[] → Condition-Nodes (neue Positionen)
  - actions[] → Action-Nodes (neue Positionen)
  - Edges → AUTOMATISCH GENERIERT (alle Conditions → Logic → alle Actions)
```

**Problem:** Der User zeichnet einen spezifischen Graphen, aber beim Speichern+Laden wird er zu "alle-zu-alle" vereinfacht.

**SOLL-Zustand:**
- Edges im Datenmodell speichern (z.B. `"routing": [{"condition_index": 0, "action_indices": [0]}, ...]`)
- Beim Laden die originale Topologie wiederherstellen
- Beim Evaluieren: Nur die Actions ausfuehren die zur erfuellten Condition gehoeren

### Finding UX-3: Kein Action-Routing (HIGH)

Direkte Folge von UX-2. Das Backend-Datenmodell `cross_esp_logic` hat:
```json
{
  "trigger_conditions": [...],  // ALLE Bedingungen
  "actions": [...],             // ALLE Aktionen
  "compound_operator": "AND"    // Global
}
```

Es fehlt eine Zuordnung "Condition X → Action Y". Aktuell gilt: TRUE → alle Actions.

### Finding UX-4: Hysterese Phantom-Feature (HIGH)

**IST (aus Screenshot image2.png):**
- Config-Panel zeigt KUEHLUNG (Ein wenn > / Aus wenn <) UND HEIZUNG (Ein wenn < / Aus wenn >)
- User kann BEIDE ausfuellen
- Backend-Code (`hysteresis_evaluator.py:225`): `if activate_above is not None and deactivate_below is not None` → Cooling-Modus. Wird ZUERST geprueft.
  [Korrektur verify-plan: Zeile war 145 (andere Methode: `_persist_state_change`). Tatsaechlich: Zeile 225. Ausserdem prueft die Condition BEIDE Felder zusammen, nicht nur `activate_above` allein — wenn nur eines gesetzt ist, laeuft die Logik in den Error-Zweig (Zeile 275).]
- Wenn Cooling-Felder (activate_above + deactivate_below) gesetzt sind, werden Heating-Felder IGNORIERT
- **Ergebnis:** User fuellt Heizung aus, Heizung funktioniert nicht

**SOLL:**
- Option A: Hysterese auf EIN Modus beschraenken (Kuehlung ODER Heizung per Toggle)
- Option B: Zwei separate Hysterese-Conditions erlauben — eine fuer Kuehlung mit Aktor A, eine fuer Heizung mit Aktor B (erfordert Action-Routing UX-3)
- **Empfehlung:** Option A kurzfristig (einfacher Fix), Option B langfristig (nach R2)

### Finding UX-5: Hysterese ohne Aktor-Zuordnung (HIGH)

**IST (aus Robins Beobachtung):**
- Hysterese-Knoten → verbunden mit 2 Aktor-Knoten
- User erwartet: Kuehlung → Aktor A (Luefter), Heizung → Aktor B (Heizung)
- Realitaet: Hysterese = TRUE → BEIDE Aktoren AN. Hysterese = FALSE → BEIDE Aktoren AUS

**Kern:** Das Datenmodell hat kein Konzept von "dieser Zweig der Bedingung steuert diesen Aktor". Loesbar nur durch Action-Routing (UX-3/R2).

### Finding UX-6: Redundante Palette (MEDIUM)

**IST (aus Screenshot image1.png):**
Linke Sidebar "BEDINGUNGEN":
1. Sensor — Sensor-Schwellwert Bedingung (GENERISCH)
2. Feuchtigkeit — Luftfeuchtigkeits-Bedingung
3. pH-Wert — pH-Sensor Bedingung
4. Licht — Lichtsensor Bedingung
5. CO2 — CO2-Konzentration Bedingung
6. Bodenfeuchte — Bodenfeuchtigkeit Bedingung
7. EC-Wert — Leitfaehigkeit Bedingung
8. Fuellstand — Tank-/Behaelter-Fuellstand
9. Zeitfenster — Tageszeitbasierte Bedingung (EIGENSTAENDIG)
10. Diagnose-Status — Bedingung basierend auf System-... (EIGENSTAENDIG)

**Analyse:** 1-8 sind ALLE Sensor-Bedingungen — sie unterscheiden sich nur im vorgefilterten `sensor_type`. Der User muss trotzdem ESP + konkreten Sensor auswaehlen. Der Typ-Filter spart genau einen Dropdown-Klick.

**SOLL:** 3 Knoten-Typen in der Palette:
1. **Sensor** — Generische Sensor-Bedingung (ESP → Sensor → Operator → Wert)
2. **Zeitfenster** — Tageszeitbasiert (genuinely anderer Condition-Typ)
3. **Diagnose-Status** — System-Health (genuinely anderer Condition-Typ)

Optional: Die 8 Sensor-Typen als "Schnellzugriff" in einer kollabierbaren Sektion behalten (fuer Power-User die den Typ schon kennen). Aber der generische "Sensor"-Knoten muss IMMER funktionieren und prominent sein.

### Finding UX-7: Aktor nur unidirektional (MEDIUM)

**IST (aus Screenshot image4.png):**
- Befehl-Dropdown: "Einschalten (ON)" (vermutlich auch "Ausschalten (OFF)")
- KEIN "Automatisch (AN wenn TRUE, AUS wenn FALSE)"
- KEIN bedingtes Verhalten

**SOLL:**
- Neuer Befehl-Modus: "Automatisch" — AN wenn Bedingung TRUE, AUS wenn FALSE
- Das ist die logische Entsprechung zu UX-1 aber auf der Aktor-Seite
- Erfordert Backend-Aenderung: Logic Engine muss bei FALSE aktiv OFF senden (nicht nur bei Hysterese)

### Finding UX-8: Compound-Knoten bei komplexen Graphen (MEDIUM)

**IST (aus Screenshot image3.png):**
- Logik-Verknuepfung: UND/ODER Toggle
- "Mindestens eine verbundene Bedingung muss erfuellt sein" (ODER)
- Nur EIN Toggle fuer die GESAMTE Regel — kein verschachteltes AND(OR(A,B), C)

**Problem bei Multi-Node:**
- User zieht 3 Sensoren und 2 Aktoren auf die Flaeche
- Verbindet Sensor 1+2 → AND → Aktor 1, Sensor 3 → Aktor 2
- System serialisiert: conditions=[1,2,3], actions=[Aktor1, Aktor2], operator=AND
- Ergebnis: Nur wenn ALLE 3 Sensoren TRUE sind, feuern BEIDE Aktoren
- User wollte: (1 AND 2) → Aktor1, 3 → Aktor2

---

## Abhaengigkeitsdiagramm

```
BESTEHEND (L0-L5):
  L0 ✅ → L1 → L2+L3 → L4 → L5

NEU (R1-R5 — DIESE Roadmap):
  R1-FE Analyse ──┐
                   ├──► R2 Datenmodell-Redesign ──► R3 Frontend ──┐
  R1-BE Analyse ──┘                              ──► R4 Backend  ──┼──► R5 Verifikation
                                                                   │
  L2 Hysterese-Haertung ──────────────────────────────────────────┘
  (N2 State-Persistenz bleibt Voraussetzung fuer R4)

OFFLINE-RULES:
  R4 Backend ──► OL-2 Offline-Rule-Anpassung (in R4 enthalten)
```

**Reihenfolge-Empfehlung:**
1. **SOFORT:** R1-FE + R1-BE parallel (Analyseauftraege)
2. **PARALLEL zu R1:** L1-L2 weiter abarbeiten (Backend-Haertung)
3. **NACH R1:** R2 Datenmodell-Redesign (braucht Analyse-Ergebnisse)
4. **NACH R2:** R3+R4 parallel (Frontend + Backend)
5. **ZULETZT:** R5 Verifikation

---

## Aufwand-Schaetzung

| Phase | Aufwand | Abhaengigkeit |
|-------|---------|---------------|
| R1-FE + R1-BE Analyse | ~3-4h | Keine |
| R2 Datenmodell-Redesign | ~4-6h | R1 |
| R3 Frontend-Vereinfachung | ~6-8h | R2 |
| R4 Backend-Anpassung | ~3-5h | R2, L2 |
| R5 Verifikation | ~2-3h | R3, R4 |
| **Gesamt** | **~18-26h** | |

Plus bestehende L1-L5: ~15-20h
**Logic Engine Total: ~33-46h**

---

## Risiken

| Risiko | Wahrscheinlichkeit | Auswirkung | Mitigation |
|--------|---------------------|------------|------------|
| Datenmodell-Migration bricht bestehende Regeln | HOCH | Bestehende Regeln laden nicht | Migration mit Fallback: altes Format weiterhin lesbar |
| Offline-Rule-Extraktion inkompatibel | MITTEL | ESP Offline-Hysterese bricht | OL-2 explizit in R4 einplanen |
| Frontend-Refactoring zu gross (~1968 Zeilen RuleFlowEditor) | MITTEL | Scope Creep | Chirurgische Aenderungen, kein Komplett-Rewrite |
| VueFlow-Edges-API nicht ausreichend | NIEDRIG | Graph-Topologie nicht speicherbar | VueFlow unterstuetzt Edges als First-Class — API pruefen in R1-FE |

---

## Screenshots-Referenz

| Screenshot | Zeigt | Relevant fuer |
|------------|-------|---------------|
| `image1.png` | Gesamtansicht Rule Builder mit Palette + Graph + Minimap | UX-6 (Palette), UX-8 (Graph-Layout) |
| `image2.png` | Sensor-Bedingung Config mit Hysterese (Kuehlung 70/50, Heizung leer) | UX-4 (Dual-Modus), UX-5 (Aktor-Zuordnung) |
| `image2_5.png` | Operator-Dropdown (8 Optionen inkl. Hysterese) | UX-1 (einfache Operatoren), UX-4 |
| `image3.png` | Logik-Verknuepfung (UND/ODER Toggle) | UX-8 (Compound) |
| `image4.png` | Aktor-Aktion Config (ON, Max Laufzeit) | UX-7 (unidirektional), UX-1 |

---

**Ende Roadmap Logic Engine UX-Redesign (2026-04-01).**
