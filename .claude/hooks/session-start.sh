#!/bin/bash
# Claude Code Session Start Hook für Automation-One
# Automatisch ausgeführt bei Session-Start

echo "🚀 Automation-One IoT Framework"
echo "================================"
echo ""

# 1. Environment Check
echo "📋 Environment Check:"
echo "--------------------"

# Check PlatformIO
if command -v pio &> /dev/null; then
    PIO_VERSION=$(pio --version 2>/dev/null | head -1)
    echo "✅ PlatformIO: $PIO_VERSION"
else
    echo "❌ PlatformIO nicht installiert!"
    echo "   Install: pip install platformio"
fi

# Check Poetry
if command -v poetry &> /dev/null; then
    POETRY_VERSION=$(poetry --version 2>/dev/null)
    echo "✅ $POETRY_VERSION"
else
    echo "❌ Poetry nicht installiert!"
    echo "   Install: curl -sSL https://install.python-poetry.org | python3 -"
fi

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>/dev/null)
    echo "✅ $PYTHON_VERSION"
fi

# Check Git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version 2>/dev/null)
    echo "✅ $GIT_VERSION"
fi

echo ""

# 2. Git Status
echo "📊 Git Status:"
echo "--------------"
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
echo "Branch: $CURRENT_BRANCH"
echo ""

GIT_STATUS=$(git status --short 2>/dev/null)
if [ -z "$GIT_STATUS" ]; then
    echo "✅ Working tree clean"
else
    echo "Modified files:"
    git status --short
fi

echo ""

# 3. Zeige letzte 3 Commits
echo "📜 Recent Commits:"
echo "------------------"
git log --oneline -3 2>/dev/null

echo ""

# 4. PlatformIO Environments
echo "🔌 PlatformIO Environments:"
echo "----------------------------"
if [ -f "El Trabajante/platformio.ini" ]; then
    cd "El Trabajante" || exit
    echo "Available environments:"
    pio project config --json-output 2>/dev/null | grep -o '"env:[^"]*"' | sed 's/"//g' | sed 's/env:/  - /' || echo "  - seeed_xiao_esp32c3\n  - esp32_dev"
    cd ..
else
    echo "⚠️  platformio.ini not found"
fi

echo ""

# 5. Python Dependencies Check
echo "🐍 Python Dependencies:"
echo "-----------------------"
if [ -f "El Servador/pyproject.toml" ]; then
    cd "El Servador" || exit
    if command -v poetry &> /dev/null; then
        POETRY_CHECK=$(poetry check 2>&1)
        if echo "$POETRY_CHECK" | grep -q "All set"; then
            echo "✅ Poetry dependencies OK"
        else
            echo "⚠️  Poetry check warnings:"
            echo "$POETRY_CHECK"
        fi
    fi
    cd ..
else
    echo "⚠️  pyproject.toml not found"
fi

echo ""

# 6. Quick Stats
echo "📈 Project Stats:"
echo "-----------------"
ESP_FILES=$(find "El Trabajante/src" -name "*.cpp" -o -name "*.h" 2>/dev/null | wc -l)
echo "ESP32 Files: $ESP_FILES"

PY_FILES=$(find "El Servador/god_kaiser_server/src" -name "*.py" 2>/dev/null | wc -l)
echo "Python Files: $PY_FILES"

DOC_FILES=$(find . -name "*.md" 2>/dev/null | wc -l)
echo "Documentation Files: $DOC_FILES"

echo ""
echo "✨ Session Ready! Use /help for custom commands"
echo ""
