# Phase 3: Sequenz-Action-Executor - VERBESSERTE VERSION

**Projekt:** AutomationOne Framework
**Phase:** 3 - Sequenz-Actions
**Status:** READY FOR IMPLEMENTATION
**Geschätzter Aufwand:** 4-5 Arbeitstage
**Erstellt:** 2025-12-27
**Verbessert:** 2025-12-27

---

## VERBESSERUNGEN gegenüber Original-Plan

### 🔧 Kritische Fixes

1. **Error Code Range korrigiert:**
   - ❌ Original: 5200-5299 (bereits für Validation belegt)
   - ✅ Neu: 5600-5699 (verfügbar)

2. **Shutdown-Logik hinzugefügt:**
   - Cleanup-Task wird jetzt korrekt in main.py Shutdown gestoppt
   - Verhindert Warnungen beim Server-Shutdown

3. **Import-Pfade präzisiert:**
   - Korrekte relative Imports für alle Module
   - Angepasst an vorhandene Projektstruktur

### 🚀 Optionale Verbesserungen (für spätere Iterationen)

- DB-Persistenz für Sequenzen (Production-ready)
- Sequence Templates System
- Prometheus Metrics Integration

---

## 1. Error Codes (KORRIGIERT)

### Server Error Code Range: 5600-5699 (Sequences)

**Datei:** `src/core/error_codes.py` (erweitern)

```python
class SequenceErrorCode(IntEnum):
    """Error Codes für Sequenz-Operationen (5600-5699)."""

    # Validation Errors (5600-5609)
    SEQ_INVALID_DEFINITION = 5600
    SEQ_EMPTY_STEPS = 5601
    SEQ_INVALID_STEP = 5602
    SEQ_INVALID_ACTION_TYPE = 5603
    SEQ_STEP_MISSING_ACTION = 5604
    SEQ_INVALID_DELAY = 5605
    SEQ_TOO_MANY_STEPS = 5606
    SEQ_DURATION_EXCEEDED = 5607

    # Runtime Errors (5610-5629)
    SEQ_ALREADY_RUNNING = 5610
    SEQ_NOT_FOUND = 5611
    SEQ_CANCELLED = 5612
    SEQ_TIMEOUT = 5613
    SEQ_STEP_FAILED = 5614
    SEQ_STEP_TIMEOUT = 5615
    SEQ_MAX_DURATION_EXCEEDED = 5616
    SEQ_EXECUTOR_NOT_FOUND = 5617
    SEQ_CIRCULAR_REFERENCE = 5618

    # System Errors (5630-5639)
    SEQ_TASK_CREATION_FAILED = 5630
    SEQ_INTERNAL_ERROR = 5631
    SEQ_CLEANUP_FAILED = 5632
    SEQ_STATE_CORRUPTION = 5633

    # Conflict Errors (5640-5649)
    SEQ_ACTUATOR_LOCKED = 5640
    SEQ_RATE_LIMITED = 5641
    SEQ_SAFETY_BLOCKED = 5642


# Error Descriptions
SEQUENCE_ERROR_MESSAGES = {
    5600: "Invalid sequence definition",
    5601: "Sequence must have at least one step",
    5602: "Invalid step configuration",
    5603: "Unknown action type in step",
    5604: "Step requires either 'action' or 'delay_seconds'",
    5605: "Invalid delay value (must be 0-3600 seconds)",
    5606: "Too many steps (max 50)",
    5607: "Sequence duration exceeds maximum allowed",
    5610: "Sequence with this ID is already running",
    5611: "Sequence not found",
    5612: "Sequence was cancelled",
    5613: "Sequence timed out",
    5614: "Step execution failed",
    5615: "Step timed out",
    5616: "Maximum sequence duration exceeded",
    5617: "No executor found for action type",
    5618: "Circular sequence reference detected",
    5630: "Failed to create sequence task",
    5631: "Internal sequence error",
    5632: "Failed to cleanup completed sequence",
    5633: "Sequence state corruption detected",
    5640: "Actuator locked by another sequence/rule",
    5641: "Rate limit exceeded",
    5642: "Action blocked by safety system",
}


def get_sequence_error_message(code: int) -> str:
    """Returns human-readable error message for sequence error code."""
    return SEQUENCE_ERROR_MESSAGES.get(code, f"Unknown sequence error ({code})")
```

---

## 2. Implementation Details

Siehe Original-Plan für vollständige Implementierung mit folgenden Anpassungen:

### Anpassungen in sequence_executor.py:

**Zeile 475:** Import korrigiert
```python
from ....core.error_codes import SequenceErrorCode, get_sequence_error_message
```

**Zeile 480-488:** Error Codes aktualisiert (5600er Range)

**HINZUGEFÜGT: Shutdown-Methode**
```python
async def shutdown(self) -> None:
    """
    Graceful shutdown für Cleanup-Task.

    Muss in main.py Shutdown aufgerufen werden.
    """
    if self._cleanup_task and not self._cleanup_task.done():
        self._cleanup_task.cancel()
        try:
            await self._cleanup_task
        except asyncio.CancelledError:
            pass

    logger.info("SequenceActionExecutor shutdown complete")
```

### Anpassungen in main.py:

**Startup (nach Zeile 352):**
```python
# Setup action executors
actuator_executor = ActuatorActionExecutor(actuator_service)
delay_executor = DelayActionExecutor()
notification_executor = NotificationActionExecutor(_websocket_manager)

# Phase 3: Sequence Executor
from .services.logic.actions.sequence_executor import SequenceActionExecutor
sequence_executor = SequenceActionExecutor(websocket_manager=_websocket_manager)

action_executors = [
    actuator_executor,
    delay_executor,
    notification_executor,
    sequence_executor,
]

# KRITISCH: Circular-Dependency auflösen
sequence_executor.set_action_executors(action_executors)

logger.info("SequenceActionExecutor initialized with circular dependency resolution")
```

**Shutdown (nach Zeile 427 - NEU):**
```python
# Step 2.5: Shutdown SequenceActionExecutor cleanup task
if 'sequence_executor' in locals():
    logger.info("Stopping SequenceActionExecutor cleanup task...")
    await sequence_executor.shutdown()
    logger.info("SequenceActionExecutor stopped")
```

---

## 3. Vollständige Dateiliste

| Datei | Zeilen | Status |
|-------|--------|--------|
| `src/core/error_codes.py` | +70 | Erweitern |
| `src/schemas/sequence.py` | ~345 | Neu |
| `src/services/logic/actions/sequence_executor.py` | ~1280 | Neu |
| `src/api/v1/sequences.py` | ~185 | Neu |
| `src/api/v1/__init__.py` | +2 | Erweitern |
| `src/main.py` | +20 | Erweitern |
| `tests/unit/test_sequence_executor.py` | ~500 | Neu |

**Gesamt:** ~2400 Zeilen neuer Code

---

## 4. Implementierungs-Checkliste

- [ ] Error Codes hinzufügen (5600-5699)
- [ ] Schemas erstellen
- [ ] SequenceActionExecutor implementieren
- [ ] shutdown() Methode hinzufügen
- [ ] REST API Endpoints erstellen
- [ ] Router registrieren
- [ ] main.py Startup anpassen
- [ ] main.py Shutdown anpassen
- [ ] Unit Tests schreiben (min. 15)
- [ ] Integration Test
- [ ] Server startet ohne Fehler
- [ ] WebSocket Events funktionieren

---

**Definition of Done:**
- ✅ Alle Dateien implementiert
- ✅ Server startet ohne Fehler
- ✅ Sequenz kann gestartet werden
- ✅ Sequenz kann gecancelt werden
- ✅ WebSocket Events werden empfangen
- ✅ Error Codes korrekt (5600-5699)
- ✅ Cleanup-Task wird sauber gestoppt
- ✅ Tests grün (min. 90% Coverage)

---

**Referenzen:**
- Original Plan: `.claude/LogicEnginePhase3`
- Basis Executor: `src/services/logic/actions/actuator_executor.py`
- Error Code System: `src/core/error_codes.py`
