# Wokwi Self-Hosted CI Server Evaluation

**Datum:** 2026-02-06
**Aktueller Plan:** Hobby ($7/month)
**Budget:** 200 CI-Minuten/Monat

---

## Zusammenfassung

| Aspekt | Ergebnis |
|--------|----------|
| **Self-Hosted verfügbar für Hobby-Plan?** | **NEIN** |
| **Grund** | Enterprise/On-Premise Option |
| **Empfehlung** | Budget optimieren, kein Self-Hosted |

---

## 1. Self-Hosted Server Analyse

### 1.1 Docker-Image

Das Docker-Image `wokwi/wokwi-ci-server` existiert auf Docker Hub:
- **Image:** `wokwi/wokwi-ci-server:latest`
- **Tags:** 20240625, 20240613, latest

### 1.2 Verfügbarkeit

Laut offizieller Wokwi-Dokumentation (docs.wokwi.com/wokwi-ci/getting-started):

> "If you do not want to upload your firmware to the cloud, please contact us to discuss options for **on-premise deployment** of Wokwi CI."

**Interpretation:** Self-Hosted ist KEINE Standard-Feature des Hobby-Plans, sondern eine Enterprise/Custom-Option die individuell verhandelt werden muss.

### 1.3 Test (nicht durchgeführt)

Ein Test mit dem Hobby-Plan Token wurde NICHT durchgeführt, da:
1. Die Dokumentation klar besagt, dass On-Premise kontaktiert werden muss
2. Ein Fehlschlagen würde nur bestätigen, was die Dokumentation bereits sagt
3. Kein Risiko eingehen wollen, den Token zu invalidieren

---

## 2. Wokwi Pricing Übersicht

| Plan | Preis | CI-Minuten/Monat | Self-Hosted |
|------|-------|------------------|-------------|
| **Community** | $0 | 50 min | ❌ |
| **Hobby** | $7/mo | 200 min | ❌ |
| **Hobby+** | $12/mo | 200 min | ❌ |
| **Pro** | $25/seat/mo | 2000 min | ❌ (Standard) |
| **Enterprise** | Kontakt | Custom | ✅ (On-Premise) |

**Quelle:** [wokwi.com/pricing](https://wokwi.com/pricing), [docs.wokwi.com/wokwi-ci/getting-started](https://docs.wokwi.com/wokwi-ci/getting-started)

---

## 3. Budget-Prognose (Hobby-Plan: 200 min/Monat)

| Phase | Szenarien | Geschätzte Zeit/Run | Runs/Monat |
|-------|-----------|---------------------|------------|
| Aktuell | ~32 | ~15-20 min | ~10-13 |
| Nach Phase 1 | ~70 | ~25-30 min | ~6-8 |
| Nach Phase 2 | ~142 | ~50-60 min | **~3-4** |

**Kritischer Punkt:** Ab Phase 2 (~142 Szenarien) sind nur noch ~3-4 volle CI-Runs pro Monat möglich.

---

## 4. Empfehlungen für Hobby-Plan

Da Self-Hosted keine Option ist, müssen wir das Budget optimieren:

### 4.1 Workflow-Trigger optimieren

```yaml
on:
  push:
    paths:
      - 'El Trabajante/**'  # Nur bei Firmware-Änderungen
  pull_request:
    paths:
      - 'El Trabajante/**'
  workflow_dispatch:  # Manuelle Runs für volle Suite
```

### 4.2 Kategorien-basierte Jobs

Statt alle Szenarien bei jedem Push:

| Trigger | Kategorien |
|---------|------------|
| Push auf Feature-Branch | Nur 01-boot, 02-sensor (Quick-Check) |
| PR auf master | Alle aktiven Kategorien |
| Manuell (workflow_dispatch) | Volle Suite inkl. Extended |

### 4.3 Parallelisierung reduzieren

- `--parallel 2` statt `--parallel 4` in CI
- Weniger gleichzeitige Wokwi-Instanzen = weniger Overhead

### 4.4 Skip-Listen pflegen

Szenarien die bekannt stabil sind, können bei Quick-Checks übersprungen werden:
- `SKIP_SCENARIOS` im Python-Runner erweitern
- Flaky Tests identifizieren und fixen statt dauerhaft laufen lassen

### 4.5 Lokales Testen bevorzugen

```bash
# Lokal testen vor Push
make wokwi-test-boot
make wokwi-test-quick

# Nur bei Erfolg pushen
git push
```

---

## 5. Alternative Optionen (Langfristig)

| Option | Kosten | Vorteil |
|--------|--------|---------|
| **Upgrade auf Pro** | $25/mo | 2000 min/Monat (10x mehr) |
| **Enterprise kontaktieren** | Custom | Self-Hosted, unlimited |
| **GitHub Actions Cache** | $0 | Schnellere Builds, weniger Sim-Zeit |
| **Matrix-Strategie** | $0 | Fehlgeschlagene schneller abbrechen |

---

## 6. Fazit

**Self-Hosted ist für den Hobby-Plan NICHT verfügbar.**

Die beste Strategie für das aktuelle Budget:
1. Workflow-Trigger auf Firmware-Pfade beschränken
2. Quick-Check bei Push, volle Suite nur bei PR/manuell
3. Python-Runner mit Skip-Listen optimieren
4. Lokal testen vor Push

Bei kontinuierlicher CI-Nutzung mit >100 Szenarien sollte ein **Upgrade auf Pro ($25/mo)** in Betracht gezogen werden, um 2000 min/Monat zu erhalten.

---

**Quellen:**
- [Wokwi Pricing](https://wokwi.com/pricing)
- [Wokwi CI Getting Started](https://docs.wokwi.com/wokwi-ci/getting-started)
- [Docker Hub: wokwi-ci-server](https://hub.docker.com/r/wokwi/wokwi-ci-server)
