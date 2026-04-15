# Linear und Cursor für dieses Repository

Dieses Dokument bezieht sich auf das Git-Remote **`Auto-one-Family/Automation-One`**. Passe Owner/Repo an, falls dein Fork anders heißt.

## Kurzklärung: Was „herunterladen“ bedeutet

- **Linear** läuft als Web-App und optional als **Desktop-App**: [linear.app/download](https://linear.app/download). Es gibt nichts Repo-internes zu „installieren“, außer Konfiguration und Integrationen.
- **Cursor** verbindet sich mit Linear über das **Cursor-Dashboard** (Cloud Agents) und/oder über **MCP** (lokaler Chat/Agent mit Linear-API).

---

## 1. Linear-Projekt passend zu diesem Repo

1. In Linear ein **Team** wählen (oder anlegen), in dem die AutomationOne-Arbeit läuft.
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

## 3. Lokales Cursor: Linear per MCP (dieses Repo)

Das Repo ignoriert **`/.mcp.json`** (siehe `.gitignore`), damit keine Tokens lokal aus Versehen committed werden.

### Voraussetzungen

- **Node.js** installiert, sodass `npx` verfügbar ist (für `mcp-remote`).

### Einrichtung

1. Im Repository-Root die Vorlage kopieren:

   ```powershell
   Copy-Item mcp.json.example .mcp.json
   ```

2. Falls du **bereits** eine `.mcp.json` hast: den Block unter `mcpServers.linear` aus `mcp.json.example` **manuell** in deine Datei einfügen (nur ein Schlüssel `linear` pro Datei).

3. Cursor neu starten oder unter **Einstellungen → MCP** den Server **linear** aktivieren.

4. Beim ersten Zugriff folgt die **OAuth-/Anmelde-Führung** von Linear (über `mcp-remote` und `https://mcp.linear.app/mcp`). Details können sich ändern; bei Abweichungen die aktuelle Seite [Linear: Cursor MCP](https://linear.app/integrations/cursor-mcp) nutzen.

### Alternative (Personal API Token)

Wenn du keinen Remote-MCP nutzen willst, existieren Community-Pakete mit **`LINEAR_ACCESS_TOKEN`**. Tokens **niemals** ins Repo legen; nur in Umgebungsvariablen oder in der lokalen `.mcp.json`, die gitignored ist.

---

## 4. Branch- und Commit-Konventionen (GitHub ↔ Linear)

| Element | Konvention |
|--------|------------|
| Branch | `feature/AUTO-123-kurzbeschreibung` (Präfix **`AUTO-`** nur Beispiel — **dein Team-Präfix** steht in Linear unter Team-Settings als **Issue identifier**) |
| Commit / PR-Text | Issue-ID erwähnen, z. B. `AUTO-123: Kurzbeschreibung` |

Interne Analysen im Repo verwenden teils Platzhalter wie `#AUTO-LX-L01`; in Linear legst du echte Issues an und ersetzt die Platzhalter durch deine echten IDs.

---

## 5. Checkliste

- [ ] Linear-Team + Projekt für AutomationOne
- [ ] GitHub-Integration auf **`Auto-one-Family/Automation-One`**
- [ ] Optional: Label-Gruppe **`repo`** mit Label **`Auto-one-Family/Automation-One`**
- [ ] Cursor Dashboard: Linear + GitHub + Default-Repo für Cloud Agents
- [ ] Lokal: `mcp.json.example` → **`.mcp.json`**, MCP **linear** in Cursor aktiv
- [ ] Branches mit **echtem** Issue-Präfix aus deinem Linear-Team

---

## 6. Troubleshooting

- **MCP verbindet nicht:** Cursor neu starten; unter MCP die Logs prüfen; prüfen, ob `npx` im PATH ist.
- **Cloud Agent baut im falschen Repo:** `[repo=Auto-one-Family/Automation-One]` oder **`repo`**-Label setzen (Abschnitt 2).
- **Kein „Connect“ bei Linear in Cursor:** Nur **Cursor-Admins** können die Organisation-Integration installieren — Admin bitten oder persönlichen Workspace testen.
