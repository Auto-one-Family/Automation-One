SAFETY-RTOS-IMPL Phase M4: Mutexes + Thread-Safety
Referenz: auftrag-SAFETY-RTOS-IMPL-dual-task-migration-2026-03-30.md, Abschnitt "Phase M4"
Abhaengigkeit: M3 (Communication-Task) MUSS abgeschlossen sein.

Kontext
Nach M1-M3 laufen zwei Tasks auf zwei verschiedenen CPU-Kernen:

Core 0: Communication-Task (WiFi, MQTT-Management, Publish-Queue, Timer)
Core 1: Safety-Task (Sensoren, Aktoren, Safety-Checks, Command-Queues)
ESP-IDF MQTT: Interner Task auf Core 0 (Event-Handler, Message-Empfang)
Jetzt finden ECHTE Cross-Core-Zugriffe statt:

Config-Push kommt via MQTT Event-Handler (Core 0) → schreibt sensors_[]/actuators_[]
Sensor-Read im Safety-Task (Core 1) → liest sensors_[]
I2C-Bus: Sensor-Init bei Config-Push (Core 0) vs. Sensor-Read (Core 1)
Ohne Synchronisation: Race Conditions, Bus-Kollisionen, Crashes.

Aufgabe
Analyse ZUERST (KRITISCH)
ALLE globalen/statischen Variablen auflisten die von BEIDEN Tasks gelesen/geschrieben werden
i2c_bus.cpp (src/drivers/i2c_bus.cpp) komplett lesen — alle Wire-Aufrufe identifizieren
sensor_manager.cpp → configureSensor() lesen — wird von Config-Push aufgerufen (Core 0)
actuator_manager.cpp → alle Public Methods: welche werden von Core 0 aufgerufen?
Pruefen ob DynamicJsonDocument in beiden Tasks instanziiert wird (muss jeweils LOKAL sein, nicht statisch/global — sonst Race Condition auf JSON-Parser-State)
M4.1 — Mutex-Initialisierung
In setup() — VOR Task-Erstellung:


SemaphoreHandle_t g_actuator_mutex      = xSemaphoreCreateMutex();
SemaphoreHandle_t g_sensor_mutex        = xSemaphoreCreateMutex();
SemaphoreHandle_t g_i2c_mutex           = xSemaphoreCreateMutex();
SemaphoreHandle_t g_gpio_registry_mutex = xSemaphoreCreateMutex();
M4.2 — I2C/Wire Mutex (KRITISCH)
Die Arduino Wire-Bibliothek ist NICHT thread-safe. Gleichzeitiger I2C-Zugriff von
Core 0 (Config-Push mit Sensor-Init) und Core 1 (Sensor-Read) fuehrt zu Bus-Kollision.

In i2c_bus.cpp (src/drivers/i2c_bus.cpp) ALLE Wire-Aufrufe mit g_i2c_mutex wrappen.

Beispiel:


bool I2CBus::readRegister(uint8_t addr, uint8_t reg, uint8_t* buf, size_t len) {
    if (xSemaphoreTake(g_i2c_mutex, pdMS_TO_TICKS(250)) != pdTRUE) {
        ESP_LOGW("I2C", "Mutex timeout — skipping read");
        return false;
    }
    Wire.beginTransmission(addr);
    Wire.write(reg);
    Wire.endTransmission(false);
    size_t received = Wire.requestFrom(addr, len);
    for (size_t i = 0; i < received && i < len; i++) {
        buf[i] = Wire.read();
    }
    xSemaphoreGive(g_i2c_mutex);
    return received == len;
}
Timeout 250ms: SHT31-Messung ~15ms, aber Config-Push mit Sensor-Init kann sich mit
laufendem Sensor-Read-Zyklus ueberlappen. 100ms waere zu knapp.

JEDE Methode in i2c_bus.cpp die Wire aufruft braucht den Mutex — nicht nur readRegister.

M4.3 — OneWire Mutex (Pruefung)
OneWire-Protokoll ist zeitkritisch (Pulse-Timing). Interruption = CRC-Failures.

Erwartung: OneWire-Sensor-Reads passieren NUR im Safety-Task (Core 1), OneWire-Scans
nur per MQTT-Command (ueber Queue ebenfalls auf Core 1). Dann braucht OneWire KEINEN
Mutex — alles ist auf Core 1 serialisiert.

PRUEFEN: Gibt es OneWire-Zugriffe AUSSERHALB von sensorManager? Falls ja: Mutex noetig.

M4.4 — Actuator-Mutex
g_actuator_mutex um JEDEN Zugriff auf actuators_[] in actuator_manager.cpp:


void ActuatorManager::processActuatorLoops() {
    xSemaphoreTake(g_actuator_mutex, portMAX_DELAY);
    // ... bestehender Code ...
    xSemaphoreGive(g_actuator_mutex);
}

void ActuatorManager::handleActuatorCommand(const String& topic, const String& payload) {
    xSemaphoreTake(g_actuator_mutex, portMAX_DELAY);
    // ... bestehender Code ...
    xSemaphoreGive(g_actuator_mutex);
}

void ActuatorManager::setAllActuatorsToSafeState() {
    xSemaphoreTake(g_actuator_mutex, portMAX_DELAY);
    // ... bestehender Code ...
    xSemaphoreGive(g_actuator_mutex);
}
portMAX_DELAY: Aktor-Operationen duerfen nicht uebersprungen werden (Safety).

M4.5 — Sensor-Mutex
Analog: g_sensor_mutex um alle sensors_[] Zugriffe in sensor_manager.cpp.
Besonders kritisch: configureSensor() (via Config-Push, kommt ueber Queue von Core 0)
vs. performAllMeasurements() (Core 1).

M4.6 — Config-Update-Queue (Core 0 → Core 1)
Config-Push kommt via MQTT (Core 0). Statt direkt configureSensor()/configureActuator()
aufzurufen (Race Condition auf sensors_[]/actuators_[]), wird ein Config-Update in die
Queue gelegt und auf Core 1 verarbeitet:


struct ConfigUpdateRequest {
    enum Type { SENSOR_CONFIG, ACTUATOR_CONFIG, SYSTEM_CONFIG } type;
    char json_payload[2048];   // Config-Push Full-State JSON kann > 1024 Bytes sein
};

QueueHandle_t g_config_update_queue = xQueueCreate(5, sizeof(ConfigUpdateRequest));
// Queue-Tiefe 5 reicht: Config-Pushes kommen selten (nach Boot, nach CRUD)
// 5 * ~2052 = ~10KB Heap
Core 0 sendet, Core 1 verarbeitet in processConfigUpdateQueue() — aufgerufen im
Safety-Task Loop (nach M4 hinzufuegen).

Akzeptanzkriterien
 Kein I2C-Bus-Lockup bei gleichzeitigem Config-Push und Sensor-Read
 Kein Crash bei gleichzeitigem Aktor-Command und processActuatorLoops()
 Emergency-Stop funktioniert innerhalb < 10ms (xTaskNotify, nicht Queue)
 Config-Push wird korrekt an Core 1 weitergeleitet und angewendet
 Stack Highwater Mark beider Tasks loggen — kein Overflow
 Heap-Monitoring: ESP.getFreeHeap() alle 60s loggen — kein Memory-Leak
Was NICHT gemacht wird
Keine neuen Features
Kein Backend/Frontend
Keine Aenderung der MQTT-Topic-Struktur