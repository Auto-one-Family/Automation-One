---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: ""
run_id: feuchte-baseline-esp-gpio33-2026-04-11
order: incident_first
target_docs:
  - docs/analysen/BERICHT-feuchte-baseline-neues-esp-gpio33-live-verifikation-2026-04-11.md
scope: |
  NEUSTART — **keine** Fehlerkaskade: Ein klarer **Baseline-Lauf** fuer **genau einen** physischen Aufbau.

  HARDWARE / GERAET (normativ, von Robin):
  - **ESP32 DevKit WROOM**, seriell **COM4** (lokaler PC-Anschluss — im Server-Repo nur als Kontext fuer
    Firmware-Flash/Serial-Monitor; **keine** COM-Ports in produktiven Configs einchecken).
  - **Ein** kapazitiver Bodenfeuchtesensor auf **GPIO 33** (nicht 32 — explizit **33**).
  - Sensor **noch nicht kalibriert** → Server/Firmware arbeiten mit **Default-Kennlinie** bzw. Roh-ADC wie
    dokumentiert.
  - Substrat: **trocken**, Sensor **stabil** (keine Schwankungen in der aktuellen Beobachtung) — das ist die
    **Referenz-Erwartung** fuer „Baseline gesund“.

  ZIEL DIESES LAUFS (nur **Verifikation + Bericht**, **keine** Produktcode-Aenderung):
  1) **esp_id** (oder kanonisches Device-Identifier) des **neuen** ESP im System ermitteln und **alle**
     folgenden Checks **nur** auf **dieses** Geraet + **GPIO 33** + **sensor_type moisture** beziehen —
     keine Aggregation mit anderen ESPs, keine alten Test-Geraete mischen.
  2) **Live-Status je Schicht** abarbeiten (siehe Schichten-Tabelle unten); pro Schicht: **IST-Wert** oder
     **BLOCKER** (was fehlt, um die Schicht zu sehen).
  3) Bericht ablegen: eine **uebersichtliche** Tabelle „Schicht → Status → Evidence“.

  SCHICHTEN (der Reihe nach; nichts ueberspringen ohne „N/A“ zu begruenden):

  | # | Schicht | Was zu verifizieren ist |
  |---|---------|-------------------------|
  | L0 | **Identitaet** | Welches DB-/MQTT-`esp_id` gehoert zum neuen Geraet? (UI-Liste, DB `esp_devices`, oder MQTT-
       Login/Hello — **ein** eindeutiger Weg dokumentieren.) |
  | L1 | **Firmware-Konfig** | Im Code/Config: Sensor auf **GPIO 33**, Typ moisture, `raw_mode`/Pi-Enhanced wie
       konfiguriert — **IST** aus `sensor_registry` / Device-Config / NVS-Wissen **read-only** aus Repo. |
  | L2 | **MQTT / Roh-Payload** | Letzte sinnvolle Messages: `raw` oder ADC, `gpio`==33, **kein** Fremd-Geraet.
       Wenn moeglich **ein** Payload-Zitat (ohne Secrets). |
  | L3 | **Server-Verarbeitung** | Welcher Pfad: Pi-Enhanced → `moisture.py` mit **Defaults** (3200/1500) wenn
       unkalibriert? Evidence aus Code-Pfad + ggf. Log-Zeile. |
  | L4 | **Persistenz** | `sensor_configs`: `calibration_data` **leer** oder Default — **nur** dieses Device/GPIO. |
  | L5 | **Frontend** (falls Daten sichtbar) | Anzeige Roh/Prozent fuer **dieses** Geraet — konsistent mit L3/L4? |

  ERFOLGSBILD „BASELINE OK“:
  - End-to-end ist **konsistent** beschreibbar (von MQTT-Roh bis zu dem, was der Operator sieht).
  - **Kein** Widerspruch zwischen Schichten ohne erklaerte Ursache (wenn doch: **eine** klare Luecke nennen).

  NICHT IN DIESEM LAUF:
  - Kalibrier-Wizard, Finalize, Korrelations-Fixes — **out of scope** (erst nach stabiler Baseline).
  - Parallele Analyse alter Incidents — hoechstens **ein** Absatz „Abgrenzung zur frueheren Kaskade“.

forbidden: |
  Keine Secrets/Tokens/Keys in Berichten.
  Keine Code-Aenderungen in diesem Lauf.
  Keine Aggregation ueber mehrere `esp_id` ohne explizite Trennung.
  Git: read-only wo moeglich.
  Inbox-Kopie nach Auto-one: keine Pfade auf Life-Repo, arbeitsbereiche/, wissen/.

done_criteria: |
  - docs/analysen/BERICHT-feuchte-baseline-neues-esp-gpio33-live-verifikation-2026-04-11.md existiert.
  - Tabelle L0–L5 vollstaendig: je Zeile **Status** (OK / BLOCKER / N/A) + **kurze Evidence** (Pfad, Query,
    Topic-Muster, oder „nicht verfuegbar: Grund“).
  - **esp_id** des neuen Geraets im Bericht **genannt** (oder BLOCKER: konnte nicht ermittelt werden).
  - Explizit: Sensor **GPIO 33** und **unkalibriert** im Lauf beruecksichtigt.
---

# Steuerlauf — Feuchte-Baseline: neuer ESP, GPIO 33, Live je Schicht

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `feuchte-baseline-esp-gpio33-2026-04-11`

## Ziel (ein Satz)

Fuer **einen** frischen ESP (COM4 / DevKit WROOM) mit **Bodenfeuchte auf GPIO 33**, **unkalibriert**, den **Live-Status aller relevanten Schichten** verifizieren und **einen** klaren Baseline-Bericht liefern — **ohne** die fruehere Fehlerkaskade zu mischen.

## Abnahme

Bericht unter `docs/analysen/` mit L0–L5 und eindeutiger `esp_id`-Zuordnung.

---

## Runbook (imperativ)

1. Im Auto-one-Checkout: **ein** Geraet identifizieren, das dem „neuen“ ESP entspricht (Robin bestaetigt ggf.
   Namen/Label in UI oder letzte Registrierung).

2. **Filtern:** alle Queries/Logs mit `esp_id = <dieses>` **und** `gpio = 33` **und** `moisture`.

3. Schichten L0–L5 abarbeiten; BLOCKER ehrlich dokumentieren.

4. Bericht schreiben; **STOP** (kein Fix).

---

## Mehrschritt-Folge (Hinweis fuer Robin)

- **Schritt 1 (dieser STEUER):** Baseline-Bericht **nur** Lesen/Verifizieren.  
- **Schritt 2 (spaeter, separates Gate):** Erst wenn Baseline **OK**, Kalibrierung oder Wizard-Analyse erneut
  ansetzen.

---

## Kopie nach Auto-one

`Auto-one\.claude\auftraege\auto-debugger\inbox\STEUER-feuchte-baseline-neues-esp-gpio33-live-verifikation-2026-04-11.md`

---

## Aktivierung (Claude Code, Auto-one-Checkout)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-feuchte-baseline-neues-esp-gpio33-live-verifikation-2026-04-11.md
Baseline-Lauf: neuer ESP (COM4-Setup), Bodenfeuchte nur GPIO 33, unkalibriert, trockenes Substrat stabil.
Verifiziere L0–L5 (esp_id, MQTT, Server-Defaults, DB, UI) nur fuer dieses Geraet; Bericht
docs/analysen/BERICHT-feuchte-baseline-neues-esp-gpio33-live-verifikation-2026-04-11.md; kein Code-Fix in diesem Lauf.
```

---

## Strategie-Repo (nicht in Inbox-Kopie)

- Kontext vorherige Kaskade nur zur **Abgrenzung** — nicht erneut analysieren.
