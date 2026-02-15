# Verifikationsauftrag: Phase 1-3 Gesamtprüfung – Alles korrekt vernetzt?

**Modus:** Plan + Bash (Read-Only Analyse, aber Bash für Live-Tests)
**Agent:** Du bist ein Verifikations-Agent. Du darfst Subagents spawnen. Du darfst Bash-Befehle ausführen um den Stack live zu testen. Du ÄNDERST keine Dateien.

---

## Systemkontext

Du prüfst das **AutomationOne IoT-Framework** nach einer umfangreichen Implementierungsphase. Drei Phasen wurden abgeschlossen:

- **Phase 1:** CI-Docker-Vereinheitlichung (docker-compose.ci.yml, Workflow-Umstellung, Test-Config)
- **Phase 2:** Frontend-Test-Engine (Vitest, Vue Test Utils, Komponenten-/Store-Tests, CI-Workflow)
- **Phase 3:** Wokwi-Coverage-Erweiterung, lokaler Test-Runner, Makefile-Integration, Agent-Updates

Dein Job: **Verifiziere dass ALLES korrekt vernetzt ist, ALLES startet, loggt, stoppt – und dass CI komplett ordentlich ist.** Nicht oberflächlich. Du testest LIVE und liest KOMPLETT.

---

## TEIL 1: Docker-Stack – Starten, Stoppen, Logs, Health

### 1.1 Core-Stack starten und verifizieren

```bash
# Sauberer Start
docker compose down -v 2>/dev/null
docker compose up -d --build

# Warte auf Healthchecks
sleep 30

# Status aller Container
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# Health-Endpoints
curl -s http://localhost:8000/v1/health/live | python3 -m json.tool
curl -s http://localhost:8000/v1/health/ready | python3 -m json.tool
```

Dokumentiere:
- Starten ALLE 4 Core-Container? (el-servador, el-frontend, postgres, mqtt-broker)
- Sind ALLE healthy? Wie lange bis healthy?
- Antwortet `/health/live`? `/health/ready`?
- Stimmen die Port-Mappings mit der Dokumentation überein?

### 1.2 Profile testen

```bash
# DevTools-Profile
docker compose --profile devtools up -d
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
# Erwartung: Core + pgAdmin

# Monitoring-Profile (falls implementiert)
docker compose --profile monitoring up -d 2>/dev/null
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# Alles stoppen
docker compose --profile devtools --profile monitoring down
```

Dokumentiere:
- Welche Profiles existieren? Welche Container gehören zu welchem?
- Starten die Profile-Container sauber neben den Core-Containern?
- Stoppen sie sauber ohne Core zu beeinflussen?

### 1.3 Log-Persistenz verifizieren

```bash
# Stack starten
docker compose up -d

# Warte bis Logs geschrieben werden
sleep 15

# Prüfe JEDES Log-Verzeichnis
echo "=== Log-Verzeichnisse ==="
ls -la logs/ 2>/dev/null
ls -la logs/server/ 2>/dev/null
ls -la logs/mqtt/ 2>/dev/null
ls -la logs/postgres/ 2>/dev/null
ls -la logs/esp32/ 2>/dev/null
ls -la logs/wokwi/ 2>/dev/null
ls -la logs/current/ 2>/dev/null

# Haben die Logs Inhalt?
echo "=== Log-Inhalte (letzte 5 Zeilen) ==="
tail -5 logs/server/*.log 2>/dev/null || echo "KEINE SERVER-LOGS"
tail -5 logs/mqtt/*.log 2>/dev/null || echo "KEINE MQTT-LOGS"
tail -5 logs/postgres/*.log 2>/dev/null || echo "KEINE POSTGRES-LOGS"
```

Dokumentiere:
- Existieren ALLE Log-Verzeichnisse aus `LOG_LOCATIONS.md`?
- Werden Logs tatsächlich geschrieben? (Nicht nur leere Dateien)
- Stimmen die Pfade mit der Dokumentation in `.claude/reference/debugging/LOG_LOCATIONS.md` überein?
- Funktioniert die Log-Rotation? (max-size, max-file in docker-compose.yml)

### 1.4 Sauberes Stoppen

```bash
# Stoppen
docker compose down

# Prüfe: Sind ALLE Container weg?
docker ps -a --filter "name=automationone" --format "{{.Names}}: {{.Status}}"

# Prüfe: Volumes noch da? (sollen sie)
docker volume ls --filter "name=automationone"

# Clean Stop mit Volume-Löschung
docker compose down -v
docker volume ls --filter "name=automationone"
```

Dokumentiere:
- Stoppt `docker compose down` sauber? Bleiben Zombie-Container?
- Bleiben Volumes bei `down` erhalten? Werden sie bei `down -v` gelöscht?

---

## TEIL 2: Makefile – Alle Targets verifizieren

### 2.1 Makefile-Inventar

```bash
# Alle Targets auflisten
make help 2>/dev/null || grep -E "^[a-zA-Z_-]+:" Makefile | sed 's/:.*//'
```

### 2.2 Jedes Target testen

Führe JEDES test- und docker-bezogene Target aus und dokumentiere ob es funktioniert:

```bash
# Docker-Targets
make status 2>&1 | head -20
make health 2>&1 | head -10

# Test-Targets (JEDES das existiert)
make test-backend 2>&1 | tail -20          # oder wie es heißt
make test-frontend 2>&1 | tail -20         # oder wie es heißt
make test-wokwi 2>&1 | tail -20           # oder wie es heißt
make test-wokwi-quick 2>&1 | tail -20     # falls existent
make test-all 2>&1 | tail -20             # falls existent

# Log-Targets
make logs 2>&1 | head -10 &
sleep 3 && kill %1 2>/dev/null

# DevTools
make devtools-up 2>&1 | tail -10
make devtools-stop 2>&1 | tail -10

# Watch (nur prüfen ob es startet, dann abbrechen)
timeout 10 make watch 2>&1 | tail -10 || true
```

Für JEDES Target dokumentiere:

| Target | Existiert? | Funktioniert? | Output korrekt? | Fehler/Warnings? |
|--------|-----------|---------------|-----------------|------------------|

### 2.3 Cross-Reference mit Dokumentation

```bash
cat .claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md
```

Vergleiche: Sind ALLE dokumentierten Targets im Makefile? Sind alle Makefile-Targets dokumentiert? Diskrepanzen auflisten.

---

## TEIL 3: Test-Suites – Backend, Frontend, Wokwi

### 3.1 Backend-Tests

```bash
# Sind Dependencies installiert?
cd "El Servador/god_kaiser_server" 2>/dev/null || cd "El Servador"
pip list 2>/dev/null | grep -iE "pytest|httpx|aiosqlite" || echo "Dependencies prüfen"

# pytest Discovery
python -m pytest --collect-only 2>&1 | tail -30

# Marker auflisten
python -m pytest --markers 2>&1 | head -30

# Kurzer Testlauf (nur Unit-Tests, schnell)
python -m pytest -m unit --tb=short -q 2>&1 | tail -20
cd -
```

Dokumentiere:
- Werden Tests gefunden? Wie viele?
- Welche Marker sind registriert?
- Laufen Unit-Tests durch? Failures?
- Welche Test-DB wird verwendet? (SQLite/PostgreSQL – prüfe conftest.py)

### 3.2 Frontend-Tests

```bash
cd "El Frontend"

# Dependencies
cat package.json | python3 -c "import sys,json; d=json.load(sys.stdin); [print(k,v) for k,v in {**d.get('devDependencies',{}), **d.get('dependencies',{})}.items() if 'vitest' in k.lower() or 'test' in k.lower() or 'vue-test' in k.lower()]" 2>/dev/null

# Vitest Config existiert?
ls -la vitest.config.* 2>/dev/null

# Test-Dateien finden
find src -name "*.test.*" -o -name "*.spec.*" 2>/dev/null | head -30
find src -name "__tests__" -type d 2>/dev/null

# npm test Script
cat package.json | python3 -c "import sys,json; d=json.load(sys.stdin); [print(k,v) for k,v in d.get('scripts',{}).items() if 'test' in k.lower()]" 2>/dev/null

# Test Discovery
npx vitest --run --reporter=verbose 2>&1 | tail -40

cd -
```

Dokumentiere:
- Ist Vitest installiert und konfiguriert?
- Wie viele Test-Dateien existieren? Wo?
- Welche Komponenten/Stores werden getestet?
- Laufen die Tests durch? Failures?
- Gibt es Mock-Setup? (MSW? Vitest Mocks? Custom?)
- Gibt es Test-Utilities/Helpers? (render-Wrapper, Store-Factories?)

### 3.3 Wokwi-Tests

```bash
# Wokwi CLI installiert?
wokwi-cli --version 2>/dev/null || echo "WOKWI-CLI NICHT INSTALLIERT"

# Szenario-Inventar
echo "=== Szenario-Kategorien ==="
ls -la "El Trabajante/tests/wokwi/scenarios/" 2>/dev/null

echo "=== Szenario-Anzahl pro Kategorie ==="
for dir in "El Trabajante/tests/wokwi/scenarios/"*/; do
  count=$(find "$dir" -name "*.yaml" -o -name "*.yml" 2>/dev/null | wc -l)
  echo "$(basename $dir): $count Szenarien"
done

# Helpers vorhanden?
ls -la "El Trabajante/tests/wokwi/helpers/" 2>/dev/null

# Run-Script vorhanden?
ls -la scripts/run-wokwi* 2>/dev/null

# Lokaler Test-Runner (falls implementiert)
ls -la scripts/test-wokwi* 2>/dev/null
ls -la scripts/wokwi* 2>/dev/null

# PlatformIO wokwi_simulation Environment
grep -A 20 "\[env:wokwi_simulation\]" "El Trabajante/platformio.ini" 2>/dev/null

# Firmware bauen (ohne Upload)
cd "El Trabajante"
pio run -e wokwi_simulation 2>&1 | tail -20
cd -
```

Dokumentiere:
- Ist wokwi-cli installiert? Version?
- Wie viele Szenarien pro Kategorie?
- Baut die Firmware für `wokwi_simulation` sauber?
- Existiert ein lokaler Test-Runner-Script?
- Kann man Wokwi-Tests lokal ausführen? (Falls Token vorhanden, einen Test starten)

---

## TEIL 4: CI-Workflows – Vollständigkeitsprüfung

### 4.1 Alle Workflows lesen

Lies KOMPLETT:

```
.github/workflows/server-tests.yml
.github/workflows/esp32-tests.yml
.github/workflows/wokwi-tests.yml
.github/workflows/pr-checks.yml
.github/workflows/frontend-tests.yml     ← MUSS EXISTIEREN (Phase 2)
```

Für JEDEN Workflow prüfe:

| Prüfpunkt | Was du suchst |
|-----------|---------------|
| Trigger | on: push/PR – korrekte Branches und Paths? |
| Services | Mosquitto/PostgreSQL – korrekte Ports und Config? |
| Dependencies | pip install / npm install / pio – vollständig? |
| Healthcheck-Waits | Wird auf Service-Readiness gewartet? Wie? |
| Test-Ausführung | Korrekter Befehl? Korrekte Arbeitsverzeichnisse? |
| Artifact-Upload | Test-Results gespeichert? Retention konfiguriert? |
| Failure-Handling | continue-on-error? fail-fast? |
| Concurrency | cancel-in-progress konfiguriert? |

### 4.2 Frontend-Workflow Spezialprüfung

Der `frontend-tests.yml` (oder wie er heißt) ist NEU aus Phase 2. Besonders genau prüfen:

- Trigger: Wird er bei Frontend-Änderungen ausgelöst? Path-Filter korrekt?
- Node-Version: Stimmt sie mit der lokalen überein?
- npm install: Wird `package-lock.json` gecacht?
- Vitest-Aufruf: Korrekter Befehl? Coverage?
- Artifact: Test-Results als Artifact?

### 4.3 Wokwi-Workflow Spezialprüfung

Phase 3 hat die Coverage erweitert. Prüfe:

- Neue Szenarien: Sind die neu aktivierten Szenarien korrekt referenziert?
- Job-Struktur: Stimmt die build → test → summary Kette?
- MQTT-Injection: Wird `mqtt_inject.py` korrekt aufgerufen?
- Timeouts: Sind die Timeouts für neue Szenarien angemessen?
- Parallelität: Wie viele Jobs laufen parallel? Limit?

### 4.4 Cross-Workflow-Konsistenz

Prüfe über ALLE Workflows hinweg:

- Werden gleiche Actions in gleicher Version verwendet? (actions/checkout, actions/setup-python, etc.)
- Sind Mosquitto-Configs konsistent? (Vergleiche Service-Definitionen)
- Ist die Node-Version überall gleich?
- Ist die Python-Version überall gleich?
- Ist die PlatformIO-Version überall gleich?

### 4.5 docker-compose.ci.yml Prüfung (Phase 1)

```bash
cat docker-compose.ci.yml 2>/dev/null || cat docker-compose.test.yml 2>/dev/null
```

- Existiert die Datei?
- Wird sie in einem CI-Workflow referenziert?
- Stimmen die Services mit den CI-Workflow-Services überein?
- Sind Healthchecks definiert?

---

## TEIL 5: Dokumentations-Konsistenz

### 5.1 Cross-Reference-Prüfung

Lies JEDE der folgenden Dateien KOMPLETT und prüfe auf Konsistenz:

```
.claude/reference/testing/TEST_WORKFLOW.md
.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md
.claude/reference/debugging/LOG_LOCATIONS.md
.claude/reference/debugging/CI_PIPELINE.md
.claude/rules/docker-rules.md
.claude/rules/frontend-rules.md
.claude/skills/system-control/SKILL.md
.claude/skills/esp32-debug/SKILL.md
.claude/skills/esp32-development/SKILL.md
.claude/skills/frontend-development/SKILL.md
.claude/skills/server-debug/SKILL.md
.claude/agents/frontend/
.claude/agents/esp32-debug.md
.claude/agents/system-control.md
```

Für JEDE Datei:

| Prüfpunkt | Was du suchst |
|-----------|---------------|
| Pfade | Stimmen referenzierte Pfade? (`logs/wokwi/`, `logs/server/`, Makefile-Targets) |
| Container-Namen | Konsistent? (automationone-server überall gleich?) |
| Ports | Stimmen die Ports? (8000, 5173, 1883, 9001, 5432) |
| Makefile-Targets | Werden nur existierende Targets referenziert? |
| CI-Workflows | Stimmen die Workflow-Namen und -Beschreibungen? |
| Wokwi-Referenzen | Sind die neuen Wokwi-Integrationen dokumentiert? |
| Frontend-Test-Referenzen | Sind Frontend-Tests in TEST_WORKFLOW.md erwähnt? |
| Log-Pfade | Stimmt `LOG_LOCATIONS.md` mit den realen Pfaden überein? |

### 5.2 Inkonsistenzen-Katalog

Erstelle eine Tabelle ALLER Inkonsistenzen:

| Datei A | Sagt | Datei B | Sagt | Korrekt ist | Fix nötig in |
|---------|------|---------|------|-------------|--------------|

---

## TEIL 6: Vernetzungs-Matrix

Die zentrale Frage: Ist ALLES mit ALLEM korrekt verbunden?

### 6.1 Wer kennt wen?

Erstelle eine Vernetzungs-Matrix:

```
                    │ Makefile │ CI │ Docs │ Agents │ session.sh │ Logs │
────────────────────┼──────────┼────┼──────┼────────┼────────────┼──────┤
Backend-Tests       │    ?     │  ? │  ?   │   ?    │     ?      │  ?   │
Frontend-Tests      │    ?     │  ? │  ?   │   ?    │     ?      │  ?   │
Wokwi-Tests         │    ?     │  ? │  ?   │   ?    │     ?      │  ?   │
Docker Core-Stack   │    ?     │  ? │  ?   │   ?    │     ?      │  ?   │
Docker Profiles     │    ?     │  ? │  ?   │   ?    │     ?      │  ?   │
Log-Persistenz      │    ?     │  ? │  ?   │   ?    │     ?      │  ?   │
Health-Endpoints    │    ?     │  ? │  ?   │   ?    │     ?      │  ?   │
```

Fülle jede Zelle mit:
- ✅ Korrekt verbunden und verifiziert
- ⚠️ Teilweise (existiert aber inkonsistent/unvollständig)
- ❌ Nicht verbunden (fehlt)
- ➖ Nicht relevant

### 6.2 End-to-End Flows

Prüfe diese konkreten Flows:

**Flow A: "Entwickler macht Backend-Änderung"**
1. Code-Änderung in `El Servador/`
2. `make test-backend` lokal → funktioniert?
3. `git push` → CI `server-tests.yml` triggered? Korrekte Paths?
4. CI-Tests laufen mit Mosquitto? Ergebnis?

**Flow B: "Entwickler macht Frontend-Änderung"**
1. Code-Änderung in `El Frontend/`
2. `make test-frontend` lokal → funktioniert?
3. `git push` → CI `frontend-tests.yml` triggered? Korrekte Paths?
4. CI-Tests laufen? Ergebnis?

**Flow C: "Entwickler ändert Firmware"**
1. Code-Änderung in `El Trabajante/`
2. `make test-wokwi` lokal → funktioniert? (oder Hinweis warum nicht)
3. `git push` → CI `wokwi-tests.yml` triggered? Korrekte Paths?
4. Firmware baut? Szenarien laufen? Summary-Report?

**Flow D: "TM startet Debug-Session"**
1. `make status` → Zeigt Stack-Status?
2. session.sh → Erstellt STATUS.md mit Docker-Info?
3. system-control → Kann Logs lesen? Wokwi-Ergebnisse?
4. esp32-debug → Kennt `logs/wokwi/`? Kann Wokwi-Logs auswerten?
5. `/collect-reports` → Konsolidiert alles?

**Flow E: "Alles stoppen und sauber aufräumen"**
1. `docker compose down` → Alle Container weg?
2. Logs bleiben erhalten?
3. `docker compose down -v` → Volumes weg?
4. Kein Zustand der den nächsten Start beeinflusst?

---

## OUTPUT

Schreibe nach `.claude/reports/current/VERIFICATION_PHASE1_3.md`:

```markdown
# Verifikation: Phase 1-3 Gesamtprüfung

**Datum:** [Timestamp]
**Agent:** Verifikations-Agent
**Scope:** Docker-Stack, Makefile, Tests (Backend/Frontend/Wokwi), CI-Workflows, Docs, Vernetzung

---

## Zusammenfassung

| Bereich | Status | Kritische Issues |
|---------|--------|-----------------|
| Docker Core-Stack | ✅/⚠️/❌ | ... |
| Docker Profiles | ✅/⚠️/❌ | ... |
| Log-Persistenz | ✅/⚠️/❌ | ... |
| Makefile-Targets | ✅/⚠️/❌ | ... |
| Backend-Tests | ✅/⚠️/❌ | ... |
| Frontend-Tests | ✅/⚠️/❌ | ... |
| Wokwi-Tests | ✅/⚠️/❌ | ... |
| CI: server-tests | ✅/⚠️/❌ | ... |
| CI: frontend-tests | ✅/⚠️/❌ | ... |
| CI: wokwi-tests | ✅/⚠️/❌ | ... |
| CI: pr-checks | ✅/⚠️/❌ | ... |
| Dokumentation | ✅/⚠️/❌ | ... |
| Vernetzung | ✅/⚠️/❌ | ... |

## 1. Docker-Stack
[1.1 Core-Start, 1.2 Profiles, 1.3 Logs, 1.4 Stoppen – Ergebnisse]

## 2. Makefile-Targets
[Vollständige Target-Tabelle mit Test-Ergebnissen]
[Cross-Reference mit SYSTEM_OPERATIONS_REFERENCE.md]

## 3. Test-Suites
[3.1 Backend, 3.2 Frontend, 3.3 Wokwi – Ergebnisse + Failures]

## 4. CI-Workflows
[4.1-4.5 Pro-Workflow Prüfung + Cross-Konsistenz]

## 5. Dokumentation
[Inkonsistenzen-Katalog]

## 6. Vernetzungs-Matrix
[Ausgefüllte Matrix + End-to-End Flow-Ergebnisse]

## 7. Kritische Issues (nach Priorität)
[MUSS-FIX: Was JETZT repariert werden muss]
[SOLL-FIX: Was bald repariert werden sollte]
[KANN-FIX: Kosmetik, Optimierungen]

## 8. Empfehlungen an den TM
[Konkrete nächste Schritte]
```

---

## Regeln

- Du ÄNDERST keine Dateien – nur lesen und Bash für Tests
- Wenn ein Befehl fehlschlägt: Dokumentiere den EXAKTEN Fehler (vollständige Ausgabe)
- Wenn etwas nicht existiert: Dokumentiere es als ❌ mit Pfad und Erwartung
- Teste REAL – keine Annahmen. `make test-frontend` entweder läuft oder nicht
- Lies Dateien KOMPLETT, nicht die ersten 20 Zeilen
- Der Report muss eigenständig verständlich sein – der TM hat keinen Projektzugriff
- Sei schonungslos ehrlich: Wenn etwas kaputt ist, sag es. Keine Schönfärberei
- Priorität bei Issues: Security > Funktionalität > Konsistenz > Kosmetik