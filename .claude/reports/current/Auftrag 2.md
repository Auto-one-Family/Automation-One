SAFETY-RTOS-IMPL Phase M3: Communication-Task auf Core 0
Referenz: auftrag-SAFETY-RTOS-IMPL-dual-task-migration-2026-03-30.md, Abschnitt "Phase M3"
Abhaengigkeit: M2 (ESP-IDF MQTT) MUSS abgeschlossen sein.

Kontext
Nach M1+M2 ist die Architektur:

Core 1: Safety-Task (Sensoren, Aktoren, Safety-Checks, WDT)
Core 1: loop() mit WiFiManager, Timer-Code, Heartbeat, Status-Publish
ESP-IDF MQTT: Eigener interner Task (Core 0, durch M2 konfiguriert)
loop() enthaelt noch WiFi-Management, Timer-Code und Publish-Logik. Diese Phase
verschiebt alles Verbleibende aus loop() in einen Communication-Task auf Core 0.
Danach ist loop() leer.

Publish-Problem
Der Safety-Task (Core 1) erzeugt Daten die publiziert werden muessen: Sensor-Werte,
Aktor-Status-Aenderungen. esp_mqtt_client_publish() ist zwar thread-safe, aber alle
Publish-Aufrufe sollten ueber den Communication-Task laufen, damit die gesamte
Netzwerk-Kommunikation auf Core 0 konzentriert ist. Das erleichtert Debugging und
verhindert dass Core 1 durch langsame Publishes aufgehalten wird.

Aufgabe
Analyse ZUERST
Alle verbleibenden loop()-Aufrufe nach M1 dokumentieren
Sensor-Publish-Code identifizieren (wird in Publish-Queue verschoben)
Actuator-Status-Publish-Code identifizieren (alle 30s)
Timer-Code: WiFi-Disconnect-Debounce (30s → Portal), MQTT Persistent Failure (5min)
Heartbeat-Publish-Code identifizieren (alle 30s)
M3.1 — Communication-Task erstellen
Neue Dateien src/tasks/communication_task.h + src/tasks/communication_task.cpp:


void communicationTaskFunction(void* param) {
    for (;;) {
        wifiManager.loop();                 // WiFi-Management
        handleWifiDisconnectDebounce();     // 30s Timer → Portal oeffnen
        handleMqttPersistentFailure();      // 5min Timer
        processPublishQueue();              // Sensor-Daten + Aktor-Status von Core 1
        handleHeartbeatPublish();           // Heartbeat alle 30s
        handleActuatorStatusPublish();      // Aktor-Status alle 30s
        timeManager.loop();                 // NTP
        vTaskDelay(pdMS_TO_TICKS(50));      // 50ms Takt reicht fuer Comm-Management
    }
}
In setup() (NACH createSafetyTask()):


xTaskCreatePinnedToCore(communicationTaskFunction, "CommTask",
                         6144, NULL, 3, NULL, 0);  // Core 0, Prioritaet 3
Die Timer-/Debounce-/Publish-Funktionen sind Extraktionen aus dem bestehenden
loop()-Code. Den Code 1:1 in eigene Funktionen verschieben, keine Logik-Aenderungen.

M3.2 — Publish-Queue (Core 1 → Core 0)

struct PublishRequest {
    char topic[128];
    char payload[1024];    // 1024: Heartbeat-Payloads mit Diagnostik und 
                           // Aktor-Status koennen > 512 Bytes sein
    uint8_t qos;
    bool retain;
};

QueueHandle_t g_publish_queue = xQueueCreate(15, sizeof(PublishRequest));
// 15 * ~1156 = ~17KB Heap. Mehr als genug fuer Burst-Publishes.
Core 1 (Safety-Task) sendet Publish-Requests:


void queuePublish(const char* topic, const char* payload, uint8_t qos, bool retain) {
    PublishRequest req;
    strncpy(req.topic, topic, sizeof(req.topic) - 1);
    req.topic[sizeof(req.topic) - 1] = '\0';
    strncpy(req.payload, payload, sizeof(req.payload) - 1);
    req.payload[sizeof(req.payload) - 1] = '\0';
    req.qos = qos;
    req.retain = retain;
    xQueueSend(g_publish_queue, &req, 0);  // Non-blocking, Drop wenn voll
}
Core 0 (Comm-Task) empfaengt und publiziert:


void processPublishQueue() {
    PublishRequest req;
    while (xQueueReceive(g_publish_queue, &req, 0) == pdTRUE) {
        esp_mqtt_client_publish(mqtt_client_, req.topic, req.payload, 0, req.qos, req.retain);
    }
}
Alle Stellen im Safety-Task die bisher direkt publish() aufrufen muessen auf
queuePublish() umgestellt werden.

M3.3 — loop() minimal machen
Nach M3:


void loop() {
    vTaskDelay(pdMS_TO_TICKS(1000));  // Arduino braucht loop(), darf nicht leer sein
}
setup() Reihenfolge nach M3

1. Bestehende Initialisierung
2. Atomic-Variablen
3. ALLE Queues erstellen (actuator_cmd, sensor_cmd, publish, config_update)
4. createSafetyTask()
5. esp_task_wdt_delete(xTaskGetCurrentTaskHandle())
6. createCommunicationTask()
7. esp_mqtt_client_start()
Akzeptanzkriterien
 Communication-Task startet auf Core 0 (Log: [COMM] Communication task running on core 0)
 WiFi-Portal funktioniert weiterhin (30s Disconnect → Portal)
 Sensor-Daten werden ueber Publish-Queue publiziert
 Aktor-Status wird ueber Publish-Queue publiziert
 Heartbeat erscheint alle 30s
 loop() ist minimal (nur vTaskDelay)
Was NICHT gemacht wird
Keine Mutexes (kommt in M4)
Keine neuen Features
Kein Backend/Frontend