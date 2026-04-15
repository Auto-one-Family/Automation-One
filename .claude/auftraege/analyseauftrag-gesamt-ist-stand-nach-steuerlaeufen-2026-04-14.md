**Dateiname nach Kopie:** `analyseauftrag-gesamt-ist-stand-nach-steuerlaeufen-2026-04-14.md`  
**Typ:** Analyseauftrag (nur Bericht, keine Produkt-Code-Änderung aus diesem Dokument)  
**Ausführende Rolle:** Orchestrierter Analyse-Lauf im Auto-one-Checkout (z. B. `auto-debugger` oder nach `AGENTS.md` benannte Analyse-Rolle) mit **Read/Grep/Glob** und optional **pytest** / **vue-tsc** — Ergebnisse **ehrlich** dokumentieren (kein „grün“ ohne ausgeführte Befehle).

### 0. Ziel (ein Satz)

Einen **vollständigen, evidenzbasierten IST-Bericht** über AutomationOne **jetzt** erstellen: Schichtenübergreifende **Wahrheit** zu Datenflüssen, State, Hintergrundprozessen, Fertigation Inflow/Runoff, Korrelation/Traceability, Lifecycle bei entfernten/abgemeldeten Entitäten — inklusive **Lücken, Risiken und offenen Punkten**.

### 1. Lieferobjekt (verbindlich)

| Artefakt | Pfad (relativ Auto-one-Wurzel) |
|----------|--------------------------------|
| **Hauptbericht (Pflicht)** | `docs/analysen/BERICHT-gesamt-ist-stand-automationone-2026-04-14.md` |
| **Optional** (nur wenn nötig): Test-/Lint-Auszug | `docs/analysen/ANHANG-gesamt-ist-stand-befehlsauszug-2026-04-14.md` |

Der Hauptbericht muss **allein lesbar** sein (keine „siehe externes Repo“).

### 2. Nicht-Ziele

- Keine Feature-Implementierung, kein Refactor aus diesem Auftrag.
- Kein `git push`, kein Force, keine destruktiven Git-Operationen.
- Keine Spekulation: Jede Behauptung zum **aktuellen** Verhalten mit **Datei-Pfad + kurze Evidence** (Zeilennummer oder Suchtreffer) oder als **„unbekannt / nicht verifiziert“** markieren.

### 3. Eingebetteter Systemkontext (normativ)

**Drei Schichten:**

| Schicht | Verzeichnis (typisch) | Technologie |
|---------|------------------------|-------------|
| Firmware | `El Trabajante/` | ESP32, C++, MQTT, NVS, Safety |
| Backend | `El Servador/god_kaiser_server/` | FastAPI, PostgreSQL, MQTT-Handler, Background-Tasks |
| Frontend | `El Frontend/` | Vue 3, TypeScript, Pinia, WebSocket, REST über `src/api/` |

**Produktregeln (bei Treffer im Code prüfen):** Sensor-Konfiguration fachlich in **HardwareView**-Kontext, nicht in der reinen Komponenten-Wissensdatenbank-Route; Dashboard **Legacy** getrennt von neuem Dashboard; Charts **Chart.js** laut Projektstandard sofern noch so dokumentiert.

**Observability:** Korrelation **HTTP `request_id`** vs. **MQTT** nicht blind vermischen; strukturierte Logs und vorhandene Monitoring-Anbindung (Loki/Prometheus/OTEL) nur **beschreiben, was im Repo und in Config wirklich angebunden ist** — nicht wünschen.

### 4. Arbeits- und Git-Hinweis

- Aktuellen Branch mit `git branch --show-current` und Kurzcommit `git log -1 --oneline` im Bericht nennen.
- Wenn Analyse auf **`auto-debugger/work`** oder anderem Arbeitsbranch: explizit sagen; Vergleich zu Default-Branch nur **read-only** (`git diff master...` oder `main...` je nach Repo-Default — Default **verifizieren**).

### 5. Analysepakete (alle bearbeiten; Reihenfolge frei)

#### Paket A — Fertigation Inflow / Runoff

- UI: `El Frontend/src/components/dashboard/widgets/FertigationPairWidget.vue`, `useFertigationKPIs.ts`, Widget-Registrierung/Dashboard-Pipeline.
- Doku vs. Code: `docs/FERTIGATION_WIDGET_INTEGRATION.md`, Widget-README unter `El Frontend/src/components/dashboard/widgets/README.md`.
- Server/DB: alle tatsächlichen Endpoints, Models, Migrationen, die Inflow/Runoff oder `measurement_role` betreffen — wenn **nichts** serverseitig existiert: **Lücke P0** benennen.
- Realtime: WebSocket-Updates, Staleness, Doppeldatenquellen (REST vs. WS).

**Output im Bericht:** Datenflussdiagramm (ASCII oder Tabelle), IST **vollständig / unvollständig**, konkrete Dateizeilen.

#### Paket B — Phase 0 Traceability (ohne neue DB)

- Mutationspfade (API POST/PATCH/DELETE, relevante MQTT-Ingest-Pfade): wo werden `correlation_id`, `request_id`, `device_id`, `zone_id`, `sensor_config_id`, Schema-/Payload-Version gesetzt oder **verloren**?
- Logs: strukturierte Felder an **heißen** Stellen — Inventar mit „vorhanden / fehlt“.

**Output im Bericht:** Tabelle „Pfad → IDs → Lücke“.

#### Paket C — Lifecycle, Abmeldung, Hintergrundprozesse

- Server: `src/services/logic_engine.py`, `src/mqtt/handlers/heartbeat_handler.py`, `src/mqtt/subscriber.py`, `src/services/calibration_service.py`; weitere `asyncio.create_task` / Loops in `services/` und `mqtt/`.
- Konsistenz: soft-delete vs. Heartbeat vs. Background-Evaluation — **Stop-Bedingungen** dokumentieren (IST).
- DB: welche Flags/Tabellen definieren „weg“; lesen Handler nur DB oder auch RAM-Cache?

**Output im Bericht:** Matrix **mindestens 8 Zeilen**: interner Ablauf ↔ externer Trigger ↔ Source of Truth ↔ bekannte Bruchstelle.

#### Paket D — Frontend: Subscriptions, Duplikate, Cleanup

- `onUnmounted` / Deaktivierung: Monitor, Dashboard, Fertigation, Kalibrierung, ZonePlate / device-delete-Kette.
- Doppelte KPI-Berechnung, parallele Polls, fehlende AbortController (oder Repo-Äquivalent).

**Output im Bericht:** Befundliste P0/P1 mit Datei-Evidence oder explizit „nicht gefunden“ mit Suchraum.

#### Paket E — Firmware (nur IST, kein Umbau)

- MQTT, Registrierung, Command-Queue (z. B. `mqtt_client.cpp`, `sensor_command_queue.cpp`): was passiert bei Server-seitig entfernter Config — nur **beschreiben** anhand Code/Lesung.

**Output im Bericht:** Kurzabschnitt + Verweis auf kritische Dateien.

#### Paket F — Qualitätssignal (optional, ehrlich)

- Server: `ruff` und gezielt `pytest` nur wenn Umgebung klar; Ergebnis **wörtlich** (OK / Fehler / nicht ausgeführt mit Grund).
- Frontend: `vue-tsc --noEmit` — gleichermaßen ehrlich.
- **Nicht** behaupten E2E/Playwright grün ohne laufenden Stack.

**Output:** Kurz im Hauptbericht oder im Anhang.

### 6. Struktur des Hauptberichts (Pflicht-Gliederung)

1. **Executive Summary** (max. 15 Zeilen): was stabil wirkt, was riskant, Top-3 P0.  
2. **Branch / Commit / Analyseumfang**  
3. **Schicht Firmware** (IST)  
4. **Schicht Backend** (IST) inkl. Background/MQTT  
5. **Schicht Frontend** (IST)  
6. **Datenbank / Persistenz** (IST)  
7. **Querschnitt: Fertigation Inflow/Runoff**  
8. **Querschnitt: Traceability / Korrelation**  
9. **Querschnitt: Lifecycle vs. Hintergrund**  
10. **Observability / Debugging heute** (was geht, was fehlt)  
11. **Test- und Lint-Signal** (ehrlich)  
12. **P0 / P1 / P2** (priorisierte Liste, nur Analyse-Folgen)  
13. **BLOCKER** (wenn Gesamtbild ohne menschliche Klärung nicht sicher ist)  
14. **Abnahme-Checkliste** (alle Pakete A–F mit „erfüllt / Teil / offen“)

### 7. Abnahme (messbar)

- Datei `docs/analysen/BERICHT-gesamt-ist-stand-automationone-2026-04-14.md` existiert und enthält **alle** Gliederungspunkte aus §6.  
- Jedes Paket A–F hat mindestens **einen** Evidence-Block (Pfad + Inhalt/Snippet oder klares „nicht im Tree gefunden“).  
- Kein Widerspruch zwischen Doku (`docs/…`) und Code ohne **explizite** „Doku ahead of code“- oder „Code ahead of Doku“-Markierung.  
- **Agent-Prompt (Copy-Paste)** am Ende des Berichts (optional): ein Satz, wie ein Folgeauftrag Implementierung einzeln anstoßen kann — ohne diesen Analyseauftrag zu erweitern.

### 8. Agent-Prompt (Copy-Paste für Start im Auto-one-Checkout)

```text
Bitte Analyseauftrag ausführen: Datei .claude/auftraege/analyseauftrag-gesamt-ist-stand-nach-steuerlaeufen-2026-04-14.md vollständig lesen und den Pflichtbericht docs/analysen/BERICHT-gesamt-ist-stand-automationone-2026-04-14.md evidenzbasiert erstellen. Keine Code-Änderungen aus diesem Auftrag; nur IST, Lücken, P0/P1 und BLOCKER. Tests/Lint nur mit ehrlicher Ausführungsanzeige.
```

---

**Ende KOPIERFASSUNG FÜR AUTO-ONE**
