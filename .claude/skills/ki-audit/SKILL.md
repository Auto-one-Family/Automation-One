---
name: ki-audit
description: |
  Tiefgehende Prüfung von Bereichen auf typische KI-generierte Fehler (halluzinierte APIs,
  veraltete Syntax, Logik-Lücken, falsche Mappings, Namenskonventionen). System funktioniert
  meist – Fokus auf Fehler die User/Entwickler behindern.
  MUST BE USED when: KI-Fehler suchen, Audit anfordern, Bereich auf Qualitätsfehler prüfen,
  Grafana/Docker/Python/ESP/Frontend nach typischen KI-Irrtümern durchgehen.
  NOT FOR: Runtime-Debugging (server-debug, esp32-debug), Log-Analyse, reine Code-Reviews.
  Keywords: ki-audit, KI-Fehler, Audit, Qualitätsprüfung, halluzinierte API, falsches Mapping
allowed-tools: Read, Grep, Glob, Edit
user-invocable: true
---

# KI-Audit Skill

> **Zweck:** Betroffene Stellen oder ganze Bereiche vollständig auf typische KI-Fehler untersuchen. Kontext leitet sich aus dem **vom User im Chat bereitgestellten Umfang** ab (Bereich, Dateien, Komponenten). Standard: Analyse + Report; **Fix nur auf ausdrückliche User-Anfrage**.

---

## 1. Kontexterkennung (Auftrag aus dem Chat)

Der Umfang der Prüfung ergibt sich aus dem **User-Kontext**:

| User gibt an… | Prüfumfang |
|---------------|------------|
| Einzelne Datei/Dateipfad | Nur diese Datei(en), plus Abhängigkeiten wenn Integration geprüft wird |
| Bereich (z. B. "Grafana", "Docker", "Frontend ESP-Cards") | Alle relevanten Dateien des Bereichs; Referenzen für APIs/Config nutzen |
| "Alles zu X" / "gesamtes Modul Y" | Vollständiger Bereich: Code, Config, Referenz-Docs, Namenskonventionen |
| Kein konkreter Bereich | Nachfragen: Welcher Stack/Bereich? Oder Standard: alle in Referenzen genannten Bereiche durchgehen |

**Regel:** Erst den Kontext verstehen, dann die passenden Fehler-Kategorien (Abschnitt 2) anwenden. Für Abgleich mit Projekt-Fakten immer **Referenzen** nutzen (Abschnitt 7).

---

## 2. KI-Fehler-Katalog (vollständig prüfen)

### 2.1 Strukturelle Fehler (jede Sprache/jedes Format)

| ID | Typ | Prüfung |
|----|-----|---------|
| 1.1 | **Halluzinierte APIs/Properties** | Funktionen, Parameter, Config-Optionen gegen echte Version prüfen. Bei dir: Grafana-Panel-Options (Version?), PromQL-Funktionen, Docker-Compose-Keys (v2), Python-Imports (FastAPI-Version), ESP32/Arduino-Funktionen (Board-Package). |
| 1.2 | **Veraltete Syntax** | Gemischte Versionen? Bei dir: Grafana Datasource String vs Objekt (pre-v9), `version:` in Compose (deprecated), Mosquitto-Config, python-prometheus-client, ESP32 Arduino Core v2 vs v3. |
| 1.3 | **Falsche Verschachtelung (Nesting)** | Properties auf richtiger Ebene? Bei dir: Grafana `fieldConfig.defaults.custom` vs `fieldConfig.defaults` vs `options`; Compose `healthcheck.test` vs `healthcheck.command`; Alert Rules `data[].model.conditions`; Alloy/Promtail Pipeline Stage-Reihenfolge und Nesting. |
| 1.4 | **Copy-Paste-Propagation** | Duplizierte IDs/Labels/Refs? Bei dir: Panel-IDs im Dashboard-JSON, gleiche `refId` in Targets, identische Container-Names, doppelte Port-Bindings. |

### 2.2 Logik- und Semantikfehler

| ID | Typ | Prüfung |
|----|-----|---------|
| 2.1 | **Plausibel aber falsch** | Syntaktisch ok, läuft – aber semantisch falsch. Bei dir: PromQL mit Mock-Daten feuernd, Division ohne `clamp_min` → NaN bei 0 Geräten, Loki-Query mit nicht existierendem Label (still 0). |
| 2.2 | **Off-by-One / Grenzwerte** | Edge Cases: 0, null, leeres Array, erstes/letztes Element. Bei dir: ESP total=0 → Division by Zero; "No Data" vs sinnvolle Defaults; leere Loki-Streams. |
| 2.3 | **Threshold-Logik invertiert** | Richtung pro Metrik klar? ESP online 0=rot; Connections 0 = rot oder grün? Deadlocks 0=grün, >0=rot; CPU >80%=rot. |
| 2.4 | **Counter vs Gauge** | Counter → `rate()`/`increase()`; Gauge direkt. Bei dir: `broker_messages_received` ohne rate(); `pg_stat_*_deadlocks` Counter; `god_kaiser_uptime_seconds` Gauge. |

### 2.3 Format- und Encoding-Fehler

| ID | Typ | Prüfung |
|----|-----|---------|
| 3.1 | **YAML-Indentation** | Einrückung konsistent und semantisch korrekt. Alloy/Promtail Stages, Alert Rules `data:`, Compose `depends_on` auf richtiger Ebene. |
| 3.2 | **JSON** | Keine Trailing Commas, keine Smart-Quotes; UTF-8 bei Umlauten. Dashboard-JSON: Grafana lädt oft ohne hilfreichen Fehler. |
| 3.3 | **Escape in verschachtelten Kontexten** | Regex in YAML/JSON, LogQL/PromQL in YAML/JSON: Anführungszeichen und Sonderzeichen korrekt. |

### 2.4 Integration und Kontext

| ID | Typ | Prüfung |
|----|-----|---------|
| 4.1 | **Isolation statt Integration** | Eine Datei geändert – Abhängigkeiten in anderen Dateien? DB-Name `god_kaiser_db` vs `automationone`; Alert Rule geändert, Grafana neugestartet? Mosquitto stdout vs Bind-Mount; ESP-Code vs Server-Handler. |
| 4.2 | **Annahmen statt Fakten** | Nur prüfen was existiert/funktioniert – Referenzen und Config lesen, nicht raten. |
| 4.3 | **Naming-Inkonsistenz** | Projekt-Namen verwenden: "El Servador", "El Trabajante", "god_kaiser_", "god_kaiser_db" – nicht zu "server", "automationone_db" "korrigieren". |
| 4.4 | **Konfigurationsdrift** | Config geändert, Service noch mit alter Config? Neustart nötig? |

### 2.5 Grafana-spezifisch

| ID | Typ | Prüfung |
|----|-----|---------|
| 5.1 | **Row collapsed/open** | Zwei JSON-Strukturen – konsistent die richtige wählen. |
| 5.2 | **Datasource-Referenz** | Pro Panel **und** pro Target explizit. |
| 5.3 | **fieldConfig vs options** | `fieldConfig.defaults` = Daten (unit, thresholds, min/max); `options` = Visualisierung (colorMode, textMode). |
| 5.4 | **Threshold-Format** | Erster Step `"value": null` (Basis-Farbe), nicht `"value": 0`. |
| 5.5 | **stat-Panel reduceOptions** | Explizit `calcs: ["lastNotNull"]` etc., sonst Mittelwert/nichts. |

### 2.6 Docker/Infrastruktur

| ID | Typ | Prüfung |
|----|-----|---------|
| 6.1 | **Netzwerk** | Container↔Container: Service-Name (z. B. `http://prometheus:9090`). Host: `localhost:PORT`. |
| 6.2 | **Volume** | host:container, `:ro` wo nötig. |
| 6.3 | **Healthcheck** | Läuft im Container: `curl localhost:8000` ok, nicht `curl automationone-server:8000`. |
| 6.4 | **Profile** | Services in `profile: monitoring` starten nur mit `--profile monitoring`. |

### 2.7 Python/FastAPI

| ID | Typ | Prüfung |
|----|-----|---------|
| 7.1 | **Async/await** | `await` bei async – sonst Coroutine statt Ergebnis. |
| 7.2 | **Import-Pfade** | Projekt: `src.middleware.request_id`, `src.core.config` – nicht `from middleware` / `from app.core`. |
| 7.3 | **SQLAlchemy** | Sessions schließen; kein sync-Pattern in async-Code. |

### 2.8 ESP32/Embedded

| ID | Typ | Prüfung |
|----|-----|---------|
| 8.1 | **Stack/Heap** | RAM-Grenzen (z. B. ~200KB nutzbar); keine wachsenden Strings in Schleifen. |
| 8.2 | **Watchdog** | Kein langer blockierender Code ohne `yield()`/`delay()`. |
| 8.3 | **WiFi/MQTT** | Reconnect, Backoff, State bei Disconnect. |

### 2.9 Meta-Fehler (Umgang mit Fehlern)

| ID | Typ | Prüfung |
|----|-----|---------|
| 9.1 | **Konfidenz ohne Verifikation** | "Funktioniert" nur mit Verifikationsschritten. |
| 9.2 | **Symptom-Fix** | Root-Cause beheben, nicht nur Symptom (z. B. Watchdog → blockierenden Code finden). |
| 9.3 | **Stille Degradation** | Bei Fehlern sichtbar scheitern (Log/Exception), nicht still weiterlaufen. |
| 9.4 | **Overengineering** | Keine unnötigen Abstraktionen/Patterns. |
| 9.5 | **Kontext-Verlust** | Bei großen Aufträgen: Anfangsvorgaben bis zum Ende durchhalten (Struktur, Konventionen). |

---

## 3. Arbeitsweise

1. **Kontext aus dem Chat** festlegen: welche Dateien/Bereiche/Stack.
2. **Referenzen** laden (Abschnitt 7): APIs, Fehlercodes, Pfade, Namenskonventionen.
3. **Kategorien** aus Abschnitt 2 auswählen, die zum Bereich passen (Grafana → 2.1, 2.2, 2.5, 2.3; Docker → 2.1, 2.6, 2.3; Python → 2.7; ESP → 2.8; Frontend → 2.1, 2.2, 2.4).
4. **Tiefgehende Analyse**: Dateien lesen, Grep/Glob für Muster, gegen Referenzen prüfen.
5. **Report** schreiben (Abschnitt 4). **Fixes** nur wenn User explizit "fixen", "korrigieren", "anpassen" o. ä. verlangt – sonst nur Befunde und Empfehlungen.

---

## 4. Report-Format

**Zieldatei:** `.claude/reports/current/KI_AUDIT_REPORT.md`

```markdown
# KI-Audit: {Kurztitel/Bereich}

**Kontext:** {Was der User angegeben hat}
**Prüfumfang:** {Dateien/Bereiche}
**Referenzen genutzt:** {Liste}
**Datum:** ISO-8601

## Executive Summary
| Kategorie | Befunde | Kritisch/Warnung/Info |

## Befunde (nach Katalog-ID)
### 1.1 Halluzinierte APIs / …
- **Wo:** Datei:Zeile oder Pfad
- **Befund:** …
- **Empfehlung:** …

### 2.x / 3.x / … (nur wo relevant)

## Nicht betroffen (kurz)
- 2.8 ESP32: Kein ESP-Code im Prüfumfang

## Empfehlungen (Priorität)
1. …
2. …
```

Wenn der User **explizit Fixes** wünscht: gleicher Report plus Abschnitt "Durchgeführte Korrekturen" mit Datei, Änderung, Begründung.

---

## 5. Regeln

| # | Regel |
|---|--------|
| 1 | Kontext immer aus User-Aussage ableiten; bei Unklarheit nachfragen. |
| 2 | **Nur Report** liefern, außer User fordert ausdrücklich "fixen", "korrigieren", "anpassen". |
| 3 | Jede Aussage zu APIs/Config/Version gegen Referenzen oder Code prüfen – keine Annahmen. |
| 4 | Projekt-Namen und -Pfade aus Referenzen verwenden (god_kaiser_db, El Servador, etc.). |
| 5 | Report immer unter `.claude/reports/current/KI_AUDIT_REPORT.md` (oder vom User angegeben). |

---

## 6. Trigger-Keywords

- ki-audit, KI-Audit, KI-Fehler prüfen
- Bereich auf Qualitätsfehler untersuchen
- Grafana/Docker/Python/ESP/Frontend auf KI-Fehler prüfen
- halluzinierte API, falsches Mapping, Namenskonvention prüfen
- Audit-Bericht, Analyse-Bericht (mit Fokus auf typische KI-Irrtümer)

---

## 7. Referenzen (Projekt)

Für faktenbasierte Prüfung immer nutzen:

| Zweck | Datei |
|-------|--------|
| APIs, Topics, Endpoints | `.claude/reference/api/MQTT_TOPICS.md`, `REST_ENDPOINTS.md`, `WEBSOCKET_EVENTS.md` |
| Fehlercodes, Ranges | `.claude/reference/errors/ERROR_CODES.md` |
| Abhängigkeiten, Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md`, `ARCHITECTURE_DEPENDENCIES.md` |
| Docker, Services, Ports | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` |
| Log-Pfade, Zugriff | `.claude/reference/debugging/LOG_LOCATIONS.md`, `LOG_ACCESS_REFERENCE.md` |
| Best Practices, Agent/Skill-Format | `.claude/reference/patterns/vs_claude_best_practice.md` |
| Tests, Flows | `.claude/reference/testing/flow_reference.md`, `agent_profiles.md` |

---

## 8. Abgrenzung

| Aufgabe | Zuständig |
|---------|-----------|
| Laufzeit-Debug (Logs, Crashes) | server-debug, esp32-debug, mqtt-debug, frontend-debug |
| Cross-Report-Korrelation | meta-analyst |
| TM-Plan gegen Codebase | verify-plan |
| DB-Schema, Cleanup | db-inspector |
| KI-typische Struktur-/Logik-/Config-Fehler in angegebenem Bereich | **ki-audit** |

---

*Tiefgehende Analyse auf KI-Fehler. Report standardmäßig; Fix nur auf ausdrückliche Anfrage.*
