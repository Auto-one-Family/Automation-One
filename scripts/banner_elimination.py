#!/usr/bin/env python3
"""
AUT-286: Replace box-banner LOG_*/Serial.println with plain-text single-line equivalents.
Saves ~5 KB DRAM on ESP32 by eliminating UTF-8 box chars from string literals.

Handles only pure-string banners. Dynamic-content banners are left unchanged.
"""
import re
import os

BASE = os.path.join(
    os.path.dirname(__file__), "..", "El Trabajante", "src"
)

FILES = [
    r"main.cpp",
    r"services\communication\mqtt_client.cpp",
    r"services\actuator\actuator_manager.cpp",
    r"services\provisioning\provision_manager.cpp",
    r"utils\time_manager.cpp",
    r"services\communication\wifi_manager.cpp",
    r"tasks\communication_task.cpp",
    r"services\config\storage_manager.cpp",
]

EMOJI_MAP = {
    "✅": "[OK]",      # ✅
    "❌": "[FAIL]",    # ❌
    "⚠️": "[WARN]",  # ⚠️
    "\U0001f525": "[!!!]",  # 🔥
}


def clean_text(text: str) -> str:
    for emoji, repl in EMOJI_MAP.items():
        text = text.replace(emoji, repl)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def is_dynamic_line(line: str) -> bool:
    """True if line contains runtime string concatenation (+ variable or String(...))."""
    return bool(re.search(r"\+\s*(?:\w+_\w*|\w+_|String\()", line))


def extract_content_text(line: str):
    """
    Extract plain text from a banner content line containing ║.
    Returns None if the line has dynamic string parts (cannot safely flatten).
    """
    if is_dynamic_line(line):
        return None

    parts = line.split("║")  # ║ = U+2551
    if len(parts) >= 3:
        text = parts[1]
    elif len(parts) == 2:
        text = parts[1]
        text = re.sub(r'"\s*\);\s*$', "", text)
    else:
        return ""

    return clean_text(text)


def get_fn_info(line: str):
    """
    Extract (indent_str, fn_name, tag_name, has_newline_prefix) from a ╔ opener line.
    Returns (None, None, None, None) if line cannot be parsed.
    """
    indent = len(line) - len(line.lstrip())
    indent_str = line[:indent]
    stripped = line.strip()

    if stripped.startswith("Serial.println"):
        has_nl = bool(re.search(r'println\(\s*"\\n', stripped))
        return indent_str, "Serial.println", "", has_nl

    m = re.match(r"(LOG_[IWEC])\((\w+)", stripped)
    if m:
        return indent_str, m.group(1), m.group(2), False

    return None, None, None, None


def process_file(filepath: str) -> int:
    label = os.path.basename(filepath)
    print(f"  {label}", end="", flush=True)

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(" [NOT FOUND]")
        return 0

    output = []
    i = 0
    changes = 0

    while i < len(lines):
        line = lines[i]

        # Quick filter: only lines with ╔ (U+2554) can open a banner
        if "╔" not in line:
            output.append(line)
            i += 1
            continue

        indent_str, fn, tag, has_nl = get_fn_info(line)
        if fn is None:
            output.append(line)
            i += 1
            continue

        # Collect banner: ╠ separator (skip), ║ content, ╚ close
        content_parts = []
        has_dynamic = False
        j = i + 1
        banner_complete = False

        while j < len(lines) and j < i + 20:
            next_line = lines[j]

            if "╚" in next_line:   # ╚  closing
                banner_complete = True
                j += 1
                break
            elif "╠" in next_line:  # ╠  separator
                j += 1
            elif "║" in next_line:  # ║  content
                text = extract_content_text(next_line)
                if text is None:
                    has_dynamic = True
                    j += 1
                else:
                    if text:
                        content_parts.append(text)
                    j += 1
            else:
                # Non-banner line interrupts sequence
                break

        if banner_complete and not has_dynamic:
            combined = " | ".join(content_parts)
            if fn == "Serial.println":
                prefix = r"\n" if has_nl else ""
                replacement = f'{indent_str}Serial.println(F("{prefix}--- {combined} ---"));\n'
            else:
                replacement = f'{indent_str}{fn}({tag}, "=== {combined} ===");\n'
            output.append(replacement)
            changes += 1
            i = j
        else:
            # Incomplete or dynamic banner: emit as-is
            output.extend(lines[i:j])
            i = j

    if changes > 0:
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(output)
        print(f" -- {changes} banners converted")
    else:
        print(" -- no changes")

    return changes


if __name__ == "__main__":
    print("AUT-286: Box-Banner Elimination")
    print("=" * 40)
    total = 0
    for fname in FILES:
        fpath = os.path.normpath(os.path.join(BASE, fname))
        total += process_file(fpath)
    print("=" * 40)
    print(f"Total: {total} banners converted")
