"""
Conflict Manager für Logic Engine

Erkennt und löst Konflikte wenn mehrere Rules den gleichen Actuator steuern wollen.

INTEGRATION: Via Dependency Injection in LogicEngine
PATTERN: Kein Singleton - wird als Dependency injiziert
"""
import asyncio
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class ConflictResolution(Enum):
    """Wie ein Konflikt aufgelöst wird."""
    HIGHER_PRIORITY_WINS = "higher_priority_wins"
    FIRST_WINS = "first_wins"
    SAFETY_WINS = "safety_wins"  # Sicherheits-relevante Commands haben Vorrang
    BLOCKED = "blocked"          # Actuator ist temporär blockiert


@dataclass
class ConflictInfo:
    """Information über einen erkannten Konflikt."""
    actuator_key: str           # "esp_id:gpio"
    competing_rules: List[str]  # Rule-IDs die konkurrieren
    winner_rule_id: str
    resolution: ConflictResolution
    blocked_until: Optional[datetime] = None
    message: str = ""


@dataclass
class ActuatorLock:
    """Lock für einen Actuator."""
    rule_id: str
    priority: int
    command: str
    acquired_at: datetime
    expires_at: Optional[datetime] = None
    is_safety_critical: bool = False


class ConflictManager:
    """
    Verwaltet Konflikte zwischen Rules die den gleichen Actuator steuern.

    Strategie:
        1. Höhere Priorität gewinnt (niedrigerer priority-Wert = höher)
        2. Bei gleicher Priorität: Erste Rule gewinnt (FIFO)
        3. Safety-kritische Commands haben IMMER Vorrang
        4. Locks haben TTL (default: 60 Sekunden)

    Thread-Safety:
        - asyncio.Lock für jeden Actuator
        - Alle Operationen sind async

    USAGE:
        conflict_manager = ConflictManager()
        can_execute, conflict = await conflict_manager.acquire_actuator(
            esp_id="ESP_001",
            gpio=12,
            rule_id="rule-123",
            priority=1,
            command="ON"
        )
    """

    DEFAULT_LOCK_TTL_SECONDS = 60
    SAFETY_PRIORITY = -1000  # Safety-Commands haben immer höchste Priorität

    def __init__(self):
        self._locks: Dict[str, ActuatorLock] = {}  # "esp_id:gpio" → Lock
        self._mutexes: Dict[str, asyncio.Lock] = {}  # "esp_id:gpio" → asyncio.Lock
        self._conflict_history: List[ConflictInfo] = []

    def _get_actuator_key(self, esp_id: str, gpio: int) -> str:
        """Generiert eindeutigen Key für Actuator."""
        return f"{esp_id}:{gpio}"

    def _get_mutex(self, actuator_key: str) -> asyncio.Lock:
        """Holt oder erstellt Mutex für Actuator."""
        if actuator_key not in self._mutexes:
            self._mutexes[actuator_key] = asyncio.Lock()
        return self._mutexes[actuator_key]

    async def acquire_actuator(
        self,
        esp_id: str,
        gpio: int,
        rule_id: str,
        priority: int,
        command: str,
        is_safety_critical: bool = False,
        lock_ttl_seconds: Optional[int] = None
    ) -> Tuple[bool, Optional[ConflictInfo]]:
        """
        Versucht einen Actuator für eine Rule zu reservieren.

        Args:
            esp_id: ESP-ID
            gpio: GPIO des Actuators
            rule_id: ID der aufrufenden Rule
            priority: Priorität (niedriger = höher)
            command: Das gewünschte Command (ON, OFF, PWM, etc.)
            is_safety_critical: True für Emergency-Stop etc.
            lock_ttl_seconds: Wie lange der Lock gehalten wird

        Returns:
            Tuple of (success, conflict_info)
            - success=True: Rule darf Actuator steuern
            - success=False: Konflikt, conflict_info enthält Details
        """
        actuator_key = self._get_actuator_key(esp_id, gpio)
        mutex = self._get_mutex(actuator_key)

        async with mutex:
            now = datetime.utcnow()
            existing_lock = self._locks.get(actuator_key)

            # Cleanup: Abgelaufene Locks entfernen
            if existing_lock and existing_lock.expires_at and existing_lock.expires_at < now:
                del self._locks[actuator_key]
                existing_lock = None

            # Kein existierender Lock → einfach erwerben
            if existing_lock is None:
                ttl = lock_ttl_seconds or self.DEFAULT_LOCK_TTL_SECONDS
                self._locks[actuator_key] = ActuatorLock(
                    rule_id=rule_id,
                    priority=self.SAFETY_PRIORITY if is_safety_critical else priority,
                    command=command,
                    acquired_at=now,
                    expires_at=now + timedelta(seconds=ttl),
                    is_safety_critical=is_safety_critical
                )
                logger.debug(f"Actuator {actuator_key} acquired by rule {rule_id}")
                return True, None

            # Gleiche Rule → erlauben (Update)
            if existing_lock.rule_id == rule_id:
                existing_lock.command = command
                existing_lock.acquired_at = now
                logger.debug(f"Actuator {actuator_key} renewed by rule {rule_id}")
                return True, None

            # Konflikt! Resolution bestimmen
            effective_priority = self.SAFETY_PRIORITY if is_safety_critical else priority

            # Safety-kritische Commands gewinnen immer
            if is_safety_critical and not existing_lock.is_safety_critical:
                resolution = ConflictResolution.SAFETY_WINS
                winner = rule_id
                self._locks[actuator_key] = ActuatorLock(
                    rule_id=rule_id,
                    priority=effective_priority,
                    command=command,
                    acquired_at=now,
                    expires_at=now + timedelta(seconds=lock_ttl_seconds or self.DEFAULT_LOCK_TTL_SECONDS),
                    is_safety_critical=True
                )
                logger.warning(f"Safety override on {actuator_key}: {rule_id} > {existing_lock.rule_id}")

            # Höhere Priorität gewinnt
            elif effective_priority < existing_lock.priority:
                resolution = ConflictResolution.HIGHER_PRIORITY_WINS
                winner = rule_id
                self._locks[actuator_key] = ActuatorLock(
                    rule_id=rule_id,
                    priority=effective_priority,
                    command=command,
                    acquired_at=now,
                    expires_at=now + timedelta(seconds=lock_ttl_seconds or self.DEFAULT_LOCK_TTL_SECONDS),
                    is_safety_critical=is_safety_critical
                )
                logger.warning(
                    f"Priority override on {actuator_key}: {rule_id} (prio {priority}) > "
                    f"{existing_lock.rule_id} (prio {existing_lock.priority})"
                )

            # Gleiche oder niedrigere Priorität → FIRST_WINS
            else:
                resolution = ConflictResolution.FIRST_WINS
                winner = existing_lock.rule_id
                logger.warning(
                    f"Conflict on {actuator_key}: {rule_id} blocked by {existing_lock.rule_id} "
                    f"(equal or lower priority)"
                )

            conflict = ConflictInfo(
                actuator_key=actuator_key,
                competing_rules=[existing_lock.rule_id, rule_id],
                winner_rule_id=winner,
                resolution=resolution,
                blocked_until=existing_lock.expires_at if winner != rule_id else None,
                message=f"Conflict on {actuator_key}: {resolution.value}"
            )

            self._conflict_history.append(conflict)

            return winner == rule_id, conflict

    async def release_actuator(self, esp_id: str, gpio: int, rule_id: str) -> bool:
        """
        Gibt einen Actuator-Lock frei.

        Args:
            esp_id, gpio: Actuator-Identifikation
            rule_id: Rule die den Lock freigeben will

        Returns:
            True wenn erfolgreich, False wenn Lock einer anderen Rule gehört
        """
        actuator_key = self._get_actuator_key(esp_id, gpio)
        mutex = self._get_mutex(actuator_key)

        async with mutex:
            existing_lock = self._locks.get(actuator_key)
            if existing_lock and existing_lock.rule_id == rule_id:
                del self._locks[actuator_key]
                logger.debug(f"Actuator {actuator_key} released by rule {rule_id}")
                return True
            return False

    def get_active_conflicts(self) -> List[ConflictInfo]:
        """Returns die letzten 100 Konflikte für Debugging."""
        return self._conflict_history[-100:]

    def get_locked_actuators(self) -> Dict[str, ActuatorLock]:
        """Returns alle aktuell gelockten Actuatoren."""
        now = datetime.utcnow()
        return {
            key: lock for key, lock in self._locks.items()
            if lock.expires_at is None or lock.expires_at > now
        }

    def get_stats(self) -> dict:
        """Returns Statistiken für Monitoring."""
        now = datetime.utcnow()
        active_locks = sum(
            1 for lock in self._locks.values()
            if lock.expires_at is None or lock.expires_at > now
        )

        return {
            "active_locks": active_locks,
            "total_locks": len(self._locks),
            "total_conflicts": len(self._conflict_history),
            "recent_conflicts": len(self._conflict_history[-10:])
        }
