# 🚀 **SERVER-ENTWICKLER ANFORDERUNG: GOD-KAISER-INTEGRATION**

## 📋 **EXECUTIVE SUMMARY**

### **🎯 Ziel der Backend-Erweiterung:**

Das bestehende **Pi Server Backend** muss um **God-Kaiser-Hierarchie** erweitert werden, um die bereits implementierte Frontend-Integration vollständig zu unterstützen.

### **✅ Aktueller Status:**

- ✅ **Frontend vollständig implementiert** - God-Kaiser-Integration, hierarchische Verwaltung, Cross-Kaiser-Logik
- ✅ **MQTT-Handler implementiert** - God-Kaiser-Topics, Befehlsketten-Tracking, Cross-Kaiser-Kommunikation
- ✅ **Error-Handling erweitert** - Hierarchische Fehlerbehandlung, Konflikt-Lösung
- ✅ **Performance-Optimierungen** - Cache-Strategien, Batch-Updates, Memory-Optimierung

### **❌ Fehlende Backend-Integration:**

- ❌ **API-Endpoints** - God-Kaiser-Management, Hierarchie-Verwaltung, ESP-Transfer
- ❌ **Datenbank-Tabellen** - Kaiser-Registry, ESP-Ownership, Command-Chain-Tracking
- ❌ **MQTT-Topic-Handler** - Backend-seitige God-Kaiser-Kommunikation
- ❌ **Error-Handling** - Backend-seitige hierarchische Fehlerbehandlung

---

## 🔧 **DETAILLIERTE BACKEND-ANFORDERUNGEN**

### **📋 1. NEUE API-ENDPOINTS (main.py)**

#### **A. God-Kaiser-Management Endpoints**

```python
# God-Kaiser-Management (NEUE Endpoints hinzufügen)
@app.post("/api/god/kaiser/add")
async def add_kaiser_to_god(request: KaiserAddRequest):
    """Fügt Kaiser zum God-Netzwerk hinzu"""
    kaiser_id = request.kaiser_id
    esp_devices = request.esp_devices

    # BESTEHENDE Kaiser-Registrierung nutzen
    await register_kaiser_in_god_network(kaiser_id, esp_devices)

    # ESPs unter Kaiser-Kontrolle bringen
    for esp_id in esp_devices:
        await transfer_esp_to_kaiser(esp_id, kaiser_id)

    return {"success": True, "kaiser_id": kaiser_id, "esp_count": len(esp_devices)}

@app.get("/api/god/hierarchy")
async def get_god_hierarchy():
    """Gibt die komplette God-Kaiser-ESP-Hierarchie zurück"""
    # BESTEHENDE ESP-Device-Struktur nutzen
    registered_kaisers = mqtt_subscriber.esp_devices

    return {
        "god": {
            "id": get_kaiser_id(),
            "type": "god",
            "total_kaisers": len(registered_kaisers),
            "total_esps": sum(len(k.esp_devices) for k in registered_kaisers.values())
        },
        "kaisers": [
            {
                "id": kaiser_id,
                "esp_count": len(kaiser.esp_devices),
                "status": kaiser.status,
                "last_heartbeat": kaiser.last_heartbeat
            }
            for kaiser_id, kaiser in registered_kaisers.items()
        ]
    }

@app.post("/api/god/esp/transfer")
async def transfer_esp_between_kaisers(request: EspTransferRequest):
    """Überträgt ESP zwischen God und Kaiser oder zwischen Kaisern"""
    esp_id = request.esp_id
    from_owner = request.from_owner
    to_owner = request.to_owner

    # BESTEHENDE ESP-Transfer-Logik nutzen
    await transfer_esp_control(esp_id, from_owner, to_owner)

    return {"success": True, "esp_id": esp_id, "new_owner": to_owner}

@app.get("/api/god/command-chains")
async def get_command_chains():
    """Gibt alle aktiven Befehlsketten zurück"""
    command_chains = await database_manager.get_active_command_chains()
    return {"command_chains": command_chains}

@app.post("/api/god/command-chain/{command_id}/cancel")
async def cancel_command_chain(command_id: str):
    """Bricht eine Befehlskette ab"""
    await database_manager.cancel_command_chain(command_id)
    return {"success": True, "command_id": command_id}

@app.get("/api/god/performance/stats")
async def get_performance_stats():
    """Gibt Performance-Statistiken zurück"""
    stats = await database_manager.get_performance_stats()
    return stats
```

#### **B. Request/Response Models**

```python
# NEUE Pydantic Models hinzufügen
class KaiserAddRequest(BaseModel):
    kaiser_id: str
    esp_devices: List[str]
    kaiser_config: Optional[Dict] = None

class EspTransferRequest(BaseModel):
    esp_id: str
    from_owner: str  # "god" oder kaiser_id
    to_owner: str    # "god" oder kaiser_id
    reason: Optional[str] = None

class CommandChainRequest(BaseModel):
    command_type: str
    source_kaiser: Optional[str] = None
    target_kaiser: Optional[str] = None
    esp_id: Optional[str] = None
    payload: Dict
```

### **📋 2. DATENBANK-ERWEITERUNGEN (database_manager.py)**

#### **A. Neue Tabellen erstellen**

```python
def init_database(self):
    """Initialisiert alle Datenbank-Tabellen"""
    with sqlite3.connect(self.db_path) as conn:
        # BESTEHENDE Tabellen beibehalten
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sensor_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                esp_id TEXT NOT NULL,
                gpio INTEGER NOT NULL,
                sensor_type TEXT NOT NULL,
                raw_data INTEGER NOT NULL,
                processed_value REAL,
                timestamp INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX(esp_id, gpio, timestamp)
            )
        """)

        # NEUE Kaiser-Registry Tabelle
        conn.execute("""
            CREATE TABLE IF NOT EXISTS kaiser_registry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kaiser_id TEXT UNIQUE NOT NULL,
                god_id TEXT NOT NULL,
                kaiser_name TEXT,
                esp_devices TEXT,  -- JSON array of ESP IDs
                status TEXT DEFAULT 'offline',
                last_heartbeat TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # NEUE ESP-Ownership Tabelle
        conn.execute("""
            CREATE TABLE IF NOT EXISTS esp_ownership (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                esp_id TEXT UNIQUE NOT NULL,
                current_owner TEXT NOT NULL,  -- "god" oder kaiser_id
                previous_owner TEXT,
                transfer_timestamp TIMESTAMP,
                transfer_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # NEUE Command-Chain-Tracking Tabelle
        conn.execute("""
            CREATE TABLE IF NOT EXISTS command_chains (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command_id TEXT UNIQUE NOT NULL,
                god_id TEXT NOT NULL,
                kaiser_id TEXT,
                esp_id TEXT,
                command_type TEXT NOT NULL,
                command_data TEXT,  -- JSON
                status TEXT DEFAULT 'pending',
                response_data TEXT,  -- JSON
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            )
        """)

        # NEUE Performance-Monitoring Tabelle
        conn.execute("""
            CREATE TABLE IF NOT EXISTS performance_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_name TEXT NOT NULL,
                metric_value REAL NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX(metric_name, timestamp)
            )
        """)
```

#### **B. Neue Datenbank-Methoden**

```python
# NEUE Methoden für Kaiser-Management
async def register_kaiser(self, kaiser_id: str, god_id: str, esp_devices: List[str]):
    """Registriert einen neuen Kaiser"""
    with sqlite3.connect(self.db_path) as conn:
        conn.execute("""
            INSERT OR REPLACE INTO kaiser_registry
            (kaiser_id, god_id, esp_devices, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, (kaiser_id, god_id, json.dumps(esp_devices), 'online'))

async def update_kaiser_status(self, kaiser_id: str, status: str):
    """Aktualisiert den Status eines Kaisers"""
    with sqlite3.connect(self.db_path) as conn:
        conn.execute("""
            UPDATE kaiser_registry
            SET status = ?, last_heartbeat = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE kaiser_id = ?
        """, (status, kaiser_id))

async def get_all_kaisers(self):
    """Gibt alle registrierten Kaiser zurück"""
    with sqlite3.connect(self.db_path) as conn:
        cursor = conn.execute("SELECT * FROM kaiser_registry")
        return [dict(row) for row in cursor.fetchall()]

# NEUE Methoden für ESP-Ownership
async def set_esp_ownership(self, esp_id: str, owner: str, reason: str = None):
    """Setzt den Besitzer eines ESPs"""
    with sqlite3.connect(self.db_path) as conn:
        # Vorherigen Besitzer speichern
        cursor = conn.execute("SELECT current_owner FROM esp_ownership WHERE esp_id = ?", (esp_id,))
        previous_owner = cursor.fetchone()

        conn.execute("""
            INSERT OR REPLACE INTO esp_ownership
            (esp_id, current_owner, previous_owner, transfer_timestamp, transfer_reason, created_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
        """, (esp_id, owner, previous_owner[0] if previous_owner else None, reason))

async def get_esp_owner(self, esp_id: str):
    """Gibt den aktuellen Besitzer eines ESPs zurück"""
    with sqlite3.connect(self.db_path) as conn:
        cursor = conn.execute("SELECT current_owner FROM esp_ownership WHERE esp_id = ?", (esp_id,))
        result = cursor.fetchone()
        return result[0] if result else 'god'

# NEUE Methoden für Command-Chain-Tracking
async def create_command_chain(self, command_id: str, god_id: str, command_type: str, command_data: Dict):
    """Erstellt eine neue Befehlskette"""
    with sqlite3.connect(self.db_path) as conn:
        conn.execute("""
            INSERT INTO command_chains
            (command_id, god_id, command_type, command_data, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
        """, (command_id, god_id, command_type, json.dumps(command_data)))

async def update_command_chain(self, command_id: str, status: str, response_data: Dict = None):
    """Aktualisiert eine Befehlskette"""
    with sqlite3.connect(self.db_path) as conn:
        conn.execute("""
            UPDATE command_chains
            SET status = ?, response_data = ?, completed_at = CURRENT_TIMESTAMP
            WHERE command_id = ?
        """, (status, json.dumps(response_data) if response_data else None, command_id))

async def get_active_command_chains(self):
    """Gibt alle aktiven Befehlsketten zurück"""
    with sqlite3.connect(self.db_path) as conn:
        cursor = conn.execute("SELECT * FROM command_chains WHERE status = 'pending'")
        return [dict(row) for row in cursor.fetchall()]

# NEUE Methoden für Performance-Monitoring
async def record_performance_metric(self, metric_name: str, metric_value: float):
    """Zeichnet eine Performance-Metrik auf"""
    with sqlite3.connect(self.db_path) as conn:
        conn.execute("""
            INSERT INTO performance_stats (metric_name, metric_value)
            VALUES (?, ?)
        """, (metric_name, metric_value))

async def get_performance_stats(self):
    """Gibt Performance-Statistiken zurück"""
    with sqlite3.connect(self.db_path) as conn:
        # Durchschnittliche Verarbeitungszeit
        cursor = conn.execute("""
            SELECT AVG(metric_value) as avg_processing_time
            FROM performance_stats
            WHERE metric_name = 'processing_time'
            AND timestamp > datetime('now', '-1 hour')
        """)
        avg_processing_time = cursor.fetchone()[0] or 0

        # Cache-Hit-Ratio
        cursor = conn.execute("""
            SELECT
                SUM(CASE WHEN metric_name = 'cache_hit' THEN 1 ELSE 0 END) as hits,
                COUNT(*) as total
            FROM performance_stats
            WHERE metric_name IN ('cache_hit', 'cache_miss')
            AND timestamp > datetime('now', '-1 hour')
        """)
        result = cursor.fetchone()
        cache_hit_ratio = result[0] / result[1] if result[1] > 0 else 0

        return {
            "avg_processing_time": avg_processing_time,
            "cache_hit_ratio": cache_hit_ratio,
            "active_command_chains": len(await self.get_active_command_chains()),
            "registered_kaisers": len(await self.get_all_kaisers()),
        }
```

### **📋 3. MQTT-TOPIC-HANDLER ERWEITERN (mqtt_handler.py)**

#### **A. God-Kaiser Topic-Handler**

```python
# NEUE God-Kaiser Topic-Handler hinzufügen
class GodKaiserMqttHandler:
    def __init__(self, database_manager):
        self.db = database_manager
        self.active_command_chains = {}

    async def handle_god_kaiser_message(self, topic: str, payload: Dict):
        """Behandelt God-Kaiser MQTT-Nachrichten"""
        topic_parts = topic.split('/')

        if len(topic_parts) < 4:
            return

        kaiser_id = topic_parts[1]
        message_type = topic_parts[2]
        sub_type = topic_parts[3]

        if message_type == 'god':
            await self.handle_god_message(kaiser_id, sub_type, payload)
        elif message_type == 'kaiser':
            await self.handle_kaiser_message(kaiser_id, sub_type, payload)
        elif message_type == 'cross_kaiser':
            await self.handle_cross_kaiser_message(kaiser_id, topic_parts, payload)
        elif message_type == 'esp_transfer':
            await self.handle_esp_transfer_message(kaiser_id, payload)

    async def handle_god_message(self, kaiser_id: str, sub_type: str, payload: Dict):
        """Behandelt God → Kaiser Nachrichten"""
        if sub_type == 'command':
            await self.process_god_command(kaiser_id, payload)
        elif sub_type == 'response':
            await self.process_god_response(kaiser_id, payload)

    async def handle_kaiser_message(self, kaiser_id: str, sub_type: str, payload: Dict):
        """Behandelt Kaiser → God Nachrichten"""
        if sub_type == 'status':
            await self.update_kaiser_status(kaiser_id, payload)
        elif sub_type == 'health':
            await self.update_kaiser_health(kaiser_id, payload)

    async def handle_cross_kaiser_message(self, source_kaiser: str, topic_parts: List[str], payload: Dict):
        """Behandelt Cross-Kaiser Nachrichten"""
        if len(topic_parts) < 5:
            return

        target_kaiser = topic_parts[3]
        message_type = topic_parts[4]

        if message_type == 'command':
            await self.process_cross_kaiser_command(source_kaiser, target_kaiser, payload)
        elif message_type == 'response':
            await self.process_cross_kaiser_response(source_kaiser, target_kaiser, payload)

    async def process_god_command(self, kaiser_id: str, payload: Dict):
        """Verarbeitet God-Befehle"""
        command_type = payload.get('command')
        command_id = payload.get('command_id')

        # Befehlskette erstellen
        await self.db.create_command_chain(command_id, 'god_pi_central', command_type, payload)

        if command_type == 'register_kaiser':
            await self.register_kaiser_command(kaiser_id, payload)
        elif command_type == 'transfer_esp':
            await self.transfer_esp_command(kaiser_id, payload)
        elif command_type == 'emergency_stop':
            await self.emergency_stop_command(kaiser_id, payload)

    async def register_kaiser_command(self, kaiser_id: str, payload: Dict):
        """Verarbeitet Kaiser-Registrierung"""
        esp_devices = payload.get('esp_devices', [])
        await self.db.register_kaiser(kaiser_id, 'god_pi_central', esp_devices)

        # Response senden
        response = {
            "command_id": payload.get('command_id'),
            "response": {
                "success": True,
                "kaiser_id": kaiser_id,
                "registered": True,
                "esp_count": len(esp_devices)
            }
        }
        await self.publish_response(f"kaiser/{kaiser_id}/god/response", response)

    async def transfer_esp_command(self, kaiser_id: str, payload: Dict):
        """Verarbeitet ESP-Transfer"""
        esp_id = payload.get('esp_id')
        from_owner = payload.get('from_owner')
        to_owner = payload.get('to_owner')

        # ESP-Ownership aktualisieren
        await self.db.set_esp_ownership(esp_id, to_owner, 'god_command')

        # Response senden
        response = {
            "command_id": payload.get('command_id'),
            "response": {
                "success": True,
                "esp_id": esp_id,
                "new_owner": to_owner
            }
        }
        await self.publish_response(f"kaiser/{kaiser_id}/god/response", response)

    async def emergency_stop_command(self, kaiser_id: str, payload: Dict):
        """Verarbeitet Emergency-Stop"""
        # Emergency-Stop für alle ESPs des Kaisers
        kaiser_data = await self.db.get_kaiser_data(kaiser_id)
        esp_devices = json.loads(kaiser_data.get('esp_devices', '[]'))

        for esp_id in esp_devices:
            await self.send_emergency_stop(esp_id)

        # Response senden
        response = {
            "command_id": payload.get('command_id'),
            "response": {
                "success": True,
                "emergency_stop_activated": True,
                "affected_esps": esp_devices
            }
        }
        await self.publish_response(f"kaiser/{kaiser_id}/god/response", response)

    async def update_kaiser_status(self, kaiser_id: str, payload: Dict):
        """Aktualisiert Kaiser-Status"""
        status = payload.get('status', 'unknown')
        await self.db.update_kaiser_status(kaiser_id, status)

    async def update_kaiser_health(self, kaiser_id: str, payload: Dict):
        """Aktualisiert Kaiser-Health"""
        # Health-Daten in Datenbank speichern
        health_data = {
            "free_heap": payload.get('free_heap'),
            "cpu_usage": payload.get('cpu_usage'),
            "uptime": payload.get('uptime')
        }
        await self.db.update_kaiser_health(kaiser_id, health_data)

    async def process_cross_kaiser_command(self, source_kaiser: str, target_kaiser: str, payload: Dict):
        """Verarbeitet Cross-Kaiser-Befehle"""
        command_type = payload.get('command')
        command_id = payload.get('command_id')

        if command_type == 'transfer_esp':
            await self.process_cross_kaiser_esp_transfer(source_kaiser, target_kaiser, payload)
        elif command_type == 'sync_data':
            await self.process_cross_kaiser_data_sync(source_kaiser, target_kaiser, payload)

    async def process_cross_kaiser_esp_transfer(self, source_kaiser: str, target_kaiser: str, payload: Dict):
        """Verarbeitet Cross-Kaiser ESP-Transfer"""
        esp_id = payload.get('esp_id')

        # ESP-Ownership aktualisieren
        await self.db.set_esp_ownership(esp_id, target_kaiser, 'cross_kaiser_transfer')

        # Response senden
        response = {
            "command_id": payload.get('command_id'),
            "response": {
                "success": True,
                "esp_id": esp_id,
                "new_owner": target_kaiser
            }
        }
        await self.publish_response(f"kaiser/{target_kaiser}/cross_kaiser/{source_kaiser}/response", response)

    async def publish_response(self, topic: str, payload: Dict):
        """Sendet eine MQTT-Antwort"""
        # MQTT-Client verwenden um Antwort zu senden
        await mqtt_client.publish(topic, json.dumps(payload))

    async def send_emergency_stop(self, esp_id: str):
        """Sendet Emergency-Stop an ESP"""
        topic = f"kaiser/god/esp/{esp_id}/emergency"
        payload = {"emergency_stop": True, "timestamp": int(time.time())}
        await mqtt_client.publish(topic, json.dumps(payload))
```

### **📋 4. ERROR-HANDLING ERWEITERN (error_handler.py)**

#### **A. Hierarchische Fehlerbehandlung**

```python
# NEUE hierarchische Fehlerbehandlung hinzufügen
class HierarchicalErrorHandler:
    def __init__(self, database_manager):
        self.db = database_manager

    async def handle_hierarchical_error(self, error_type: str, error_data: Dict):
        """Behandelt hierarchische Fehler"""
        if error_type == 'esp_ownership_conflict':
            return await self.resolve_esp_ownership_conflict(error_data)
        elif error_type == 'kaiser_id_conflict':
            return await self.resolve_kaiser_id_conflict(error_data)
        elif error_type == 'command_chain_timeout':
            return await self.resolve_command_chain_timeout(error_data)
        elif error_type == 'cross_kaiser_communication_failed':
            return await self.retry_cross_kaiser_communication(error_data)
        else:
            return await self.handle_generic_hierarchical_error(error_type, error_data)

    async def resolve_esp_ownership_conflict(self, error_data: Dict):
        """Löst ESP-Ownership-Konflikte"""
        esp_id = error_data.get('esp_id')
        current_owner = error_data.get('current_owner')
        requested_owner = error_data.get('requested_owner')

        # God hat immer Vorrang
        if requested_owner == 'god':
            await self.db.set_esp_ownership(esp_id, 'god', 'conflict_resolution_god_priority')
            return {"resolved": True, "new_owner": "god", "reason": "god_priority"}

        # Kaiser-zu-Kaiser Transfer nur mit God-Autorisation
        if current_owner != 'god':
            authorization = await self.check_god_authorization(esp_id, requested_owner)
            if authorization.get('authorized'):
                await self.db.set_esp_ownership(esp_id, requested_owner, 'conflict_resolution_authorized')
                return {"resolved": True, "new_owner": requested_owner, "reason": "authorized_transfer"}
            else:
                return {"resolved": False, "reason": "unauthorized_transfer"}

        return {"resolved": True, "new_owner": "god", "reason": "fallback_to_god"}

    async def resolve_kaiser_id_conflict(self, error_data: Dict):
        """Löst Kaiser-ID-Konflikte"""
        esp_id = error_data.get('esp_id')
        device_kaiser_id = error_data.get('device_kaiser_id')
        current_kaiser_id = error_data.get('current_kaiser_id')

        # Device-Kaiser-ID übernehmen wenn möglich
        can_adopt = await self.check_kaiser_adoption_permission(device_kaiser_id)

        if can_adopt:
            await self.adopt_kaiser_id(esp_id, device_kaiser_id)
            return {"resolved": True, "adopted_id": device_kaiser_id, "reason": "adopted_device_id"}
        else:
            # Device zurücksetzen
            await self.reset_device_kaiser_id(esp_id, current_kaiser_id)
            return {"resolved": True, "reset_to": current_kaiser_id, "reason": "reset_device_id"}

    async def resolve_command_chain_timeout(self, error_data: Dict):
        """Löst Command-Chain-Timeouts"""
        command_id = error_data.get('command_id')

        # Befehlskette abbrechen
        await self.db.update_command_chain(command_id, 'timeout', {"error": "timeout"})

        # Timeout-Benachrichtigung senden
        await self.notify_command_timeout(command_id)

        return {"resolved": True, "action": "timeout_cancelled", "command_id": command_id}

    async def retry_cross_kaiser_communication(self, error_data: Dict):
        """Wiederholt Cross-Kaiser-Kommunikation"""
        source_kaiser = error_data.get('source_kaiser')
        target_kaiser = error_data.get('target_kaiser')
        command_type = error_data.get('command_type')

        # Netzwerk-Status prüfen
        network_status = await self.check_cross_kaiser_network_status(source_kaiser, target_kaiser)

        if network_status.get('available'):
            # Kommunikation wiederholen
            retry_result = await self.retry_cross_kaiser_command(source_kaiser, target_kaiser, command_type)
            return {"resolved": True, "retry_successful": retry_result.get('success')}
        else:
            # Alternative Route verwenden
            alternative_result = await self.use_alternative_cross_kaiser_route(source_kaiser, target_kaiser, command_type)
            return {"resolved": True, "alternative_route": True, "result": alternative_result}

    async def check_god_authorization(self, esp_id: str, requested_owner: str):
        """Prüft God-Autorisation"""
        # Implementierung für God-Autorisation
        return {"authorized": True, "reason": "authorized"}

    async def check_kaiser_adoption_permission(self, kaiser_id: str):
        """Prüft ob Kaiser-ID übernommen werden darf"""
        kaiser_data = await self.db.get_kaiser_data(kaiser_id)
        if kaiser_data:
            esp_devices = json.loads(kaiser_data.get('esp_devices', '[]'))
            return len(esp_devices) < 10  # Max 10 ESPs pro Kaiser
        return False

    async def adopt_kaiser_id(self, esp_id: str, kaiser_id: str):
        """Übernimmt Device-Kaiser-ID"""
        # ESP-Konfiguration aktualisieren
        await self.update_esp_kaiser_id(esp_id, kaiser_id)

    async def reset_device_kaiser_id(self, esp_id: str, current_kaiser_id: str):
        """Setzt Device-Kaiser-ID zurück"""
        # ESP-Konfiguration zurücksetzen
        await self.update_esp_kaiser_id(esp_id, current_kaiser_id)

    async def notify_command_timeout(self, command_id: str):
        """Sendet Timeout-Benachrichtigung"""
        topic = "god/command_chain/timeout"
        payload = {"command_id": command_id, "timestamp": int(time.time())}
        await mqtt_client.publish(topic, json.dumps(payload))

    async def check_cross_kaiser_network_status(self, source_kaiser: str, target_kaiser: str):
        """Prüft Netzwerk-Status zwischen Kaisern"""
        source_status = await self.db.get_kaiser_status(source_kaiser)
        target_status = await self.db.get_kaiser_status(target_kaiser)

        return {
            "available": source_status == 'online' and target_status == 'online',
            "source_status": source_status,
            "target_status": target_status
        }

    async def retry_cross_kaiser_command(self, source_kaiser: str, target_kaiser: str, command_type: str):
        """Wiederholt Cross-Kaiser-Befehl"""
        topic = f"kaiser/{target_kaiser}/cross_kaiser/{source_kaiser}/command"
        payload = {"command": command_type, "retry": True, "timestamp": int(time.time())}

        try:
            await mqtt_client.publish(topic, json.dumps(payload))
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def use_alternative_cross_kaiser_route(self, source_kaiser: str, target_kaiser: str, command_type: str):
        """Verwendet alternative Route über God"""
        topic = "god/cross_kaiser/alternative_route"
        payload = {
            "source_kaiser": source_kaiser,
            "target_kaiser": target_kaiser,
            "command_type": command_type,
            "timestamp": int(time.time())
        }

        try:
            response = await mqtt_client.request(topic, payload)
            return {"success": True, "result": response}
        except Exception as e:
            return {"success": False, "error": str(e)}
```

### **📋 5. MIGRATION-SKRIPTE**

#### **A. Datenbank-Migration**

```python
# migration_script.py
import sqlite3
import json
import os

def migrate_existing_data():
    """Migriert bestehende Daten zur God-Kaiser-Struktur"""
    db_path = "growy_database.db"

    if not os.path.exists(db_path):
        print("Datenbank nicht gefunden, erstelle neue Struktur...")
        return

    with sqlite3.connect(db_path) as conn:
        # Prüfe ob neue Tabellen existieren
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='kaiser_registry'")
        if not cursor.fetchone():
            print("Erstelle neue Tabellen...")
            create_new_tables(conn)

        # Migriere bestehende ESP-Daten
        migrate_esp_data(conn)

        # Migriere bestehende Kaiser-Daten
        migrate_kaiser_data(conn)

        print("Migration abgeschlossen!")

def create_new_tables(conn):
    """Erstellt neue Tabellen"""
    # Kaiser-Registry Tabelle
    conn.execute("""
        CREATE TABLE IF NOT EXISTS kaiser_registry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kaiser_id TEXT UNIQUE NOT NULL,
            god_id TEXT NOT NULL,
            kaiser_name TEXT,
            esp_devices TEXT,
            status TEXT DEFAULT 'offline',
            last_heartbeat TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ESP-Ownership Tabelle
    conn.execute("""
        CREATE TABLE IF NOT EXISTS esp_ownership (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            esp_id TEXT UNIQUE NOT NULL,
            current_owner TEXT NOT NULL,
            previous_owner TEXT,
            transfer_timestamp TIMESTAMP,
            transfer_reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Command-Chain-Tracking Tabelle
    conn.execute("""
        CREATE TABLE IF NOT EXISTS command_chains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command_id TEXT UNIQUE NOT NULL,
            god_id TEXT NOT NULL,
            kaiser_id TEXT,
            esp_id TEXT,
            command_type TEXT NOT NULL,
            command_data TEXT,
            status TEXT DEFAULT 'pending',
            response_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )
    """)

    # Performance-Monitoring Tabelle
    conn.execute("""
        CREATE TABLE IF NOT EXISTS performance_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metric_name TEXT NOT NULL,
            metric_value REAL NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

def migrate_esp_data(conn):
    """Migriert bestehende ESP-Daten"""
    # Alle ESPs unter God-Kontrolle setzen
    cursor = conn.execute("SELECT DISTINCT esp_id FROM sensor_data")
    esp_ids = [row[0] for row in cursor.fetchall()]

    for esp_id in esp_ids:
        conn.execute("""
            INSERT OR IGNORE INTO esp_ownership
            (esp_id, current_owner, transfer_reason, created_at)
            VALUES (?, 'god', 'migration_from_legacy', CURRENT_TIMESTAMP)
        """, (esp_id,))

    print(f"Migriert {len(esp_ids)} ESPs unter God-Kontrolle")

def migrate_kaiser_data(conn):
    """Migriert bestehende Kaiser-Daten"""
    # Standard-Kaiser registrieren
    conn.execute("""
        INSERT OR IGNORE INTO kaiser_registry
        (kaiser_id, god_id, kaiser_name, esp_devices, status, created_at, updated_at)
        VALUES ('default_kaiser', 'god_pi_central', 'Default Kaiser', '[]', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    """)

    print("Standard-Kaiser registriert")

if __name__ == "__main__":
    migrate_existing_data()
```

---

## 🎯 **IMPLEMENTIERUNGS-CHECKLISTE FÜR SERVER-ENTWICKLER**

### **✅ Phase 1: Grundlagen (1-2 Tage)**

- [ ] **Datenbank-Tabellen erstellen** - Kaiser-Registry, ESP-Ownership, Command-Chains, Performance-Stats
- [ ] **Migration-Skript ausführen** - Bestehende Daten migrieren
- [ ] **API-Endpoints implementieren** - God-Kaiser-Management in main.py
- [ ] **Request/Response Models** - Pydantic Models für neue Endpoints

### **✅ Phase 2: MQTT-Integration (2-3 Tage)**

- [ ] **God-Kaiser Topic-Handler** - MQTT-Handler für hierarchische Kommunikation
- [ ] **Cross-Kaiser-Kommunikation** - Handler für Kaiser-zu-Kaiser-Kommunikation
- [ ] **Command-Chain-Tracking** - Backend-seitige Befehlsketten-Verfolgung
- [ ] **ESP-Transfer-Logik** - Backend-seitige ESP-Übertragung

### **✅ Phase 3: Error-Handling (1-2 Tage)**

- [ ] **Hierarchische Fehlerbehandlung** - Backend-seitige Konflikt-Lösung
- [ ] **ESP-Ownership-Konflikte** - Automatische Konflikt-Lösung
- [ ] **Kaiser-ID-Konflikte** - ID-Konflikt-Behandlung
- [ ] **Command-Chain-Timeouts** - Timeout-Behandlung

### **✅ Phase 4: Testing & Validation (1-2 Tage)**

- [ ] **API-Tests** - Alle neuen Endpoints testen
- [ ] **MQTT-Tests** - God-Kaiser-Kommunikation testen
- [ ] **Error-Szenarien** - Fehlerbehandlung testen
- [ ] **Performance-Tests** - Skalierbarkeit testen

---

## 🚀 **NÄCHSTE SCHRITTE**

### **📋 Sofortige Aktionen:**

1. **Datenbank-Setup** - Neue Tabellen erstellen und Migration ausführen
2. **API-Endpoints** - God-Kaiser-Management implementieren
3. **MQTT-Handler** - Hierarchische Kommunikation implementieren
4. **Error-Handling** - Backend-seitige Fehlerbehandlung implementieren

### **📋 Entwickler-Bestätigung:**

- ✅ **Verständnis** der Frontend-Integration und Anforderungen
- ✅ **Bereitschaft** zur schrittweisen Backend-Erweiterung
- ✅ **Rückwärtskompatibilität** gewährleisten
- ✅ **Testing** aller neuen Funktionen

---

**📝 Dokumentation erstellt: Dezember 2024**  
**🔄 Version: v3.8.0**  
**🎯 Status: Backend-Implementierung bereit**

Die **Frontend-Integration ist vollständig implementiert** und wartet auf die Backend-Erweiterungen. Alle neuen Funktionen nutzen die bestehenden Strukturen und sind vollständig rückwärtskompatibel.
