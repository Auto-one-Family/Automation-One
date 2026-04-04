# Bereich 06 - Safety-Policy und Wirksamkeit (IST-Revision 2026-04-04)

> Fokus: Safety-Policy, Wirksamkeit unter Stoerung und verbleibende Safety-Restluecken.

## 1) Was war veraltet?

- Die alte Fassung war detailliert, aber nicht im einheitlichen IST-Revisionsformat strukturiert.
- Bereits gehaertete Teilbereiche und echte offene Safety-Risiken waren nicht klar getrennt.

## 2) Was ist jetzt der IST-Stand?

- `FA-P15-001`: Safety bleibt bei Persistenzproblemen funktional, aber ueber Reboot nicht voll deterministisch.
- `FA-P15-002`: Config-Fehlerpfade sind safety-relevant, NACK-/Contract-Haertung bleibt unvollstaendig.
- `FA-P15-003`: NaN/Stale/Suspect-Guards sind nicht ueberall gleich streng operationalisiert.
- `FA-P15-004`: Queue-Drops sind fuer Safety weiter nur teilweise beobachtbar.
- `FA-P15-005`: Kaltstart-/Reentry-Gates sind konzeptionell stark, aber als harte Nachweislogik offen.
- `FA-P15-006`: Emergency ist priorisiert, Nachlaufbehandlung bleibt formal unvollstaendig.
- `FA-P15-007`: ACK-Reentry robust, aber Sequenz-/Zeitbezug nicht voll vertraglich erzwungen.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-P15-001`, `FA-P15-002`.
- **P1:** `FA-P15-004`, `FA-P15-005`, `FA-P15-006`.
- **P2:** `FA-P15-003`, `FA-P15-007`.

## 4) Was wurde in der Datei konkret angepasst?

- Auf das einheitliche 4-Block-IST-Schema umgestellt.
- Safety-Befunde als Prioritaetscluster (P0/P1/P2) konsolidiert.
- Abnahmekriterien fuer Safety-Wirksamkeit und Reboot-Robustheit ergaenzt.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn alle `FA-P15-*` Punkte priorisiert und mit Wirkungsebene erfasst sind.
- **Nicht bestanden**, wenn Policy- und Wirksamkeitsluecken ohne Prioritaets-/Gatebezug verbleiben.

