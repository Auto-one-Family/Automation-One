# Board-spezifische Pin-Konfiguration

## Übersicht

Das System unterstützt jetzt board-spezifische Pin-Konfigurationen für verschiedene ESP32-Boards. Jedes Board hat seine eigenen Hardware-Limitationen, die in der Pin-Auswahl berücksichtigt werden.

## Unterstützte Boards

### ESP32 DevKit (WROOM-32)
- **Verfügbare Pins:** 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33
- **I2C Pins:** SDA=21, SCL=22
- **Input-Only Pins:** 34, 35, 36, 39 (ADC Pins)
- **Reservierte Pins:** 0, 1, 3, 6, 7, 8, 9, 10, 11 (Boot, UART, SPI, etc.)

### ESP32-C3 (XIAO)
- **Verfügbare Pins:** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20, 21
- **I2C Pins:** SDA=5, SCL=6 (D4/D5)
- **Input-Only Pins:** Keine
- **Reservierte Pins:** 0 (Boot Pin)

## Features

### Board-Typ-Auswahl
- Dropdown in der ESP-Konfiguration
- Default: ESP32 DevKit
- Nachträglich änderbar

### Pin-Validierung
- **I2C-Sensoren:** Nur auf SDA-Pin verfügbar
- **Aktuatoren:** Nicht auf Input-Only Pins
- **Reservierte Pins:** Automatisch ausgegraut
- **Tooltips:** Erklären, warum ein Pin nicht verfügbar ist

### UI-Feedback
- **Grüne Pins:** Verfügbar
- **Rote Pins:** Reserviert (Boot, UART, etc.)
- **Gelbe Pins:** Input-Only (nur für Sensoren)
- **Graue Pins:** Bereits belegt

## Technische Details

### Store-Erweiterungen
- `boardPinConfigs`: Board-spezifische Pin-Definitionen
- `getEspBoardType()`: Board-Typ eines ESP abrufen
- `setEspBoardType()`: Board-Typ setzen
- `isPinValidForBoard()`: Pin-Validierung
- `getPinConflictReason()`: Konflikt-Begründung

### Validierungsregeln
1. I2C-Sensoren müssen auf SDA-Pin sein
2. Aktuatoren können nicht auf Input-Only Pins
3. Reservierte Pins sind nicht verfügbar
4. Pins müssen in der Board-spezifischen Liste sein

## Erweiterbarkeit

Neue Boards können einfach hinzugefügt werden:

```javascript
NEW_BOARD: {
  name: 'Board Name',
  availablePins: [1, 2, 3, ...],
  i2c: { sda: 21, scl: 22 },
  inputOnly: [],
  reserved: [0],
}
```

## Backend-Integration

- Board-Typ wird **nicht** ans Backend gesendet
- Pin-Validierung erfolgt nur im Frontend
- Backend erhält weiterhin GPIO-Nummern
- I2C-Konfiguration bleibt unverändert

## Sicherheit

- Hardware-spezifische Validierung verhindert Fehlkonfiguration
- Tooltips erklären Pin-Beschränkungen
- Keine "magische" Erkennung - explizite Auswahl erforderlich
- Backend-Fallback-Validierung als zusätzlicher Schutz
- UI-Warnhinweise bei Board-Typ-Auswahl
- Erweiterte Pin-Konflikt-Prüfung mit detaillierten Fehlermeldungen

## Verbesserungen

### UI-Verbesserungen
- **Board-Typ-Warnhinweis:** Klarer Hinweis auf korrekte Board-Auswahl
- **Board-Typ-Validierung:** Echtzeit-Validierung der Board-Auswahl
- **Pin-Validierung:** Erweiterte Fehlermeldungen mit Konflikt-Details
- **Board-Info:** Anzeige des aktuellen Board-Typs in der Pin-Konfiguration

### Backend-Integration
- **Fallback-Validierung:** Zusätzliche Pin-Validierung vor Backend-Sendung
- **Gefährliche Pins:** Automatische Erkennung und Ablehnung von System-Pins
- **I2C-Validierung:** Backend-seitige Prüfung der I2C-Pin-Kompatibilität
- Backend-Fallback-Validierung als zusätzlicher Schutz
- UI-Warnhinweise bei Board-Typ-Auswahl
- Erweiterte Pin-Konflikt-Prüfung mit detaillierten Fehlermeldungen

## Verbesserungen

### UI-Verbesserungen
- **Board-Typ-Warnhinweis:** Klarer Hinweis auf korrekte Board-Auswahl
- **Board-Typ-Validierung:** Echtzeit-Validierung der Board-Auswahl
- **Pin-Validierung:** Erweiterte Fehlermeldungen mit Konflikt-Details
- **Board-Info:** Anzeige des aktuellen Board-Typs in der Pin-Konfiguration

### Backend-Integration
- **Fallback-Validierung:** Zusätzliche Pin-Validierung vor Backend-Sendung
- **Gefährliche Pins:** Automatische Erkennung und Ablehnung von System-Pins
- **I2C-Validierung:** Backend-seitige Prüfung der I2C-Pin-Kompatibilität 