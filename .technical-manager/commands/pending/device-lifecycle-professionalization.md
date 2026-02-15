# Device Lifecycle Professionalisierung
**Datum:** 2026-02-10
**Erstellt von:** Technical Manager
**Typ:** Multi-Phase Implementierungsplanung
**Betroffene Agents:** esp32-dev, server-dev, verify-plan
**Methode pro Phase:** verify-plan → Analyse (IST/SOLL) → Implementierungsplan

---

## Gesamtkontext (für ALLE Phasen relevant)

### Architektur-Prinzip

AutomationOne ist **server-zentrisch**: El Servador (FastAPI) enthält alle Business-Logik, ESP32-Devices (El Trabajante) sind "dumme Agenten" die nur ausführen und melden. Das Frontend (El Frontend, Vue 3) zeigt an was die **Datenbank als zentrale Wahrheit** liefert. Kommunikation: ESP32 ↔ MQTT ↔ Server ↔ DB ↔ Frontend.

### Der echte Device-Lifecycle (wie er für den User funktioniert)

```
1. ESP wird geflasht
2. ESP öffnet WiFi Access Point ("AutoOne-{ESP_ID}")
3. User verbindet sich, Captive Portal öffnet sich (Website auf ESP)
4. User konfiguriert: WiFi-SSID, WiFi-Passwort, Server-IP, MQTT-Port, Kaiser-ID
5. ESP speichert Config in NVS, rebooted
6. ESP verbindet sich zu WiFi → dann zu MQTT Broker
7. ESP sendet Heartbeat an Server
8. Server registriert Device → Device ist im Pending-State
9. User sieht neues Device im Frontend, muss es per Button akzeptieren oder ablehnen
10. Nach Akzeptanz: Device ist "online" und voll operativ
```

**Die Captive-Portal-Website dient zwei Zwecken:**
- **Ersteinrichtung:** Initiale Konfiguration bei neuem ESP
- **Rekonfiguration:** User kann später Server/Ports wechseln (z.B. Umzug auf anderen Server)

### Was aktuell funktioniert und was nicht

**Funktioniert gut:**
- Captive Portal selbst (WiFi AP, Website, Formular)
- WiFi-Credential-Fehlerbehandlung: Falsches WiFi → Portal öffnet sich erneut, NVS wird gelöscht
- Der gesamte Konfigurations-Flow von ESP → MQTT → Server → DB → Frontend ist implementiert und funktional
- Server-seitige Verarbeitung: Fehler werden korrekt erkannt und dem User über Server-Responses gemeldet
- Error-Logging und Error-Codes funktionieren durchgängig

**Hat Probleme:**
- **Captive Portal Recovery bei MQTT/Server-Fehlern:** Wenn WiFi korrekt aber MQTT-Port oder Server-IP falsch, fehlt die Fehlerbehandlung die das Portal wieder öffnet und NVS löscht (Phase 1)
- **DB speichert States falsch/voreilig:** Server verarbeitet korrekt, aber DB wird zu früh auf Erfolgs-Status gesetzt. Beispiele:
  - Device sendet Heartbeat → Server speichert sofort "online" in DB, obwohl Device noch im Pending-Approval-Flow ist
  - Sensor wird an ESP konfiguriert → DB markiert sofort "Erfolg", auch wenn ESP einen Fehler meldet
  - Der User sieht die richtigen Meldungen (weil Server-Responses stimmen), aber die DB-Einträge stimmen nicht
  - Frontend nutzt DB als Quelle → zeigt teilweise falschen State
  - Dieses Problem betrifft wahrscheinlich ALLE Bereiche die State oder Errors in die DB schreiben: Devices, Sensoren, Aktoren, Konfigurationen (Phase 2)

**Getrennt aber im selben System-Kontext:**
- **Wokwi-Simulation** hat eigene PlatformIO Build-Umgebung (`wokwi_simulation`), durchläuft aber denselben Provisioning-Flow wie echte Hardware. Wokwi sollte Captive Portal überspringen und direkt per MQTT einsteigen (Phase 3)

### Wichtig für alle Agents

- Die Code-Struktur gibt bereits alles vor. Es müssen **Anpassungen an bestehenden Stellen** gemacht werden, **keine neuen Funktionen oder Flows**.
- Für jeden Bereich muss die **beste Stelle im bestehenden Code** gefunden werden, um die Korrektur umzusetzen.
- Die Phasen hängen zusammen (alle betreffen den Device-Lifecycle), können aber **unabhängig voneinander bearbeitet** werden. Phase 2 ist die umfangreichste und hat den größten Impact. Phase 1 und 3 sind fokussierter.
- **Server-zentrische Verarbeitung** ist das Leitprinzip: Die DB muss den echten Zustand widerspiegeln den der Server kennt. Nicht voreilig, nicht optimistisch, sondern nach Verifikation.

---

## Phase 1: Captive Portal – Vollständige Fehlerbehandlung

**Scope:** ESP32-Firmware (El Trabajante)
**Primär-Agent:** esp32-dev
**Sekundär:** verify-plan (vorher)

### Kontext

Das Captive Portal auf dem ESP hat eine funktionierende Fehlerbehandlung für WiFi-Credentials: Wenn der User falsche WiFi-Daten eingibt, schließt sich das Portal zunächst (ESP versucht Verbindung), öffnet sich nach fehlgeschlagener Verbindung aber wieder und löscht die fehlerhafte NVS-Config. Der User kann es erneut versuchen.

Dieses Verhalten existiert **nicht** für MQTT-Port und Server-IP. Wenn WiFi korrekt ist, aber der MQTT-Port falsch oder die Server-IP nicht erreichbar, bleibt der ESP in einem fehlerhaften Zustand ohne Recovery.

### Aufgabe: IST-Zustand erfassen

1. **WiFi-Recovery-Flow analysieren:** Wo genau im Code wird erkannt dass WiFi fehlschlägt? Wie wird das Portal wieder geöffnet? Wie wird NVS gelöscht? Exakte Code-Stellen und Ablauf dokumentieren.

2. **MQTT/Server-Verbindungsversuch analysieren:** Was passiert aktuell wenn WiFi steht aber MQTT-Verbindung fehlschlägt? Was passiert wenn Server-IP nicht erreichbar? Wo bleibt der ESP hängen? Gibt es Timeouts? Was sieht der User?

3. **Alle Fehlerkombinationen erfassen:**
   - WiFi falsch → (funktioniert bereits)
   - WiFi korrekt, MQTT-Port falsch → ?
   - WiFi korrekt, Server-IP falsch/nicht erreichbar → ?
   - WiFi korrekt, MQTT-Port korrekt, Server antwortet nicht → ?
   - WiFi korrekt, alles korrekt aber Broker lehnt Verbindung ab → ?

### Aufgabe: SOLL-Zustand definieren

Das Recovery-Verhalten das für WiFi existiert muss **für alle Konfigurations-Fehler** greifen. Egal welcher Teil der Konfiguration fehlerhaft ist – wenn der ESP nicht erfolgreich bis zum Heartbeat kommt, muss er:
- Die fehlerhafte Config erkennen
- NVS löschen (oder als ungültig markieren)
- Das Captive Portal wieder öffnen
- Dem User die Möglichkeit geben, die Konfiguration zu korrigieren

Das bestehende WiFi-Recovery-Pattern ist das Vorbild. Es muss auf MQTT- und Server-Verbindungsfehler erweitert werden.

### Erfolgskriterium

- Jede Fehlerkombination (WiFi, MQTT, Server) führt zur Wiedereröffnung des Captive Portals
- User kann bei jeder fehlerhaften Config korrigieren ohne den ESP neu flashen zu müssen
- Bestehender WiFi-Recovery-Flow bleibt unverändert funktional
- Keine neuen HTTP-Endpoints, keine neuen Flows – Erweiterung des bestehenden Recovery-Patterns

### Report zurück an
`.technical-manager/inbox/agent-reports/phase1-captive-portal-recovery-YYYY-MM-DD.md`

---

## Phase 2: DB State Consistency – Zentrale Wahrheit korrigieren

**Scope:** El Servador (Backend), mit Auswirkung auf Frontend-Darstellung
**Primär-Agent:** server-dev
**Sekundär:** verify-plan (vorher), ggf. frontend-dev (nachgelagert)

### Kontext

Das System hat ein durchgängiges State-Konsistenz-Problem: Der Server verarbeitet Abläufe korrekt und meldet Fehler richtig an den User, aber die **Datenbank wird zu früh oder mit falschem Status beschrieben**. Da das Frontend die DB als zentrale Wahrheit nutzt, zeigt es teilweise falschen State an.

**Architektur-Prinzip:** In einem server-zentrischen System MUSS die DB den echten, verifizierten Zustand widerspiegeln. Nicht den optimistischen, nicht den erwarteten, sondern den bestätigten.

### Bekannte Manifestationen

**Device-Registration:**
- ESP sendet Heartbeat → Server schreibt Device sofort als "online" in DB
- Aber: Device soll erst im Pending-State sein bis Admin es akzeptiert
- Der Pending/Approval-Flow existiert (DB-Schema hat `pending_approval`, `approved_at`, `approved_by`), aber der Heartbeat-Handler überspringt ihn und setzt direkt `"online"`
- Frontend zeigt Device als "online" → User muss es per Button akzeptieren → aber DB sagt schon "online"

**Sensor-Konfiguration:**
- User konfiguriert Sensor an ESP (über Server → MQTT → ESP)
- DB markiert Konfiguration als "Erfolg" bevor ESP-Bestätigung/Fehler zurückkommt
- ESP meldet Fehler über MQTT zurück → Server erkennt den Fehler korrekt → User sieht Fehlermeldung
- Aber: DB-Eintrag steht weiterhin auf "Erfolg"
- Frontend zeigt bei erneutem Laden den DB-State = "Erfolg" obwohl es ein Fehler war

**Vermutete weitere Betroffenheit:**
- Aktuator-Konfiguration (gleicher Pattern wie Sensor)
- Jeder Flow der: Command an ESP schickt → DB sofort als Erfolg markiert → ESP-Antwort erst später verarbeitet
- Jeder State-Wechsel der in DB geschrieben wird bevor die Verifikation abgeschlossen ist

### Aufgabe: IST-Zustand erfassen

1. **Device-Registration-Flow im Server-Code durchgehen:**
   - Heartbeat-Handler: Wo wird der DB-Status gesetzt? Welcher Status wird gesetzt?
   - Discovery-Handler: Gleiche Frage
   - Approval-Endpoints: Existieren sie? Werden sie genutzt? Was machen sie?
   - Wie interagiert Frontend mit Device-Status? (API-Endpoints für Device-Liste, Status-Anzeige)

2. **Sensor/Aktuator-Konfigurationsflow im Server-Code durchgehen:**
   - Wo wird eine Config-Anfrage in die DB geschrieben?
   - Wann wird der Status auf "Erfolg" gesetzt – vor oder nach ESP-Bestätigung?
   - Wie kommt die ESP-Antwort (Erfolg/Fehler) zurück? Über welchen MQTT-Handler?
   - Wird der DB-Eintrag nach ESP-Antwort aktualisiert?

3. **Alle State-Schreibvorgänge in DB katalogisieren:**
   - Welche Stellen im Code schreiben Status/State in die DB?
   - Bei welchen wird auf Verifikation gewartet, bei welchen nicht?
   - Systematische Übersicht: Jeder DB-Write der einen Status setzt, mit Angabe ob er verifiziert oder optimistisch ist

### Aufgabe: SOLL-Zustand definieren

**Prinzip: Write-after-Verification**

Die DB darf einen Erfolgs-Status erst schreiben wenn der Erfolg vom Server **verifiziert** wurde. Das bedeutet:

- **Device-Registration:** Heartbeat → DB-Status = `"pending_approval"` (nicht `"online"`). Erst nach Admin-Approval → `"online"`.
- **Sensor/Aktuator-Config:** Config-Anfrage → DB-Status = `"pending"` oder `"configuring"`. Erst nach ESP-Bestätigung → `"active"` oder `"error"`.
- **Generell:** Jeder zweistufige Flow (Server → ESP → Antwort) muss einen Zwischen-Status in der DB haben der den unbestätigten Zustand widerspiegelt.

Das bestehende DB-Schema unterstützt dies bereits (die Status-Werte und Approval-Felder existieren). Es muss an den **Server-Handlern** angepasst werden, wo und wann welcher Status geschrieben wird.

**Wichtig:** Das Frontend muss NICHT geändert werden wenn die DB korrekt ist – das Frontend zeigt was die DB sagt. Wenn die DB stimmt, stimmt das Frontend automatisch. Sollte das Frontend State-spezifische Darstellung brauchen (z.B. "Pending" visuell anders als "Online"), ist das ein nachgelagerter Frontend-Task, kein Bestandteil dieser Phase.

### Erfolgskriterium

- Vollständiger Katalog aller State-Writes in die DB mit Bewertung (verifiziert vs. optimistisch)
- Für jeden optimistischen Write: Identifizierte Stelle wo Verifikation stattfinden sollte
- Device-Lifecycle in DB korrekt: `offline` → `pending_approval` → `approved`/`rejected` → `online`/`offline`
- Sensor/Aktuator-Config in DB korrekt: Status reflektiert echten ESP-Zustand
- Keine neuen Tabellen, keine neuen Flows – Anpassungen an bestehenden Handlern und DB-Write-Stellen

### Report zurück an
`.technical-manager/inbox/agent-reports/phase2-db-state-consistency-YYYY-MM-DD.md`

---

## Phase 3: Wokwi Provisioning Bypass

**Scope:** ESP32-Firmware (El Trabajante), Build-Umgebung `wokwi_simulation`
**Primär-Agent:** esp32-dev
**Sekundär:** verify-plan (vorher)

### Kontext

Wokwi hat eine eigene PlatformIO Build-Umgebung (`wokwi_simulation`) die vom Production-Build getrennt ist. Aktuell durchläuft auch der Wokwi-Build den Provisioning-Flow (Captive Portal), was für Simulation unnötig ist und Tests verkompliziert.

Im ESP32-Code existiert **deaktivierter Device-Discovery-Code** der potenziell für den Wokwi-Bypass nutzbar wäre. Dieser Code muss analysiert werden.

**Ziel:** Wokwi überspringt das Captive Portal vollständig und startet direkt mit MQTT-Heartbeat. Die Konfiguration (WiFi, Server-IP, MQTT-Port) wird über eine **Secrets-Datei** bereitgestellt die aus Git ausgeschlossen ist und vom User anpassbar bleibt.

### Aufgabe: IST-Zustand erfassen

1. **Wokwi Build-Umgebung analysieren:**
   - Was unterscheidet `wokwi_simulation` vom Production-Build? (platformio.ini Flags, Defines, Includes)
   - Wie wird aktuell entschieden ob Captive Portal gestartet wird? Welche Bedingung, welcher Code-Pfad?
   - Gibt es bereits `#ifdef`-Guards oder Build-Flags die Provisioning steuern?

2. **Deaktivierten Discovery-Code analysieren:**
   - Wo liegt der Code? (Datei, Funktionen, Klassen)
   - Warum ist er deaktiviert? (Compile-Flag, auskommentiert, Feature-Flag?)
   - Was macht er? Welcher Flow wird damit ermöglicht?
   - Kann er für den Wokwi-Bypass genutzt werden? Was wäre nötig?

3. **Aktuelle Wokwi-Konfiguration analysieren:**
   - `wokwi.toml`: Netzwerk-Config, Gateway-Setting
   - Wie verbindet sich Wokwi-ESP aktuell zu MQTT? Hardcoded? Aus NVS?
   - Was passiert beim Wokwi-Boot wenn kein NVS vorhanden ist?

### Aufgabe: SOLL-Zustand definieren

**Wokwi-Pfad (nur `wokwi_simulation` Build):**
```
1. ESP startet
2. Build-Flag erkennt: Wokwi-Simulation
3. Captive Portal wird NICHT gestartet
4. Config wird aus Secrets-Datei geladen (Compile-Time oder definierte Defaults)
5. ESP verbindet direkt zu WiFi → MQTT → sendet Heartbeat
6. Normaler Betrieb (identisch mit Production nach Provisioning)
```

**Secrets-Datei:**
- Enthält: WiFi-SSID, WiFi-Passwort, Server-IP, MQTT-Port, Kaiser-ID
- Format: passend zur bestehenden Build-Umgebung (z.B. `platformio.ini` `build_flags`, oder separate `.h`-Datei)
- In `.gitignore` eingetragen
- Ein `.example`-Template wird mitgeliefert

**Production-Pfad bleibt unverändert:** Der echte ESP durchläuft weiterhin den vollen Provisioning-Flow. Die Trennung erfolgt ausschließlich über Build-Flags/Build-Umgebung.

### Bezug zum deaktivierten Discovery-Code

Der deaktivierte Discovery-Code soll analysiert werden auf Eignung als Basis für den Wokwi-Bypass. Wenn er passt, soll er für die `wokwi_simulation`-Umgebung aktiviert und angepasst werden. Wenn nicht, soll der einfachste Weg über Build-Flags und Config-Injection gewählt werden. Die Analyse muss beide Optionen bewerten.

### Erfolgskriterium

- Wokwi-ESP startet ohne Captive Portal und verbindet direkt zu MQTT
- Config kommt aus einer Secrets-Datei die nicht in Git liegt
- `.example`-Template existiert für neue Entwickler
- Production-Build ist nicht betroffen (Captive Portal läuft normal)
- Der deaktivierte Discovery-Code ist dokumentiert (Funktion, Zustand, Eignung)
- Seed-Script `seed_wokwi_esp.py` funktioniert weiterhin mit dem neuen Flow

### Report zurück an
`.technical-manager/inbox/agent-reports/phase3-wokwi-bypass-YYYY-MM-DD.md`

---

## Phasen-Abhängigkeiten und Reihenfolge

```
Phase 1 (Captive Portal Recovery)     Phase 3 (Wokwi Bypass)
         ESP-seitig                        ESP-seitig
              \                               /
               \                             /
                ↘                           ↙
           Phase 2 (DB State Consistency)
                   Server-seitig
```

**Phase 1 und Phase 3** sind ESP-seitig und können **parallel** bearbeitet werden. Sie berühren unterschiedliche Code-Bereiche (Phase 1: Provisioning/Recovery, Phase 3: Build-Umgebung/Bypass).

**Phase 2** ist Server-seitig und kann **unabhängig** von Phase 1 und 3 bearbeitet werden. Phase 2 profitiert aber davon wenn Phase 1 abgeschlossen ist, weil dann der vollständige Device-Lifecycle (inklusive korrekter Recovery) gegen die DB-Korrekturen getestet werden kann.

**Empfohlene Reihenfolge:**
1. Alle drei Phasen: **verify-plan** zuerst (IST/SOLL validieren gegen echten Code)
2. Phase 1 + Phase 3 parallel (ESP-seitig, unterschiedliche Bereiche)
3. Phase 2 (Server-seitig, kann auch parallel starten, finale Verifikation nach Phase 1)

**Jede Phase ist ein eigener Chat-Kontext.** Agent aktiviert verify-plan, liest dieses Dokument, fokussiert auf seine Phase. Der vollständige Kontext oben stellt sicher dass jeder Agent das Gesamtbild versteht.

---

## Für Agents: Wie dieses Dokument nutzen

1. **Lies den Gesamtkontext** (oben) vollständig – er beschreibt das System und die Zusammenhänge
2. **Fokussiere auf deine Phase** – nur der Abschnitt der dir zugewiesen wurde
3. **Erstelle zuerst den IST-Zustand** mit exakten Code-Referenzen (Datei, Zeile, Funktion)
4. **Stelle den SOLL-Zustand** dagegen – was muss sich ändern, wo genau?
5. **Ergebnis:** Ein klarer Implementierungsplan mit konkreten Änderungsstellen, keine Architektur-Diskussion
6. **Keine neuen Funktionen oder Flows.** Die Code-Struktur gibt alles vor. Finde die beste Stelle für die Anpassung.
