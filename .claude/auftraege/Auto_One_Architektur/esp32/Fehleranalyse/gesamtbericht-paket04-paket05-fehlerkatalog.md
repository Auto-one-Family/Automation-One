# Gesamtbericht - Fehlerkatalog Paket 04 + Paket 05

> **Typ:** Konsolidierter Fehlerbericht  
> **Stand:** 2026-04-04 (Schritt 13, vollabgeglichen mit Schritten 1-12)  
> **Scope:** Reboot/Powerloss/Speicherkonsistenz + Safety/Failsafe/Wirksamkeit  
> **Quellenbasis:** `bereich-01` bis `bereich-11`, Schwerpunkt `bereich-05-*` und `bereich-06-*`

---

## 1) Was war veraltet?

- Der vorherige Bericht enthielt noch Sammel-Fehler ohne klare Trennung zwischen "weiterhin offen" und "teilweise bereits gehaertet".
- `FA-P14-003`, `FA-P14-005` und `FA-P14-006` waren als pauschal kritisch dargestellt; laut Bereichsrevision sind diese heute nur noch als teiloffene Restluecken gueltig.
- `FA-SAF-*` aus `bereich-05-safety-und-failsafe-kette.md` war im alten Paket-04/05-Gesamtbild nicht integriert.
- Die alte Priorisierung hatte keine eindeutige Matrix, die Paket-04/05 mit querliegenden Integrationsrisiken aus den Schritten 7-12 verknuepft.

---

## 2) Was ist jetzt der IST-Stand?

### 2.1 Kritische Restluecken (P0)

1. **FA-P14-001** - Fehlende transaktionale Atomik ueber Persistenz-Domaenen bleibt offen.  
2. **FA-P14-002** - Runtime-vs-NVS Drift bei Write-Fails weiterhin sicherheitsrelevant offen.  
3. **FA-P14-008** - Neuer Konsistenzbruch durch gemischte Persistenzpfade fuer `is_active`.  
4. **FA-SAF-001** - Emergency-Auth kann fail-open bleiben (kritischer Gate-Fehler).  
5. **FA-CFG-001 / FA-OBS-002 / FA-E2E-002** - Parse/Apply-Fehler sind nicht in allen Pfaden terminal als `error|timeout` geschlossen.

### 2.2 Hohe Restluecken (P1)

1. **FA-P14-004 / FA-P15-004 / FA-OBS-001 / FA-E2E-003** - Queue-Drops ohne durchgaengige terminale Rueckmeldung und Kausalitaet.  
2. **FA-P15-005** - Kaltstart-/Reentry-Gates policy-seitig vorhanden, Nachweislogik noch nicht hart operationalisiert.  
3. **FA-P15-006 / FA-COR-005** - Emergency priorisiert, Queue-Nachlaufbehandlung weiterhin unvollstaendig formalisiert.  
4. **FA-P15-007 / FA-NET-002 / FA-E2E-004** - ACK-/Online-Semantik noch nicht in allen Grenzpfaden eindeutig getrennt.

### 2.3 Mittlere Restluecken (P2)

1. **FA-P14-003** - Deterministische Negativpfade sind weitgehend vorhanden, aber nicht vollstaendig in allen Ketten verifiziert.  
2. **FA-P14-005 / FA-P15-003** - Blindphase und uneinheitliche Guard-Haerte sind reduziert, aber nicht vollstaendig eliminiert.  
3. **FA-P14-006** - Teilpersistenz bei Rule-Status verbessert, globale Drossel-/Debounce-Wirkung noch nicht voll belegt.  
4. **FA-P14-007 / FA-NET-004** - Legacy-No-Task-Pfad bleibt als Randrisiko fuer Reproduzierbarkeit bestehen.

---

## 3) Prioritaetsmatrix (Paket 04/05 konsolidiert)

| Fehler-ID | Prioritaet | Status | Kernwirkung |
| --- | --- | --- | --- |
| FA-P14-001 | P0 | offen | Nicht-atomische Mehrbereichs-Persistenz |
| FA-P14-002 | P0 | offen | Drift zwischen Runtime und NVS |
| FA-P14-008 | P0 | offen (neu) | Inkonsistente `is_active`-Wahrheit |
| FA-SAF-001 | P0 | offen | Fail-open im Emergency-Zugang |
| FA-CFG-001 / FA-OBS-002 / FA-E2E-002 | P0 | offen | Fehlende terminale Negativabschluesse |
| FA-P14-004 / FA-P15-004 / FA-OBS-001 | P1 | offen | Queue-Drops ohne harte Abschlusssemantik |
| FA-P15-005 | P1 | offen | Reentry/Kaltstart ohne harte Evidenz-Gates |
| FA-P15-006 / FA-COR-005 | P1 | offen | Unklarer Emergency-Nachlauf |
| FA-P15-007 / FA-NET-002 | P1 | offen | ACK/Liveness-Semantikdrift |
| FA-P14-003 | P2 | teilweise behoben | NACK-Pfade verbessert, nicht voll abgeschlossen |
| FA-P14-005 / FA-P15-003 | P2 | teilweise behoben | Guard-/Blindphasen-Restthemen |
| FA-P14-006 | P2 | teilweise behoben | Teilpersistenz verbessert, Nachweisluecke bleibt |
| FA-P14-007 / FA-NET-004 | P2 | offen | Legacy-Randpfad ohne Timing-Aequivalenz |

---

## 4) Welche Restluecken bleiben?

- Kein verbindlicher Endvertrag "jede kritische Anfrage endet terminal" ueber alle Fehlerarten hinweg.
- Drift wird noch nicht durchgaengig als verpflichtender Degraded-Zustand inklusive Eskalationspfad transportiert.
- Paket-04/05-Sicherheitslogik ist lokal staerker als zuvor, aber E2E-gekoppelte Nachweise (Firmware -> Server -> DB -> UI) sind als harte Gates noch unvollstaendig.
- Offene Punkte mit externer Verifikation bleiben bestehen, insbesondere bei Reboot-Stress, Queue-Full-Storms und Legacy-Mode-Pfaden.

---

## 5) Was wurde in der Datei konkret angepasst?

- Vollstaendige Neustruktur auf die vier Pflichtbloecke der Auftragsserie umgestellt.
- Veraltete Sammelaussagen entfernt und durch statusklare Einordnung ersetzt (`offen`, `teilweise behoben`, `neu`).
- `FA-P14-008` und `FA-SAF-001` als kritische Luecken in die Paket-04/05-Konsolidierung aufgenommen.
- Prioritaetsmatrix mit uebergreifender ID-Verknuepfung zu Config/Observability/E2E eingefuehrt.
- Vollabgleich gegen die Bereichsergebnisse 1-12 bestaetigt: fuer Paket 04/05 ergaben sich keine zusaetzlichen P0/P1-Deltas.
- Navigations- und Konsistenzbezug auf die Schritte 1-12 explizit gemacht.

---

## 6) Abnahmekriterien (Bestanden/Nicht bestanden)

- **AK-13-04-05-01:** Alle offenen Punkte aus `bereich-05-reboot-powerloss-und-speicherkonsistenz-paket04.md` und `bereich-06-safety-policy-und-wirksamkeit-paket05.md` sind mit Prioritaet im Gesamtbericht enthalten.  
- **AK-13-04-05-02:** Teilweise ueberholte Findings (`FA-P14-003`, `FA-P14-005`, `FA-P14-006`) sind nicht mehr als vollkritisch dargestellt.  
- **AK-13-04-05-03:** Mindestens eine konsolidierte Matrix verknuepft Paket-04/05-Risiken mit Observability/E2E-Contracts.  
- **AK-13-04-05-04:** Die Datei bildet einen klaren IST-Stand ab und markiert offene Verifikation explizit.
