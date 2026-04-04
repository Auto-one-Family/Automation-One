# Analyse- und Fixauftrag Bereich C: Server-Randhaertung (Envelope, Trace, API-Callsites)

**Stand:** 2026-04-04  
**Prioritaet:** P0  
**Typ:** Server Schwerpunkt (Contract-Projektion + API-Randhaertung)

---

## Hauptauftragsdokument (verbindliche Referenz)

- `/.claude/reports/current/auftragsserie-config-korrelation-restgaps-2026-04-04.md`
- Serienindex: `/.claude/auftraege/Auto_One_Architektur/integration/auftragsserie-config-korrelation-restgaps-2026-04-04.md`
- Bereich A ist Pflichtvoraussetzung.

---

## Spezifischer Bereich dieses Auftrags

Dieser Auftrag haertet die serverseitigen **Contract-Raender**, damit:

- envelope/data drift nicht mehr unsichtbar bleibt,
- optionaler Trace (`request_id`) standardisiert transportiert wird,
- API-Callsites `send_config()` semantisch korrekt auswerten.

Kernziel: Keine operative Fehleinschaetzung durch "technisch ok aussehende", aber semantisch falsche Randfaelle.

---

## Scope (muss erledigt werden)

1. Drift-Regel fuer top-level/envelope vs `data.correlation_id`.
2. Optionales `data.request_id` fuer Config-Eventprojektion.
3. Korrektur aller `send_config()`-Callsites auf `success`-Semantik.
4. Metriken fuer die drei Rest-Gaps getrennt erfassbar machen.

---

## Relevante Module

- `El Servador/god_kaiser_server/src/websocket/manager.py`
- `El Servador/god_kaiser_server/src/services/event_contract_serializers.py`
- `El Servador/god_kaiser_server/src/services/esp_service.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py`
- `El Servador/god_kaiser_server/src/core/metrics.py`
- `El Servador/god_kaiser_server/src/api/v1/sensors.py`
- `El Servador/god_kaiser_server/src/api/v1/actuators.py`
- `El Servador/god_kaiser_server/src/api/v1/logic.py`

---

## Konsistenz- und Pattern-Regeln (verbindlich)

- Fachliche Autoritaet bleibt `data.correlation_id`.
- Envelope-Korrelation ist Transportkontext und darf Domain-Korrelation nicht ueberschreiben.
- API darf Versandresultate nicht implizit truthy/falsy deuten.
- Beobachtbarkeit muss Contract-Fehler von Domain-Fehlern trennen.
- Async/Repository/Schema-Regeln des Backends bleiben ungebrochen.

---

## Umsetzungsauftrag (konkret)

1. Drift Detection:
   - Wenn envelope-Korrelation und `data.correlation_id` beide vorhanden und ungleich, Contract-Mismatch emittieren/loggen.
2. Serializer-Haertung:
   - `request_id` als optionales Datenfeld in Config-Projektionen standardisieren.
3. API-Callsite Audit:
   - Alle `if config_sent:` auf `if config_sent.get("success"):` umstellen.
4. Metriken:
   - Counter fuer `missing_correlation`, `envelope_data_divergence`, `contract_mismatch`.
5. Tests:
   - Regressionstest fuer bestehende Happy Paths,
   - gezielte Tests fuer Drift/Trace/Callsite-Failure.

---

## Deliverables (pflichtig)

- Callsite-Auditliste (Fundstelle + Altlogik + Neulogik)
- Metrikdefinition (Name, Zweck, Trigger, Dashboard-Zuordnung)
- Testnachweis fuer envelope/data divergence
- Testnachweis fuer `send_config()` failure visibility

---

## Testmatrix (Mindestumfang)

- T1: Envelope/Data-Divergenz erzeugt Contract-Signal.
- T2: `request_id` vorhanden/fehlend aendert Intent-Matching nicht.
- T3: `send_config()`-Failure wird API-seitig korrekt als Fehler behandelt.
- T4: Happy Path Publish/ACK bleibt unveraendert funktional.

---

## Abnahmekriterien

- [ ] Envelope/Data-Divergenz ist technisch und operativ sichtbar.
- [ ] API-Raender koennen Publish-Failures nicht mehr still uebersehen.
- [ ] `request_id` ist verfuegbar, aber nie Matching-Schluessel.
- [ ] Server bleibt pattern-konform (async sauber, klare Serialisierungsgrenzen, testabgesichert).

Wenn weiterhin ein fehlgeschlagener `send_config()`-Versand durch truthy Dict-Pruefung als erfolgreich durchrutschen kann, gilt Bereich C als nicht bestanden.
