# ESP Registrierungs-Flow Report

**Datum:** 2026-02-15
**Modus:** Playwright User-Simulation (wie User würde registrieren)
**Screenshots:** `logs/frontend/playwright/esp-registration-flow/`

---

## 1. Zusammenfassung

Playwright hat den **vollständigen User-Flow** simuliert: Login → Dashboard → Pending-Panel öffnen → ESP (MOCK_E1BD1447) genehmigen. **Erfolgreich.** MOCK_E1BD1447 wechselte von `pending_approval` zu `online`. Backend bestätigt: health_check_esps 1 checked, 1 online.

---

## 2. Ablauf (Playwright-Schritte)

| Schritt | Aktion | Screenshot | Ergebnis |
|---------|--------|------------|----------|
| 1 | Landing/Login-Seite laden | 01-landing-or-login.png | - |
| 2 | Login-Form ausfüllen (admin / Admin123#) | 02-login-form-filled.png | - |
| 3 | Dashboard nach Login | 03-dashboard-after-login.png | Redirect OK |
| 4 | Geräte-Button klicken (Pending-Panel) | 04-pending-panel-open.png | Panel öffnet |
| 5 | Pending-Devices-Liste | 05-pending-devices-list.png | MOCK_E1BD1447 sichtbar |
| 6 | Genehmigen-Button klicken | 06-after-approval.png | Approval API-Call |
| 7 | Dashboard final | 07-dashboard-final.png | Device approved |

---

## 3. Technische Anpassungen

- **Viewport-Problem:** Pending-Panel ist `position: fixed`. Klicks auf Genehmigen/Schließen schlugen mit "element outside viewport" fehl. **Lösung:** `element.evaluate(el => el.click())` statt `locator.click()`.
- **ES Module:** `__dirname` nicht verfügbar → `fileURLToPath(import.meta.url)`.
- **Test-Config:** `storageState: { cookies: [], origins: [] }` für frischen Login-Flow (ohne globalSetup-Auth).

---

## 4. Backend-Verifikation (nach Flow)

| Check | Vorher | Nachher |
|-------|--------|---------|
| esp_devices MOCK_E1BD1447 | pending_approval | **online** |
| health_check_esps | 0 checked | **1 checked, 1 online** |
| Server-Logs | - | WebSocket broadcast esp_health für MOCK_E1BD1447 |

**Bekannte Hinweise (unverändert):**
- ZONE_MISMATCH: ESP meldet zone_id=greenhouse, DB hat None
- Sensor 21_sht31_temp, 4_DS18B20, 5_pH: not in config (keine sensor_configs in DB)
- Invalid JSON auf system/will (leere Payload)

---

## 5. Screenshot-Pfade

```
logs/frontend/playwright/esp-registration-flow/
├── 01-landing-or-login.png
├── 02-login-form-filled.png
├── 03-dashboard-after-login.png
├── 04-pending-panel-open.png
├── 05-pending-devices-list.png
├── 06-after-approval.png
└── 07-dashboard-final.png
```

---

## 6. Empfehlungen

1. **SHT31 konfigurieren:** Nach Approval Sensoren (GPIO 21 temperature/humidity) über API/Frontend hinzufügen.
2. **ESP_472204:** Echten ESP verbinden – gleicher Flow (Heartbeat → Pending → Approve).
3. **Zone-Mismatch:** Optional Zone-Zuweisung im Frontend prüfen (ESP hat greenhouse, DB None).

---

*Flow ausgeführt via `npx playwright test esp-registration-flow.spec.ts --project=chromium`*
