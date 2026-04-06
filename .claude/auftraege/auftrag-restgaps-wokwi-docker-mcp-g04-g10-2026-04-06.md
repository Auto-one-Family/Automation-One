# Auftrag: Rest-Gaps G04-G10 schliessen — Wokwi-in-Docker + MCP + MQTT

**Typ:** Umsetzungsauftrag (haertend, regressionssicher)  
**Datum:** 2026-04-06  
**Prioritaet:** Mittel bis hoch  
**Voraussetzung:** Top-3-Auftrag (`G01-G03`) laeuft oder ist abgeschlossen.  
**Kernregel:** Keine Regression gegen bereits geschlossene Gaps. Jeder Schritt mit Test- und Log-Nachweis.

---

## 1) Missionsziel

Schliesse die Rest-Gaps **G04 bis G10** so, dass das System:

1. deutlich weniger flaky ist,  
2. reproduzierbar ueber lokale und CI-Pfade laeuft,  
3. Testaussagen korrekt und ehrlich sind (keine Scheinabdeckung),  
4. MCP optional nutzbar macht, ohne das Release-Gate davon abhaengig zu machen.

---

## 2) Scope und harte Grenzen

### In Scope
- G04 Race-Condition in MQTT-Injection
- G05 Wokwi-CLI Version-Pinning
- G06 MCP-Konfiguration + PoC
- G07 I2C-Gate-Klarheit (kurzfristig Option B)
- G08 Script/CI-Divergenz
- G09 Parallelitaet ohne ESP-ID-Isolation
- G10 Wokwi-Preflight/Health-Check

### Out of Scope
- G01-G03 (separater Auftrag)
- Funktionsumbauten ausserhalb Wokwi/Docker/MCP/CI/Testlogik
- Frontend-/Business-Features

---

## 3) Legende und Verbindlichkeit

| Feld | Bedeutung |
|------|-----------|
| IST | Aktueller Zustand im Code/Workflow |
| SOLL | Belastbarer Zielzustand |
| Delta | Konkrete Luecke |
| Aktion | Verbindliche Umsetzung |
| Aufwand | S (<1h), M (1-4h), L (>4h) |
| Risiko | niedrig / mittel / hoch / kritisch |

**Stop-Regel:** Kein naechstes Gap starten, bevor das aktuelle Gap die Abnahme erreicht hat.

---

## 4) Ausfuehrungsreihenfolge (verbindlich)

1. G04  
2. G05  
3. G10  
4. G07  
5. G08  
6. G09  
7. G06

Begruendung: zuerst Stabilitaet/Determinismus, dann Abdeckungsklarheit, dann Wartbarkeit, zuletzt MCP.

---

## 5) Umsetzungsblaetter je Gap

## G04 — Race-Condition in MQTT-Injection

| Feld | Inhalt |
|------|--------|
| **IST** | Injection erfolgt ueber starres `sleep 25`, nicht ueber echte Readiness |
| **SOLL** | Injection erst nach belegter MQTT-Bereitschaft |
| **Delta** | Timing-Fenster zu frueh/zu spaet erzeugt Flaky-Timeouts |
| **Aufwand** | M |
| **Risiko** | mittel |

### Aktion
1. Ersetze starres Sleep durch Readiness-Wait (Serial-Match `"MQTT connected"` oder gleichwertiger, dokumentierter Indikator).  
2. Extrahiere Waiting in dediziertes Script/Funktion, damit alle betroffenen Jobs denselben Mechanismus nutzen.  
3. Falls kurzfristig noetig: `sleep 35` nur als temporaerer Fallback mit klarer TODO-Markierung.

### Testpflicht
1. Drei identische Runs eines injection-basierten Szenarios hintereinander.  
2. Nachweis pro Run: `readiness_timestamp < injection_timestamp`.  
3. Keine Timeouts, die auf fruehe Injection zurueckzufuehren sind.

### Logpflicht
- `logs/wokwi/serial/g04/`
- `logs/wokwi/reports/g04/`

Pflichtfelder im Report:
- Szenario, Laufnummer, Startzeit, Endzeit, Exit-Code
- Zeitpunkt Readiness-Match
- Zeitpunkt Injection
- Zeitpunkt erwarteter Serial-Match

### Abnahme
- 3/3 stabil gruen,
- kein starres Sleep mehr als alleinige Steuerlogik.

---

## G05 — Wokwi-CLI Version nicht gepinnt

| Feld | Inhalt |
|------|--------|
| **IST** | CLI-Installation zieht implizit latest |
| **SOLL** | Version in CI explizit gepinnt |
| **Delta** | Update-Drift kann CI unerwartet brechen |
| **Aufwand** | S |
| **Risiko** | mittel |

### Aktion
1. `WOKWI_CLI_VERSION` zentral im Workflow definieren.  
2. Installationspfad auf diese Version pinnen.  
3. Lokale Skripte angleichen oder explizit als "lokal latest, CI pinned" dokumentieren.

### Testpflicht
1. CI-Run mit gepinnter Version gruen.  
2. Dokumentierter Kontrolllauf mit bewusst geaenderter Version (nur Testbranch), um kontrollierte Wirkung zu zeigen.

### Logpflicht
- `logs/wokwi/reports/g05/cli-version-pin-check.md`

Pflichtinhalt:
- gesetzte Version
- Install-Ausgabe
- Ergebnis des Testlaufs

### Abnahme
- Version ist zentral sichtbar und reproduzierbar wirksam.

---

## G10 — Kein Wokwi-Health-Check im Makefile/CI

| Feld | Inhalt |
|------|--------|
| **IST** | Kein verbindlicher Preflight |
| **SOLL** | Vor jedem Lauf ein schneller, harter Toolchain-Check |
| **Delta** | Fehler werden zu spaet erkannt |
| **Aufwand** | S |
| **Risiko** | niedrig |

### Aktion
1. Lokales `wokwi-check` (Makefile oder gleichwertig) einfuehren.  
2. CI-Preflight vor erstem Szenario:
   - CLI vorhanden
   - Version erwartungsgemaess
   - Token/Auth-Plausibilitaet (soweit technisch moeglich).

### Testpflicht
1. Positivfall: Preflight gruen -> Tests starten.  
2. Negativfall: fehlender/ungueltiger Token -> schneller, klarer Abbruch.

### Logpflicht
- `logs/wokwi/reports/g10/`

Pflichtinhalt:
- Preflight-Output
- eindeutiger Fehlercode/-text im Negativfall

### Abnahme
- Kein Testlauf startet ohne bestandenen Preflight.

---

## G07 — I2C-Szenarien ohne Hardware-Counterpart

| Feld | Inhalt |
|------|--------|
| **IST** | I2C in CI teilweise als Gate aktiv, obwohl kein echter Sensor-Counterpart |
| **SOLL** | Keine irrefuehrende I2C-Abdeckungsbehauptung im PR-Gate |
| **Delta** | Pseudo-Abdeckung |
| **Aufwand** | S (Option B) / L (Option A) |
| **Risiko** | mittel |

### Aktion (verbindlich kurzfristig)
1. **Option B** umsetzen: I2C-Sensor-Kommunikationsszenarien aus PR-Gate entfernen.  
2. Klar markieren:
   - "I2C Sensor-Kommunikation = Hardware-only"
   - "I2C Controller-Init = CI-simuliert (falls zutreffend)"
3. Option A (Custom Chip) als separates Langfristpaket dokumentieren.

### Testpflicht
1. PR-Gate laeuft nach Anpassung gruen.  
2. Vorher/Nachher-Matrix zeigt exakt, was noch CI-pruefbar ist.

### Logpflicht
- `.claude/reports/current/g07-i2c-gate-entscheidung-2026-04-06.md`

Pflichtinhalt:
- betroffene Szenarienliste
- Entfernt/Beibehalten mit Begruendung
- "simuliert vs hardware-only" Tabelle

### Abnahme
- Keine falsche I2C-Sicherheitsaussage mehr im PR-Gate.

---

## G08 — `run-wokwi-tests.py` nicht CI-synchronisiert

| Feld | Inhalt |
|------|--------|
| **IST** | Lokaler Script-Pfad und CI-Workflow-Pfad divergieren |
| **SOLL** | Klare Betriebsentscheidung und dokumentierter Zweck je Pfad |
| **Delta** | Maintenance-Overhead, Missverstaendnisse |
| **Aufwand** | S (Doku) / L (Konsolidierung) |
| **Risiko** | niedrig |

### Aktion
1. Verbindliche Kurzentscheidung:
   - "Script = lokal, Workflow = CI" (empfohlen)  
   oder
   - "Script = Single Entry Point" (nur wenn realistisch sofort umsetzbar).
2. Kommentare, Readmes und Hilfetexte auf diese Entscheidung angleichen.  
3. Nachweisbar falsche Kommentare entfernen/korrigieren.

### Testpflicht
1. Ein lokaler Lauf via Script.  
2. Ein CI-Lauf via Workflow.  
3. Kurzer Vergleich "absichtlich verschieden / absichtlich gleich".

### Logpflicht
- `.claude/reports/current/g08-runner-divergenz-klarstellung-2026-04-06.md`

### Abnahme
- Jeder im Team erkennt sofort, welcher Eintrittspunkt wofuer gilt.

---

## G09 — Paralleles Wokwi ohne ESP-ID-Isolation

| Feld | Inhalt |
|------|--------|
| **IST** | `--parallel N` moeglich, aber potenziell Topic-Kollision durch gleiche ESP-ID |
| **SOLL** | Entweder sicher isoliert oder bewusst auf `parallel=1` begrenzt |
| **Delta** | Risiko von Message-Interferenz |
| **Aufwand** | M |
| **Risiko** | niedrig (bei `parallel=1`) |

### Aktion
1. Kurzfristig Standard hart auf `parallel=1` belassen/setzen.  
2. Optionales Ausbaupaket dokumentieren: ESP-ID-Rotation pro Worker.

### Testpflicht
1. Stabilitaetslauf mit `parallel=1`.  
2. Falls Rotation umgesetzt wird: 2+ parallele Instanzen mit isolierten IDs/Topics nachweisen.

### Logpflicht
- `logs/wokwi/reports/g09/`

Pflichtinhalt:
- gewaehlter Modus
- Kollision beobachtet: ja/nein
- Schlussfolgerung fuer Standardbetrieb

### Abnahme
- Kein unbeabsichtigter Parallelbetrieb mit Topic-Ueberlagerung.

---

## G06 — MCP nicht konfiguriert

| Feld | Inhalt |
|------|--------|
| **IST** | MCP fehlt/ist nicht betriebsverifiziert |
| **SOLL** | MCP sauber konfiguriert, PoC erfolgreich, aber CI-gate-unabhaengig |
| **Delta** | Agentische Steuerung fehlt |
| **Aufwand** | M |
| **Risiko** | niedrig bis mittel |

### Aktion
1. `.mcp.json` um Wokwi-Server erweitern (stdio, `wokwi-cli mcp`, env-basiert, korrektes CWD).  
2. `docs/wokwi-mcp.md` erstellen/aktualisieren (Start, Fehlerfaelle, Grenzen).  
3. MCP als optionales Diagnose-/Automationswerkzeug positionieren, nicht als harte Gate-Abhaengigkeit.

### Testpflicht
1. MCP-Server startet.  
2. PoC:
   - Boot-Lauf anstossen,
   - Serial-Ausgabe lesen,
   - Erfolg/Fehlschlag dokumentieren.
3. Kontrolltest: CI funktioniert weiterhin ohne MCP.

### Logpflicht
- `logs/wokwi/reports/g06/`
- `.claude/reports/current/g06-mcp-poc-2026-04-06.md`

### Abnahme
- MCP praktisch nutzbar,
- keine neue Single-Point-of-Failure-Abhaengigkeit entstanden.

---

## 6) Gesamt-Deliverables (Pflicht)

1. `.claude/reports/current/g04-race-condition-verifikation-2026-04-06.md`  
2. `.claude/reports/current/g05-cli-version-pin-verifikation-2026-04-06.md`  
3. `.claude/reports/current/g10-preflight-healthcheck-verifikation-2026-04-06.md`  
4. `.claude/reports/current/g07-i2c-gate-entscheidung-2026-04-06.md`  
5. `.claude/reports/current/g08-runner-divergenz-klarstellung-2026-04-06.md`  
6. `.claude/reports/current/g09-parallelitaet-esp-id-verifikation-2026-04-06.md`  
7. `.claude/reports/current/g06-mcp-poc-2026-04-06.md`  
8. `.claude/reports/current/restgaps-g04-g10-abschlussbericht-2026-04-06.md`

Der Abschlussbericht muss zwingend enthalten:
- Status je Gap (erledigt/offen/blockiert)
- harte Restrisiken
- empfohlene naechste 3 Aufgaben
- klares Betriebsfazit (release-ready ja/nein fuer Restgaps)

---

## 7) Definition of Done (hart)

Dieser Auftrag ist nur abgeschlossen, wenn:

1. alle Gaps G04-G10 mit Test- und Lognachweis bearbeitet wurden,  
2. die geforderten Deliverables vorhanden und inhaltlich belastbar sind,  
3. keine Regression gegen Top-3-Gaps entstanden ist,  
4. ein klares Endurteil vorliegt:
   - **"Restgaps produktionsreif geschlossen"** oder
   - **"noch nicht produktionsreif"** mit priorisierten Blockern.

**Unvollstaendig, wenn:** nur Code geaendert wurde, aber Test-/Log-/Abnahmebelege fehlen.

