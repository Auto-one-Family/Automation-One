# Analyse- und Fixauftrag Bereich D: Firmware Strict-Contract statt stiller Fallback-Heilung

**Stand:** 2026-04-04  
**Prioritaet:** P0  
**Typ:** Firmware Schwerpunkt (Config-Pfad, Korrelation, Outcome-Semantik)

---

## Hauptauftragsdokument (verbindliche Referenz)

- `/.claude/reports/current/auftragsserie-config-korrelation-restgaps-2026-04-04.md`
- Serienindex: `/.claude/auftraege/Auto_One_Architektur/integration/auftragsserie-config-korrelation-restgaps-2026-04-04.md`
- Bereich A ist Pflichtvoraussetzung.

---

## Spezifischer Bereich dieses Auftrags

Dieser Auftrag ersetzt semantisch problematische Fallback-Heilung bei fehlender Korrelation durch **explizite Contract-Sichtbarkeit** in der Firmware.

Wichtig: Resilienz bleibt erhalten (kein Pipeline-Stop), aber Contract-Verletzung darf nicht mehr wie normaler Erfolg aussehen.

---

## Scope (muss erledigt werden)

1. Audit aller Stellen, die Config-Korrelation setzen/ersetzen/weiterreichen.
2. Einheitliche Korrelationsquelle pro Intent fuer Outcome + Response.
3. Entfernen oder isolieren stiller Fallback-ID-Heilung in terminalen Business-Pfaden.
4. Contract-Fehlerfall als eigener Error-/Outcome-Code sichtbar machen.

---

## Relevante Module

- `El Trabajante/src/services/config/config_manager.cpp`
- `El Trabajante/src/services/communication/mqtt_client.cpp`
- `El Trabajante/src/main.cpp`
- `El Trabajante/src/models/error_codes.h`
- `El Trabajante/src/utils/topic_builder.cpp`
- ggf. zugehoerige Header in `services/config/` und `services/communication/`

---

## Konsistenz- und Pattern-Regeln (verbindlich)

- Server-centric bleibt unberuehrt: keine neue Business-Logik auf ESP32.
- Kein stilles Auffuellen fehlender Korrelation im terminalen Contract-Pfad.
- Eine Intent-Korrelation, eine Bedeutung, alle Emissionen konsistent.
- `request_id` nur optionales Diagnosefeld.
- Safety-/RTOS-Invarianten bleiben bestehen (non-blocking, watchdog-sicher, queue-safe).

---

## Umsetzungsauftrag (konkret)

1. Korrelation-Bestandsaufnahme:
   - Wo entstehen `fw_cfg_*` / `corr_*`-Fallbacks?
   - Welche Pfade betreffen terminale Config-Outcomes?
2. Strict-Contract Pfad einziehen:
   - Fehlende `correlation_id` -> eigener Contract-Error/Outcome statt "normal success/failure".
3. Korrelationsquelle vereinheitlichen:
   - Gleiche ID in `publishIntentOutcome`, Config-Response und Fehler-/Abbruchpfaden.
4. Lexikon-Anbindung vorbereiten:
   - Neuer Firmware-Contract-Code in `error_codes.h` dokumentieren und upstream-faehig emitten.
5. Resilienz pruefen:
   - Queue/Retry-Verhalten bleibt robust, aber Contract-Verletzung bleibt sichtbar.

---

## Deliverables (pflichtig)

- Liste der geaenderten Fallback-Pfade (vorher/nachher Semantik)
- Nachweis "Outcome-ID == Response-ID" pro Intent-Fall
- Neuer Contract-Fehlercode inkl. Kurzbeschreibung, Severity, Operator-Aktion
- Kurze Notiz "Resilienz erhalten, Semantik geschaerft"

---

## Testmatrix (Mindestumfang)

- T1: Fehlende `correlation_id` fuehrt zu Contract-Error, nicht zu regulaerem Erfolg.
- T2: Outcome und Config-Response tragen dieselbe Korrelation.
- T3: Retry/Reconnect verschluckt Contract-Verletzung nicht.
- T4: Bestehender Happy Path bleibt unveraendert erfolgreich.

---

## Abnahmekriterien

- [ ] Keine stille Fallback-Heilung in terminalen Config-Pfaden.
- [ ] Contract-Verletzung ist als eigener Code/Outcome sichtbar.
- [ ] Korrelationsfluss bleibt je Intent ueber Emissionen konsistent.
- [ ] Firmware bleibt safety- und runtime-konform (kein Blockieren, kein Watchdog-Risiko).

Wenn fehlende Korrelation weiterhin als regulaerer "gruener" Abschluss im Upstream ankommt, gilt Bereich D als nicht bestanden.
