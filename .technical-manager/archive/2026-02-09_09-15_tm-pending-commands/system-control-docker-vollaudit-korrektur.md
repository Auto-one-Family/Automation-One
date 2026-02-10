# Auftrag 6: DOCKER_VOLLAUDIT.md Phantom-Service-Korrektur

**Datum:** 2026-02-09
**Agent:** @system-control
**Priorität:** KRITISCH
**Geschätzter Aufwand:** 30-45 Minuten
**Typ:** Dokumentations-Korrektur (Infrastruktur-Audit)

---

## WORUM GEHT ES

Die Dokumentation `DOCKER_VOLLAUDIT.md` beschreibt das Docker-Setup als **vollständiges Infrastruktur-Audit**. Das Problem: Sie beschreibt pgAdmin als **existierenden Service** mit detaillierter Konfiguration (Container-Name, Image-Version, Port, Healthcheck, Resource-Limits, Security-Analyse).

**Die Realität:** pgAdmin existiert NICHT in docker-compose.yml. Kein Service, kein Profile, nicht deploybar.

**Die Fehler:**

| VOLLAUDIT-Behauptung | Realität | Impact |
|---------------------|----------|--------|
| "9 Services im Stack" | 8 Services | Service-Zählung falsch |
| pgAdmin-Service-Details | Service existiert nicht | Phantom-Beschreibung |
| "Images gepinnt: 9/9 (100%)" | 8/8 ohne pgAdmin | Score falsch |
| "Healthchecks: 8/9 (89%)" | 7/8 ohne pgAdmin | Score falsch |
| Profile `devtools` | Profil existiert nirgends | Kategorie falsch |
| pgAdmin depends_on postgres | Keine Dependency | Falsche Architektur-Info |

**Warum ist das kritisch:**
- VOLLAUDIT ist **offizielle Infrastruktur-Wahrheit**
- Scores und Metriken sind falsch
- Führt zu falschen Architektur-Entscheidungen
- User erwarten 9 Services, finden nur 8
- Follow-up-Dokumentation könnte diese Fehler übernehmen

**Zusätzlich:** Dokument ist sehr lang (~1000+ Zeilen). pgAdmin wird an **mehreren Stellen** erwähnt (Service-Tabelle, Image-Pins, Healthchecks, Security, Netzwerk, Volumes).

---

## WAS MUSS ANALYSIERT WERDEN

### Phase A: Vollständige IST-Analyse (15 Min)

**1. Docker-Compose IST-Zustand verifizieren**

**Dateien prüfen:**
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `docker-compose.test.yml`
- `docker-compose.ci.yml`
- `docker-compose.e2e.yml`

**Dokumentieren:**
- Wie viele Services TATSÄCHLICH in docker-compose.yml? (Erwartet: 8)
- Ist pgAdmin irgendwo definiert? (Erwartet: NEIN)
- Welche Profile existieren? (Erwartet: `monitoring`, NICHT `devtools`)

**Service-Inventar erstellen:**

```bash
# Services zählen
docker compose config --services | wc -l
# Erwartung: 8

# Services auflisten
docker compose config --services | sort
# Erwartung:
# el-frontend
# el-servador
# grafana
# loki
# mqtt-broker
# postgres
# prometheus
# promtail
```

**Profile-Check:**
```bash
# Alle Profile extrahieren
grep -h "profiles:" docker-compose*.yml | sort -u
# Erwartung: profiles: ["monitoring"]
# NICHT: profiles: ["devtools"]
```

**2. DOCKER_VOLLAUDIT.md pgAdmin-Erwähnungen finden**

Datei: `.claude/reports/current/DOCKER_VOLLAUDIT.md`

**Alle pgAdmin-Erwähnungen dokumentieren:**

```bash
# Zeilen mit pgAdmin
grep -n "pgadmin\|pgAdmin\|devtools" .claude/reports/current/DOCKER_VOLLAUDIT.md

# Erwartete Sections:
# - Service-Tabelle (Z.~29)
# - Profile-Kategorien (Z.~50-60)
# - Image-Pins (Z.~765)
# - Healthchecks (Z.~768)
# - Resource-Limits (Z.~742)
# - Security-Analyse (Z.~570)
# - Netzwerk-Tabelle (Z.~639)
# - Volume-Definitionen
# - depends_on Graph (Z.~338)
```

**Für jede Erwähnung dokumentieren:**
- Zeilen-Nummer(n)
- Kontext (welche Sektion)
- Behauptung (was steht dort)
- Korrektur nötig (was muss geändert werden)

**3. Score-Metriken analysieren**

**Falsche Metriken identifizieren:**

| Metrik | VOLLAUDIT-Wert | Korrekter Wert | Berechnung |
|--------|---------------|----------------|------------|
| Gesamt-Services | 9 | 8 | docker-compose.yml count |
| Image-Pins | 9/9 (100%) | 8/8 (100%) | Alle Images gepinnt, aber 8 nicht 9 |
| Healthchecks | 8/9 (89%) | 7/8 (87.5%) | Nur el-frontend fehlt Healthcheck |
| Resource-Limits | X/9 | X/8 | pgAdmin hat keine Limits weil nicht existent |

**Dokumentieren:**
- Welche Scores sind falsch?
- Wie sollten sie korrekt sein?
- Sind andere Metriken betroffen? (Prüfen: Volumes, Networks, Security-Scores)

**4. Existierende pgAdmin-Artefakte**

**Was existiert WIRKLICH:**

```bash
# pgAdmin-Verzeichnis
ls -la docker/pgadmin/
# Erwartung: servers.json (Pre-Provisioning, ungenutzt)

# .env.example
grep PGADMIN .env.example
# Erwartung: PGADMIN_EMAIL, PGADMIN_PASSWORD (verwaist)
```

**Dokumentieren:**
- `docker/pgadmin/servers.json` existiert: JA (Pre-Provisioning vorbereitet)
- `.env.example` Variablen existieren: JA (PGADMIN_EMAIL, PGADMIN_PASSWORD)
- Diese sind Vorbereitungen für zukünftige Implementation
- Sollten in VOLLAUDIT erwähnt werden als "Geplant/Vorbereitet", NICHT als "Deployed"

**5. Cross-References prüfen**

**Andere Dokumente die VOLLAUDIT referenzieren könnten:**

```bash
# Suche nach "9 Services" oder "VOLLAUDIT"
grep -r "9.*Services\|VOLLAUDIT" .claude/reference/ .claude/reports/
```

**Falls Treffer:** Dokumentieren welche Dokumente betroffen sein könnten.

---

## WIE SOLL GEARBEITET WERDEN

### Phase B: Korrektur-Plan erstellen (10 Min)

**Strategie:**
1. **Service-Zählung korrigieren:** 9 → 8 überall
2. **pgAdmin-Service entfernen:** Alle Erwähnungen als deployed Service
3. **Scores neu berechnen:** Image-Pins, Healthchecks, Limits
4. **Optional:** pgAdmin als "Geplant" kennzeichnen (mit Verweis auf Artefakte)

**Korrektur-Matrix (Beispiel):**

| Section | Zeile | Aktuell | Korrektur |
|---------|-------|---------|-----------|
| Executive Summary | ~10 | "9 Services deployed" | "8 Services deployed" |
| Service-Tabelle | ~29 | pgAdmin-Zeile vorhanden | pgAdmin-Zeile **ENTFERNEN** |
| Profile-Kategorien | ~50 | "devtools: pgAdmin" | **ENTFERNEN** (Profil existiert nicht) |
| Image-Pins | ~765 | "9/9 (100%)" mit pgadmin:8.14 | "8/8 (100%)" ohne pgAdmin |
| Healthchecks | ~768 | "8/9 (89%)" | "7/8 (87.5%)" |
| depends_on | ~338 | pgAdmin → postgres | **ENTFERNEN** |
| Netzwerk | ~639 | Port 5050 | **ENTFERNEN** |
| Security | ~570 | pgAdmin User-Analyse | **ENTFERNEN** |
| Volumes | | pgAdmin Volume | **ENTFERNEN** |

**Optional-Section hinzufügen: "Geplante Services"**

Am Ende des Dokuments:
```markdown
## Geplante Services (nicht deployed)

### pgAdmin (DevTools)
**Status:** Vorbereitet, nicht implementiert
**Artefakte:**
- Pre-Provisioning: `docker/pgadmin/servers.json`
- Environment-Variablen: `.env.example` (PGADMIN_EMAIL, PGADMIN_PASSWORD)
**Fehlende Components:**
- Docker Service-Definition
- Profile `devtools`
- Makefile-Targets
**Implementation-Aufwand:** ~30-60 Min
```

### Phase C: Implementierung (15-20 Min)

**1. Service-Tabelle bereinigen**

**VORHER (Beispiel, Zeile ~29):**
```markdown
| # | Service | Container | Image | Port | Profile |
|---|---------|-----------|-------|------|---------|
| 1 | postgres | automationone-postgres | postgres:17.2 | 5432 | core |
| 2 | mqtt-broker | automationone-mqtt | eclipse-mosquitto:2.0.20 | 1883, 9001 | core |
| 3 | el-servador | automationone-server | god_kaiser_server:latest | 8000 | core |
| 4 | el-frontend | automationone-frontend | god_kaiser_frontend:latest | 5173 | core |
| 5 | loki | automationone-loki | grafana/loki:3.4 | 3100 | monitoring |
| 6 | promtail | automationone-promtail | grafana/promtail:3.4 | - | monitoring |
| 7 | prometheus | automationone-prometheus | prom/prometheus:v3.2.1 | 9090 | monitoring |
| 8 | grafana | automationone-grafana | grafana/grafana:11.5.2 | 3000 | monitoring |
| 9 | pgadmin | automationone-pgadmin | dpage/pgadmin4:8.14 | 5050 | devtools |
```

**NACHHER:**
```markdown
| # | Service | Container | Image | Port | Profile |
|---|---------|-----------|-------|------|---------|
| 1 | postgres | automationone-postgres | postgres:17.2 | 5432 | core |
| 2 | mqtt-broker | automationone-mqtt | eclipse-mosquitto:2.0.20 | 1883, 9001 | core |
| 3 | el-servador | automationone-server | god_kaiser_server:latest | 8000 | core |
| 4 | el-frontend | automationone-frontend | god_kaiser_frontend:latest | 5173 | core |
| 5 | loki | automationone-loki | grafana/loki:3.4 | 3100 | monitoring |
| 6 | promtail | automationone-promtail | grafana/promtail:3.4 | - | monitoring |
| 7 | prometheus | automationone-prometheus | prom/prometheus:v3.2.1 | 9090 | monitoring |
| 8 | grafana | automationone-grafana | grafana/grafana:11.5.2 | 3000 | monitoring |

**Gesamt: 8 Services**
```

**2. Profile-Kategorien korrigieren**

**VORHER:**
```markdown
## Profile-Kategorien
- **core** (4 Services): postgres, mqtt-broker, el-servador, el-frontend
- **monitoring** (4 Services): loki, promtail, prometheus, grafana
- **devtools** (1 Service): pgadmin
```

**NACHHER:**
```markdown
## Profile-Kategorien
- **core** (4 Services): postgres, mqtt-broker, el-servador, el-frontend
- **monitoring** (4 Services): loki, promtail, prometheus, grafana

**Hinweis:** Ein `devtools`-Profile existiert nicht in der aktuellen Konfiguration.
```

**3. Scores neu berechnen und korrigieren**

**Image-Pins (Beispiel Zeile ~765):**

**VORHER:**
```markdown
### Image-Versions-Status
**Gepinnt:** 9/9 (100%) ✅
- postgres:17.2
- eclipse-mosquitto:2.0.20
- god_kaiser_server:latest (Local Build)
- god_kaiser_frontend:latest (Local Build)
- grafana/loki:3.4
- grafana/promtail:3.4
- prom/prometheus:v3.2.1
- grafana/grafana:11.5.2
- dpage/pgadmin4:8.14
```

**NACHHER:**
```markdown
### Image-Versions-Status
**Gepinnt:** 8/8 (100%) ✅
- postgres:17.2
- eclipse-mosquitto:2.0.20
- god_kaiser_server:latest (Local Build)
- god_kaiser_frontend:latest (Local Build)
- grafana/loki:3.4
- grafana/promtail:3.4
- prom/prometheus:v3.2.1
- grafana/grafana:11.5.2
```

**Healthchecks (Beispiel Zeile ~768):**

**VORHER:**
```markdown
### Healthcheck-Status
**Implementiert:** 8/9 (89%) ⚠️
**Fehlend:** el-frontend, pgadmin
```

**NACHHER:**
```markdown
### Healthcheck-Status
**Implementiert:** 7/8 (87.5%) ⚠️
**Fehlend:** el-frontend

**Hinweis:** Frontend-Healthcheck kann nachgerüstet werden (Vite Dev-Server hat /health Endpoint).
```

**4. depends_on Graph bereinigen**

**Falls pgAdmin im Dependency-Graph erwähnt:**

**VORHER:**
```markdown
## Service-Dependencies
```
postgres ← el-servador
postgres ← pgadmin (service_healthy)
loki ← promtail (service_healthy)
...
```
```

**NACHHER:**
```markdown
## Service-Dependencies
```
postgres ← el-servador
loki ← promtail (service_healthy)
...
```
```

**5. Alle anderen Erwähnungen entfernen**

**Systematisch durchgehen:**
- Security-Analyse: pgAdmin-User-Analyse entfernen
- Netzwerk-Tabelle: Port 5050 entfernen
- Volume-Liste: pgadmin-data Volume entfernen
- Resource-Limits: pgAdmin 256M/128M entfernen

**6. Optional: "Geplante Services" Section**

Am Ende des Dokuments hinzufügen (siehe Phase B Beispiel).

---

## WO IM SYSTEM

### Dateipfade

| Datei | Zweck | Änderung |
|-------|-------|----------|
| `.claude/reports/current/DOCKER_VOLLAUDIT.md` | Vollständiges Infrastruktur-Audit | **MASSIV ÄNDERN** (pgAdmin entfernen, Scores korrigieren) |

### Dokumentations-Hierarchie

**DOCKER_VOLLAUDIT.md Position im System:**

```
.claude/reports/current/
├── DOCKER_VOLLAUDIT.md      ← Vollständiges Audit (ÄNDERN)
├── TM_REPORT.md              ← TM Monitoring-Stack-Analyse
└── ...

.claude/reference/infrastructure/
├── DOCKER_REFERENCE.md       ← Operator-Referenz (korrekt, bereits bereinigt)
├── DOCKER_AKTUELL.md         ← Project Overview (korrekt)
└── ...
```

**Wichtig:** DOCKER_REFERENCE.md ist bereits korrekt (v1.2 hat Ghost-Targets entfernt). VOLLAUDIT ist veraltet.

---

## ERFOLGSKRITERIUM

### Technische Verifikation

**1. Markdown-Syntax**
```bash
# Markdown validieren
markdownlint .claude/reports/current/DOCKER_VOLLAUDIT.md
```

**2. Service-Zählung konsistent**

**Alle "9" durch "8" ersetzt:**
```bash
# Suche nach "9 Services" oder "9/9"
grep -n "9.*Service\|9/9\|9/8" .claude/reports/current/DOCKER_VOLLAUDIT.md
# Sollte keine Treffer mehr haben (außer in "8/9" alt → "7/8" neu)
```

**3. Keine pgAdmin-Erwähnungen als deployed Service**
```bash
# Suche nach pgAdmin
grep -n "pgadmin\|pgAdmin" .claude/reports/current/DOCKER_VOLLAUDIT.md
# Sollte nur Treffer in "Geplante Services" Section haben (falls hinzugefügt)
# ODER: Keine Treffer
```

**4. devtools-Profile nicht mehr als existent beschrieben**
```bash
grep -n "devtools" .claude/reports/current/DOCKER_VOLLAUDIT.md
# Sollte nur in "Hinweis: devtools existiert nicht" vorkommen
```

**5. Scores mathematisch korrekt**

**Nachrechnen:**
- Gesamt-Services: 8 (manuell zählen in docker-compose.yml)
- Image-Pins: 8/8 = 100% (alle gepinnt)
- Healthchecks: 7 von 8 haben HC = 87.5% (postgres, mqtt, server, loki, promtail, prometheus, grafana)
- el-frontend fehlt Healthcheck

**6. Live-Verifikation gegen Docker**

**Real-Count prüfen:**
```bash
# Services im System
docker compose ps --all --format "table {{.Service}}" | tail -n +2 | wc -l
# Erwartung: Zahl ≤ 8 (je nach laufenden Services)

docker compose config --services | wc -l
# Erwartung: Exakt 8
```

---

## STRUKTUR & PATTERN

### DOCKER_VOLLAUDIT.md Struktur

**Standard-Sections (sollten alle vorhanden sein):**

1. **Executive Summary** (Service-Count, Profile, Deployment-Status)
2. **Service-Tabelle** (alle Services mit Details)
3. **Profile-Kategorien** (core, monitoring, evtl. andere)
4. **Image-Versioning** (gepinnte Versionen, Score)
5. **Healthchecks** (implementiert, fehlend, Score)
6. **Resource-Limits** (Memory, CPU, implementiert vs. nicht)
7. **Security-Analyse** (User, Permissions, Secrets)
8. **Netzwerk** (Ports, Bridges, Exposure)
9. **Volumes** (Persistenz, Named vs. Bind-Mounts)
10. **Service-Dependencies** (depends_on Graph)
11. **CI/CD** (GitHub Actions, Testing)
12. **Monitoring** (Logging, Metrics, Alerting)

**Jede Section prüfen ob pgAdmin erwähnt wird!**

### Score-Berechnung-Pattern

**Alle Scores im VOLLAUDIT folgen Pattern:**

```markdown
**Metrik-Name:** X/Y (Z%) [Status-Icon]
[Liste der Implementierten]
**Fehlend:** [Liste]
```

**Beispiel korrigiert:**
```markdown
**Healthchecks:** 7/8 (87.5%) ⚠️
- postgres (pg_isready)
- mqtt-broker (mosquitto_sub)
- el-servador (/health/live)
- loki (/ready)
- promtail (TCP:9080)
- prometheus (/-/healthy)
- grafana (/api/health)
**Fehlend:** el-frontend (Vite Dev-Server, kann nachgerüstet werden)
```

### Geplante-Services-Section-Pattern

**Falls hinzugefügt, Format:**

```markdown
## Geplante Services (nicht deployed)

### <Service-Name> (<Kategorie>)
**Status:** <Geplant/Vorbereitet/In Entwicklung>
**Zweck:** <1-2 Sätze>
**Vorhandene Artefakte:**
- <Liste>
**Fehlende Components:**
- <Liste>
**Implementation-Aufwand:** <Schätzung>
**Roadmap:** <Phase X oder "TBD">
```

---

## REPORT ZURÜCK AN TM

**Datei:** `.technical-manager/inbox/agent-reports/system-control-docker-vollaudit-korrektur-2026-02-09.md`

**Struktur:**

```markdown
# DOCKER_VOLLAUDIT.md Phantom-Service-Korrektur

## Analyse-Findings
- Services in docker-compose.yml: [8, nicht 9]
- pgAdmin-Service existiert: [NEIN]
- pgAdmin-Erwähnungen in VOLLAUDIT: [Liste Zeilen + Sections]
- Falsche Metriken: [9→8 Services, Image-Pins, Healthchecks]
- Profile devtools: [existiert nicht]
- Vorhandene Artefakte: [servers.json, .env.example Vars]

## Korrektur-Plan
- Service-Tabelle: [pgAdmin-Zeile entfernt]
- Service-Count: [9→8 überall]
- Profile-Kategorien: [devtools entfernt/Hinweis]
- Scores neu berechnet: [Image-Pins 8/8, Healthchecks 7/8]
- Alle pgAdmin-Erwähnungen: [Liste entfernter Sections]
- Optional Geplante-Services: [Hinzugefügt/Nicht hinzugefügt]

## Implementierung
- Geänderte Sections: [Liste mit Zeilen-Nummern]
- Entfernte Zeilen: [Anzahl]
- Neue Hinweise: [devtools-Profile, Geplante-Services]
- Scores: [Alt → Neu Tabelle]

## Verifikation
- Markdown-Validierung: [OK]
- Service-Count konsistent: [grep "9" → keine Treffer]
- pgAdmin nur in Geplant-Section: [Bestätigt]
- Scores mathematisch korrekt: [Nachgerechnet]
- Live-Docker-Count: [8 Services bestätigt]

## Cross-Impact
- DOCKER_REFERENCE.md: [Bereits korrekt (v1.2)]
- DOCKER_AKTUELL.md: [Korrekt (erwähnt nur Verzeichnis)]
- Andere Dokumente: [Geprüft, keine weiteren Inkonsistenzen]
```

---

## KRITISCHE HINWEISE

### Umfang der Änderungen

**DOCKER_VOLLAUDIT.md ist groß (~1000+ Zeilen).**

**Systematisch vorgehen:**
1. Executive Summary korrigieren
2. Service-Tabelle bereinigen
3. Jede Section durchgehen (Score-Sections, Security, Netzwerk, etc.)
4. Suche nach "pgadmin" (case-insensitive)
5. Suche nach "devtools"
6. Suche nach "9 Service" oder "9/9"

**Checkliste während der Arbeit:**
- [ ] Executive Summary (Service-Count)
- [ ] Service-Tabelle (pgAdmin-Zeile)
- [ ] Profile-Kategorien (devtools)
- [ ] Image-Pins (Score + Liste)
- [ ] Healthchecks (Score)
- [ ] Resource-Limits (pgAdmin entfernt)
- [ ] Security (pgAdmin-User entfernt)
- [ ] Netzwerk (Port 5050 entfernt)
- [ ] Volumes (pgadmin-data entfernt)
- [ ] depends_on (pgAdmin → postgres entfernt)
- [ ] Alle "9" Referenzen → "8"

### Warum VOLLAUDIT falsch wurde

**Mögliche Ursachen:**
1. **Geplanter Zustand statt IST-Zustand:** VOLLAUDIT beschreibt wie Stack sein sollte, nicht wie er ist
2. **Veralteter Stand:** pgAdmin war mal implementiert, wurde entfernt, VOLLAUDIT nicht aktualisiert
3. **Copy-Paste aus Template:** Audit aus anderem Projekt kopiert

**Lehre für Zukunft:**
- Audits müssen gegen Live-System verifiziert werden
- `docker compose config --services` als Source-of-Truth
- Dokumentation sollte versioniert sein (Datum, Hash)

### Scores vs. Realität

**Wichtig:** Nach Korrektur könnten Scores SCHLECHTER aussehen:
- 9/9 (100%) → 8/8 (100%) ← Gleich gut, aber niedriger absolute Zahl
- 8/9 (89%) → 7/8 (87.5%) ← Minimal schlechter Prozentsatz

**Das ist OK!** Korrektheit > schöne Zahlen.

### Geplante-Services-Section: Pro/Contra

**PRO:**
- Dokumentiert Vorbereitungen (servers.json, .env Vars)
- Zeigt Roadmap-Intent
- Verhindert Frage "Warum existieren diese Dateien?"

**CONTRA:**
- Könnte verwirren ("Geplant aber nicht implementiert seit wann?")
- Erhöht Wartungsaufwand (muss aktualisiert werden wenn implementiert)

**TM-Empfehlung:** Hinzufügen, kurz halten, mit "nicht deployed" deutlich markieren.

---

## ZUSAMMENFASSUNG

**Was wird gemacht:**
- DOCKER_VOLLAUDIT.md vollständig von pgAdmin-Phantom bereinigen
- Service-Count 9 → 8 überall korrigieren
- Alle Scores neu berechnen (Image-Pins, Healthchecks, etc.)
- Profile `devtools` als nicht-existent kennzeichnen
- Optional: "Geplante Services" Section hinzufügen

**Warum:**
- VOLLAUDIT ist offizielle Infrastruktur-Wahrheit
- Falsche Service-Zählung führt zu falschen Annahmen
- pgAdmin-Details beschreiben nicht-existenten Service
- Scores sind mathematisch falsch

**Wie:**
- Systematisch alle Sections durchgehen
- pgAdmin komplett entfernen (außer optional in Geplant-Section)
- Scores nachrechnen und korrigieren
- Markdown validieren, Live-Docker-Count abgleichen

**Erwartung:**
- DOCKER_VOLLAUDIT beschreibt exakt die 8 existierenden Services
- Alle Scores korrekt
- Keine Phantom-Services
- Optional: Transparenz über geplante Features
