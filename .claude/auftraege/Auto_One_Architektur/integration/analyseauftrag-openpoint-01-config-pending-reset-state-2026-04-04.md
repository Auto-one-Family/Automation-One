# Analyseauftrag Open Point 01: Expliziter Runtime-Status bei Config-Pending nach Reset

**Typ:** Eigenstaendiger Analyseauftrag  
**Prioritaet:** P1  
**Ziel:** Verhindern, dass ein System nach Power-Loss mit unvollstaendiger Aktor-/Regelbasis still als "normal" laeuft.

## 1) Problemkern

Nach einem Reset kann der Sensorpfad bereits vollstaendig sein, waehrend Aktor- oder Regelkonfiguration noch fehlt und erst spaeter per Config-Push nachgeladen wird.  
Wenn dieser Zustand nicht explizit modelliert ist, entstehen zwei Risiken:

1. falsche Betriebsannahme ("normal", obwohl zentrale Basis fehlt),
2. uneindeutige Guard-Logik fuer zulassige und unzulassige Aktionen.

## 2) Zielzustand

Ein expliziter Zwischenzustand, z. B. `CONFIG_PENDING_AFTER_RESET`, mit klaren Regeln:

- Welche Eingangsarten sind erlaubt?
- Welche Schaltpfade sind blockiert?
- Welche Events fuehren in den Vollbetrieb?

## 3) Pflichtanalyse

1. Definiere Mindestbasis fuer "voll betriebsbereit":
   - Aktorkonfig vorhanden,
   - Offline-Regelbasis konsistent,
   - Safety-Bedingungen erfuellt.
2. Modellieren des Zwischenzustands:
   - Eintrittsbedingungen,
   - erlaubte Aktionen,
   - Exit-Kriterien.
3. Kollisionen mit Reconnect/ACK/Admission pruefen:
   - kein externer Aktoreffekt ohne volle Freigaben.

## 4) Fixanforderungen

1. Runtime-State explizit im Zustandsmodell einfuehren.
2. Guard-Matrix pro Nachrichtentyp (command/config/emergency/heartbeat).
3. Status- und reason-codes fuer blocked actions.
4. Telemetrie fuer Eintritt/Austritt des Zwischenzustands.

## 5) Abnahmekriterien

- [ ] Zwischenzustand ist explizit sichtbar und testbar.
- [ ] Keine implizite "normal"-Annahme bei unvollstaendiger Konfigurationsbasis.
- [ ] Definierte Exit-Bedingung in Vollbetrieb ist reproduzierbar.
- [ ] Guard-Verhalten ist fuer alle externen Eingangsarten konsistent.

