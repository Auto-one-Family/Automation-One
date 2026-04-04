# Auftrag P1.4: ESP32 Speicheranalyse RAM vs NVS

**Ziel-Repo:** auto-one (El Trabajante Firmware)  
**Bereich:** AutomationOne Architektur-Komplettanalyse (`architektur-autoone`)  
**Roadmap-Bezug:** `roadmap-komplettanalyse.md` -> Paket 1, Schritt P1.4  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~5-8h  
**Abhaengigkeit:** P1.1 bis P1.3 abgeschlossen

---

## Ziel

Erstelle ein belastbares Speicherbild der Firmware mit klarer Trennung zwischen:
- Runtime-Daten in RAM,
- persistenter Konfiguration/Zustand in NVS,
- Restore-Verhalten nach Reboot oder Power-Loss.

Zu beantworten:
1. Welche Datentypen liegen nur in RAM, welche in NVS, welche sind abgeleitet?
2. Wann und unter welchen Guards wird nach NVS geschrieben?
3. Welche Daten werden beim Boot deterministisch wiederhergestellt?
4. Wo entstehen Konsistenzluecken (teilweise Writes, stale Runtime, fehlende Versionierung)?
5. Welche Risiken muessen vor P1.5/P1.6 geklaert werden?

---

## Pflichtinputs

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensorhandling-end-to-end.md`
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-contract-matrix.md`
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-fehler-recovery-matrix.md`
4. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-timing-und-lastprofil.md`
5. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-runtime-lifecycle-state-model.md`
6. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-trigger-matrix.md`
7. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-core-interaktionsbild.md`
8. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-degraded-recovery-szenarien.md`
9. `arbeitsbereiche/automation-one/architektur-autoone/roadmap-komplettanalyse.md`

Regel:
- Nur die oben genannten Source-of-Truth-Dateien verwenden.
- Keine `copy.md` als Grundlage.

---

## Arbeitsschritte

## Block A - Speicherobjekt-Inventar (RAM/NVS/abgeleitet)

1. Alle relevanten Datenobjekte aus P1.2/P1.3 erfassen (Lifecycle, Sensor, Config, Offline, Queue, Safety).
2. Pro Objekt klassifizieren:
   - RAM-only (volatile),
   - NVS-persistiert,
   - abgeleitet zur Laufzeit.
3. Objekt-Owner und Scope dokumentieren (Core 0, Core 1, shared).

Output Block A:
- Vollstaendige Speicherkarte mit IDs `FW-MEM-XXX`.

---

## Block B - Schreibstrategie (Write Timing und Guardrails)

1. Alle NVS-Write-Pfade identifizieren (Config-Save, Rule-Status, State-Save).
2. Pro Write-Pfad festhalten:
   - Trigger,
   - Write-Haeufigkeit/Burst-Risiko,
   - atomare Grenzen,
   - Fehlerverhalten.
3. Guardrails dokumentieren:
   - no-op vermeiden,
   - write-on-change,
   - valid-before-commit,
   - fallback bei Write-Fail.

Output Block B:
- Schreib- und Restore-Strategie mit IDs `FW-STR-XXX`.

---

## Block C - Restore-Verhalten nach Reboot/Power-Loss

1. Boot-Restore-Reihenfolge erfassen (was wird wann aus NVS gelesen?).
2. Szenarien modellieren:
   - normaler Reboot,
   - Power-Loss waehrend Config-Update,
   - Power-Loss waehrend Offline-Rule-Aktivitaet,
   - NVS-Defekt/CRC-Fehler.
3. Konsistenzstatus je Szenario bewerten:
   - konsistent,
   - inkonsistent aber safe,
   - kritisch inkonsistent.

Output Block C:
- Reboot-/Power-Loss-Konsistenzanalyse mit IDs `FW-CONS-XXX`.

---

## Block D - Risiko- und Lueckenanalyse

1. Top-Risiken priorisieren (kritisch/hoch/mittel).
2. Offene Punkte explizit markieren (inkl. Evidenzgrad sicher/teilweise/offen).
3. Konkrete Verifikationsfragen fuer P1.5 und P1.6 ableiten.

Output Block D:
- Liste `Risiken/Offene Punkte` + direkter Hand-off.

---

## Deliverables

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-speicherkarte-ram-vs-nvs.md`
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-schreib-und-restore-strategie.md`
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-reboot-powerloss-konsistenzanalyse.md`

---

## Akzeptanzkriterien

- [ ] Alle relevanten Firmware-Datenobjekte sind als RAM/NVS/abgeleitet klassifiziert
- [ ] NVS-Write-Trigger und Write-Guardrails sind je Pfad dokumentiert
- [ ] Restore-Pfade fuer Reboot/Power-Loss sind szenariobasiert beschrieben
- [ ] Konsistenzstatus je Szenario ist bewertet (konsistent / safe-inkonsistent / kritisch)
- [ ] Risiken und offene Punkte sind priorisiert und explizit dokumentiert
- [ ] Hand-off-Fragen fuer P1.5 (Safety) und P1.6 (Netzwerk) sind vorhanden
- [ ] Keine Code-Aenderung im Firmware-Repo vorgenommen

---

## Nicht-Scope

- Keine Implementierung von NVS-Schema-Aenderungen oder Flash-Layout-Aenderungen
- Keine Optimierung von WiFi/MQTT-Reconnect-Algorithmen (P1.6)
- Keine vollstaendige Safety-Wirksamkeitsbewertung aller Barrieren (P1.5)
- Keine Server-/DB-Seitenanalyse (Paket 2/3)

---

## Erfolgskriterium fuer Robin

Nach P1.4 ist praezise beantwortbar:
- Welche Firmware-Daten bei Reboot verloren gehen duerfen und welche nicht.
- Ob aktuelle NVS-Write- und Restore-Pfade fuer stabile Offline-/Recovery-Phasen reichen.
- Welche Speicherkonsistenzrisiken vor P1.5/P1.6 prioritaer geschlossen werden muessen.
