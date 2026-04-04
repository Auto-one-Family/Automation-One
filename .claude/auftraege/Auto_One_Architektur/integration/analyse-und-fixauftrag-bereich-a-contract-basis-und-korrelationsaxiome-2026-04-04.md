# Analyse- und Fixauftrag Bereich A: Contract-Basis und Korrelationsaxiome

**Stand:** 2026-04-04  
**Prioritaet:** P0  
**Typ:** Cross-layer Fundament (Definitionen + verbindliche Regeln)

---

## Hauptauftragsdokument (verbindliche Referenz)

- `.claude/reports/current/auftragsserie-config-korrelation-restgaps-2026-04-04.md`
- Serienindex: `.claude/auftraege/Auto_One_Architektur/integration/auftragsserie-config-korrelation-restgaps-2026-04-04.md`

---

## Spezifischer Bereich dieses Auftrags

Dieser Auftrag legt die **nicht verhandelbare Basissemantik** fest, auf die alle Folgeauftraege aufsetzen:

- Was ist Intent-Korrelation (`data.correlation_id`)?
- Was ist Trace-Kontext (`request_id`)?
- Welche Config-Events sind terminal, welche nicht?
- Was ist eine Contract-Verletzung und wie wird sie sichtbar?

Ohne diese Basis wird in B-E mit unterschiedlichen impliziten Bedeutungen gearbeitet. Genau das verursacht Drift.

---

## Scope (muss erledigt werden)

1. Verbindlicher Config-Eventvertrag fuer:
   - `config_published`
   - `config_response`
   - `config_failed`
2. Pflicht/Optional/Niemals-fuer-Matching je Feld definieren.
3. Drift-Regeln definieren:
   - missing `data.correlation_id`
   - envelope/data divergence
   - unzulaessige Feldsubstitution
4. Cross-layer Konsumregeln fuer Firmware, Server, Frontend festziehen.

---

## Relevante Module (Analyse- und Zielpunkte)

- **Server Contract/Ingress:** `El Servador/god_kaiser_server/src/services/device_response_contract.py`, `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py`
- **Server Projektion/WS:** `El Servador/god_kaiser_server/src/services/event_contract_serializers.py`, `El Servador/god_kaiser_server/src/websocket/manager.py`
- **Server Publish/Failure-Emission:** `El Servador/god_kaiser_server/src/services/esp_service.py`
- **Frontend Konsum:** `El Frontend/src/utils/contractEventMapper.ts`, `El Frontend/src/types/websocket-events.ts`
- **Firmware Emission:** `El Trabajante/src/services/config/config_manager.cpp`, `El Trabajante/src/services/communication/mqtt_client.cpp`

---

## Konsistenz- und Pattern-Regeln (verbindlich)

- Contract-first: Feldpflichten zuerst, Fallbacks danach.
- Matching nur ueber `data.correlation_id`.
- `request_id` darf nie als "if missing correlation then use request" missbraucht werden.
- Ein Feld darf nicht gleichzeitig Domain-ID und Trace-ID sein.
- Contract-Verletzungen werden explizit signalisiert, nicht "stillschweigend korrigiert".

---

## Umsetzungsauftrag (konkret)

1. Erzeuge eine Contract-Tabelle "Config Events v1" mit:
   - event_type
   - required fields
   - optional fields
   - forbidden-for-matching fields
2. Hinterlege pro Regel den Konsumort (Firmware/Server/Frontend).
3. Definiere kanonische Fehlerfaelle:
   - `missing_correlation`
   - `envelope_data_divergence`
   - `invalid_field_substitution`
4. Definiere terminal authority:
   - Welche Events duerfen finalisieren?
   - Unter welchen Feldbedingungen?

---

## Pflicht-Ergaenzung: IST->ZIEL Migrationsbruecke (verbindlich)

Der Zielvertrag in diesem Bereich ist korrekt, aber die aktuelle Codebasis verwendet fuer Config-Lifecycle-Events teilweise noch eine abweichende Feld- und Statussemantik. Diese Bruecke ist deshalb Bestandteil von Bereich A und kein "optional spaeter":

| Aspekt | IST in Codebasis | Zielvertrag Bereich A | verbindliche Migrationsregel |
|---|---|---|---|
| Korrelation | `correlation_id` primar top-level (`data.correlation_id` nicht durchgaengig) | `data.correlation_id` ist kanonisch | waehrend Migration Dual-Read erlauben, aber nur mit explizitem `contract_violation` bei Divergenz; Zielzustand = ausschliesslich `data.correlation_id` fuer Matching |
| Config-Response Status | `success` / `partial_success` / `error` | terminal via `config_response` nur bei erlaubten Statuswerten | Status-Normalisierung explizit dokumentieren; kein implizites "best guess" Mapping ohne Signal |
| Fehlerstruktur | haeufig `error` oder `error_code` top-level | `data.error.code` + `data.error.message` fuer `config_failed` | bis Umstellung: Legacy-Form nur ueber explizite Mapping-Regel + Contract-Signal; kein stilles Umschreiben |

Zusatzpflicht fuer die Umsetzung:
- Reihenfolge: zuerst Contract-Signalpfad und Validierung, danach eventuelle Legacy-Kompatibilitaet.
- Jede Legacy-Annahme muss einen benannten Auslaufpfad (Removal-Note) haben.

---

## Config Events v1 (verbindlicher Vertrag)

### Contract-Tabelle

| event_type | required fields | optional fields | forbidden-for-matching fields | terminal authority | primaerer Konsumort |
|---|---|---|---|---|---|
| `config_published` | `event_type`, `timestamp`, `esp_id`, `data.correlation_id`, `data.intent`, `data.status` | `request_id`, `data.version`, `data.hash`, `data.meta` | `request_id`, `event_id`, `timestamp`, `data.version`, `data.hash` | nein | Server Ingress + Frontend Timeline |
| `config_response` | `event_type`, `timestamp`, `esp_id`, `data.correlation_id`, `data.status` | `request_id`, `data.applied_at`, `data.details`, `data.version`, `data.hash` | `request_id`, `event_id`, `timestamp`, `data.version`, `data.hash` | ja, nur bei `data.status in {ack, applied}` | Server Contract + Frontend Completion |
| `config_failed` | `event_type`, `timestamp`, `esp_id`, `data.correlation_id`, `data.error.code`, `data.error.message` | `request_id`, `data.retryable`, `data.details`, `data.version`, `data.hash` | `request_id`, `event_id`, `timestamp`, `data.error.message`, `data.version`, `data.hash` | ja, immer | Server Contract + Frontend Failure |

### Terminal Authority (normativ)

- Finalisierung eines Config-Intent darf nur durch `config_response` oder `config_failed` erfolgen.
- `config_published` ist immer nicht-terminal und darf keinen Intent abschliessen.
- `config_response` darf nur finalisieren, wenn `data.correlation_id` vorhanden und valide ist.
- `config_failed` darf nur finalisieren, wenn `data.correlation_id` und `data.error.code` vorhanden sind.
- Events ohne `data.correlation_id` duerfen nie terminal wirken, selbst wenn `status` terminal aussieht.

---

## Regelmatrix: Matching vs Tracing (verbindlich)

| feld | Matching erlaubt | Tracing erlaubt | Pflicht fuer Vertrag | Bemerkung |
|---|---|---|---|---|
| `data.correlation_id` | ja (einzige Matching-ID) | ja | ja | Domain-Intent-Korrelation |
| `request_id` | nein | ja | optional | Request-/Transport-Trace, kein Domain-Matching |
| `event_id` | nein | ja | optional | Event-spezifische ID, nur Observability |
| `timestamp` | nein | ja | ja | Reihenfolge/Timeline, kein Matching |
| `esp_id` | nur als Scope, nie als Join-ID | ja | ja | Device-Scope, kein Intent-Schluessel |
| `data.version` | nein | ja | optional | Vertrags-/Payload-Versionierung |
| `data.hash` | nein | ja | optional | Integritaetshinweis, kein Matching |

---

## Kanonische Contract-Verletzungen

| verletzungscode | trigger | sichtbarkeit (signal) | hartes Verhalten |
|---|---|---|---|
| `missing_correlation` | `data.correlation_id` fehlt/leer in `config_published`, `config_response` oder `config_failed` | `contract_violation.missing_correlation` | kein Matching, kein stiller Erfolg, Event als invalid markieren |
| `envelope_data_divergence` | widerspruch zwischen Envelope (`event_type`, `esp_id`) und `data`-Nutzlast | `contract_violation.envelope_data_divergence` | kein Finalisieren, Event in Quarantaene/invalid |
| `invalid_field_substitution` | verbotene Ersetzung (`request_id` oder anderes Feld als Korrelation genutzt) | `contract_violation.invalid_field_substitution` | Matching-Pfad abbrechen, explizit loggen und broadcasten |

---

## Legacy/Fallback -> Contract-Signal Mapping

| legacy/fallback verhalten (zu entfernen) | neues Contract-Signal | ersatzregel |
|---|---|---|
| "Wenn `data.correlation_id` fehlt, nutze `request_id`" | `contract_violation.invalid_field_substitution` | Matching strikt abbrechen |
| "Event ohne Korrelation trotzdem als Erfolg zeigen" | `contract_violation.missing_correlation` | Status = invalid, kein Erfolg |
| "Envelope/Data Widerspruch tolerieren und best guess mappen" | `contract_violation.envelope_data_divergence` | Event isolieren, nicht finalisieren |
| "Terminalstatus aus Textfeld ohne Eventtyp ableiten" | `contract_violation.invalid_field_substitution` | Terminal nur per erlaubtem Eventtyp |

---

## Cross-layer Konsumregeln (Firmware/Server/Frontend)

- **Firmware (Emission):** muss `data.correlation_id` fuer alle drei Config-Events setzen; `request_id` bleibt optional und rein trace-bezogen.
- **Server (Ingress/Contract):** validiert Pflichtfelder vor jeder Projektion; bei Verstoessen nur explizite Contract-Signale, niemals stilles Heilen.
- **Server (WS-Projektion):** uebernimmt Contract-Signal 1:1 ins Eventmodell, damit Frontend keine eigene Fehlerspekulation bauen muss.
- **Frontend (Konsum):** matching und Grouping ausschliesslich ueber `data.correlation_id`; `request_id` nur fuer Diagnose/Tooltip/Trace-Ansicht.
- **Alle Schichten:** ein Feld darf nie gleichzeitig als Domain-Korrelation und Trace-ID verwendet werden.

---

## Architektur-Notiz: Warum die Trennung zukunftsfaehig ist

Die Trennung von Intent-Korrelation (`data.correlation_id`) und Trace-Kontext (`request_id`) verhindert semantische Drift bei neuen Transportwegen, Retrys, Bridge-Services und Multi-ESP-Routing. Domain-Zustandsuebergaenge bleiben stabil, waehrend Tracing unabhaengig erweitert werden kann (z. B. OpenTelemetry, Request-Fans, Replay-Pipelines), ohne Matching-Regeln neu zu definieren.

---

## Deliverables (pflichtig)

- `.claude/reports/current/contract-config-events-v1.md` (oder als Abschnitt im Auftragsergebnis mit identischer Ueberschrift)
- Mapping-Tabelle "legacy/fallback -> contract signal"
- Explizite Regelmatrix fuer Matching vs Tracing
- Kurze Architektur-Notiz "Warum diese Trennung zukunftsfaehig ist"

---

## Testmatrix (Mindestumfang)

- T1: Alle 3 Config-Events enthalten `data.correlation_id` als Pflicht.
- T2: Fehlende Korrelation produziert Contract-Signal, keinen stillen Erfolg.
- T3: `request_id` vorhanden/fehlend aendert Matching nicht.
- T4: envelope/data divergence wird als eigener Fall markiert.
- T5: `config_published` kann niemals terminalisieren, auch nicht bei `status=applied`.
- T6: `config_response` finalisiert nur bei erlaubtem `data.status` und valider Korrelation.
- T7: `config_failed` finalisiert nur mit `data.error.code`; ohne Code = Contract-Verletzung.
- T8: Frontend-Gruppierung bleibt identisch, egal ob `request_id` rotiert oder fehlt.

---

## Abnahmekriterien

- [ ] Es gibt eine eindeutige, dokumentierte Trennung Intent-Korrelation vs Request-Trace.
- [ ] Kein Matching-Pfad nutzt `request_id` als Korrelation.
- [ ] Contract-Verletzungen sind explizit modelliert und sichtbar.
- [ ] Die IST->ZIEL Migrationsbruecke (`correlation_id`/Status/Fehlerstruktur) ist explizit dokumentiert und ohne stille Feldsubstitution umgesetzt.
- [ ] Folgebereiche B-E koennen den Vertrag direkt konsumieren, ohne neue Feldsemantik zu erfinden.

Wenn Begriffe/Felder zwischen Schichten weiter unterschiedlich interpretiert werden, gilt Bereich A als nicht bestanden.
