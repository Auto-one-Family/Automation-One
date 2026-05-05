# Incident `INC-2026-04-09-dockerlog-obs-triage` — Index

**Zeitfenster Auswertung:** 2026-04-09 (Docker-/Loki-/Monitoring-Stichprobe; lokaler Stack).  
**Git (Orchestrator-Lauf):** Branch **`auto-debugger/work`** (Soll für auto-debugger; bei diesem Lauf verifiziert).  
**Baseline Kern-Stack:** parallel [`INC-2026-04-09-docker-ist`](../INC-2026-04-09-docker-ist/) — Stichprobe ohne strenges ERROR/FATAL in den damals betrachteten Tails (keine Erweiterung darüber hinaus behaupten).

## Ausgangslage (Symptomkontext)

- **AutoOps-Stichprobe (Kontext Stand 2026-04-09):** 9/9 — dient der Einordnung, ersetzt aber keine vollständige Log-Auditierung.
- **ERROR-Breitensuche:** In der damaligen Auswertung **keine strengen** Server-/Frontend-/Postgres-**ERROR**-Treffer im Sinne klarer Anwendungsfehler-Zeilen — das **ersetzt keine** weitergehende „alles grün“-Behauptung und bezieht sich nur auf diese Stichprobe.
- **Symptom (methodisch):** Auswertung von Docker-/Collector-Logs soll **nicht** in einer flachen „ERROR“-Liste enden, sondern **A/B/C** strikt trennen (siehe unten).
- **Evidenz im Repo:** Rohzeilen der manuellen Stichprobe sind nicht vollständig versioniert; die **Klassen** sind über Topic-Pfade, typische Stack-Signaturen und `INCIDENT-LAGEBILD.md` nachvollziehbar.

## Artefakte

| Datei | Inhalt |
|-------|--------|
| [INCIDENT-LAGEBILD.md](./INCIDENT-LAGEBILD.md) | Symptomkontext, Klassen **A/B/C**, Pattern-Scan, Annahmen |
| [CORRELATION-MAP.md](./CORRELATION-MAP.md) | Trennung Gerätepfad vs. Observability-Rauschen vs. Schein-Treffer |
| [TASK-PACKAGES.md](./TASK-PACKAGES.md) | Kein aktives Code-Paket in diesem Lauf; optionale Follow-ups |
| [SPECIALIST-PROMPTS.md](./SPECIALIST-PROMPTS.md) | Platzhalter — kein Dev-Handoff ohne separates PKG |
| [VERIFY-PLAN-REPORT.md](./VERIFY-PLAN-REPORT.md) | Gate-Status (kein Produktcode in diesem Lauf) |

**Single Source of Truth (Methodik, Tabellen, Prioritäten):**  
`docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md`

## Trennung A / B / C (je ein Beispieltyp)

Die drei Klassen **dürfen** in Breitensuchen nicht vermischt werden.

### (A) Produkt / Gerät — echtes Signal

- **Pfad:** MQTT-Topic `kaiser/…/esp/{esp_id}/system/error` → Server-Handler verarbeitet Payload; Korrelation über **`esp_id`**, Topic, Zeitfenster.
- **Beispieltyp (paraphrasiert):** Broadcast-Emergency-JSON Parse-Fehler → Firmware meldet **`EMERGENCY_PARSE_ERROR`** / leerer oder ungültiger Payload; Kommunikationscode im Repo **`ERROR_MQTT_PAYLOAD_INVALID` = 3016** (in Steuer-/Suchtexten gelegentlich fälschlich „**6016**“ — hier **3016** als maßgeblich). Zusätzlich können **`intent_outcome`** mit **failed** oder kritische Handler-Drops ohne MQTT-CID vorkommen (Vertrags-/Qualitätsthema, eigenes RCA).
- **Nicht vermischen mit:** Alloy-Container-IDs oder Grafana-Provisioning (das ist **B**).

### (B) Operational — Observability-Stack-Lärm

- **Grafana — Beispieltyp:** Startup/Provisioning-Hinweis auf fehlendes oder unerwartetes Verzeichnis unter **`/etc/grafana/provisioning/`** (z. B. erwarteter Unterordner **`plugins/`** im Image-Kontext fehlt im Checkout unter `docker/grafana/provisioning/` — nur **Ops-/Mount-Thema**, kein ESP-RCA).
- **Alloy — Beispieltyp:** Tailer-Meldung **„No such container“** / tote **Container-ID** nach Recreate oder entferntem Container — **Deploy-Lifecycle**, kein Firmware-Fehler.
- **cAdvisor (niedrige Priorität):** DMI-/Windows-Host-Hinweise oft **erwartbar**; keine Produkt-Störung ableiten.

### (C) Schein-Fehler — Such- und Darstellungs-Artefakte

- **Loki — Beispieltyp:** Query enthält Literal **`|= "error"`** und trifft **JSON-Feldnamen**, Labels oder neutralen Text — **kein** automatischer Anwendungsfehler.
- **Postgres — Beispieltyp:** Logzeile **`LOG: execute …`** mit **INSERT**-Daten oder Alert-Text, in dem das Wort „error“ vorkommt — **kein** App-ERROR ohne Kontext.

---

## Evidenz (Kurz, paraphrasiert — keine vollständigen Dumps)

| Klasse | Illustration (Typ, nicht Rohdump) |
|--------|-------------------------------------|
| A | `…/system/error` + numerischer Kommunikationscode **3016** / `EMERGENCY_PARSE_ERROR`; ggf. `intent_outcome` **failed** |
| B | Grafana: Pfad unter `/etc/grafana/provisioning/…`; Alloy: **„No such container“** + alte Container-ID |
| C | Loki: Treffer nur wegen String „error“; Postgres: SQL-Text mit „error“ im Wert |

---

## Betroffene Container / Themen (Rahmen, paraphrasiert)

| Ebene | Beispiel |
|-------|----------|
| App-Stack | Server-, Frontend-, DB-Container (siehe Compose; keine Secrets hier) |
| MQTT | Broker-Container, Topics `kaiser/…/esp/{esp_id}/…` |
| Monitoring-Profil | Loki, Alloy, Grafana, cAdvisor (u. a.) |

Keine Secrets in diesen Dateien; Evidenz paraphrasiert bzw. aus Repo-Pfaden belegt.

---

## Nächster Schritt (Orchestrierung)

**STEUER-02:** IST-Hauptdokument unter `docs/analysen/` — dieser Index-Lauf ändert **keine** `docs/analysen/`-Dateien.
