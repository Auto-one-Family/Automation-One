# Analyseauftrag — IST: Observability, Correlation, Error-Codes, Verträge (E2E)

**Datum:** 2026-04-09  
**Typ:** Reiner Analyseauftrag (kein Produktiv-Code als Ziel dieses Dokuments; Ergebnis = Markdown-Bericht im Ziel-Repo)  
**Ziel-Repository:** AutomationOne-Codebasis (lokal z. B. unter `...\PlatformIO\Projects\Auto-one\`)  
**Priorität:** Hoch (Grundlage für spätere, kleine Umsetzungs-PRs)

> **Hinweis zur Ablage:** Diese Datei ist so formuliert, dass sie **unverändert** nach  
> `Auto-one\.claude\auftraege\analyse-IST-observability-correlation-contracts-2026-04-09.md`  
> kopiert werden kann. Es sind **keine** externen Wissens-Pfade nötig; alle Begriffe und Regeln stehen unten.

---

## Auftrag: IST erheben — Correlation Contracts & Observability (E2E)

**Kontext:** Vor einer geordneten Observability-Roadmap soll der **Ist-Zustand** der Identifier und Verträge über Firmware, MQTT, Server, Frontend und Monitoring dokumentiert werden — ohne bereits zu implementieren.

**Bezug:** Planungsphase „Correlation / Logging / Grafana“; Vorbereitung für optionale E2E-Verbesserungen in kleinen PRs.

**Nicht-Ziele (verbindlich):**

- Keine Breaking Changes an öffentlichen APIs, MQTT-Topic-Schema oder DB-Schema ohne ausdrücklichen Migrationsplan und Freigabe.
- Keine Entfernung bestehender Log- oder Payload-Felder.
- Keine Produktiv-Secrets oder personenbezogenen Daten im Bericht.

---

## Eingebetteter Fachkontext (Pflichtlektüre = dieser Abschnitt)

Der ausführende Agent **liest nur dieses Dokument und den Code/Docs im Ziel-Repo**. Die folgenden Regeln ersetzen externe Wissensdateien.

### Begriffe (eindeutig verwenden)

- **Technische Ablaufkorrelation:** Ein Vorgang (z. B. ein API-Request, ein MQTT-Handler-Lauf, ein gebündelter Reconnect) soll über mehrere Komponenten hinweg **dieselbe** technische Kette erkennbar machen. Üblich: W3C **Trace Context** (`traceparent` / optional `tracestate`), in Logs oft als `trace_id` / `span_id` oder abgeleitet davon.
- **Fachliche / Operator-Korrelation:** Stabile Geschäfts- oder Bedienkontexte (Tenant, Gerät, „Intent“, manuelle Aktion). Nicht automatisch identisch mit der technischen Trace-ID; gehört in explizite Felder (vergleichbar mit OpenTelemetry-**Baggage**-Idee: klein, klar benannt, keine PII unnötig).
- **Request-/HTTP-Korrelation:** `X-Request-ID` / `request_id` — typischer Einstieg am API-Gateway oder FastAPI-Middleware; muss in Server-Logs und idealerweise in abgeleiteten MQTT/WS-Schritten wiederzufinden sein, **wenn** der Vorgang dort weitergeht.
- **Gerätekontext:** `device_id` / `esp_id` / äquivalente stabile IDs aus Firmware und Registrierung.
- **MQTT-Nachrichten-ID:** Broker-/Client-`msg_id` wo vom Stack geliefert; von **Anwendungs-**`correlation_id` unterscheiden.

### IoT-Realität (Firmware)

ESP32 hat oft **keine** vollständige HTTP-Header-Kette Richtung Broker. Erwartung: **leichtgewichtiges** Pattern (Gerät + Topic + Sequenz oder Zeitfenster) ist legitim; eine lückenlose `traceparent`-Kette ab Firmware ist **optional** und nur zu empfehlen, wenn Protokoll (MQTT 3.1.1 vs 5) und Ressourcen es tragen.

### Loki / Grafana (Kardinalität)

Hochkardinale Werte (**insb.** `trace_id`, `correlation_id`, `request_id`) **nicht** als Loki-**Labels** missbrauchen (Label-Explosion, Performance). Stattdessen: in **Logzeilen-JSON / Structured Metadata** filtern. Alerts und Dashboards: auf **stabile** Labels (service, env, severity) und sinnvolle `for`-/No-Data-Regeln achten — typische False-Positive-Quellen: `for: 0`, falscher `noDataState`, zu enge Schwellen, fehlende Glättung bei schwankenden Sensorzeitreihen.

### Logging-Verträge (Abgleich mit geplanten Logging-Blöcken)

Für spätere Umsetzung ist als **Zielbild** (nicht als Ist-Forderung dieses Auftrags) dokumentiert:

- Strukturierte Schlüssel pro Entscheidung; wo sinnvoll: `intent_id`, `correlation_id`, Geräte-ID, MQTT-`msg_id`, `handover_epoch`.
- **Fehlerklassen** zur Ursachenklärung: `failure_class` ∈ {`TRANSPORT`, `GATE`, `OUTBOX`, `CONTRACT_LOCAL`, `CONTRACT_REMOTE`, `INTERNAL`} — *nur klassifizieren im IST-Bericht, ob Spuren davon schon existieren oder komplett fehlen.*
- Log-Level-Disziplin: erwartbare Pfadverweigerung ≠ schwere Warnung; echte Inkonsistenzen klar als Fehler.

### Frontend-Finalität (Operator-Modell)

Befehle/Aktionen folgen grob: **accepted → pending → terminal** (`success` | `failed` | `timeout` | `partial`). Der IST-Bericht soll prüfen, ob **terminale** Zustände in Logs **derselben** Vorgangs-Kette erkennbar sind (nicht nur UI-Toasts).

---

## 1. Lieferobjekt

Ein **IST-Bericht** (Markdown) im Ziel-Repo, empfohlener Pfad:

`docs/analysen/IST-observability-correlation-contracts-2026-04-09.md`

**Pflichtabschnitte:**

### A) Executive Summary (max. eine Druckseite Text)

- Welche IDs existieren **nachweislich** heute in Firmware, MQTT-Payloads, Server, Frontend, Loki-Abfragen?
- **Top 5 Lücken** (P0–P2 priorisiert).
- Abschnitt **„Was ist schon gut“** — explizit, um Blind-Rewrites zu vermeiden.

### B) Feld-Matrix („Correlation Contract“)

Tabelle **Zeilen = Vorgangstyp**, **Spalten = Felder** (siehe Bericht; Zellwerte nur: `gesetzt+weitergegeben` | `gesetzt, bricht ab bei …` | `fehlt` | `nur in Logs` | `nur in Payload`).

### C) Handshake & Vertrags-Abschluss

Pro Partner-Paar **Server ↔ Firmware** und **Server ↔ Frontend**: Einstieg, Weitergabe, Abschluss, Lücken.

### D) Error-Codes & Logs

Inventar, 10 repräsentative ERROR-Logs aus Loki (anonymisiert), Abgleich `failure_class`-Zielbild.

### E) Metriken

Prometheus ↔ Logs Join; Lücken kardinalitätssicherer Metriken.

### F) Grafana

Dashboards/Alerts; False-Positive-Risiko.

### G) Wokwi & SIL

Gleiche Correlation-Felder wie Hardware? Blocker.

### H) Risiko-Register (No-Breaking-Ausgang)

### I) Empfohlene Follow-up-Aufträge

Max. 8 kleine Aufträge mit messbaren Akzeptanzkriterien.

---

## 2. Methodik (verbindlich)

1. **Code-Suche** (ripgrep o. Ä.) nach u. a.: `correlation_id`, `request_id`, `X-Request-ID`, `trace_id`, `traceparent`, `tracestate`, `tenant`, `intent_id`, `threshold_correlation_id`, ContextVar, Middleware, OTel/OpenTelemetry.
2. **Laufzeit:** Docker-Compose-Stack mit Monitoring-Profil; mindestens **10 Minuten** Normalbetrieb + **ein** konstruierter Fehlerpfad (z. B. invalides MQTT-JSON). Verwendete **LogQL**/Filter im Bericht festhalten.
3. **Frontend:** Netzwerk-Tab — ausgehende Header; ein Fehlerpfad bis zur sichtbaren UI-Rückmeldung; welche IDs wo sichtbar?
4. **Firmware:** Serial-Log eines Wokwi-Szenarios **oder** Hardware — Sequenz Boot → MQTT verbunden → mindestens ein Publish.
5. **Keine** Secrets/PII in Beispiel-Logs.

---

## 3. Akzeptanzkriterien (für den Analysebericht)

- [ ] Matrix Abschnitt **B** vollständig; keine leere Zeile ohne **eine** Satz-Begründung („nicht im Code vorgesehen“ zählt als Begründung).
- [ ] Mindestens **5** konkrete Inkonsistenzen mit **Repo-Pfad + Funktions-/Modulname + kurzem Zitat oder Zeilenrange**.
- [ ] Abschnitt **„Abgleich mit bestehenden Ziel-Repo-Aufträgen“:** In `.claude/auftraege/` nach thematisch passenden Logging-/Observability-Aufträgen suchen. Tabelle: **Auftrag (Dateiname)** | **was der Auftrag fordert** | **IST erfüllt / teilweise / offen**. Wenn keine passenden Dateien existieren: ein Satz „keine thematischen Aufträge gefunden“.
- [ ] Expliziter Absatz **„Breaking Changes: keine“** — oder nummerierte Liste der **einzigen** potenziell breaking Stellen (dann: kein Implementierungs-PR ohne Freigabe).

---

## 4. Zeitrahmen (Schätzung)

**6–12 h** fokussierte Analyse (eine Person mit Kenntnis aller drei Schichten), abhängig von Docker/Wokwi-Verfügbarkeit.

---

## 5. Nach dem Bericht (Prozess für Robin)

1. Matrix und Risiko-Register reviewen.  
2. Nummerierte Follow-ups aus Abschnitt **I** in die **eigene** Observability-Roadmap übernehmen (wo auch immer sie geführt wird).  
3. Umsetzung nur als kleine PRs; nach jedem PR: Loki-Stichprobe + bestehende CI grün.

---

## Agent-Prompt (Copy-Paste für den ausführenden Agenten im Ziel-Repo)

```text
Du arbeitest im AutomationOne-Ziel-Repo. Lies den Auftrag in
.claude/auftraege/analyse-IST-observability-correlation-contracts-2026-04-09.md
vollständig (insbesondere „Eingebetteter Fachkontext“).

Ziel: Erstelle den IST-Markdown-Bericht unter
docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
mit den Pflichtabschnitten A–I.

Vorgehen:
1) Codebasis durchsuchen und Evidence sammeln (Pfade, kurze Zitate).
2) Laufzeit: Docker-Monitoring-Stack, Normalbetrieb + ein Fehlerpfad; LogQL notieren.
3) Frontend- und Firmware-Spuren wie beschrieben erfassen.
4) Keine Life-Repo-Pfade verwenden; nur dieses Repo.
5) Keine Implementierungsänderungen außer dem neuen Bericht (und ggf. docs/analysen/ anlegen).

Qualität: Matrix vollständig, ≥5 Inkonsistenzen mit Evidence, Abgleich mit .claude/auftraege/,
Breaking-Changes-Absatz, Follow-ups max. 8 mit messbaren Kriterien.
```
