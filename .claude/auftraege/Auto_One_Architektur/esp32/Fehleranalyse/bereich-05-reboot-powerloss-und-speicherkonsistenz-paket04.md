# Bereich 05B - Reboot/Powerloss und Speicherkonsistenz (IST-Revision 2026-04-05)

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
- `FA-P14-008`: Gemischter Legacy-vs-Blob-Bezug fuer `is_active` nur noch im Migrationsfenster relevant; Runtime-Persistenz laeuft im aktuellen Code durchgaengig ueber Blob v3.

## 3) Welche Restluecken bleiben?

- **P0:** `FA-P14-001`, `FA-P14-002`.
- **P1:** `FA-P14-004`, `FA-P14-006`, `FA-P14-008` (Restrisiko Migration/Rollout, nicht mehr Runtime-Dual-Write).
- **P2:** `FA-P14-003`, `FA-P14-005`, `FA-P14-007` (teilweise verbessert, aber nicht voll verifiziert).

## 4) Was wurde in der Datei konkret angepasst?

- Auf ein einheitliches IST-Revisionsformat umgestellt.
- Kritische und teilweise ueberholte P14-Befunde sauber getrennt.
- Prioritaetsbild fuer Reboot-/Powerloss-Risiken konsolidiert.
- Reality-Check gegen `El Trabajante/src` (2026-04-05): P14-002 Drift-Signale, P14-008 Blob-v3-Runtime-Persistenz, Pfade und Legacy-No-Task-Bezeichner praezisiert.

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
- **Absicherung IST:** Teilweise erweitert — bei NVS-Fehlern in `saveOfflineRulesToNVS()` setzt `OfflineModeManager::setPersistenceDrift(...)`, loest `publishIntentOutcome("offline_rules", ..., "PERSISTENCE_DRIFT", ...)` aus, und der Heartbeat-Payload enthaelt `degraded`, `degraded_reason` und `persistence_drift_count` (`mqtt_client.cpp`).
- **Absicherung fehlt:** harter operativer Lock/Degrade bei Persistenzfehler (Sichtbarkeit allein ersetzt keinen Safety-Stop) und serverseitig verpflichtende Auswertung der Drift-Felder.
- **Auswirkung:** **kritisch**, weil Safety-Entscheidung nach Reboot auf stale Status beruhen kann.

## FA-P14-003 - Deterministische Negativpfade fuer Config-Fehler sind weitgehend vorhanden (teilweise ueberholt)

- **Quellbezug:** `FW-CONS-012`, `FW-STR-011` (Revalidierung gegen aktuellen Stand).
- **Betroffene Module:** `src/tasks/config_update_queue.cpp`, `src/main.cpp`, `ConfigResponseBuilder` (`src/services/config/config_response.*`), Intent-Outcome-Pfad (`publishIntentOutcome` in `src/tasks/intent_contract.*`).
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
- **Betroffene Module:** `g_config_update_queue` (`src/tasks/config_update_queue.*`), Command-Queues (`sensor_command_queue`, `actuator_command_queue`, …), `g_publish_queue` (`src/tasks/publish_queue.*`).
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
- **Interner Ablauf:** Es existiert inzwischen ein Warmup-Gate (`OFFLINE_WARMUP_VALID_SAMPLES` in `offline_mode_manager.cpp`, Logzeile mit Text `warmup gate passed` inkl. Sample-Zaehler).
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
- **Betroffene Module:** Bootpfad/Task-Erstellung (`loopLegacySingleThreadedWhenNoRtosTasks` in `main.cpp` wenn keine RTOS-Tasks), Core-Isolation-Annahmen.
- **Wie der Fehler auftritt:** Deployment startet in Legacy-Variante mit abweichender Ablaufcharakteristik.
- **Interner Ablauf:** Annahmen zu Queue-Isolation und Task-Timing sind nicht 1:1 uebertragbar.
- **Externe Wirkung:** Verhalten unter Last oder nach Reboot weicht geraeteabhaengig ab.
- **Speicherorte:** indirekt betroffen (Queue-Latenz, Reihenfolge von Apply/Publish/ACK).
- **Parallelaktion/Race:** Unterschiedliche Scheduling-Modelle erzeugen schwer reproduzierbare Randfaelle.
- **Absicherung IST:** unklar.
- **Absicherung fehlt:** formale Gleichwertigkeitsdefinition oder klare Deaktivierungsregel fuer Legacy.
- **Auswirkung:** **mittel bis hoch** (insb. fuer Testbarkeit und Feldvergleich).

## FA-P14-008 - Konsistenzbruch durch gemischte Persistenzpfade fuer `is_active` (Revalidierung gegen Firmware-Stand 2026-04-05)

- **Quellbezug:** Forensischer Ausgangsbefund (2026-04-04), abgeglichen mit `offline_mode_manager.cpp` (Load/Save/Migration).
- **Betroffene Module:** `offline_mode_manager`, Rule-Blob-v3 Persistenz (`ofr_blob`/`ofr_ver`/`ofr_count`), Legacy-Lesepfad nur bei Migration (`ofr_ver==0`, Einzelkeys inkl. `ofr_%d_state`), anschliessend `_deleteOldIndividualKeys()`.
- **Wie der Fehler historisch gemeint war / Restfenster:**
  1. Rule-Transition aendert `is_active` in RAM.
  2. **IST-Code:** Zustandswechsel nach erfolgreicher Aktorik werden ausschliesslich ueber `saveOfflineRulesToNVS()` in Blob v3 geschrieben (Kommentar im Code: Vermeidung gemischter Pfade); es gibt **keinen** aktuellen Schreibpfad auf `ofr_%d_state` in `src/`.
  3. Restore bei `ofr_ver>=1` liest nur `ofr_blob`; Legacy-Keys werden nur im Migrationszweig (`ver==0`) gelesen, danach migriert und geloescht.
  4. Restrisiko liegt in **Migrations-/Power-Loss-Fenstern** (Migration nicht abgeschlossen), **Rollout mit aelterer Firmware**, oder **externen NVS-Manipulationen** — nicht im normalen Dual-Write waehrend laufender Rule-Evaluierung.
- **Interner Ablauf:** Zur Laufzeit eine Persistenz-Quelle (Blob v3); kein paralleler Legacy-Write mehr nachweisbar.
- **Externe Wirkung:** Nach vollstaendiger Migration sollte Reboot-Determinismus fuer `is_active` dem Blob entsprechen; Abweichungen sind auf Migrationsrandfaelle oder Hardware/NVS-Fehler zu pruefen.
- **Speicherorte:** NVS Blob v3; Legacy-Keyspace nur transient bis Migration.
- **Parallelaktion/Race:** Schnelle Transitionsketten + NVS-Commit-Fehler bleiben relevant (siehe Drift-Pfad bei `saveOfflineRulesToNVS()`).
- **Absicherung IST:** Runtime-Persistenz vereinheitlicht auf Blob v3; Shadow-Vergleich in `saveOfflineRulesToNVS()` reduziert Burst-Writes.
- **Absicherung fehlt:** formale Abnahme aller Migrations- und Rollout-Szenarien sowie serverseitige Nutzung der Drift-/Degrade-Signale als Policy.
- **Auswirkung:** **mittel** fuer den aktuellen Hauptpfad (nach Migration), **hoch** solange Geraete im Legacy-`ofr_ver==0`-Zweig oder mit unterbrochener Migration betrieben werden.

---

## Priorisierte Verifikation (naechster Ausbau)

1. Migrations- und Rollout-Abnahme fuer `is_active`/Blob v3 (kein offener Dual-Write mehr im `src/`-Stand), inkl. Power-Loss waehrend `ver==0`-Migration.
2. Server-Policy zu Heartbeat-`degraded`/`persistence_drift_*` und Intent-Outcome `PERSISTENCE_DRIFT` festziehen (Firmware signalisiert bereits).
3. Queue-full-Fall fuer safety-relevante Config-Intents mit robustem Retry/Journal absichern.
4. Legacy-No-Task Modus klar begrenzen oder formal gleichwertig absichern.

---

## TM-Zusammenfassung (aktualisiert, 2026-04-05)

- Der Bericht ist in der Grundrichtung weiterhin korrekt, mit folgenden IST-Korrekturen nach Code-Abgleich:
  1. Negativpfade fuer Config-Fehler sind inzwischen deutlich deterministischer.
  2. Warmup-Gate fuer Offline-Rule-Evaluierung ist implementiert (`OFFLINE_WARMUP_VALID_SAMPLES`).
  3. no-op/change-detection existiert in `saveOfflineRulesToNVS()` (memcmp gegen Shadow).
  4. Der Befund „Dual-Write Legacy-Key vs. Blob fuer `is_active`“ trifft auf den aktuellen `src/`-Stand fuer laufende Rule-Transitions **nicht** mehr zu; relevant bleiben Migrations-/Rollout-Fenster und Policy um die bereits vorhandenen Drift-Signale.
- Prioritaet fuer das naechste Paket:
  1. Migration/Rollout- und Power-Loss-Abnahme fuer Offline-Rule-NVS (Blob v3).
  2. Serverseitige Auswertung von Drift/Degrade (Heartbeat + Intent-Outcome) als verbindliche Reaktion definieren.
  3. Queue-full fuer safety-relevante Intents robust absichern.
  4. Legacy-No-Task kontrolliert begrenzen oder absichern.
