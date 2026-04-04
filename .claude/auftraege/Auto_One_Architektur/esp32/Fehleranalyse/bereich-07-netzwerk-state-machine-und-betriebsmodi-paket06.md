# Bereich 07 - Netzwerk-State-Machine und Betriebsmodi (IST-Revision 2026-04-04)

> Fokus: Moduswechsel, ACK/Liveness-Semantik und Offline->Online-Rueckfuehrung.

## 1) Was war veraltet?

- Die alte Fassung war als reine FA-Liste ohne einheitliche Revisionsstruktur aufgebaut.
- Netzwerk-, Persistenz- und Betriebsmodusrisiken waren nicht als priorisierte Endlage konsolidiert.

## 2) Was ist jetzt der IST-Stand?

- `FA-NET-001`: Gate-Timeout kann weiterhin ONLINE ohne valides ACK freigeben.
- `FA-NET-002`: `server/status=online` kann semantisch mit ACK-Autoritaet kollidieren.
- `FA-NET-003`: Persistenzfehler im OFFLINE->ONLINE-Reset bleiben kritisch fuer Runtime/NVS-Konsistenz.
- `FA-NET-004`: Legacy-No-Task-Pfad bleibt nicht timing-aequivalent zum RTOS-Pfad.
- `FA-NET-005`: Provisioning-Fallback kann bei Dauerinstabilitaet zu Flattern fuehren.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-NET-001`, `FA-NET-002`, `FA-NET-003`.
- **P1:** `FA-NET-005`.
- **P2:** `FA-NET-004`.

## 4) Was wurde in der Datei konkret angepasst?

- Datei auf das verbindliche 4-Block-IST-Format umgestellt.
- `FA-NET-*` Befunde als priorisierte Betriebsrisiken konsolidiert.
- Abnahmekriterien fuer Netzwerk-/ACK-Autoritaet ergaenzt.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn ACK-Autoritaet, Reset-Drift und Betriebsmodusrisiken getrennt priorisiert sind.
- **Nicht bestanden**, wenn Liveness- und Reconciliation-Pfade ohne klare Prioritaetsgates verbleiben.

