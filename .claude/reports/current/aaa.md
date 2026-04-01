Analyse: Hysterese-Offline-Zustandsproblem
Das Problem in einem Satz
Der ESP kennt im Offline-Modus die Schwellenwerte der Regel, aber nicht den aktuellen Zustand (ist die Regel gerade aktiv oder nicht?) — und ohne diesen Zustand ist eine Hysterese-Logik per Definition nicht auswertbar.

Wie die Hysterese auf dem Server funktioniert
Die Logic Engine wertet Hysterese-Regeln mit zwei Schwellen aus, um Flattern zu verhindern:

activate_below = 45 → Befeuchter EIN wenn Feuchte unter 45%
deactivate_above = 55 → Befeuchter AUS wenn Feuchte ueber 55%
Der entscheidende Mechanismus: Derselbe Sensorwert hat je nach Zustand eine andere Bedeutung.

Feuchte 48% + is_active = False → "Warte bis 45%, tue nichts"
Feuchte 48% + is_active = True → "Befeuchter laeuft korrekt, warte bis 55%"
Der Zustand is_active lebt ausschliesslich in einem Python-Dictionary im RAM des Servers (self._states: Dict[str, HysteresisState]). Es gibt keine Datenbank-Tabelle dafuer (das ist Finding N2 aus der Deep-Dive-Analyse).

Was der Config-Push an den ESP liefert
Der Server sendet bei jedem Config-Push ein offline_rules-Array. Pro Regel werden diese NVS-Keys persistiert:

Key	Inhalt
ofr_{i}_en	Regel aktiviert (ja/nein)
ofr_{i}_agpio	Aktor-GPIO
ofr_{i}_sgpio	Sensor-GPIO
ofr_{i}_svtyp	Sensor-Typ (z.B. "sht31_humidity")
ofr_{i}_actb	activate_below (Einschaltschwelle)
ofr_{i}_deaa	deactivate_above (Ausschaltschwelle)
Was fehlt: ofr_{i}_state — ob die Regel gerade aktiv ist oder nicht.

Wie evaluateOfflineRules() aktuell arbeitet
Nach ca. 120s ohne Server-Heartbeat-ACK wechselt der OfflineModeManager in den Offline-Modus. Bei jeder Sensor-Messung laeuft dann:


Fuer jede Regel:
  1. Hole Sensorwert aus ValueCache
  2. NaN? → skip
  3. Pruefe: value < activate_below? → Aktor AN
     Pruefe: value > deactivate_above? → Aktor AUS
  4. Nichts davon? → tue nichts
Das ist keine Hysterese. Das ist eine zustandslose Schwellenpruefung. Ohne is_active fehlt der Memory-Effekt, der eine Hysterese definiert.

Dein konkretes Szenario — Schritt fuer Schritt

10:00  Feuchte 40% → Server: is_active=True, Befeuchter AN ✓
10:30  Feuchte 48% → Server: is_active=True, Befeuchter bleibt AN ✓
10:31  Server stoppt
10:33  ESP → Offline-Modus (120s Timeout)
10:34  Feuchte 48% → evaluateOfflineRules():
         48 < 45? NEIN → kein AN
         48 > 55? NEIN → kein AUS
         → ESP tut NICHTS
Ergebnis: Der Befeuchter laeuft physisch weiter (war vom Server eingeschaltet), aber die Offline-Logik erkennt nicht, dass er in der "toten Zone" zwischen 45-55% aktiv bleiben sollte. Wenn die Feuchte jetzt auf 52% steigt, passiert immer noch nichts — obwohl der Befeuchter eigentlich weiterlaufen sollte bis 55%.

Noch schlimmer: Faellt die Feuchte wieder auf 44%, schaltet die Offline-Logik den Befeuchter "ein" — obwohl er schon laeuft. Das ist harmlos. Aber das Problem ist, dass bei Werten in der toten Zone keinerlei Kontrolle stattfindet.

Warum GAR KEINE Regel mehr funktioniert
Jede Hysterese-Regel mit einem Sensorwert in der toten Zone beim Disconnect ist betroffen. Liegt der Wert ausserhalb der Zone (z.B. Feuchte 40% beim Disconnect), funktioniert die Offline-Regel zufaellig korrekt — weil 40 < 45 sofort den AN-Befehl triggert.

Robins Beobachtung "gar keine Regel funktioniert" trifft zu, weil seine Regel gerade aktiv war und der Sensorwert in der toten Zone lag. In diesem Zustand kann evaluateOfflineRules() keine Entscheidung treffen.

Der chirurgische Fix — 3 Stellen
1. NVS-Schema erweitern (Firmware)
Neuer Key pro Regel: ofr_{i}_state (uint8_t, 0=inaktiv, 1=aktiv). Nur bei Zustandswechsel schreiben (Wear-Schutz via Shadow-Copy wie bestehende memcmp-Logik).

2. evaluateOfflineRules() anpassen (Firmware)

Fuer jede Regel:
  1. Sensorwert aus ValueCache
  2. NaN? → skip
  3. Lade is_active aus RAM-Feld (NICHT jedes Mal NVS lesen)
  4. Heating: value < activate_below AND NOT is_active → AN, is_active=true
     Heating: value > deactivate_above AND is_active → AUS, is_active=false
  5. Bei Zustandswechsel → NVS-Write
  6. Aktor schalten
3. Config-Push erweitern (Server + Firmware)
Server liefert current_state_active: true/false im offline_rules-Payload. ESP uebernimmt den Wert in RAM + NVS. Damit ist beim naechsten Disconnect der korrekte Ausgangszustand bekannt.

Voraussetzung fuer Teil 3: Der Server muss selbst wissen, in welchem Zustand die Regel ist — und genau das ist Finding N2 (Hysterese-State DB-Persistenz). Beide Fixes gehoeren zusammen.