# Auftrag P1.5: ESP32 Safety-Operationen Firmware

**Ziel-Repo:** auto-one (El Trabajante Firmware)  
**Bereich:** AutomationOne Architektur-Komplettanalyse (`architektur-autoone`)  
**Roadmap-Bezug:** `roadmap-komplettanalyse.md` -> Paket 1, Schritt P1.5  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~6-9h  
**Abhaengigkeit:** P1.1 bis P1.4 abgeschlossen

---

## Ziel

Analysiere die Safety-Operationen der ESP32-Firmware entlang der bereits dokumentierten Runtime-, Sensor- und Speicherpfade.

Zu beantworten:
1. Welche lokalen Safeties sichern Sensorik/Aktorik in Normalbetrieb, Degraded und Recovery?
2. Welche Hard-Limits, Watchdogs, Fail-Safes und Fallbacks greifen wann?
3. Welche Risiken entstehen durch Reboot-/Power-Loss-Drift (RAM vs NVS)?
4. Welche Safety-Luecken sind kritisch/hoch/mittel priorisiert?
5. Welche Entscheidungen muessen vor P1.6 (Netzwerk/Reconciliation) fixiert sein?

---

## Pflichtinputs

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-speicherkarte-ram-vs-nvs.md`
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-schreib-und-restore-strategie.md`
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-04-esp32-reboot-powerloss-konsistenzanalyse.md`
4. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensorhandling-end-to-end.md`
5. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-fehler-recovery-matrix.md`
6. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-runtime-lifecycle-state-model.md`
7. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-trigger-matrix.md`
8. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-core-interaktionsbild.md`
9. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-02-esp32-degraded-recovery-szenarien.md`
10. `arbeitsbereiche/automation-one/architektur-autoone/roadmap-komplettanalyse.md`

Regel:
- Nur Source-of-Truth-Dateien ohne `copy.md` verwenden.
- Ergebnisse in bestehende Struktur schreiben, keine Parallelstruktur.

---

## Arbeitsschritte

## Block A - Safety-Inventar und Barrierenkarte

1. Alle Safety-Mechanismen erfassen (Emergency-Stop, Safe-State, Offline-Policy, Circuit-Breaker, Timeouts, Guards).
2. Pro Mechanismus dokumentieren:
   - Ausloeser,
   - Owner (Core0/Core1/shared),
   - Wirkung auf Aktorik/Sensorik,
   - Abhaengigkeit zu RAM/NVS.
3. Safety-Barrieren in kritische Pfade mappen (Boot, Approval, OFFLINE_ACTIVE, Reconnect, Reboot).

Output Block A:
- Safety-Katalog mit IDs `FW-SAF-XXX`.

---

## Block B - Safety-Wirksamkeit in Fehler- und Reboot-Szenarien

1. P1.4-Konsistenzfaelle (`FW-CONS-*`) gegen Safety-Barrieren pruefen.
2. Besonders bewerten:
   - NaN-/Stale-Phase nach Reboot,
   - verlorene in-flight Commands/Publishes,
   - Write-Fail bei safety-relevanten Zustandsdaten,
   - Rule-Status-Drift (`is_active`, `server_override`).
3. Klassifiziere Ergebnis je Szenario:
   - safe,
   - safe aber degradiert,
   - unsicher/unklar.

Output Block B:
- Wirksamkeitsmatrix `Safety-Barriere -> Fehlerbild -> Rest-Risiko`.

---

## Block C - Safety-Policies und Entscheidungsregeln

1. Verbindliche Policy-Vorschlaege dokumentieren fuer:
   - Rule-Eval bei `NaN`, `stale`, `quality=suspect`,
   - Kaltstart ohne frische Sensorwerte,
   - Prioritaet lokalem Rule-Fallback vs externem Command.
2. Definiere Mindestbedingungen fuer Aktorfreigabe nach Reboot.
3. Benenne explizit, welche Regeln P1.6 als Netzwerk-Contract absichern muss (ACK/NACK/Retry/Telemetry).

Output Block C:
- Safety-Policy-Set mit IDs `FW-POL-SAF-XXX`.

---

## Block D - Risiken, offene Punkte, Hand-off

1. Top-Risiken priorisieren (kritisch/hoch/mittel).
2. Offene Punkte explizit mit Evidenzgrad markieren (sicher/teilweise/offen).
3. Direkte Hand-off-Liste fuer P1.6 erstellen:
   - notwendige Observability,
   - notwendige Reconciliation-Signale,
   - notwendige Queue-/Backpressure-Absicherungen.

Output Block D:
- Priorisierte Risiko- und Hand-off-Liste.

---

## Deliverables

1. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-05-esp32-safety-katalog-und-priorisierung.md`
2. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-05-esp32-safety-wirksamkeit-fehlerbilder.md`
3. `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-05-esp32-safety-policy-und-entscheidungsregeln.md`

---

## Akzeptanzkriterien

- [ ] Vollstaendiger Safety-Katalog mit klaren IDs und Ownern vorhanden
- [ ] Jede zentrale Safety-Barriere ist mindestens einem Fehlerbild zugeordnet
- [ ] Reboot-/Power-Loss-Risiken aus P1.4 sind safety-seitig bewertet
- [ ] Verbindliche Policy fuer `NaN`, `stale`, `quality=suspect` ist dokumentiert
- [ ] Aktorfreigabe-Regeln fuer Kaltstart/Warmstart sind explizit beschrieben
- [ ] Offene Punkte und Evidenzgrade sind transparent ausgewiesen
- [ ] Hand-off in P1.6 ist konkret und umsetzbar
- [ ] Keine Code-Aenderung im Firmware-Repo vorgenommen

---

## Nicht-Scope

- Keine Implementierung von Safety-Logik in Firmware-Code
- Keine finale Netzwerk-/MQTT-Reconciliation-Implementierung (P1.6)
- Keine Server-/DB-Analyse (Paket 2/3)
- Keine UI-Flow-Analyse (Paket 4)

---

## Erfolgskriterium fuer Robin

Nach P1.5 ist praezise beantwortbar:
- Welche Safety-Barrieren aktuell wirklich tragen,
- wo trotz Fallback noch unsichere oder unklare Zustaende existieren,
- welche Netzwerk-Contracts in P1.6 zwingend noetig sind, damit Safety auch bei Drift stabil bleibt.
