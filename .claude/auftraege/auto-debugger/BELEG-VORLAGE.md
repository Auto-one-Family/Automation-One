---
# Beleg-MD fuer auto-debugger Findings
# Ablageort: .claude/reports/current/auto-debugger-runs/<run_id>/BELEG-<finding-id>-<YYYY-MM-DD>.md
finding_id: ""          # z. B. F-001
run_id: ""              # aus Linear-Issue run_id-Feld oder Slug
date: ""                # YYYY-MM-DD
linear_issue: ""        # https://linear.app/autoone/issue/AUT-XXX/...
category: ""            # error | tracing-gap | duplicate | inconsistency | overcomplexity | unstructured
layer: ""               # El Trabajante | El Servador | El Frontend | Stack
---

# BELEG — [Finding-Titel]

**Finding-ID:** [finding_id]  
**Datum:** [YYYY-MM-DD]  
**Linear-Issue:** [URL]  
**Kategorie:** [error | tracing-gap | duplicate | inconsistency | overcomplexity | unstructured]  
**Schicht:** [El Trabajante | El Servador | El Frontend | Stack]

---

## Symptom-Zusammenfassung

[1–2 Absätze: Was ist beobachtbar? Wann tritt es auf? Wer ist betroffen?]

---

## Logs-Beleg

```loki
[LogQL-Query — z. B. {service="el-servador"} |= "correlation_id=XYZ" | json | line_format "{{.ts}} {{.level}} {{.message}}"]
```

**Roh-Output (5–20 Zeilen mit Timestamps und request_id/correlation_id):**

```
[Timestamp] [Level] request_id=... correlation_id=... [message]
...
```

---

## Stack-Beleg

```
[Stacktrace oder State-Snapshot aus dem betroffenen Service]
[Nur relevanter Ausschnitt — kein vollständiger Log-Dump]
```

---

## Code-Beleg

`path/to/file.py:123` — Kontext 5–15 Zeilen:

```python
# Zeile 120–135
[relevanter Code-Ausschnitt]
```

*Hinweis: Nur repo-belegte Pfade — keine erfundenen Stellen.*

---

## Kausalerklärung

[Wie Logs-Beleg + Stack-Beleg + Code-Beleg zusammen das Symptom verursachen. Konkret benennen welche Zeile / welcher Zustand die Ursache ist.]

---

## Hinweis Konsolidierung (nur bei Kategorie `duplicate`)

**Kanonische Stelle:** `path/to/canonical.py:NNN`  
**Begründung:** [höchste Test-Abdeckung | längste Lebensdauer | klarste API | wenigste Sonderfälle]  
**Zu prüfende andere Stellen:**
- `path/to/other1.py:NNN`
- `path/to/other2.py:NNN`

*Konsolidierung führt NICHT auto-debugger durch — Aufgabe geht per Linear-Issue an Spezialagenten.*
