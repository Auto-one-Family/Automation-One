# Analyseauftrag Open Point 06: NVS Namespace-Ownership und Transaktionsstabilitaet

**Typ:** Eigenstaendiger Analyseauftrag  
**Prioritaet:** P1  
**Ziel:** Namespace-Konflikte und "kein Namespace offen"-Fehler im Persistenzpfad eliminieren.

## 1) Problemkern

Logsignale wie:
- "Namespace already open, closing first"
- "No namespace open for getString"

zeigen inkonsistente Ownership im Storage-Zugriff.  
Das ist ein starker Hinweis auf konkurrierende oder unsauber segmentierte Persistenzzugriffe.

## 2) Zielzustand

Jeder Persistenzzugriff ist transaktional eindeutig:

1. Namespace oeffnen,
2. lesen/schreiben,
3. commit/rollback,
4. sauber schliessen.

Kein Zugriff darf ausserhalb einer gueltigen Session erfolgen.

## 3) Pflichtanalyse

1. Mapping aller parallelen Storage-Zugriffe (Tasks/Threads/ISR-nahe Pfade).
2. Ownership- und Lock-Reihenfolge pruefen.
3. Fehlerpfade auf fruehe Returns/fehlendes close pruefen.
4. Read-/Write-Mischpfade unter Last simulieren.

## 4) Fixanforderungen

1. Einheitliche Storage-Session-API verpflichtend.
2. Locking-Policy fuer Namespace-Lebensdauer (nicht nur pro Einzeloperation).
3. Harte Guard-Regel: kein `get/put` ohne aktive Session.
4. Telemetrie:
   - `storage_namespace_conflict_count`
   - `storage_no_session_access_count`

## 5) Abnahmekriterien

- [ ] Keine Namespace-Konfliktwarnung unter Lasttest.
- [ ] Keine "No namespace open"-Fehler.
- [ ] Persistenz bleibt bei Parallelitaet konsistent.
- [ ] Fehlerzaehler bleiben in Soak-Tests bei 0.

