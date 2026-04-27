---
run_mode: artefact_improvement
incident_id: ""
run_id: "demo-linear-embedding-2026-04-24"
order: incident_first
target_docs:
  - docs/analysen/PLAN-auto-debugger-linear-SOLL.md
scope: |
  Demonstrationslauf für Linear-Einbettung: kein Produkt-Feature.
  Artefaktordner: .claude/reports/current/auto-debugger-runs/demo-linear-embedding-2026-04-24/
  Nach Anlage der Linear-Issues: LINEAR-ISSUES.md im Ordner mit PKG → Identifier pflegen; verify-plan-Kommentar siehe PLAN-Dokument.
linear_local_only: false
linear_epic_issue_id: ""
linear_parent_issue_id: ""
linear_run_issue_id: ""
linear_target_labels: "auto-debugger"
linear_dedup_search_query: "demo-linear-embedding"
forbidden: |
  Keine Secrets. Keine Produktcode-Änderungen. Kein Push/Force auf Git.
done_criteria: |
  1) LINEAR-SYNC-MANIFEST.json enthält parent + zwei children (PKG-01, PKG-02).
  2) LINEAR-ISSUES.md ist mit den drei Linear-IDs befüllt.
  3) VERIFY-PLAN-REPORT.md (Demo-Stub) existiert; optional verify-plan-Kommentar auf Parent-Issue.
---

# Demo — Linear embedding

Siehe [PLAN-auto-debugger-linear-SOLL.md](../../../../docs/analysen/PLAN-auto-debugger-linear-SOLL.md) für PowerShell-Befehle.
