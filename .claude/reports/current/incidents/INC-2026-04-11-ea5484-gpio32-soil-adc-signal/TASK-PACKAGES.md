# TASK-PACKAGES — INC-2026-04-11-ea5484-gpio32-soil-adc-signal

**Stand:** Nach `/verify-plan`-Gate (Rev. 1, 2026-04-11).  
**Branch-Pflicht:** Änderungen und Commits nur auf **`auto-debugger/work`**; vor Arbeit `git checkout auto-debugger/work` und Branch verifizieren.

---

## PKG-01 — Hardware-Gate (P0, BLOCKER bis Messung)

**Owner:** Robin / HW-Betrieb (kein Code-Zwang).  
**Risiko:** Niedrig (Messung), kein SafetyController.

**Ziel:** ADC-Pfad GPIO 32 **physikalisch** verifizieren; **4095**-Reproduktion eliminieren oder als **BLOCKER** dokumentieren.

**Checkliste (messbar):**

1. Spannung am Analog-Pin **im Messmoment** (oszilloskop/multimeter): erwartbar innerhalb 0–3,3 V; keine schwebenden Eingänge.  
2. **Masse** gemeinsam ESP↔Sensor-Modul; Kabellänge minimieren.  
3. Modul laut Datenblatt (Spannungsteiler / Kapazität 0,1 µF laut `moisture.py`-Kommentar) prüfen.  
4. Während ruhiger MQTT-Last erneut messen (Serial): `ADC rail … 4095` darf nach Behebung **nicht** reproduzierbar sein — sonst **BLOCKER: Hardware** festhalten.

**Akzeptanzkriterien:**

- [ ] Protokoll (Fotos/Messwerte, **ohne** WLAN-Passwörter) im Ticket/Report angehängt.  
- [ ] Entweder: 4095 nach Fix **weg** — oder: **BLOCKER** mit Evidenz „trotz OK-Beschaltung 4095“.  
- [ ] Kein Commit auf `master`; HW braucht keinen Git-Commit.

**Abhängigkeit:** Keine Software-PKGs (PKG-02/03) als Ersatz für offenes PKG-01.

---

## PKG-02 — Firmware: optionale ADC-Stichprobe (nur nach PKG-01)

**Owner:** `esp32-dev`  
**Risiko:** Mittel — Timing, kein `delay()` in der Haupt-MQTT-Schleife (`.cursor/rules/firmware.mdc`); **keine** Änderungen am `SafetyController` ohne separates Risiko-Paket (Steuer `forbidden`).

**Ziel:** Falls HW ok, aber Rauschen: **nicht-blockierende** Mehrfachabtastung (Median/Mittel über kurzes Fenster) **nur** im Sensor-Messpfad evaluieren.

**Repo-IST (Verify):** `readRawAnalog()` nutzt aktuell **einen** `analogRead(gpio)` — kein Median-Block in `sensor_manager.cpp` (Abweichung zu älteren Analyse-Dokumenten, die 9 Samples behaupten).

**Akzeptanzkriterien:**

- [ ] `cd "El Trabajante" && pio run -e esp32_dev` Exit 0 (für ESP32 Dev/WROOM; bei Seeed XIAO: `-e seeed_xiao_esp32c3` — Board laut Hardware wählen).  
- [ ] Kein neuer blockierender `delay()` im MQTT-Hot-Path.  
- [ ] Unit-/HW-Test-Strategie dokumentiert (Wokwi vs. echter ESP).  
- [ ] Commits nur auf `auto-debugger/work`.

---

## PKG-03 — Server: optionale Entlastung Mess-Burst (nach PKG-01)

**Owner:** `server-dev`  
**Risiko:** Niedrig bis mittel (API-Verhalten).

**Ziel:** Rate-Limit / Queue für `POST /api/v1/sensors/{esp_id}/{gpio}/measure` oder UI-Drosselung — **reduziert** MQTT-Last; **löst** ADC-4095 **nicht**.

**Repo-IST:** `El Servador/god_kaiser_server/src/api/v1/sensors.py` → `trigger_measurement` → `sensor_service.trigger_measurement`.

**Akzeptanzkriterien:**

- [ ] `cd "El Servador/god_kaiser_server" && poetry run pytest` (relevante Tests + neue Unit-Tests für Limit-Verhalten falls implementiert).  
- [ ] Kein Breaking der Kalibrier-API ohne separates Gate.  
- [ ] Commits nur auf `auto-debugger/work`.

---

## PKG-04 — Referenz-Doku (optional, niedrig)

**Owner:** Robin / `agent-manager` (Doku), kein Produktzwang.

**Ziel:** `.claude/reference/api/REST_ENDPOINTS.md` ergänzen um **`POST /api/v1/sensors/{esp_id}/{gpio}/measure`** (IST im Code; in Referenz-Tabelle derzeit nicht gelistet — nur `/sensors/{sensor_id}/trigger` o. ä.).

**Akzeptanz:** PR-Text verweist auf VERIFY-PLAN-REPORT Abschnitt Referenz.

---

## PKG-05 — DB-Stichprobe (optional)

**Owner:** `db-inspector` (Read-only, keine Secrets in Reports).

**Ziel:** `sensor_configs` für `ESP_EA5484`, GPIO 32 — Kalibrierung `linear_2point` bestätigen (bereits im Bericht beschrieben); Lücken schließen falls UI/DB divergieren.

**Akzeptanz:** Kurzprotokoll ohne Passwörter/DSN in Markdown.
