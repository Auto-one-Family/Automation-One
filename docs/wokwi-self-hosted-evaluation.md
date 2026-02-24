# Wokwi Self-Hosted CI Server Evaluation

**Datum:** 2026-02-06 | **Aktualisiert:** 2026-02-23
**Aktueller Plan:** Pro ($25/seat/month)
**Budget:** 2000 CI-Minuten/Monat

---

## Zusammenfassung

| Aspekt | Ergebnis |
|--------|----------|
| **Self-Hosted verfügbar für Pro-Plan?** | **NEIN** |
| **Grund** | Enterprise/On-Premise Option |
| **Empfehlung** | 2000 min/Monat reichen für aktuelle CI-Anforderungen |

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
| **Pro** | $25/seat/mo | 2000 min | ❌ (Standard) | ← **AKTUELL** |
| **Enterprise** | Kontakt | Custom | ✅ (On-Premise) |

**Quelle:** [wokwi.com/pricing](https://wokwi.com/pricing), [docs.wokwi.com/wokwi-ci/getting-started](https://docs.wokwi.com/wokwi-ci/getting-started)

---

## 3. Budget-Prognose (Pro-Plan: 2000 min/Monat)

| Phase | Szenarien | Geschätzte Zeit/Run | Runs/Monat |
|-------|-----------|---------------------|------------|
| Aktuell | 173 | ~50-60 min (Full) | ~33-40 |
| PR Core Only | 52 | ~15-20 min | ~100-133 |
| Nightly (Full) | 173 | ~50-60 min | ~33-40 |

**Status:** Mit dem Pro-Plan (2000 min/Monat) ist das Budget für die aktuelle CI-Strategie (52 Core bei PR + 173 Nightly) ausreichend. ~30 Daily Nightlies + ~50-80 PR-Runs pro Monat möglich.

---

## 4. Aktuelle CI-Strategie (Pro-Plan)

Mit dem Pro-Plan (2000 min/Monat) ist die Budget-Situation entspannt. Die aktuelle Strategie:

### 4.1 Tiered Triggering (implementiert)

| Trigger | Kategorien | Szenarien | Geschätzte Zeit |
|---------|------------|-----------|-----------------|
| Push/PR auf Feature-Branch | Core (52 Szenarien) | 16 Jobs parallel | ~15-20 min |
| Nightly (03:00 UTC) | Full (173 Szenarien) | 22 Jobs (Core + Extended) | ~50-60 min |
| Manuell (workflow_dispatch) | Full (173 Szenarien) | 22 Jobs | ~50-60 min |

### 4.2 Budget-Nutzung (geschätzt)

| Posten | Min/Monat | Anteil |
|--------|-----------|--------|
| ~60 PR-Runs × 20 min | ~1200 | 60% |
| ~30 Nightly-Runs × 55 min | ~1650 | -- |
| **Limitierender Faktor** | **Nightly** | ~36 Nightlies/Monat |

**Empfehlung:** Bei täglichen Nightlies (~30/Monat = ~1650 min) + ~20 PR-Runs (~400 min) = ~2050 min. Knapp am Limit. Workflow-Dispatch-Runs sparsam einsetzen.

### 4.3 Lokales Testen weiterhin empfohlen

```bash
# Lokal testen vor Push (spart CI-Minuten)
make wokwi-test-boot
make wokwi-test-quick

# Nur bei Erfolg pushen
git push
```

---

## 5. Alternative Optionen (Langfristig)

| Option | Kosten | Vorteil |
|--------|--------|---------|
| ~~Upgrade auf Pro~~ | ~~$25/mo~~ | ✅ **Aktiv** (2000 min/Monat) |
| **Enterprise kontaktieren** | Custom | Self-Hosted, unlimited, On-Premise |
| **GitHub Actions Cache** | $0 | Schnellere Builds, weniger Sim-Zeit |
| **Matrix-Strategie** | $0 | Fehlgeschlagene schneller abbrechen |

---

## 6. Fazit

**Self-Hosted ist auch für den Pro-Plan NICHT verfügbar** (nur Enterprise/On-Premise).

**Aktueller Status (Pro-Plan, seit 2026-02-23):**
1. 2000 CI-Minuten/Monat — ausreichend für 173 Szenarien (52 Core + 121 Nightly)
2. Tiered Triggering implementiert: Core bei PR, Full bei Nightly/Manual
3. Lokales Testen weiterhin empfohlen um CI-Budget zu schonen
4. Enterprise-Kontakt nur nötig falls Self-Hosted/unlimited benötigt wird

---

**Quellen:**
- [Wokwi Pricing](https://wokwi.com/pricing)
- [Wokwi CI Getting Started](https://docs.wokwi.com/wokwi-ci/getting-started)
- [Docker Hub: wokwi-ci-server](https://hub.docker.com/r/wokwi/wokwi-ci-server)
