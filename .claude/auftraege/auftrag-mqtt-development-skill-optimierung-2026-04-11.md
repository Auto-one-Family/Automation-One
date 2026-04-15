# Auftrag: MQTT-Development-Skill optimieren (Ziel-Repo Auto-one — dort ausführen)

**Zweck:** Den bestehenden **MQTT-Development-Skill** (Dateiname gemäß IST im Ziel-Repo, typisch unter `.claude/skills/**/SKILL.md`) so erweitern, dass Coding-Agenten **Firmware (El Trabajante)** und **Server (El Servador)** gleichermaßen bedienen — **Pattern-First**, minimal-invasiv, mit **Evidenzpflicht** aus demselben Repository.  
**Sprache:** Deutsch für Skill-Texte, falls im Ziel-Repo anders üblich: dortangleichen.  
**Nicht-Ziel:** Neues paralleles MQTT-Framework erfinden; generische ESP32-Tutorials ohne Repo-Beleg.

---

## Eingebetteter Fachkontext (ohne externe Repo-Pfade)

- **Architektur:** Hub-and-Spoke über MQTT-Broker; **Geräte-Koordination** primär **indirekt** (Topics + Server-Logik), nicht ESP-zu-ESP als Default.  
- **Professioneller Betrieb:** TLS + Auth + ACL in Produktion; Listener-Härtung; bewusste **QoS-Disziplin** (Telemetrie oft QoS 0, Befehle/Konfig QoS 1 mit Idempotenz); **Keepalive** und Broker-**Timeout** (`exceeded timeout`) als Betriebssignal für Blockaden oder Netz.  
- **Last:** Backpressure, Rate-Limits, **Burst**-UIs (z. B. viele `measure`-Kommandos) als Test- und Designfälle; Monitoring von Verbindungsabbrüchen.  
- **UNS / Sparkplug:** Optional als **Governance-Vokabular** (ISA-95-ähnliche Hierarchie, Data Contracts); keine Pflicht zur Sparkplug-Einführung.  
- **AutomationOne-spezifisch (aus öffentlicher Strategie-Doku):** Viele **MQTT-Handler** auf dem Server, **Circuit Breaker**/Retry, **LWT**, **MQTTCommandBridge** / **correlation_id** für kritische Ketten, **OfflineManager** auf der Firmware für MQTT-Verlust — Änderungen müssen diese Patterns **verlängern**, nicht ersetzen.

---

## Phase A — Bestandsaufnahme (nur Ziel-Repo)

1. Skill-Datei(en) finden: Suche nach `SKILL.md` und Frontmatter/Trigger, die **MQTT**, **Broker**, **Firmware**, **Handler** erwähnen.  
2. **Evidence-Tabelle** (Markdown) erstellen — Zeilen nur mit **Nachweis**:

   | Schicht | Pfad (relativ Repo-Wurzel) | Rolle (1 Satz) | Skill deckt heute? (ja/teils/nein) |
   |---------|----------------------------|----------------|-------------------------------------|
   | Broker-Compose / `mosquitto.conf` | … | … | … |
   | Server MQTT-Einstieg (Client, Subscribe, Publish) | … | … | … |
   | Handler-Ordner (z. B. `src/mqtt/handlers/`) | … | … | … |
   | Firmware MQTT-Client | … | … | … |
   | Offline / Safety / CircuitBreaker | … | … | … |
   | Tests/Wokwi MQTT | … | … | … |

3. **IST-Topic- und QoS-Konvention** aus Code/Doku extrahieren (keine erfundenen Topic-Namen): zentrale Builder/Constants, Beispiel-Flows (Heartbeat, Command, ACK, LWT).

---

## Phase B — Recherche-Übernahme (lokal im Skill, ohne neue Externrecherche-Pflicht)

Den Skill um einen kurzen Abschnitt **„Professionelle Betriebsstandards (Kurz)“** ergänzen — **synthetisiert** aus folgenden inhaltlichen Punkten (Agent muss sie nicht erneut websuchen, nur korrekt **paraphrasieren** und auf **eure** Konfiguration beziehen):

- Mosquitto: anonyme Clients in Prod verbieten; ACL; TLS; `mosquitto.conf` als Single Source of Truth neben Compose.  
- HA: Mosquitto ohne natives Clustering — HA über Betrieb/Bridge/K8s-Patterns **als Entscheidungshilfe**, nicht als Rewrite-Vorschlag.  
- Koordination: Hub-and-Spoke; **Cross-Device** über Server/Regeln.  
- Last: Keepalive, Bursts, Backpressure — Verweis auf **Disconnect-Runbook**-Disziplin (drei Logs parallel).

Optional: 3–5 **interne** Links auf eure **eingecheckte** Projektdoku im Ziel-Repo (z. B. `docs/...`), **keine** Pfade aus Strategie-Repositories.

---

## Phase C — Skill-Verhalten für Agenten (verbindlich)

Neuer Abschnitt **„Soll-Verhalten (MQTT)“**:

1. **Pattern-First:** Vor jeder Änderung `Grep`/`Glob` nach **bestehendem** Handler-, Publisher-, Firmware-MQTT-Pattern; gleiche Fehlerbehandlung wie Nachbarcode.  
2. **Eine Hypothese pro Paket:** Transport (Keepalive/Timeout) vs. Contract (`correlation_id`, Schema) vs. Broker-Config — nicht mischen.  
3. **Offline-first Denken:** Jede neue Online-Funktion beschreiben: Was passiert bei **30 s Grace** / `OFFLINE_ACTIVE`?  
4. **Keine Topic-Erfindung:** Topics nur aus **Builder/Constants/Tests** übernehmen.  
5. **TLS-Profil:** Build-Flags und URI-Schema müssen zu den Logs passieren; Dev/Prod-Trennung explizit.  
6. **Tests:** Wo vorhanden, Wokwi-/Integrationstests für MQTT-Contracts erweitern statt nur manuell.

---

## Phase D — Anti-Patterns (Kurz, MQTT-spezifisch)

Bullet-Liste: zweiter MQTT-Client im Server; blockierende Messung im MQTT-Hotpath; generische QoS-2 „weil sicher“; Retained ohne Policy; Kalibrier-Pfade ohne Rate-Limit-Hinweis an UI/Server.

---

## Abnahme / Akzeptanzkriterien

- [ ] Skill-Datei(en) aktualisiert; Wortlaut **selbsttragend** für Agenten im Ziel-Repo.  
- [ ] Evidence-Tabelle vollständig (keine leeren Pfad-Zellen).  
- [ ] Neuer Abschnitt **Professionelle Betriebsstandards** + **Soll-Verhalten** + **Anti-Patterns** lesbar unter 2–3 Screens pro Abschnitt (Progressive Disclosure: Details in optionaler `references/mqtt-ops.md` im Skill-Ordner **nur** wenn im Repo schon üblich).  
- [ ] `CLAUDE.md` oder zentrale Agent-Navigation im Ziel-Repo: **ein** Verweiszeile auf den MQTT-Skill, falls dort Skill-Liste gepflegt wird.  
- [ ] Kein Bruch: MQTTCommandBridge, LWT-Pfade, CircuitBreaker bleiben **benannt** und **respektiert**.

---

## Agent-Prompt (Copy-Paste, Ziel-Repo)

Du arbeitest im **Auto-one**-Repository. Lies den Auftrag **„MQTT-Development-Skill optimieren“** vollständig. Führe **Phase A** aus: finde den MQTT-Skill, fülle die Evidence-Tabelle mit **echten relativen Pfaden**. Erweitere den Skill um **Phase B–D** ohne generische Tutorials; jedes Code-Zitat oder Topic-Beispiel muss im Repo vorkommen. Ändere **keine** Produktionslogik in diesem Auftrag, **nur** Skill/Doku im vereinbarten Umfang. Am Ende: kurze Änderungsliste und Pfad zur aktualisierten `SKILL.md`.
