# T20 Screenshots — Monitor L2 Sensor-Cards

**Status:** Alle 6 Screenshots am 2026-03-11 per Playwright MCP gesammelt.

## Dateien

| # | Datei | Inhalt |
|---|-------|--------|
| 1 | `01-monitor-l1-zonen.png` | Monitor L1, Zone-Übersicht |
| 2 | `02-monitor-l2-sensor-cards.png` | L2 Sensor-Cards (Zelt 1, Pflanze 1) |
| 3 | `03-monitor-l2-nach-60s.png` | L2 nach 60s — Card-Werte unverändert |
| 4 | `04-seitenpanel-temp-geoeffnet.png` | **BUG:** Temp-Panel zeigt 46,7 °C (Humidity-Wert!) |
| 5 | `05-seitenpanel-humidity-geoeffnet.png` | Humidity-Panel korrekt: 45,7 %RH |
| 6 | `06-vergleichen-mit-beide.png` | Beide im Overlay — Werte korrekt getrennt |

## Verifizierte Befunde

- **02 vs 03:** Keine Änderung der Card-Werte (kein Live-Update) ✓
- **04:** Temperatur-Panel zeigt Humidity-Wert mit °C — Temp/Hum vermischt ✓
- **05:** Humidity-Panel zeigt korrekten Wert ✓
- **06:** „Vergleichen mit“ — beide Werte korrekt ✓
