# Analyseauftrag Open Point 07: `hist NOT_FOUND` Klassifikation und Log-Hygiene

**Typ:** Eigenstaendiger Analyseauftrag  
**Prioritaet:** P2  
**Ziel:** Erwartbare Missing-Key-Faelle von echten Persistenzfehlern trennscharf unterscheiden.

## 1) Problemkern

Wiederkehrende `NOT_FOUND`-Meldungen fuer optionale Historien-Keys erzeugen Lograuschen.  
Ohne Klassifikation werden zwei Dinge schwieriger:

1. schnelle Incident-Analyse,
2. automatisierte Abnahme, weil echte Fehler im Rauschen untergehen.

## 2) Zielzustand

`NOT_FOUND` wird semantisch klassifiziert:

- `expected_not_found` (z. B. Erststart/optionaler Key)
- `unexpected_missing_key` (inkonsistenter Zustand)

mit abgestufter Severity und Aktionsempfehlung.

## 3) Pflichtanalyse

1. Liste aller `hist`-Lesezugriffe und deren Kontext erstellen.
2. Erwartbare vs unerwartbare Faelle definieren.
3. Logging- und Error-Tracking-Regeln je Klasse festlegen.

## 4) Fixanforderungen

1. Klassifikator fuer Missing-Key-Faelle einbauen.
2. Severity-Mapping:
   - expected -> INFO/DEBUG,
   - unexpected -> WARNING/ERROR.
3. Counter einführen:
   - `hist_not_found_expected_count`
   - `hist_not_found_unexpected_count`
4. Alarmierung nur fuer unerwartbare Faelle.

## 5) Abnahmekriterien

- [ ] Erwartbare Missing-Key-Faelle erzeugen kein Fehlalarm-Rauschen.
- [ ] Unerwartbare Missing-Key-Faelle bleiben klar sichtbar.
- [ ] Diagnosequalitaet in Langlauf/Soak verbessert sich messbar.
- [ ] Logauswertung bleibt maschinell stabil.

