# Analyse- und Fixauftrag: NVS-Offline-Rules-Migration und Runtime-Validitaet

**Stand:** 2026-04-04  
**Typ:** Verbindlicher Analyse- und Umsetzungsauftrag  
**Prioritaet:** P0/P1 (kritisch fuer Reset-Readiness)  
**Ziel:** Sicherstellen, dass migrierte oder geladene Offline-Regeln nur dann als gueltige Runtime-Basis zaehlen, wenn sie semantisch vollstaendig und ausfuehrbar sind.

---

## 1) Problemkern

Im aktuellen Lauf treten beim Start mehrfach `NOT_FOUND` fuer alte Offline-Rule-Einzelkeys auf.  
Direkt danach wird eine Migration nach Blob-Format gemeldet, jedoch mit inhaltlich ungueltigen Rules:

- `sensor GPIO 255 (INVALID)`
- `actuator GPIO 255 (INVALID)`
- `type NONE`
- `enabled=0`, `is_active=0`

Trotzdem werden diese Eintraege als "2 Regeln" geführt.  
Das kann Readiness-/Pending-Entscheidungen verfälschen, weil reine Anzahl statt semantischer Gueltigkeit bewertet wird.

---

## 2) Kritische Risiken

1. **False-Ready-Risiko (P0)**
   - Das System kann eine formal "vorhandene" Regelbasis sehen, obwohl fachlich keine ausfuehrbare Regel existiert.

2. **Pending-Exit-Fehlentscheidung (P0/P1)**
   - `CONFIG_PENDING_AFTER_RESET` kann zu frueh verlassen werden, wenn nur Counts geprueft werden.

3. **Persistenz-Korrumpierung (P1)**
   - Ungueltige Migrationsartefakte werden als neue Wahrheit in NVS-Blob geschrieben.

4. **Diagnose-Irrefuehrung (P1)**
   - Logs signalisieren "Rules vorhanden", obwohl die Rules praktisch funktionslos sind.

---

## 3) Verbindliche Zielregeln

1. Eine Offline-Regel zaehlt nur als **gueltig**, wenn alle Pflichtfelder semantisch gueltig sind:
   - gueltiger Sensortyp/Quelle,
   - gueltiger Sensor-GPIO,
   - gueltiger Aktor-GPIO,
   - gueltiger Regelmodus/Schwellwerte,
   - aktivierbarer Zustand.

2. Migration darf nur dann "erfolgreich" sein, wenn mindestens die gueltigen Regeln korrekt uebernommen wurden.

3. Ungueltige migrierte Eintraege duerfen nicht als Readiness-Basis zaehlen.

4. Readiness/Pending-Exit muss auf `valid_offline_rule_count` basieren, nicht auf roher Eintragsanzahl.

---

## 4) Konkrete Befunde aus dem Lauf (Evidenz)

```text
getString(): nvs_get_str len fail: ofr_0_svtyp NOT_FOUND
getBytesLength(): nvs_get_blob len fail: ofr_0_actb NOT_FOUND
...
[CONFIG] NVS migrated 2 rules from individual keys to blob format
[CONFIG] Rule 0: ... sensor GPIO 255 (INVALID) -> actuator GPIO 255 (INVALID) | NONE ...
[CONFIG] Rule 1: ... sensor GPIO 255 (INVALID) -> actuator GPIO 255 (INVALID) | NONE ...
```

Diese Kombination zeigt: Migration wird als erfolgt gemeldet, aber inhaltlich nicht validiert genug.

---

## 5) Fixauftrag (umsetzungsnah)

## F1 - Harte Validierung in der Migrationspipeline

1. Vor Blob-Write jede migrierte Regel validieren.
2. Ungueltige Regeln:
   - nicht als aktiv nutzbar markieren,
   - nicht in `valid_offline_rule_count` aufnehmen,
   - mit strukturiertem Reason-Code protokollieren.
3. Migrationsergebnis in Klassen ausgeben:
   - `MIGRATION_OK_WITH_VALID_RULES`
   - `MIGRATION_PARTIAL_INVALID_RULES`
   - `MIGRATION_NO_VALID_RULES`

## F2 - Readiness-/Pending-Checks auf valide Regeln umstellen

1. Neue Kennzahl: `valid_offline_rule_count`.
2. Exit aus `CONFIG_PENDING_AFTER_RESET` nur bei gueltiger Mindestbasis:
   - nicht nur Count > 0,
   - sondern Count gueltiger Regeln > 0.

## F3 - Persistenzschutz gegen Schrottzustand

1. Blob-Commit nur mit validiertem Datensatz.
2. Bei ausschliesslich ungueltigen Migrationsdaten:
   - kein "success"-Signal,
   - Runtime bleibt in Pending,
   - expliziter Nachladepfad via Config-Push.

## F4 - Telemetrie und Forensik

1. Counter:
   - `offline_rule_migration_attempt_count`
   - `offline_rule_migration_valid_count`
   - `offline_rule_migration_invalid_count`
   - `offline_rule_migration_no_valid_count`
2. Structured Event pro Migration:
   - `source_format`
   - `rules_total`
   - `rules_valid`
   - `rules_invalid`
   - `decision_code`

---

## 6) Pflichttests

1. **T1 Nur gueltige Altregeln**
   - Migration -> valid count korrekt, Blob konsistent, Runtime nutzbar.

2. **T2 Gemischt gueltig/ungueltig**
   - Nur gueltige Regeln uebernehmen, invalid sauber markieren.

3. **T3 Nur ungueltige/fehlende Altkeys**
   - Kein false-ready, Pending bleibt aktiv, klarer Decision-Code.

4. **T4 Reset + sofortiger Readiness-Check**
   - Pending-Exit basiert auf valid count, nicht auf roher Rule-Anzahl.

5. **T5 Config-Push nach fehlgeschlagener Migration**
   - Nach validem Push korrekter Exit aus Pending, keine Altartefakt-Stoerung.

---

## 7) Abnahmekriterien

- [ ] Ungueltige migrierte Regeln werden nicht als gueltige Runtime-Basis gezaehlt.
- [ ] `CONFIG_PENDING_AFTER_RESET` kann durch invalide Rules nicht vorzeitig verlassen werden.
- [ ] Migration meldet differenzierte Entscheidungs-/Fehlercodes statt pauschalem "migrated".
- [ ] Blob-Persistenz bleibt semantisch konsistent (kein Schrottzustand als Normalbasis).
- [ ] Telemetrie erlaubt klare Unterscheidung zwischen valid/invalid Migration.

Wenn einer dieser Punkte nicht belegt ist, gilt der Auftrag als nicht bestanden.

