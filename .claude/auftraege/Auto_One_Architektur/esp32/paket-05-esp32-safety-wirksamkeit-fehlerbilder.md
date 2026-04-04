# Paket 05: ESP32 Safety-Wirksamkeit gegen Fehlerbilder (P1.5)

## 1) Ziel

Wirksamkeitsmatrix:
`Safety-Barriere -> Fehlerbild -> Rest-Risiko -> Einstufung`

Basis:
- P1.2 Runtime/Trigger,
- P1.3 Sensor-Fehlermatrix,
- P1.4 Reboot/Power-Loss Konsistenz,
- Codepfade in `offline_mode_manager`, `safety_task`, `config_update_queue`, `main.cpp`.

Einstufungen:
- **safe**
- **safe aber degradiert**
- **unsicher/unklar**

## 2) Matrix (inkl. P1.4 `FW-CONS-*` Mapping)

| Fehlerbild (inkl. P1.4) | Zentrale Safety-Barriere(n) | Ergebnis | Rest-Risiko |
|---|---|---|---|
| FW-CONS-001 Normaler Reboot | FW-SAF-001, FW-SAF-014, FW-SAF-015 | safe | kurze Datenaufwaermphase bis neue Sensorwerte da sind |
| FW-CONS-002 Power-Loss vor Queue-Drain | FW-SAF-013, FW-SAF-014 | safe aber degradiert | alte Konfig bleibt aktiv, Server erwartet evtl. neuen Stand |
| FW-CONS-003 Power-Loss waehrend Persistenz | FW-SAF-014 (teilweise), FW-SAF-015 (teilweise) | unsicher/unklar | Atomikgrenze ueber mehrere Konfig-Domaenen offen |
| FW-CONS-004 Power-Loss in OFFLINE_ACTIVE | FW-SAF-005, FW-SAF-007, FW-SAF-010 | safe aber degradiert | transienter Rule-Neuaufbau nach Neustart |
| FW-CONS-005 Rule-Blob CRC/Size defekt | FW-SAF-014, FW-SAF-012 | safe aber degradiert | ohne gueltige Regeln bleibt nur Safe-State-Fallback |
| FW-CONS-006 NVS-Write-Fail bei Statusdaten | FW-SAF-003, FW-SAF-006, FW-SAF-015 | unsicher/unklar | Runtime-vs-NVS-Drift fuer Reboot-Startzustand moeglich |
| FW-CONS-007 Reboot bei Publish-Backpressure | FW-SAF-013, FW-SAF-010 | safe | Telemetrieluecken, lokal aber weiter funktionsfaehig |
| FW-CONS-008 Reboot nach langem Sensorfehler | FW-SAF-010, FW-SAF-016 | safe aber degradiert | CB-/Cache-Zustand reset, kurze Re-Lernphase |
| NaN/Stale direkt nach Reboot | FW-SAF-010 | safe aber degradiert | Rule-Skip kann Aktor laenger im vorherigen Zustand halten |
| Queue full (config/command/publish) | FW-SAF-013, FW-SAF-012 | safe aber degradiert | silent/halb-silent Drops, fehlender harter Nack-Contract |
| Config JSON parse fail (Queue worker) | FW-SAF-013 (nur Transport), sonst Luecke | unsicher/unklar | kein garantierter negativer `config_response` |
| Server command waehrend OFFLINE_ACTIVE | FW-SAF-007 | safe | Override-Lebensdauer bei langen Flaps operational beobachten |
| Reconnect ohne ACK | FW-SAF-006 | safe | lokale Rules bleiben aktiv bis ACK (bewusste Degradation) |
| Emergency waehrend Queue-Backlog | FW-SAF-011 | safe | queued Folgekommandos muessen weiter robust abgefangen werden |

## 3) Bewertete Wirksamkeit pro Safety-Barriere

| Safety-Barriere | Gegen welche Fehlerbilder wirksam | Wirksamkeitsnote | Kommentar |
|---|---|---|---|
| FW-SAF-003 ACK-Timeout | serverseitiger Ausfall/ACK-Stillstand | hoch | trigger fuer P4 sauber vorhanden |
| FW-SAF-004 30s Grace | kurze Disconnect-Flaps | hoch | reduziert Thrashing vor Offline-Aktivierung |
| FW-SAF-005 Offline Rules | laengere Trennung mit lokalen Sensorwerten | hoch | stark bei gueltigen/stabilen Messwerten |
| FW-SAF-006 ACK-basierter Re-Entry | reconnect race conditions | hoch | ACK bleibt klare Autoritaet fuer ONLINE |
| FW-SAF-007 Server Override | Rule-vs-Command Konflikt | hoch | verhindert unmittelbares Gegenschalten |
| FW-SAF-010 NaN/Stale Guard | ungueltige Sensorwerte | mittel | fail-safe durch skip, aber mit Verfuegbarkeitskosten |
| FW-SAF-014 Rule-Blob CRC/Size | korrupte Rule-Persistenz | hoch | robuste defensive Behandlung (rule_count=0) |
| FW-SAF-015 Persistenter Reset bei ACK | stale `is_active` ueber Reboot | mittel | bei NVS-Write-Fail bleibt Restdrift moeglich |

## 4) Rest-Risiko-Bild

### Kritisch
- **R1:** Unklare Persistenz-Atomik bei kombinierten Writes.
- **R2:** Write-Fail auf safety-relevanten Zustandsdaten ohne nachgewiesene Ende-zu-Ende Recovery-Garantie.

### Hoch
- **R3:** Fehlender verpflichtender Nack bei Config-Parse-Fail.
- **R4:** Reboot-NaN/Stale-Phase kann Offline-Entscheidungen auf hold/skip zwingen.

### Mittel
- **R5:** Queue Drops sind nicht als harter Delivery-Contract abgesichert.
- **R6:** Lokale Behandlung von `quality=suspect` ist nicht als globales Stop-Kriterium formalisiert.

## 5) Ergebnis fuer P1.5

Die meisten Fehlerbilder werden fail-safe oder fail-degraded behandelt. Unsicher bleiben primär die Persistenzkonsistenz bei Teil-/Fehlwrites und die fehlende verpflichtende Rueckmeldung in bestimmten Config-Fehlerpfaden. Genau diese Punkte muessen im P1.6 Netzwerk-/Reconciliation-Contract zwingend geschlossen werden.
