# Linear, Sentry und Cursor für dieses Repository

Dieses Dokument bezieht sich auf das Git-Remote **`Auto-one-Family/Automation-One`**. Passe Owner/Repo an, falls dein Fork anders heißt.

## Kurzklärung: Was "herunterladen" bedeutet

- **Linear** läuft als Web-App und optional als **Desktop-App**: [linear.app/download](https://linear.app/download).
- **Sentry** läuft als SaaS/On-Prem Plattform; für Cursor wird die MCP-Anbindung konfiguriert.
- **Cursor** verbindet sich mit Linear/Sentry über MCP (lokaler Chat/Agent) und optional über Dashboard-Integrationen (Cloud Agents).

---

## 1. Linear-Projekt passend zu diesem Repo

1. In Linear ein **Team** wählen (oder anlegen), in dem die AutomationOne-Arbeit läuft.
   - Aktives Team in diesem Workspace: [AutoOne / AUT](https://linear.app/autoone/team/AUT/active)
2. **Projekt** anlegen, z. B. `AutomationOne`, und mit dem Team verknüpfen.
3. **GitHub verbinden** (Linear → Settings → Integrations → GitHub): Repository **`Auto-one-Family/Automation-One`** auswählen.  
   Damit verknüpfen sich Branches und Pull Requests automatisch mit Issues, wenn du die Issue-ID im Branch-Namen nutzt (siehe Abschnitt 4).

---

## 2. Cursor Cloud Agent ↔ Linear (Issue zuweisen)

Für **Background-/Cloud-Agenten**, die aus Linear starten und PRs erstellen können:

1. Du (oder ein **Cursor-Admin** im Team) öffnest [cursor.com/dashboard/integrations](https://www.cursor.com/dashboard/integrations).
2. **Linear** mit **Connect** verbinden, Workspace und Team wählen, autorisieren.
3. Laut [Cursor-Doku: Linear](https://cursor.com/docs/integrations/linear): **GitHub** im Cursor-Dashboard verbinden, **Standard-Repository** und Cloud-Agent-Einstellungen (Modell, Base-Branch) setzen.

**Repo-Ziel pro Issue** (wichtig bei mehreren Repos):

- In der Issue-Beschreibung oder in einem Kommentar z. B.  
  `[repo=Auto-one-Family/Automation-One]`  
  verwenden, **oder**
- In Linear unter Settings → **Labels** eine Gruppe **`repo`** (genau so, case-insensitive) anlegen und darin ein Label **`Auto-one-Family/Automation-One`** anlegen; dieses Label am Issue (oder Projekt) setzen.

**Nutzung:** Issue öffnen → Assignee **Cursor** wählen oder in Kommentaren **`@Cursor`** erwähnen.

---

## 3. Lokales Cursor: Linear + Sentry per MCP (dieses Repo)

Das Repo ignoriert **`/.mcp.json`** (siehe `.gitignore`), damit keine Tokens lokal aus Versehen committed werden.

### Voraussetzungen

- **Node.js** installiert, sodass `npx` verfügbar ist (für `mcp-remote`).

### Einrichtung

1. Im Repository-Root die Vorlage kopieren:

   ```powershell
   Copy-Item mcp.json.example .mcp.json
   ```

2. Falls du **bereits** eine `.mcp.json` hast: die Blöcke unter `mcpServers.linear` und `mcpServers.sentry` aus `mcp.json.example` **manuell** in deine Datei einfügen (pro Name jeweils nur ein Schlüssel).

3. Cursor neu starten oder unter **Einstellungen → MCP** die Server **linear** und **sentry** aktivieren.

4. Beim ersten Zugriff folgt die **OAuth-/Anmelde-Führung**:
   - Linear via `https://mcp.linear.app/mcp`
   - Sentry via `https://mcp.sentry.dev/mcp`

### Wichtiger Hinweis: globale Cursor-MCP-Datei

Wenn du MCP-Server **global** statt repo-lokal verwaltest, liegt die wirksame Datei unter:

- `C:\Users\<dein-user>\.cursor\mcp.json`

In diesem Fall müssen `linear` und `sentry` dort eingetragen sein (nicht nur in `/.mcp.json` im Repository).

### Was wurde für dieses Repo standardisiert?

Die Vorlage `mcp.json.example` enthält jetzt beide Server:

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.linear.app/mcp"]
    },
    "sentry": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.sentry.dev/mcp"]
    }
  }
}
```

### Alternative (Personal API Token)

Wenn du keinen Remote-MCP nutzen willst, existieren Community-Pakete mit **`LINEAR_ACCESS_TOKEN`**. Tokens **niemals** ins Repo legen; nur in Umgebungsvariablen oder in der lokalen `.mcp.json`, die gitignored ist.

---

## 4. Agenten-Zugriff prüfen (Linear/Sentry)

Wenn die MCP-Server korrekt aktiv sind, tauchen sie im Cursor-MCP-Panel auf und Agenten können deren Tools verwenden.

Prüfpfad:

1. Cursor neu starten (wichtig nach Änderungen in `.mcp.json`).
2. In Cursor unter MCP prüfen, dass **linear** und **sentry** den Status "connected" zeigen.
3. Optional einen kurzen Test-Call machen (z. B. Issues listen in Linear, Projektinfos in Sentry).

Hinweis: Solange `linear`/`sentry` nicht als aktive MCP-Server geladen sind, haben Agenten keinen Zugriff auf diese Tools.

---

## 5. Branch- und Commit-Konventionen (GitHub ↔ Linear)

| Element | Konvention |
|--------|------------|
| Branch | `feature/AUTO-123-kurzbeschreibung` (Präfix **`AUTO-`** nur Beispiel — **dein Team-Präfix** steht in Linear unter Team-Settings als **Issue identifier**) |
| Commit / PR-Text | Issue-ID erwähnen, z. B. `AUTO-123: Kurzbeschreibung` |

Interne Analysen im Repo verwenden teils Platzhalter wie `#AUTO-LX-L01`; in Linear legst du echte Issues an und ersetzt die Platzhalter durch deine echten IDs.

---

## 6. Checkliste

- [ ] Linear-Team + Projekt für AutomationOne
- [ ] GitHub-Integration auf **`Auto-one-Family/Automation-One`**
- [ ] Optional: Label-Gruppe **`repo`** mit Label **`Auto-one-Family/Automation-One`**
- [ ] Cursor Dashboard: Linear + GitHub + Default-Repo für Cloud Agents
- [ ] Lokal: `mcp.json.example` → **`.mcp.json`**, MCP **linear** + **sentry** in Cursor aktiv
- [ ] MCP Smoke-Test erfolgreich (Linear-Team/Issues abrufbar, Sentry-`whoami` erfolgreich)
- [ ] Branches mit **echtem** Issue-Präfix aus deinem Linear-Team

---

## 7. Troubleshooting

- **MCP verbindet nicht:** Cursor neu starten; unter MCP die Logs prüfen; prüfen, ob `npx` im PATH ist.
- **Sentry MCP verbindet nicht:** Prüfen, ob der Server auf `https://mcp.sentry.dev/mcp` konfiguriert ist und OAuth-Freigabe abgeschlossen wurde.
- **Cloud Agent baut im falschen Repo:** `[repo=Auto-one-Family/Automation-One]` oder **`repo`**-Label setzen (Abschnitt 2).
- **Kein "Connect" bei Linear in Cursor:** Nur **Cursor-Admins** können die Organisation-Integration installieren — Admin bitten oder persönlichen Workspace testen.
