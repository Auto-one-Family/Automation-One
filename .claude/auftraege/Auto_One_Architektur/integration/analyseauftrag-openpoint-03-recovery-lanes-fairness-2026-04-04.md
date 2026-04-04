# Analyseauftrag Open Point 03: Recovery-Lanes und Fairness unter Last

**Typ:** Eigenstaendiger Analyseauftrag  
**Prioritaet:** P1  
**Ziel:** Nachweisen und haerten, dass kritische Recovery-Pfade unter Last nicht von Normalverkehr verdraengt werden.

## 1) Problemkern

Punktuelle Priorisierung einzelner Kommandos reicht nicht aus, wenn mehrere Queues und Pfade gleichzeitig Last erzeugen.  
Ohne einheitliches Lane-Modell kann es zu Starvation kritischer Pfade kommen.

## 2) Zielzustand

Systemweit konsistentes Prioritaetsmodell:

- `critical_recovery`
- `critical`
- `normal`

mit garantierter Drain-Quote und klarer Admission-Policy.

## 3) Pflichtanalyse

1. Bestimme alle Ingress-/Drain-Pfade fuer sensor, actuator, config, publish.
2. Pruefe Queue-full Verhalten je Klasse.
3. Simuliere Dauerlast + Recovery-Ereignisse parallel.
4. Messe Latenz und Durchsatz je Lane.

## 4) Fixanforderungen

1. Einheitliche Lane-Klassifizierung fuer alle relevanten Queue-Items.
2. Admission-Codes je Klasse (`retry`, `reject`, `defer`) verbindlich.
3. Deterministische Drain-Quote je Zyklus.
4. Telemetrie:
   - queue depth je Lane,
   - starvation counter,
   - critical latency p95/p99.

## 5) Abnahmekriterien

- [ ] Kritische Recovery-Items werden unter Last reproduzierbar bevorzugt.
- [ ] Keine stille Verdrangung kritischer Klassen.
- [ ] Queue-full Entscheidungen sind konsistent und nachvollziehbar.
- [ ] Lasttests zeigen stabile Finalisierung kritischer Flows.

