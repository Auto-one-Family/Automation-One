#Requires -Version 5.1
<#
.SYNOPSIS
  Wiederholbare Vorbereitung für lokale Entwicklung unter Windows.

.DESCRIPTION
  - Erstellt das externe Docker-Netzwerk "shared-infra-net", falls es fehlt
    (Voraussetzung laut docker-compose.yml / AGENTS.md).
  - Legt im Repo-Root eine .env aus .env.example an, nur wenn noch keine .env existiert
    (keine Ueberschreibung; bestehende Secrets bleiben unangetastet).
  Keine Passwörter oder Secrets in diesem Skript.

.EXAMPLE
  cd Auto-one
  .\scripts\windows\ensure-dev-prerequisites.ps1
#>

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Write-Step {
  param([string]$Message)
  Write-Host "[ensure-dev-prerequisites] $Message" -ForegroundColor Cyan
}

# --- 1) External Docker network (required by docker-compose.yml) ---
$netName = 'shared-infra-net'
docker network inspect $netName 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Step "Erstelle Docker-Netzwerk $netName ..."
  docker network create $netName
  if ($LASTEXITCODE -ne 0) {
    throw "docker network create $netName fehlgeschlagen (läuft Docker Desktop?)"
  }
} else {
  Write-Step "Docker-Netzwerk $netName ist vorhanden."
}

# --- 2) Root .env from template (never overwrite) ---
# Hinweis: Variablen heissen nicht $env*, damit die PS-Parser nicht mit $env: kollidieren.
$dotEnvExample = Join-Path $RepoRoot '.env.example'
$dotEnvPath = Join-Path $RepoRoot '.env'
if (-not (Test-Path -LiteralPath $dotEnvPath)) {
  if (-not (Test-Path -LiteralPath $dotEnvExample)) {
    Write-Warning ".env.example nicht gefunden - .env nicht erzeugt."
  } else {
    Copy-Item -LiteralPath $dotEnvExample -Destination $dotEnvPath
    Write-Step ".env aus .env.example erstellt. POSTGRES_PASSWORD und JWT_SECRET_KEY in .env anpassen (nicht committen)."
  }
} else {
  Write-Step ".env existiert - nicht ueberschrieben."
}

Write-Step "Fertig. Typischer Stack: docker compose up -d postgres mqtt-broker; Backend/Frontend siehe AGENTS.md."
