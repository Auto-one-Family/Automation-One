# AutomationOne

**Modulares IoT-Framework für skalierbare ESP32-basierte Sensor- und Aktor-Netzwerke**

## 🏗️ Architektur

```
AutomationOne
├── God (Raspberry Pi 5) ────────── KI & Analytics
├── God-Kaiser (Raspberry Pi 5) ─── Control & Database
├── Kaiser (Pi Zero, optional) ──── Relay Nodes
└── ESP32 Agents ────────────────── Sensor/Actuator Hardware
```

## 📁 Repository Struktur

```
Auto-one/
├── El Trabajante/     # ESP32 Firmware (C++/Arduino)
│   ├── src/          # 67 Module, 85 Dateien
│   ├── platformio.ini
│   └── README.md
├── El Servador/      # God-Kaiser Server (Python/FastAPI)
│   ├── src/          # API, MQTT, Services
│   ├── pyproject.toml
│   └── README.md
├── docs/             # Gemeinsame Dokumentation
└── README.md         # Dieses File
```

## 🚀 Quick Start

### ESP32 Firmware
```bash
cd "El Trabajante"
# Installation siehe El Trabajante/README.md
```

### God-Kaiser Server
```bash
cd "El Servador"
# Installation siehe El Servador/README.md
```

## 📊 Status

- [x] Projekt-Setup
- [x] ESP32 Dateistruktur (85 Dateien)
- [ ] ESP32 Implementation (in Arbeit)
- [ ] Server Struktur (geplant)
- [ ] Server Implementation (geplant)
- [ ] Frontend (geplant)

## 📖 Dokumentation

- **ESP32**: Siehe [El Trabajante/README.md](./El%20Trabajante/README.md)
- **Server**: Siehe [El Servador/README.md](./El%20Servador/README.md)
- **Architektur**: Siehe [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

## 🔧 Hardware

- **ESP32**: XIAO ESP32-C3 oder ESP32-WROOM-32
- **Server**: Raspberry Pi 5 (8GB)
- **Sensoren**: pH, EC, DS18B20, SHT31, etc.
- **Aktoren**: Pumpen, Ventile, PWM

## 📝 License

Privat / In Entwicklung
