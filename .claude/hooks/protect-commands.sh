#!/bin/bash
# PreToolUse hook for Bash: Block dangerous commands beyond deny-list
# Exit 0 = allow, Exit 2 = block (stdout shown to agent)

TOOL_INPUT="${TOOL_INPUT:-}"
COMMAND=""

# Try to extract command from TOOL_INPUT JSON
if [ -n "$TOOL_INPUT" ]; then
  COMMAND=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('command',''))" 2>/dev/null)
fi

# If no command extracted, allow (don't block on parse failure)
if [ -z "$COMMAND" ]; then
  exit 0
fi

# Additional dangerous patterns (beyond settings.json deny list)
PATTERNS="rm -rf \.|rm -rf /|> /dev/sd|mkfs\.|:\(\)\{|format [A-Z]:|del /[sS]"

if echo "$COMMAND" | grep -qiE "$PATTERNS"; then
  echo "BLOCKED: Dangerous command pattern detected. Requires explicit user approval."
  exit 2
fi

exit 0
