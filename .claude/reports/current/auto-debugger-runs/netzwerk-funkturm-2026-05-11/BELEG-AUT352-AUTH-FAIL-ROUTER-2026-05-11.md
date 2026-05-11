# BELEG: AUT-352 — 802.11 AUTH_FAIL (202) am Funkturm-Router (WPA/PMF-Inkompatibilität)

**Datum:** 2026-05-11
**Run-ID:** netzwerk-funkturm-2026-05-11
**Linear-Issue:** AUT-352
**Priorität im Bericht:** 1 — dominant
**Schicht:** Netzwerk/Infrastruktur (Router-Konfiguration)

---

## Finding-Beschreibung

ESP_EA5484 zeigt am Funkturm-Router wiederholte `AUTH_FAIL (202)`-Events im 802.11-Handshake. Am Vodafone-6F44-Router stabil — `AUTH_FAIL` fehlt dort vollständig. Die Differenz belegt, dass die Ursache in der Router-Konfiguration liegt.

---

## Belege aus dem Netzwerk-Diagnose-Bericht

### Befund-Tabelle-Zeilen (Bericht §Befund-Tabelle)

| Symptom | Schicht | Ursache | Priorität | Belastbarkeit | Abhilfe |
|---------|---------|---------|-----------|---------------|---------|
| `AUTH_FAIL (202)` im ESP-Seriell-Log | 802.11 / Router | PMF/WPA3-Inkompatibilität oder Kanalwechsel am Funkturm-Router | **1 — sofort** | Direkt aus Log belegt | Router: WPA2-Only + PMF=Optional + fester WLAN-Kanal |
| `NOT_AUTHED (6)` beim MQTT-Write-Versuch | 802.11 / lwIP | WLAN-Session war bereits verloren, lwIP meldet keinen Layer-2-Link | **1 — Folge** | Direkt aus Log belegt | Behebt sich mit AUTH_FAIL-Fix |
| Verbindung im 6F44-Netz stabil, Funkturm instabil | 802.11 | 6F44 hat andere 802.11-Konfiguration (keine PMF-Anforderung, stabilerer Kanal) | **1** | Differenzmessung nötig | Funkturm-Router auf 6F44-Niveau konfigurieren |

### Bericht-Kontext (§Schritt 1)

> "`AUTH_FAIL (202)` bedeutet: Der ESP hat versucht, sich am Access Point zu authentisieren (802.11-Handshake), und wurde abgewiesen. Das passiert auf der WLAN-Schicht, bevor TCP oder MQTT überhaupt ins Spiel kommen."
> "Im Vodafone-6F44-Netz fehlen `AUTH_FAIL` und `NOT_AUTHED` vollständig — deshalb ist es dort stabil."

### Log-Muster (Symptom-Kette aus Serial-Log, ESP_EA5484)

```
AUTH_FAIL (202)        ← WLAN-Authentisierung vom Router abgewiesen
NOT_AUTHED (6)         ← lwIP: WLAN-Session verloren beim MQTT-Write-Versuch
session taken over     ← ESP reconnectet zu schnell
exceeded timeout       ← Broker-Timeout → LWT ausgelöst
```

---

## Mögliche Router-Ursachen (aus Bericht §Schritt 1)

- PMF (Protected Management Frames / 802.11w) inkompatibel zwischen ESP32 und Router
- WPA3-Transition-Modus am Router aktiviert, aber ESP32 unterstützt kein WPA3-SAE
- Automatischer Kanalwechsel am Router unterbricht die Assoziation

---

## Empfehlung (aus Bericht §Schritt 5 + Schnell-Test-Protokoll)

**Router-Einstellungen am Funkturm-Router:**

| Einstellung | Zielwert |
|-------------|----------|
| WLAN-Kanal 2,4 GHz | Fester Kanal 1, 6 oder 11 (nicht Auto) |
| PMF / Protected Management Frames | Optional oder Disabled (nicht Required) |
| WPA-Modus | WPA2-Personal (CCMP/AES) — kein WPA3-Only |
| DTIM-Periode | 1 |
| Kanalbreite 2,4 GHz | 20 MHz |

**Erwartetes Testergebnis:** Kein `AUTH_FAIL` im Serial-Log, ARP-Eintrag stabil, Mosquitto-Verbindung hält 15+ Minuten.
