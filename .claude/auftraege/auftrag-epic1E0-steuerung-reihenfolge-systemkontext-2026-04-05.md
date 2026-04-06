# Epic 1 — Steuerung: Auftragsbündel Vertrag, Korrelation, Finalität

**Datum:** 2026-04-05  
**Ziel dieses Dokuments:** Reihenfolge, Abhängigkeiten und Systemkontext für die **einzelnen Epic-1-Aufträge** (`auftrag-epic1-01` … `06`). Nicht selbst „ausführen“, sondern **vor dem Start lesen**.

---

## Systemkontext (AutomationOne — nur Server-Schicht)

- **El Servador** liegt unter `El Servador/god_kaiser_server/`. Dieses Bündel betrifft **nur** diese Codebasis.
- **El Trabajante** (ESP32) und **El Frontend** (Vue) werden hier **nicht** geändert. Wenn ein Auftrag API-Felder ergänzt oder Semantik ändert, ist im Auftragstext vermerkt, dass **Frontend** in einem **separaten** Auftrag nachziehen muss (kein Mischen in einem Repo-Sprung).
- **Ist-Analyse:** Der Bericht „Epic 1 — Ist-Verdrahtung“ (deine Zusammenfassung mit AP-A bis AP-G) ist die **verbindliche Ist-Beschreibung**. Die nachfolgenden Aufträge setzen darauf auf und formuliieren **SOLL** plus **Abnahme**.

---

## Warum diese Reihenfolge

| Stufe | Auftrag | Begründung |
|-------|---------|------------|
| 1 | **01 Logic-Priorität** | Rein serverintern (Schema + Docstring + ggf. UI-generierte OpenAPI); **keine** MQTT-Abhängigkeit. Verhindert, dass Operatoren weiterhin „100 = am wichtigsten“ eintragen, während die Engine „klein gewinnt“. |
| 2 | **02 Actuator REST** | Klarer API-Vertrag für Dashboard/Integratoren (`correlation_id` sichtbar); baut auf bekannter Ist-Kette AP-A auf. |
| 3 | **03 Emergency-Korrelation** | Berührt `actuators.py` + `Publisher`; sollte **nach** 02 oder zumindest mit klarer ID-Strategie erfolgen, damit nicht zwei parallele Correlation-Storys entstehen. |
| 4 | **04 MQTTCommandBridge** | Eingriff in kritischen **Zone/Subzone-ACK**-Pfad; kann Firmware-Erwartung an **ACK-Payload** (`correlation_id`) betreffen — nach API-Klarheit sinnvoll. |
| 5 | **05 Intent-Orchestrierung** | Größerer Persistenz-/Worker-Umfang; von korrekter Prioritäts- und Korrelationsstory unabhängig, aber operativ „Phase 2“ der Vertragshärtung. |
| 6 | **06 Finalität-Dokumentation** | Kann parallel zu kleinen Fixes starten, sollte aber **nach** 01–04 **finalisiert** werden, damit OpenAPI/Texte nicht zweimal geändert werden. |

**Parallel erlaubt:** 01 + 06 (Entwurf) parallel; **01 vor 02** empfohlen, damit generierte Client-Typen nicht widersprüchlich sind.

---

## Abnahme des gesamten Bündels (Querschnitt)

- Kein Auftrag erzeugt **stille** Breaking Changes ohne Versionierung oder Release-Note im Server-Repo (`CHANGELOG` oder `docs/` — wie im Projekt üblich).
- Nach Abschluss: Ein kurzer **Soll-Matrix-Auszug** (aus Auftrag 06) ist mit dem **Ist** aus Epic-1-Bericht abgleichbar (keine widersprüchlichen Aussagen mehr zu `acknowledged` / Zone ACK / Subzone).

---

## Dateien in diesem Bündel

| Datei | Kurzinhalt |
|-------|------------|
| `auftrag-epic1-01-logic-priority-schema-runtime-vereinheitlichen-2026-04-05.md` | I1 (überarbeitet nach `/verify-plan`: u. a. festes `CHANGELOG.md`, kein `openapi.json` im Repo, Create/Update/Response + E2E-Testkommentare) |
| `auftrag-epic1-02-actuator-rest-correlation-warnings-finalitaet-hinweis-2026-04-05.md` | H2/K2, Teil C2 |
| `auftrag-epic1-03-emergency-mqtt-korrelation-incident-verknuepfung-2026-04-05.md` | K3 |
| `auftrag-epic1-04-mqtt-command-bridge-ack-zuordnung-haerten-2026-04-05.md` | K1 |
| `auftrag-epic1-05-intent-orchestration-sent-timeout-konsistenz-2026-04-05.md` | M1-Fragment |
| `auftrag-epic1-06-openapi-finalitaet-zone-subzone-dokumentieren-2026-04-05.md` | C2/AP-G |

---

*Ende Steuerungsauftrag Epic 1.*
