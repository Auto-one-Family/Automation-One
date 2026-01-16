"""
Compound Condition Evaluator

Evaluates compound conditions with AND/OR logic.
"""

from typing import Dict, List

from ....core.logging_config import get_logger
from .base import BaseConditionEvaluator

logger = get_logger(__name__)


class CompoundConditionEvaluator(BaseConditionEvaluator):
    """
    Evaluates compound conditions with AND/OR logic.
    
    Supports:
    - AND logic (all conditions must be true)
    - OR logic (at least one condition must be true)
    - Nested compound conditions
    """

    def __init__(self, evaluators: List[BaseConditionEvaluator]):
        """
        Initialize compound evaluator.
        
        Args:
            evaluators: List of condition evaluators to use for sub-conditions
        """
        self.evaluators = evaluators

    def supports(self, condition_type: str) -> bool:
        """Check if this evaluator supports compound conditions."""
        return condition_type == "compound" or "logic" in condition_type.lower()

    async def evaluate(self, condition: Dict, context: Dict) -> bool:
        """
        Evaluate compound condition.
        
        Args:
            condition: Condition dictionary with:
                - logic: "AND" or "OR"
                - conditions: List of sub-conditions
            context: Evaluation context (passed to sub-conditions)
                
        Returns:
            True if compound condition is met, False otherwise
        """
        # Check if this is a compound condition
        logic = condition.get("logic", "AND").upper()
        
        if logic not in ("AND", "OR"):
            logger.warning(f"Unknown logic operator: {logic}")
            return False
        
        # Get sub-conditions
        sub_conditions = condition.get("conditions", [])
        
        if not sub_conditions:
            logger.warning("Compound condition has no sub-conditions")
            return False
        
        # Evaluate all sub-conditions
        results = []
        for sub_condition in sub_conditions:
            # Find appropriate evaluator for this sub-condition
            cond_type = sub_condition.get("type", "unknown")
            
            evaluator = None
            for eval_obj in self.evaluators:
                if eval_obj.supports(cond_type):
                    evaluator = eval_obj
                    break
            
            if evaluator is None:
                logger.warning(
                    f"No evaluator found for condition type: {cond_type}"
                )
                # For AND logic, fail if we can't evaluate
                # For OR logic, continue (might still pass)
                if logic == "AND":
                    return False
                continue
            
            try:
                result = await evaluator.evaluate(sub_condition, context)
                results.append(result)
            except Exception as e:
                logger.error(
                    f"Error evaluating sub-condition {cond_type}: {e}",
                    exc_info=True,
                )
                # On error, treat as False for AND, continue for OR
                if logic == "AND":
                    return False
                results.append(False)
        
        # Apply logic operator
        if logic == "AND":
            # All must be True
            return all(results) if results else False
        else:  # OR
            # At least one must be True
            return any(results) if results else False
























