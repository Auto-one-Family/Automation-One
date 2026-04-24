# VERIFY-PLAN-REPORT — INC-2026-04-24-aut134-config-resync-oversize

> **Gate-Typ:** `/verify-plan` (auto-debugger Pflichtgate)  
> **Status:** ABGESCHLOSSEN  
> **Ergebnis:** ausführbar mit Korrekturen; Post-Verify-Mutation bereits in `TASK-PACKAGES.md` und `SPECIALIST-PROMPTS.md` übernommen.

---

## /verify-plan Ergebnis

**Plan:** AUT-134/EA-132 Incident-Kette absichern (Config-Oversize + Heartbeat-Oversize) ohne Breaking Changes.  
**Geprüft:** 16 Pfade, 5 Rollen, 4 Testkommandogruppen, 2 Architekturdocs.

### ✅ Bestätigt
- `auto-debugger/work` ist aktiver Branch und als Pflichtbranch korrekt.
- Firmware-Limits sind real: Config-Ingress `4096`, Publish-Lane `1024`.
- Drift-getriebener Auto-Push-Pfad in `heartbeat_handler.py` ist vorhanden.
- Relevante Testpfade existieren (`test_heartbeat_handler.py`, `test_esp_service_mock_config_response.py`, `useESPStatus.test.ts`, `test_topic_builder.cpp`).
- Zielkonflikt "Stabilität zuerst, dann Split/Utilization" ist mit TM-Kontext kompatibel.

### ⚠️ Korrekturen nötig (eingearbeitet)
- **Server-Paketpräzisierung:** Budget-Gate muss vor `_auto_push_config()` greifen, nicht erst im Firmware-Reject.
- **Firmware-Paketpräzisierung:** Config-Reject-Pfad braucht explizites Correlation-Echo als Akzeptanzkriterium.
- **MQTT/Firmware-Abgrenzung:** PKG-03 als gemeinsames Paket (`esp32-dev` + `mqtt-dev`) statt nur einer Rolle.
- **Frontend-Reihenfolge:** Frontend erst nach stabiler Outcome-Kette aus PKG-01/02 starten.
- **DB-Evidence-Lücke:** optionales `db-inspector`-Paket als P1 ergänzt.

### 📋 Fehlende Vorbedingungen
- [ ] Vollständiger Docker-Raw-Export für das betroffene Zeitfenster (Broker/Server/Alloy) durch Robin.
- [ ] Falls PKG-05 gezogen wird: DB-Zugriff im aktiven Stackfenster.

### 💡 Ergänzungen
- Terminal-COM3-Spuren (`payload_len=1225..1229`) wurden als eigene 1024-Lane behandelt, nicht mit 4096-Config-Limit vermischt.
- User-Event-CID `f9f74534-...` ist primärer Kettenschlüssel; fehlende Notification-Felder bleiben explizit offen.

### Zusammenfassung für TM
Der Plan ist ausführbar, wenn zuerst der serverseitige Budget-Gate (PKG-01) umgesetzt wird und erst danach Firmware/Frontend folgen. Die Post-Verify-Korrekturen sind bereits in Paketreihenfolge, Testbefehlen und Rollenaufteilung eingearbeitet. Hauptblocker bleibt die unvollständige Docker-Forensik für exakt dieselbe Zeitachse.

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta
| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | Pfade auf `heartbeat_handler.py` + `esp_service.py` fokussiert; Testkommandos auf existierende pytest-Dateien präzisiert; Reihenfolge auf Startpaket gesetzt; Risiko: ohne Budget-Gate bleibt Oversize-Loop. |
| PKG-02 | Correlation-Echo als explizites AK ergänzt; Scope auf Config-Ingress-Pfade begrenzt; HW-Gate: ESP-Build Pflicht; Risiko: ohne Echo bleibt Korrelation lückenhaft. |
| PKG-03 | Von Einzelrolle auf Co-Ownership (`esp32-dev` + `mqtt-dev`) geändert; Ziel klar auf 1024-HB-Lane; Live-HW-Gate (10min COM3) ergänzt; verworfener Teil: pauschale Topic-Umbauten ohne Evidence. |
| PKG-04 | Start erst nach PKG-01/02; Scope auf bestehende UI-Pfade ohne Parallel-UI; Testpfade auf vorhandene Unit-Tests korrigiert. |
| PKG-05 | Neu ergänzt: optionale DB-Stichprobe für CID-Vollkette; kein Produktcode, nur Evidence-Nachzug. |

### PKG → empfohlene Dev-Rolle
| PKG | Rolle (z. B. server-dev, frontend-dev, esp32-dev, mqtt-dev) |
|-----|---------------------------------------------------------------|
| PKG-01 | server-dev |
| PKG-02 | esp32-dev |
| PKG-03 | esp32-dev + mqtt-dev |
| PKG-04 | frontend-dev |
| PKG-05 | db-inspector (optional) |

### Cross-PKG-Abhängigkeiten
- PKG-01 -> PKG-02: Ohne serverseitigen Budget-Gate bleibt Firmware in Oversize-Resync-Schleifen.
- PKG-02 -> PKG-03: Erst stabile Config-Reject-Kette, dann Heartbeat-Lane-Härtung.
- PKG-01 + PKG-02 -> PKG-04: Frontend-Operatorik erst nach konsistenter Outcome-Kette.
- PKG-01 -> PKG-05: DB-Forensik erst sinnvoll nach finaler Server-Eventstruktur.

### BLOCKER
- Fehlender vollständiger Docker-Raw-Logsatz (Server/Broker/Alloy) für das exakte Incident-Zeitfenster.
- CID `f9f74534-...` liegt als User-Event vor, aber ohne vollständigen Workspace-seitigen HTTP/Notification-Metadaten-Dreiklang.
- Live-Hardware-Gates (ESP Build + COM3-Lauf) sind für finale Entwarnung erforderlich.
