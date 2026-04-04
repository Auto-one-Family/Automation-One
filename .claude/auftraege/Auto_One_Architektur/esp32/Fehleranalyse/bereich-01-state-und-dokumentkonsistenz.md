# Bereich 01 - State- und Dokumentkonsistenz (IST-Revision 2026-04-04)

> Fokus: Terminologie, Zustandsbezeichnungen, Triggerkonsistenz und Referenzhygiene.

## 1) Was war veraltet?

- Die alte Fassung war als reine FA-Liste aufgebaut und nicht im 4-Block-IST-Format.
- Historische `copy`-Dateipfade waren als Risiko referenziert; die Struktur ist inzwischen auf kanonische Dateinamen ohne `copy` bereinigt.

## 2) Was ist jetzt der IST-Stand?

- `FA-STR-001`: Referenzdrift ist strukturell reduziert, weil Paketdateien kanonisch vorliegen.
- `FA-STR-002`: Zustandsbenennung bleibt semantisch uneinheitlich (`SAFE_MODE` vs `SAFE_MODE_PROVISIONING`) und ist dokumentarisch weiter offen.
- `FA-STR-003`: ACK-Timeout-Startzustand ist zwischen Dokumenten nicht durchgaengig deckungsgleich.
- `FA-STR-004`: Legacy-Laufzeitmodus ist als Betriebsrealitaet vorhanden, aber nicht als formaler Enum-State modelliert.
- `FA-STR-005`: Trigger-Semantik fuer `server/status` vs `heartbeat/ack` ist weiterhin als potenziell ambig zu behandeln.

## 3) Welche Restluecken bleiben?

- **P1:** `FA-STR-002`, `FA-STR-003` (Terminologie-/State-Drift in Kernpfaden).
- **P2:** `FA-STR-004`, `FA-STR-005` (Diagnose-/Kausalitaetsdrift in Randpfaden).
- **P2:** formale Referenzvalidierung zwischen Paketdokumenten fehlt weiterhin.

## 4) Was wurde in der Datei konkret angepasst?

- Auf ein einheitliches IST-Revisionsformat umgestellt.
- Alte, inzwischen bereinigte `copy`-Referenzlage als historisch markiert.
- Verbleibende Luecken als priorisierte Cluster (`P1`/`P2`) konsolidiert.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn Terminologie-, Trigger- und Referenzrisiken getrennt und priorisiert beschrieben sind.
- **Nicht bestanden**, wenn alte Dateistruktur- oder `copy`-Annahmen ungeprueft fortgeschrieben werden.

