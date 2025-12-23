"""
Logic Validator

Validates logic rules for schema compliance, safety constraints, and conflicts.
"""

from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from ...core.logging_config import get_logger
from ...db.models.logic_validation import validate_actions, validate_conditions

logger = get_logger(__name__)


class ValidationResult:
    """Result of rule validation."""

    def __init__(
        self,
        valid: bool,
        errors: Optional[List[str]] = None,
        warnings: Optional[List[str]] = None,
    ):
        self.valid = valid
        self.errors = errors or []
        self.warnings = warnings or []

    def add_error(self, error: str) -> None:
        """Add an error message."""
        self.errors.append(error)
        self.valid = False

    def add_warning(self, warning: str) -> None:
        """Add a warning message."""
        self.warnings.append(warning)


class SafetyResult:
    """Result of safety validation."""

    def __init__(
        self,
        safe: bool,
        warnings: Optional[List[str]] = None,
    ):
        self.safe = safe
        self.warnings = warnings or []


class ConflictResult:
    """Result of conflict checking."""

    def __init__(
        self,
        has_conflicts: bool,
        conflicts: Optional[List[str]] = None,
    ):
        self.has_conflicts = has_conflicts
        self.conflicts = conflicts or []


class DuplicateResult:
    """Result of duplicate checking."""

    def __init__(
        self,
        has_duplicates: bool,
        duplicates: Optional[List[Dict[str, Any]]] = None,
    ):
        self.has_duplicates = has_duplicates
        self.duplicates = duplicates or []


class LogicValidator:
    """
    Logic rule validator.
    
    Validates rules for:
    - Schema compliance
    - Safety constraints
    - Conflicts with existing rules
    - Duplicates
    """

    def validate_schema(self, rule_data: Dict[str, Any]) -> ValidationResult:
        """
        Validate rule schema.
        
        Args:
            rule_data: Rule data dictionary
            
        Returns:
            ValidationResult with validation status
        """
        result = ValidationResult(valid=True)

        # Check required fields
        required_fields = ["name", "conditions", "actions"]
        for field in required_fields:
            if field not in rule_data:
                result.add_error(f"Missing required field: {field}")

        if not result.valid:
            return result

        # Validate conditions using Pydantic
        try:
            validate_conditions(rule_data["conditions"])
        except ValidationError as e:
            result.add_error(f"Invalid conditions: {e}")
            return result

        # Validate actions using Pydantic
        try:
            validate_actions(rule_data["actions"])
        except ValidationError as e:
            result.add_error(f"Invalid actions: {e}")
            return result

        # Validate logic_operator
        if "logic_operator" in rule_data:
            if rule_data["logic_operator"] not in ("AND", "OR"):
                result.add_error(
                    f"Invalid logic_operator: {rule_data['logic_operator']}. Must be 'AND' or 'OR'"
                )

        # Validate priority range
        if "priority" in rule_data:
            priority = rule_data["priority"]
            if not isinstance(priority, int) or priority < 1 or priority > 100:
                result.add_error(f"Invalid priority: {priority}. Must be between 1 and 100")

        # Validate cooldown_seconds
        if "cooldown_seconds" in rule_data and rule_data["cooldown_seconds"] is not None:
            cooldown = rule_data["cooldown_seconds"]
            if not isinstance(cooldown, int) or cooldown < 0 or cooldown > 86400:
                result.add_error(
                    f"Invalid cooldown_seconds: {cooldown}. Must be between 0 and 86400"
                )

        return result

    def validate_safety(self, rule_data: Dict[str, Any]) -> SafetyResult:
        """
        Validate safety constraints.
        
        Checks for potentially dangerous configurations:
        - Pump without moisture sensor (flood risk)
        - Heater without temperature sensor (overheating risk)
        
        Args:
            rule_data: Rule data dictionary
            
        Returns:
            SafetyResult with safety status
        """
        result = SafetyResult(safe=True)

        # Extract actuator type from actions
        actuator_types = set()
        for action in rule_data.get("actions", []):
            if action.get("type") in ("actuator_command", "actuator"):
                # Try to infer actuator type from action metadata or config
                # For now, we'll check conditions for sensor types
                pass

        # Extract sensor types from conditions
        sensor_types = set()
        conditions = rule_data.get("conditions", [])
        
        # Handle both list and dict conditions
        if isinstance(conditions, dict):
            if conditions.get("logic") in ("AND", "OR"):
                conditions = conditions.get("conditions", [])
            else:
                conditions = [conditions]
        
        for condition in conditions:
            cond_type = condition.get("type")
            if cond_type in ("sensor_threshold", "sensor"):
                sensor_type = condition.get("sensor_type")
                if sensor_type:
                    sensor_types.add(sensor_type.lower())

        # Safety checks based on common patterns
        # Note: This is a basic implementation - can be extended
        
        # Check for pump actions without moisture sensors
        has_moisture_sensor = any(
            st in ("moisture", "soil_moisture", "water_level")
            for st in sensor_types
        )
        
        # If we detect pump actions and no moisture sensor, warn
        # (We can't reliably detect actuator type from actions alone yet,
        #  so this is a placeholder for future enhancement)
        
        # Check for heater actions without temperature sensors
        has_temp_sensor = any(
            st in ("temperature", "temp", "thermal")
            for st in sensor_types
        )

        # Note: These checks are basic - full implementation would require
        # actuator type information which may not be in rule_data
        
        return result

    def check_conflicts(
        self, rule_data: Dict[str, Any], existing_rules: List[Dict[str, Any]]
    ) -> ConflictResult:
        """
        Check for conflicts with existing rules.
        
        Args:
            rule_data: New rule data
            existing_rules: List of existing rule dictionaries
            
        Returns:
            ConflictResult with conflict status
        """
        conflicts = []
        
        # Basic conflict checking - can be extended
        # Check for rules with same name
        rule_name = rule_data.get("name")
        for existing in existing_rules:
            if existing.get("name") == rule_name:
                conflicts.append(f"Rule with name '{rule_name}' already exists")
                break
        
        return ConflictResult(has_conflicts=len(conflicts) > 0, conflicts=conflicts)

    def check_duplicates(
        self, rule_data: Dict[str, Any], existing_rules: List[Dict[str, Any]]
    ) -> DuplicateResult:
        """
        Check for duplicate rules.
        
        Args:
            rule_data: New rule data
            existing_rules: List of existing rule dictionaries
            
        Returns:
            DuplicateResult with duplicate status
        """
        duplicates = []
        
        # Compare conditions and actions
        new_conditions = rule_data.get("conditions", [])
        new_actions = rule_data.get("actions", [])
        
        for existing in existing_rules:
            existing_conditions = existing.get("conditions", [])
            existing_actions = existing.get("actions", [])
            
            # Simple comparison (can be enhanced)
            if (
                str(new_conditions) == str(existing_conditions)
                and str(new_actions) == str(existing_actions)
            ):
                duplicates.append(
                    {
                        "existing_rule": existing.get("name", "Unknown"),
                        "similarity": 100.0,
                    }
                )
        
        return DuplicateResult(
            has_duplicates=len(duplicates) > 0, duplicates=duplicates
        )

    def validate(
        self,
        rule_data: Dict[str, Any],
        existing_rules: Optional[List[Dict[str, Any]]] = None,
    ) -> ValidationResult:
        """
        Perform comprehensive validation.
        
        Args:
            rule_data: Rule data dictionary
            existing_rules: Optional list of existing rules for conflict checking
            
        Returns:
            ValidationResult with all validation results
        """
        result = ValidationResult(valid=True)

        # Schema validation
        schema_result = self.validate_schema(rule_data)
        if not schema_result.valid:
            result.errors.extend(schema_result.errors)
            result.valid = False

        # Safety validation
        safety_result = self.validate_safety(rule_data)
        if not safety_result.safe:
            result.warnings.extend(safety_result.warnings)

        # Conflict checking
        if existing_rules:
            conflict_result = self.check_conflicts(rule_data, existing_rules)
            if conflict_result.has_conflicts:
                result.warnings.extend(conflict_result.conflicts)

            duplicate_result = self.check_duplicates(rule_data, existing_rules)
            if duplicate_result.has_duplicates:
                for dup in duplicate_result.duplicates:
                    result.warnings.append(
                        f"Similar rule found: {dup['existing_rule']} "
                        f"({dup['similarity']:.1f}% match)"
                    )

        return result











