# Analyseauftrag: EC-Temperaturkompensation — IST auf allen Schichten + Option DS18B20 (UI)

**Typ:** Reine Analyse (kein Implementierungsauftrag)  
**Erstellt:** 2026-04-09  
**Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`

## Erledigt / Lieferobjekt

**Bericht (IST + Option):**  
`.claude/reports/current/ANALYSE-EC-TEMPERATURKOMPENSATION-IST-UND-OPTION-DS18B20-2026-04-09.md`

---

## 1. Ziel und Lieferobjekt

**Ziel:** Vollständiger **IST-Nachweis**, wie die **Temperaturkompensation bei EC-Messungen** in AutomationOne heute funktioniert — von **MQTT-Payload** über **Backend-Processing**, **Persistenz**, **WebSocket/API-Antworten** bis **Frontend-Darstellung und Kalibrier-UI**.

**Zusätzlich:** Machbarkeits- und Risikoanalyse für eine **optionale Verbesserung**: Der Nutzer kann in der UI wählen, dass für die EC-Berechnung die **Temperatur eines realen Sensors** (primär **DS18B20**, gleiches ESP, identifiziert über **GPIO + ggf. OneWire-ROM**) **direkt in die Server-Rechnung** einfließt. **Das bisherige Verhalten muss ohne diese Option unverändert robust bleiben** (Default, Fallbacks, keine Breaking Changes).

## 2. Fachlicher Mindestkontext

**Physik:** EC₂₅ ≈ EC_T / (1 + α·(T − 25)); α oft ≈ 0,019–0,020 pro °C. Kalibrierung und Temperaturkompensation sind zwei Schritte; Reihenfolge darf nicht widersprüchlich sein.

**Produktkontext:** DFRobot **DFR0300** liefert **keine** integrierte Temperatur; **DS18B20** im selben Medium ist naheliegend.

## 3. Abgrenzung

- Keine Implementierung in diesem Auftrag.  
- Keine Änderung von Kalibrier-Presets außer IST-Beschreibung.  
- Cross-ESP-/Multi-Zone-Temperatur nur als Ausbau-Empfehlung im Bericht.

## 4. IST-Inventar — Checkliste A–H

(Siehe erledigten Bericht; alle Punkte dort mit Codebelegen.)

## 5. Analyse-Teil „Option DS18B20“

Drei bis fünf Architektur-Optionen, Empfehlung, Stale-Vorschlag, Doppelkompensation, Persistenz — im Bericht Abschnitt „Analyse: Option DS18B20“.

## 6. Test- und Verifikationshinweise

Im Bericht Abschnitt „Tests (pytest)“.

## 7. Akzeptanzkriterien

Im Bericht mit Selbstcheck abgehakt.

## 8. Referenz-Wissensbasis

Code hat Vorrang vor externer Doku; Abgleich im Bericht wo relevant.

## 9. Nächster Schritt

Nach Freigabe: separater **Implementierungsauftrag** (Backend + API-Schema + Frontend + ggf. Firmware).
