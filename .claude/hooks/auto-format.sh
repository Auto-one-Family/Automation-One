#!/bin/bash
# PostToolUse hook for Edit/Write: Auto-format Python files with ruff
# Pure bash - no Python startup overhead (~5ms vs ~300ms)

FILE_PATH=""

# Extract file_path from TOOL_INPUT JSON without Python
if [ -n "${TOOL_INPUT:-}" ]; then
  FILE_PATH=$(echo "$TOOL_INPUT" | sed -n 's/.*"file_path"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)
fi

# Only format Python files
if [[ "$FILE_PATH" == *.py ]] && command -v ruff &>/dev/null; then
  ruff format --quiet "$FILE_PATH" 2>/dev/null
fi

exit 0
