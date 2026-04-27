# Linear für auto-debugger (Onboarding)

## Ziel

**Linear** ist die kanonische Oberfläche für Status, Verknüpfungen und den nachvollziehbaren Kommentarverlauf. Lokale Markdown-Artefakte unter `.claude/reports/current/...` bleiben der **Evidence-Store**; jede wesentliche Erkenntnis wird **zusätzlich** als Issue-Kommentar (mit Repo-Pfad) gespiegelt — außer `linear_local_only: true` in der Steuerdatei.

## Schnellstart (unter 10 Minuten)

1. **Linear API Key:** [Linear → Settings → API](https://linear.app/settings/api) → Personal API keys → neuen Key anlegen.
2. **`.env`** im Repo-Root (nicht committen):  
   `LINEAR_API_KEY=lin_api_...`  
   Optional: `LINEAR_TEAM=AutoOne` überschreibt `team` aus der YAML.
3. **`.claude/config/linear-auto-debugger.yaml`** anpassen: `team`, `default_project`, `default_state`, `labels.*` auf echte Namen/Struktur im Workspace.
4. **PowerShell** (Befehle mit **`;`** verketten, nicht `&&`):

```powershell
cd "C:\Users\robin\Documents\PlatformIO\Projects\Auto-one"; $env:LINEAR_API_KEY="lin_api_..."; python scripts/linear/auto_debugger_sync.py teams --config .claude/config/linear-auto-debugger.yaml
```

5. **Dedup / Suche** vor neuen Issues:

```powershell
python scripts/linear/auto_debugger_sync.py search --config .claude/config/linear-auto-debugger.yaml --query "auto-debugger demo"
```

## IDs ermitteln

| Bedarf | Wo in Linear |
|--------|----------------|
| Team-ID / Key | Team-Einstellungen, oder `python ... teams` |
| Projekt | Projektseite → URL enthält oft Slug; GraphQL/API: `projects` |
| Label-UUID | Workspace-Labels; `list_issue_labels` über MCP **user-linear** |
| Issue-Identifier | z. B. `AUT-134` in der Issue-URL |

## Zwei Wege zur API

| Kontext | Vorgehen |
|---------|----------|
| **Cursor** | MCP **`user-linear`**: vor jedem Aufruf Tool-Schema unter `mcps/user-linear/tools/` lesen; `save_issue`, `save_comment`, `list_issues`, Relationen (`parentId`, `relatedTo`, `duplicateOf`, `blocks`, …). |
| **Headless / PowerShell** | `scripts/linear/auto_debugger_sync.py` — nur **Python-Stdlib**; liest `LINEAR_API_KEY` aus der Umgebung. |

## Docker / Logs (Korrelation)

Gezielt, keine Dump-Marathons:

```powershell
cd "C:\Users\robin\Documents\PlatformIO\Projects\Auto-one"; docker compose ps; docker logs automationone-mqtt --since 30m 2>&1 | Select-Object -First 80
```

(Servicenamen an `docker compose ps` anpassen.)

## Idempotenz (`LINEAR-SYNC-MANIFEST.json`)

Im gebundenen Artefaktordner. Schema (Auszug):

```json
{
  "run_id": "slug-des-laufs",
  "parent": { "id": "uuid", "identifier": "AUT-1", "url": "https://linear.app/..." },
  "children": {
    "PKG-01": { "id": "uuid", "identifier": "AUT-2", "url": "..." }
  },
  "comment_sha256": { "verify-plan": "hex..." }
}
```

Wiederholter Aufruf von `parent-ensure` / `child-ensure` mit bestehendem Manifest erzeugt **keine** zweite Issue-Flut. `comment-idempotent` postet nur, wenn sich der Body-Hash für `--key` geändert hat.

## Sicherheit

- **Nie** `LINEAR_API_KEY` in Git, Issue-Titel oder Reports.
- Kommentare: Logzeilen **kürzen**; vollständige Rohdatei nur per Repo-Pfad referenzieren.

## Migration alter Incident-Ordner

Kein Massenimport. Optional: einmaliger Parent-Kommentar auf bestehendem Linear-Issue mit Link auf `.claude/reports/current/incidents/<id>/` und Anlage eines leeren Manifests für weitere Synchronisation.
