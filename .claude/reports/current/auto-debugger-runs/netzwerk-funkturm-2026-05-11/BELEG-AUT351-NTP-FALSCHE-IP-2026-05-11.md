# BELEG: AUT-351 — NTP-Primärserver 192.168.0.39 hartcodiert (falsches Subnetz)

**Datum:** 2026-05-11
**Run-ID:** netzwerk-funkturm-2026-05-11
**Linear-Issue:** AUT-351
**Priorität im Bericht:** 2 (von 4)
**Schicht:** Firmware (El Trabajante)

---

## Finding-Beschreibung

Der NTP-Primärserver ist in `mqtt_client.cpp` auf `192.168.0.39` hartcodiert. ESP_EA5484 operiert im Subnetz `192.168.178.x` (Netz am Funkturm-Router). Der Server ist nicht erreichbar.

---

## Belege aus dem Netzwerk-Diagnose-Bericht

### Befund-Tabelle-Zeile (Bericht §Befund-Tabelle)

| Symptom | Schicht | Ursache | Priorität | Abhilfe |
|---------|---------|---------|-----------|---------|
| NTP-Primär `192.168.0.39` nicht erreichbar | Firmware / Konfiguration | IP aus anderem Subnetz hartcodiert im ESP-Firmware-Code | **2** | Im Firmware-Code IP auf Router-Gateway oder Hostname ändern |
| Offline-Rules-Zeitfilter inaktiv | Firmware | Folge von NTP-Fehler: kein `isInsideTimeWindow()` ohne gültige Zeit | **2 — Folge** | Behebt sich mit NTP-Fix |

### Bericht-Kontext (§Schritt 2)

> "Der ESP ist mit NTP-Primärserver `192.168.0.39` konfiguriert. Robin befindet sich aber im Subnetz `192.168.178.x` — der NTP-Server ist nicht erreichbar."
> "Die NTP-IP `192.168.0.39` ist im ESP-Quellcode (`mqtt_client.cpp` oder einer Konfigurationsdatei) hartcodiert. Robin kann das **nicht** am Pi ändern — es muss direkt im Firmware-Code korrigiert werden."

### Sicherheitsrelevanz

Betrifft direkt die Safety-P4-Logik (`isInsideTimeWindow()`): Bei fehlender NTP-Sync greift SKIP-Policy — Zeitfenster-Offline-Rules werden nicht ausgewertet. Das ist ein Korrektheitsfehler im sicherheitskritischen Pfad.

---

## Verifikationsbefehl (Pi-Seite)

```bash
ntpdate -q 192.168.0.39 2>&1    # → Timeout (nicht erreichbar)
ntpdate -q 192.168.178.1 2>&1   # → Router-Gateway als NTP-Alternative testen
```

---

## Empfehlung (aus Bericht §Firmware-Änderungstabelle)

| Was | Datei | Aktuell | Empfehlung |
|-----|-------|---------|------------|
| NTP-Primärserver | mqtt_client.cpp | `192.168.0.39` | Pi-IP im Zielnetz oder `pool.ntp.org` |

**Langfristig:** Pi als lokalen NTP-Server (chrony `local stratum 10`) konfigurieren, dann Pi-IP in Firmware.
