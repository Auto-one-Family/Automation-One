# Auftrag AUT-189 — MQTT-Verifikation MQTT-01 / MQTT-02 / MQTT-03 / MQTT-04

**Auftragstyp:** Verifikations-Analyse (KEINE Implementierung)
**Empfaenger:** technical manager (Auto-one)
**Schicht:** Cross-Layer (Firmware + Backend + Dokumentation)
**Linear-Referenz:** AUT-189
**Datum:** 2026-04-26
**Prioritaet:** Mittel (MQTT-01/MQTT-03), Niedrig (MQTT-02/MQTT-04)
**Berichts-Ablage:** Dieser Ordner — Datei `bericht-AUT-189-mqtt-01-02-03-04-2026-04-26.md`
**Anhang-Unterordner (falls noetig):** `bericht-AUT-189-anhang/` in diesem Ordner

---

## Problem

Beim Aufbau des Cluster-Hubs C1 (MQTT / Echtzeit-Protokoll) identifizierte eine
Bestandsaufnahme (AUT-175 E5, 2026-04-26) vier Punkte, die Konfusion bei Analyse und Debugging
erzeugen, ohne den Normalbetrieb zu blockieren:

- Zwei "ORPHANED" Topics (ESP-Builder ohne Server-Handler)
- Ein falsch kommentierter Code-Abschnitt ("GHOST-Kommentar")
- Keine dokumentierte Architektur-Entscheidung zur clean_session-Strategie
- Eine veraltete ACL-Analyse mit falschen Topic-Zahlen

Der TM prueft den aktuellen Code-Stand, liefert Evidenz und gibt eine Entscheidungsvorlage
fuer Robin ab (MQTT-01 und MQTT-04 erfordern Robin-Entscheidung).

---

## IST — Behauptungen, die zu pruefen sind

### MQTT-01 — ORPHANED Topics

**Behauptung:**
Zwei Topics haben ESP-seitige Builder (Firmware publiziert auf diese Topics), aber keinen
Server-seitigen MQTT-Handler (Server subscribed nicht oder verarbeitet Payload nicht):
- `sensor/batch` (vollstaendiges Pattern: `kaiser/{kaiser_id}/esp/{esp_id}/sensor/batch`)
- `subzone/status` (vollstaendiges Pattern: `kaiser/{kaiser_id}/esp/{esp_id}/subzone/status`)

Dies erzeugt MQTT-Traffic ohne Verarbeitung — ein stiller Datenverlust.

**Kern-Frage MQTT-01:**
- Existiert in der Firmware tatsaechlich ein Builder / Publish-Aufruf fuer diese Topics?
  (Grep nach dem Topic-String oder dem Publish-Aufruf in `src/`)
- Existiert im Server (Python-Backend) ein MQTT-Handler / Subscriber fuer diese Topics?
  (Grep nach dem Topic-Pattern in `src/` serverseitig)
- Falls ja/nein: vollstaendige Liste der ORPHANED-Topics (Builder vorhanden, Handler fehlt)
  UND umgekehrt (Handler vorhanden, kein bekannter Builder).

**Entscheidungsvorlage fuer Robin (TM liefert):**
- Option A: Server-Handler implementieren (wenn Funktion gewuenscht) — Aufwandsschaetzung
- Option B: ESP-Builder + Topic-Definition aus Firmware entfernen (wenn Funktion veraltet) — Risiken
- TM-Empfehlung welche Option bevorzugt wird und warum

---

### MQTT-02 — GHOST-Kommentar bei actuator/emergency

**Behauptung:**
Im Server-Code (vermutlich in einem MQTT-Handler oder Kommentar-Block) existiert eine Aussage
sinngemass "ESP subscribed nie auf `actuator/emergency`" oder "ESP verarbeitet dieses Topic
nicht". Tatsaechlich subscribed der ESP auf dieses Topic (verifizierter Fund: `src/main.cpp:629`).
Der Kommentar ist schlicht falsch.

**Kern-Frage MQTT-02:**
- In welcher Datei und Zeile steht dieser Kommentar?
- Was genau steht dort (Original-Wortlaut)?
- Welcher Commit hat diesen Kommentar eingefuehrt?
- Pruefe `src/main.cpp:629` (oder Umgebung): Subscribed der ESP tatsaechlich auf
  `actuator/emergency` oder ein Topic das dieses Topic-Segment enthaelt?

---

### MQTT-03 — ADR "clean_session=true" fehlt

**Behauptung:**
Die Firmware setzt in `src/services/communication/mqtt_client.cpp` Zeile 172:
```
disable_clean_session = 0
```
Das bedeutet `clean_session = true` (nicht false!). Konsequenz: Der Broker loescht bei jedem
Disconnect die Session inklusive ausstehender QoS-2-Nachrichten. Ein Config-Push mit QoS-2
kann verloren gehen, wenn die ESP-Verbindung abbricht.

Dieser Kompromiss ist durch fuenf aktive Kompensationsmechanismen abgemildert:
1. Heartbeat-State-Push (staerkster Kompensator, Cooldown ~120s)
2. Config-Push-Cooldown (120s)
3. Full-State-Push via MQTTCommandBridge mit ACK-Wait (DEFAULT_TIMEOUT=15s)
4. `actuator_states`-DB-Tabelle (persistierter letzter Zustand)
5. WS-Broadcast nach Reconnect

Es gibt KEIN dokumentiertes ADR (Architecture Decision Record), das erklaert ob diese
Einstellung bewusst gewaehlt wurde oder ein Legacy-Default ist.

**Kern-Frage MQTT-03:**
- Ist `disable_clean_session = 0` tatsaechlich in `mqtt_client.cpp:172` so gesetzt?
  (Code-Snippet + Commit-Hash)
- Gibt es irgendwo in `docs/` oder `.claude/` eine Dokumentation dieser Entscheidung?
- TM-Empfehlung: Soll die Einstellung auf `disable_clean_session = 1` (clean_session=false)
  geaendert werden? Trade-offs erklaeren (persistent Session = Broker haelt QoS-2 vor,
  aber: Session-Bloat bei vielen ESPs, Reconnect-Verhalten aendert sich).

**Liefer-Form MQTT-03:**
TM erstellt ADR-Datei `docs/analysen/adr-clean-session-strategie-2026-04-26.md` im Auto-one-Repo
als Teil des Berichts (kein eigener Bericht, sondern Anhang oder direkte Datei).

---

### MQTT-04 — ACL-Analyse veraltet

**Behauptung:**
Die bestehende Analyse (Datei `acl-topic-analyse-mqtt-2026-03-27.md` — pruefe ob im Auto-one-Repo
unter `docs/analysen/` oder anderem Pfad vorhanden) basiert auf Stand 2026-03-27 mit:
- 38 Topics gesamt / 31 aktiv (lt. alter Analyse)

Aktueller verifizierter Stand (AUT-175 E5, 2026-04-26):
- 34 Topics gesamt
- 17 aktive MQTT-Handler im Server (nicht 13 wie aeltere Docs angaben)
- 2 ORPHANED Topics: `sensor/batch` + `subzone/status`
- 5 neue Topics seit 2026-03-27 mit Handlern: `session/announce`, `system/heartbeat_metrics`,
  `intent/outcome`, `intent/outcome/lifecycle`, `queue/pressure`
- 1 GHOST-Kommentar (siehe MQTT-02)

**Kern-Frage MQTT-04:**
- Liegt `acl-topic-analyse-mqtt-2026-03-27.md` im Auto-one-Repo (oder existiert sie nur
  anderswo)? Falls im Repo: exakter Pfad.
- Stimmen die oben genannten aktuellen Zahlen mit dem Code-Stand heute? (TM prueft stichprobenartig:
  Anzahl Handler in `src/mqtt/` oder aequivalentem Ordner, neue Topics vorhanden?)
- Entscheidungsvorlage fuer Robin:
  - Option A: Bestehende Datei als "VERALTET (Stand 2026-03-27) — aktueller Stand: Hub C1
    `hub-mqtt-echtzeit-protokoll.md`" markieren
  - Option B: Neue Datei `acl-topic-analyse-mqtt-2026-04-26.md` mit korrekten Zahlen erstellen
  - TM-Empfehlung

---

## SOLL — Was der TM liefern soll

Der TM verteilt die Pruefung je nach Schicht an Backend-Spezialisten (MQTT-01 Server-Seite,
MQTT-02, MQTT-04) und Firmware-Spezialisten (MQTT-01 Firmware-Seite, MQTT-02 Gegenpruefe,
MQTT-03). Pro Unterpunkt:

1. **Status-Pruefung:** Existiert das Verhalten wie beschrieben?
2. **Code-Evidenz (Pflicht):** Datei-Pfad, Zeilennummer, Snippet, Commit-Hash.
3. **Erklaerung:** 1-3 Saetze Kontext.
4. **Entscheidungsvorlage** (bei MQTT-01 und MQTT-04): Zwei Optionen + TM-Empfehlung.
5. **ADR-Erstellung** (nur MQTT-03): Als eigenstaendige Datei anlegen.

**Code-Beweis-Anforderung — JEDER Unterpunkt MUSS enthalten:**
- **Datei-Pfad** (Auto-one-relativ)
- **Zeilennummer(n)**
- **Code-Snippet** (3-15 Zeilen in Markdown-Codeblock)
- **Commit-Hash oder -Datum** (via `git log -1 --pretty="%H %ad" -- <datei>`)
- **Begruendung** in 1-3 Saetzen

---

## Eingebetteter Fachkontext

### MQTT-Architektur AutomationOne

**Topic-Schema (kanonisch):**
```
kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command|status|response|alert
kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat|diagnostics|will|error|command
kaiser/{kaiser_id}/esp/{esp_id}/config
kaiser/{kaiser_id}/esp/{esp_id}/config_response
kaiser/{kaiser_id}/esp/{esp_id}/zone/assign|ack
kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign|remove|safe|ack
kaiser/broadcast/emergency
kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency
```

**Server-Stack:** paho-mqtt, MQTT 3.1.1 (NICHT 5.0). Correlation-ID nur im JSON-Payload,
nicht als MQTT-Header.

**Handler-Struktur Server:** 17 aktive MQTT-Handler (verifiziert AUT-175 E5). Pfad
vermutlich unter `src/mqtt/` oder `src/services/mqtt/` — TM verifiziert exakten Pfad.

**Firmware MQTT-Client:** `src/services/communication/mqtt_client.cpp`.
11 Subscriptions in `src/main.cpp:823-846`.

**Config-Push:**
- Trigger: 6 Aufrufer (`sensors.py:766/1058/1203`, `actuators.py:628/1170`,
  `heartbeat_handler.py:1312`)
- Cooldown: nur Heartbeat hat 120s Cooldown, CRUD-Ops haben kein Debounce
- VIRTUAL-Filter: `build_combined_config()` in `config_builder.py` filtert
  `interface_type='VIRTUAL'` aus (6 Callpoints, EIN Filter) — VPD wird nie an ESP gesendet

**QoS-Regeln (kanonisch):**
| Topic-Kategorie | QoS | Retain |
|-----------------|-----|--------|
| Sensor data | 0 | nein |
| Actuator command | 2 | nein |
| Actuator status | 1 | ja |
| Heartbeat | 0 | nein |
| Config-Push | 2 | nein |
| Emergency | 2 | nein |
| LWT | 1 | ja |

**Heartbeat:** Intervall 60s. ACK ist QoS 0, kommt nach DB-Arbeit, wird NICHT immer gesendet.
Server hat KEIN eigenes LWT — Server-Crash nur via Ausbleiben des Heartbeat erkennbar (~120s).

**clean_session Folgen (Kontext fuer MQTT-03):**
5 Kompensationsmechanismen aktiv. QoS-2 ist de-facto QoS-0 bei Disconnect,
weil Broker Session loescht. Naechster Heartbeat-State-Push (Cooldown ~120s) korrigiert.

**Mosquitto-Config (verifiziert E5):**
`max_keepalive=300s`, `max_inflight_messages=10`, `max_packet_size=262144` (256 KB),
`autosave_interval=300s`. `allow_anonymous=false`. ACL aktiv.

---

## Akzeptanzkriterien

Der Bericht ist nur akzeptiert, wenn JEDER der folgenden Punkte drei Felder hat:
`STATUS` + `Code-Evidenz` (Datei:Zeile+Snippet) + `Begruendung`.
Bei MQTT-01 und MQTT-04 zusaetzlich: `Entscheidungsvorlage (Option A / Option B + TM-Empfehlung)`.
Bei MQTT-03 zusaetzlich: ADR-Datei angelegt unter `docs/analysen/adr-clean-session-strategie-2026-04-26.md`.

| Punkt | Pruef-Frage | Erwartetes Feld |
|-------|-------------|-----------------|
| MQTT-01-FW | Firmware-Builder fuer sensor/batch + subzone/status vorhanden? | STATUS + Evidenz + Entscheidungsvorlage |
| MQTT-01-BE | Server-Handler fuer sensor/batch + subzone/status vorhanden? | STATUS + Evidenz + Entscheidungsvorlage |
| MQTT-02 | GHOST-Kommentar gefunden? Wortlaut + Datei:Zeile? ESP-Subscription in main.cpp:629? | STATUS + Evidenz |
| MQTT-03 | clean_session-Einstellung in mqtt_client.cpp verifiziert? ADR erstellt? | STATUS + Evidenz + ADR-Datei |
| MQTT-04 | Alter ACL-Analyse-Stand verifiziert? Aktuelle Zahlen stimmig? | STATUS + Evidenz + Entscheidungsvorlage |

---

## Berichts-Struktur (verbindlich fuer den TM)

Datei: `bericht-AUT-189-mqtt-01-02-03-04-2026-04-26.md` (in diesem Ordner)

```
# Bericht AUT-189 — MQTT-Verifikation MQTT-01/02/03/04

**Datum:** 2026-04-26
**Erstellt von:** [TM + Backend-Spezialist + Firmware-Spezialist]
**Commit-Stand:** [git log HEAD --format="%H %ad" -1]

## Executive Summary

- MQTT-01: [STATUS] — [Kernbefund: X Topics orphaned, Empfehlung Option A/B]
- MQTT-02: [STATUS] — [Kernbefund: Kommentar in Datei:Zeile, korrekte Aussage lautet...]
- MQTT-03: [STATUS] — [Kernbefund: clean_session=true bestaetigt/nicht bestaetigt, ADR angelegt]
- MQTT-04: [STATUS] — [Kernbefund: Zahlen stimmen/stimmen nicht, Empfehlung Option A/B]

## MQTT-01 — ORPHANED Topics

### Status
[BESTAETIGT (beide orphaned) | TEILWEISE (nur einer) | NICHT BESTAETIGT]

### Firmware-Seite
Datei: `src/...`
Zeile: X
Commit: [hash] ([datum])
```cpp
[Publish-Aufruf oder Topic-String-Definition]
```
Erklaerung: [1-3 Saetze]

### Server-Seite
Datei: `src/...`
Zeile: X (oder: KEIN HANDLER GEFUNDEN)
Erklaerung: [1-3 Saetze]

### Vollstaendige ORPHANED-Liste (Builder vorhanden, Handler fehlt)
| Topic | Builder-Datei:Zeile | Handler vorhanden? |
|-------|--------------------|--------------------|
| sensor/batch | ... | nein |
| subzone/status | ... | nein |
| [weitere falls gefunden] | ... | ... |

### Entscheidungsvorlage fuer Robin
- **Option A (Handler implementieren):** Aufwand ~[X Stunden], benoetigt [Y]
- **Option B (Builder entfernen):** Risiken: [Z], Pruef-Grep noetig fuer [W]
- **TM-Empfehlung:** Option [A/B], weil [Begruendung]

## MQTT-02 — GHOST-Kommentar
[Datei:Zeile, Original-Wortlaut, Gegenpruefe main.cpp:629, Commit]

## MQTT-03 — ADR clean_session
[Code-Snippet mqtt_client.cpp:172, Commit, Trade-Off-Erklaerung, Verweis auf ADR-Datei]

## MQTT-04 — ACL-Analyse Aktualitaet
[Datei-Existenz, Zahlen-Vergleich alt vs. aktuell, Entscheidungsvorlage Option A/B]

## Anhang: Konsultierte Spezialisten-Agenten
- [Agent-Name]: [Teilaufgabe] — [Sub-Befund in 1 Satz]

## Folge-Empfehlungen
[Was muesste als naechstes als Implementierungs-Issue raus?]
```

---

## Hinweise fuer den TM

- **Klaerungspunkte:** Ist ein Topic-Pattern nicht im Code auffindbar (Datei geloescht,
  umbenannt), explizit als "Quelle nicht auffindbar" markieren. Kein Raten.
- **MQTT-03 ADR:** Die ADR-Erstellung ist Teil dieses Verifikations-Auftrags und kein
  eigener Implementierungs-Auftrag. TM entscheidet Empfehlung, aber aendert KEINEN Code.
- **MQTT-04 Option A** (Veraltet-Markierung) kann TM direkt umsetzten, falls Robin-Entscheidung
  "Option A" lautet — das ist kein Code-Eingriff sondern Doku-Edit.
- **Git-Befehl:** `git log -1 --pretty="%H %ad" -- <datei>`
