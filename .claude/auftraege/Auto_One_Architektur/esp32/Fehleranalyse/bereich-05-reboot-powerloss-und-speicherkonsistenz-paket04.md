# Bereich 05B - Reboot/Powerloss und Speicherkonsistenz (IST-Revision 2026-04-04)

> Fokus: Reboot-/Power-Loss-Konsistenz, NVS/RAM-Drift und Persistenzdeterminismus.

## 1) Was war veraltet?

- Die vorherige Fassung war sehr detailliert, aber nicht im einheitlichen 4-Block-Revisionsformat.
- Teilweise bereits gehaertete Punkte (`FA-P14-003`, `FA-P14-005`, `FA-P14-006`) waren noch mit offenen Kernrisiken vermischt.

## 2) Was ist jetzt der IST-Stand?

- `FA-P14-001`, `FA-P14-002`: Kritische Persistenz-/Driftthemen ueber mehrere Domaenen bleiben offen.
- `FA-P14-003`: Deterministische Negativpfade fuer Config-Fehler sind deutlich verbessert (teilweise behoben).
- `FA-P14-004`: Queue-Drops vor Reboot bleiben relevant fuer E2E-Determinismus.
- `FA-P14-005`: Warmup-/Blindphase reduziert, aber nicht vollstaendig als Last-/Recovery-Nachweis geschlossen.
- `FA-P14-006`: Teilweise no-op/change-detection vorhanden, globale Drosselstrategie bleibt offen.
- `FA-P14-007`: Legacy-No-Task-Randpfad bleibt reproduzierungs- und timingkritisch.
- `FA-P14-008`: Konsistenzbruch bei `is_active` als kritischer Single-Source-of-Truth-Befund.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-P14-001`, `FA-P14-002`, `FA-P14-008`.
- **P1:** `FA-P14-004`, `FA-P14-006`.
- **P2:** `FA-P14-003`, `FA-P14-005`, `FA-P14-007` (teilweise verbessert, aber nicht voll verifiziert).

## 4) Was wurde in der Datei konkret angepasst?

- Auf ein einheitliches IST-Revisionsformat umgestellt.
- Kritische und teilweise ueberholte P14-Befunde sauber getrennt.
- Prioritaetsbild fuer Reboot-/Powerloss-Risiken konsolidiert.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn kritische Drift-/Persistenzbefunde (`P0`) klar von teilverbesserten Punkten getrennt sind.
- **Nicht bestanden**, wenn teilbehobene Punkte weiter als gleichkritisch mit `P0` gefuehrt werden.

# Bereich 05 - Reboot, Power-Loss und Speicherkonsistenz (Paket 04)

> Fokus: Fehlercluster aus `paket-04-*` mit Ablauf in beide Richtungen (intern/extern), Speichergrenzen, Parallelitaet und Absicherung.

## Systembild fuer diesen Bereich

- **Interner Hauptpfad:** Boot -> Lifecycle/Provisioning Restore -> WiFi/MQTT Init -> Config/Rule Restore -> Runtime-Rebuild.
- **Externer Hauptpfad:** Server sendet Config/Commands -> Core0 nimmt per MQTT an -> Queue-Uebergabe an Core1 -> Core1 Apply + ggf. NVS Persistenz -> Rueckmeldung an Server.
- **Speichergrenzen:** NVS (persistente Basis), RAM (Queues, Caches, Overrides, Timing), teilpersistente Rule-Runtime (`is_active`).

---

## FA-P14-001 - Fehlende transaktionale Atomik ueber mehrere Persistenz-Domaenen

- **Quellbezug:** `FW-CONS-003`, `FW-CONS-010`, `FW-RISK-SAF-001`, `FW-STR-001..004`.
- **Betroffene Module:** Config-Apply, Offline-Rule-Store, Lifecycle/Approval-Persistenz.
- **Wie der Fehler auftritt:**
  1. Ein zusammenhaengendes Update betrifft mehrere Domaenen (z. B. Sensor + Rule + Lifecycle).
  2. Power-Loss oder Write-Fail trifft mitten im Schreibfenster.
  3. Teile sind persistiert, Teile nicht.
- **Interner Ablauf:** Core1 uebernimmt Daten in Runtime, Persistenz folgt in mehreren Schritten; es gibt keine belegte transaktionale Commit-Grenze ueber alle Domaenen.
- **Externe Wirkung:** Server nimmt moeglicherweise an, dass ein logischer Gesamtstand gilt, Firmware startet aber in Mischkonfiguration.
- **Speicherorte:**
  - NVS: Sensor-Config, Rule-Blob, Statusdaten.
  - RAM: Runtime-Schatten waehrend Apply.
- **Parallelaktion/Race:** Gleichzeitige Netzwerkereignisse (neue Config/Commands) waehrend laufender Persistenz vergroessern das Mischzustandsrisiko.
- **Absicherung IST:** Teilweise (CRC/Size fuer Rule-Blob, einzelne Guards).
- **Absicherung fehlt:** Domain-uebergreifender atomarer Commit oder konsistenter Rollback-Marker.
- **Auswirkung:** **kritisch**, weil Reboot in nicht eindeutigem Safety-Startzustand landen kann.

## FA-P14-002 - Runtime-vs-NVS Drift bei safety-relevanten Write-Fails

- **Quellbezug:** `FW-CONS-006`, `FW-CONS-011`, `FW-STR-002`, `FW-STR-004`.
- **Betroffene Module:** Approval/Lifecycle-Persistenz, Rule-Aktivstatus-Persistenz (`is_active`).
- **Wie der Fehler auftritt:**
  1. Runtime nimmt einen Statuswechsel an.
  2. NVS-Write scheitert.
  3. Betrieb laeuft lokal weiter, Reboot laedt jedoch alten Stand.
- **Interner Ablauf:** Der operative Zustand in RAM divergiere von NVS; nach Neustart gewinnt NVS als Source fuer Restore.
- **Externe Wirkung:** Backend sieht ggf. zuletzt gemeldeten Runtime-Stand, Firmware startet danach in anderem Modus.
- **Speicherorte:** RAM-Status vs. persistierte Statusfelder in NVS.
- **Parallelaktion/Race:** Reconnect/ACK-Events kurz nach Write-Fail koennen Drift zusaetzlich verschleiern.
- **Absicherung IST:** Teilweise (Fehler werden als Risiko benannt, aber kein durchgaengiger Drift-Lock).
- **Absicherung fehlt:** harter degradierter Zustand bei Persistenzfehler + verpflichtender Drift-Event.
- **Auswirkung:** **kritisch**, weil Safety-Entscheidung nach Reboot auf stale Status beruhen kann.

## FA-P14-003 - Deterministische Negativpfade fuer Config-Fehler sind weitgehend vorhanden (teilweise ueberholt)

- **Quellbezug:** `FW-CONS-012`, `FW-STR-011` (Revalidierung gegen aktuellen Stand).
- **Betroffene Module:** `config_update_queue`, `main`, `ConfigResponseBuilder`, Intent-Outcome-Pfad.
- **Aktueller Stand:**
  1. Bei Parse-, Payload-, Generation- und Queue-Fehlern existieren deterministische Fehlerpfade.
  2. Fehlerantworten laufen mit `correlation_id` ueber `ConfigResponseBuilder::publishError(...)`.
  3. Ergaenzend wird `publishIntentOutcome(...)` fuer terminale Fehlerausgaenge verwendet.
- **Interner Ablauf:** Negativfaelle sind nicht mehr nur lokal "still", sondern werden in den Kommunikationsvertrag ueberfuehrt.
- **Externe Wirkung:** Server kann Fehlerfaelle deutlich robuster aufloesen und Pending-Daempfung verbessern.
- **Speicherorte:** Keine neue Persistenzgarantie fuer Retry-Journal; Fokus liegt auf deterministischem Fehlerfeedback.
- **Parallelaktion/Race:** Unter Last bleiben Timing-Risiken moeglich, aber nicht mehr als "silent fail" klassifiziert.
- **Absicherung IST:** **deutlich verbessert** (deterministische NACK-/Outcome-Pfade).
- **Absicherung fehlt:** Vollstaendiger End-to-End-Nachweis fuer alle Legacy-Edge-Cases.
- **Auswirkung:** **mittel**, nicht mehr im alten Schweregrad.

## FA-P14-004 - Queue-Drops vor Reboot/unter Last reduzieren Determinismus

- **Quellbezug:** `FW-CONS-014`, `FW-STR-010`.
- **Betroffene Module:** `g_config_update_queue`, Command-Queues, `g_publish_queue`.
- **Wie der Fehler auftritt:**
  1. Lastspitze/Backpressure fuellt Queue.
  2. Non-blocking/kurze Timeouts fuehren zu Drops.
  3. Kurz darauf Reboot/Power-Loss -> verlorene Intents sind unwiederbringlich.
- **Interner Ablauf:** RAM-only Queue-Daten gehen bei Neustart verloren.
- **Externe Wirkung:** Server und Device unterscheiden sich ueber den effektiv letzten verarbeiteten Befehl.
- **Speicherorte:** reine RAM-Queues ohne persistente Journalisierung.
- **Parallelaktion/Race:** Core0 produziert schneller als Core1 konsumiert; gleichzeitige Publish-Last kann Core0 zusaetzlich belasten.
- **Absicherung IST:** teilweise (Logging/CB-Zaehlung).
- **Absicherung fehlt:** Delivery-Contract (NACK/Retry) und priorisierte Behandlung sicherheitsrelevanter Nachrichten.
- **Auswirkung:** **hoch** fuer Nachvollziehbarkeit und Reconciliation.

## FA-P14-005 - Volatile Runtime-Caches erzeugen Rest-Blindphase nach Neustart (teilweise ueberholt)

- **Quellbezug:** `FW-CONS-013`, `FW-MEM-014`, `FW-CONS-008` (Revalidierung gegen aktuellen Stand).
- **Betroffene Module:** `offline_mode_manager`, Sensor Value-Cache, Circuit-Breaker Runtime.
- **Wie der Fehler auftritt:**
  1. Reboot leert RAM-Caches.
  2. Rule-Evaluierung wartet zunaechst auf valide Messwerte.
  3. Bis zum Gate-Pass bleiben Entscheidungen konservativ.
- **Interner Ablauf:** Es existiert inzwischen ein Warmup-Gate (`OFFLINE_WARMUP_VALID_SAMPLES`, Log "warmup gate passed").
- **Externe Wirkung:** Blindphase ist reduziert, aber nicht vollstaendig eliminiert.
- **Speicherorte:** weiterhin primar RAM-getrieben fuer Startphase.
- **Parallelaktion/Race:** Wiederanlauf Sensorzyklen, MQTT-Reconnect und Rule-Eval bleiben zeitlich gekoppelt.
- **Absicherung IST:** **vorhanden und verbessert** (Warmup-Gate + bestehende NaN/Stale-Guards).
- **Absicherung fehlt:** formaler Nachweis der Gate-Wirkung fuer alle Recovery-Varianten.
- **Auswirkung:** **mittel bis hoch** fuer Verfuegbarkeit, niedriger fuer unmittelbare Unsicherheit.

## FA-P14-006 - Rule-Status-Teilpersistenz mit nur teilweiser Schreibdrossel (teilweise ueberholt)

- **Quellbezug:** `FW-STR-004`, `FW-STR-012`, Risiko-Tabelle in Paket 04 (Revalidierung gegen aktuellen Stand).
- **Betroffene Module:** Rule-Transitionen, `saveOfflineRulesToNVS`, NVS-Write-Pfad fuer Rule-Status.
- **Wie der Fehler auftritt:**
  1. Flatternde Eingaben erzeugen haeufige Rule-Transitions.
  2. Persistenzpfade werden wiederholt aktiviert.
  3. Ohne globale Drossel bleiben Burst-Write-Risiken bestehen.
- **Interner Ablauf:** Runtime folgt Echtzeitereignissen; Persistenz zieht nach.
- **Externe Wirkung:** Bei instabilen Bedingungen steigen Drift- und Wear-Risiko.
- **Speicherorte:** NVS fuer Teilstatus + RAM fuer restliche Rule-Runtime.
- **Parallelaktion/Race:** Gleichzeitige Config-Aenderungen und Statuspersistenz konkurrieren weiterhin.
- **Absicherung IST:** **teilweise verbessert** durch no-op/change-detection bei Vollspeicherungen (`saveOfflineRulesToNVS` mit Shadow-Vergleich).
- **Absicherung fehlt:** globale Debounce/Throttle-Strategie ueber alle safety-relevanten Felder.
- **Auswirkung:** **hoch** fuer Langzeitstabilitaet und deterministischen Reboot.

## FA-P14-007 - Legacy-No-Task Modus untergraebt einheitliche Restore-Erwartung

- **Quellbezug:** `FW-CONS-015` (Timing/Isolation-Luecke).
- **Betroffene Module:** Bootpfad/Task-Erstellung, Core-Isolation-Annahmen.
- **Wie der Fehler auftritt:** Deployment startet in Legacy-Variante mit abweichender Ablaufcharakteristik.
- **Interner Ablauf:** Annahmen zu Queue-Isolation und Task-Timing sind nicht 1:1 uebertragbar.
- **Externe Wirkung:** Verhalten unter Last oder nach Reboot weicht geraeteabhaengig ab.
- **Speicherorte:** indirekt betroffen (Queue-Latenz, Reihenfolge von Apply/Publish/ACK).
- **Parallelaktion/Race:** Unterschiedliche Scheduling-Modelle erzeugen schwer reproduzierbare Randfaelle.
- **Absicherung IST:** unklar.
- **Absicherung fehlt:** formale Gleichwertigkeitsdefinition oder klare Deaktivierungsregel fuer Legacy.
- **Auswirkung:** **mittel bis hoch** (insb. fuer Testbarkeit und Feldvergleich).

## FA-P14-008 - Konsistenzbruch durch gemischte Persistenzpfade fuer `is_active` (neu)

- **Quellbezug:** Forensischer Abgleich aktueller Fixlauf (2026-04-04), Rule-Transition- und Restore-Pfade.
- **Betroffene Module:** `offline_mode_manager`, Rule-Blob-v3 Persistenz (`ofr_blob`/`ofr_ver`), Legacy-Key-Pfad (`ofr_%d_state`).
- **Wie der Fehler auftritt:**
  1. Rule-Transition setzt lokal neuen `is_active` Zustand.
  2. Teilpfad persistiert `is_active` weiterhin als Legacy-Key.
  3. Haupt-Restore liest Rule-Zustand aus Blob-v3.
  4. Nach Reboot erscheint der Blob-Stand (potenziell veraltet), nicht zwingend der letzte lokale Rule-Status.
- **Interner Ablauf:** Zwei konkurrierende Sources of Truth fuer denselben semantischen Zustand.
- **Externe Wirkung:** Beobachtbares Reboot-Verhalten kann den zuletzt erreichten Rule-Zustand widersprechen.
- **Speicherorte:** NVS Legacy-Keyspace vs. NVS Blob-v3.
- **Parallelaktion/Race:** Schnelle Rule-Transitions vor Reboot verstaerken die Inkonsistenz.
- **Absicherung IST:** keine harte Vereinheitlichung auf ein Persistenzschema.
- **Absicherung fehlt:** eindeutiges Single-Schema fuer `is_active` inkl. Migrations-/Fallback-Regel.
- **Auswirkung:** **kritisch**, da Reboot-Determinismus fuer safety-relevante Rule-Zustaende verletzt wird.

---

## Priorisierte Verifikation (naechster Ausbau)

1. `is_active`-Persistenz auf **ein** konsistentes Schema (Blob-v3) vereinheitlichen.
2. Expliziten Drift-Event bei Persistenzfehlern einfuehren (Runtime-vs-NVS sichtbar machen).
3. Queue-full-Fall fuer safety-relevante Config-Intents mit robustem Retry/Journal absichern.
4. Legacy-No-Task Modus klar begrenzen oder formal gleichwertig absichern.

---

## TM-Zusammenfassung (aktualisiert, 2026-04-04)

- Der Bericht ist in der Grundrichtung weiterhin korrekt, aber in drei Punkten aktualisiert:
  1. Negativpfade fuer Config-Fehler sind inzwischen deutlich deterministischer.
  2. Warmstart-Gate fuer Offline-Rule-Evaluierung ist implementiert.
  3. no-op/change-detection existiert teilweise bereits.
- Neuer hochrelevanter Befund: Konsistenzbruch bei `is_active` durch gemischten Legacy-vs-Blob-Persistenzpfad.
- Prioritaet fuer das naechste Paket:
  1. `is_active` auf Blob-v3 vereinheitlichen.
  2. Drift-Event bei Persistenzfehler verpflichtend machen.
  3. Queue-full fuer safety-relevante Intents robust absichern.
  4. Legacy-No-Task kontrolliert begrenzen oder absichern.
