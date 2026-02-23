## Gesamtplan – Agenten-Optimierung

---

### AP1 – System-Agenten (Fokus)

**Ziel:** Aus drei (system-control, system-manager, agent-manager) werden zwei.

**Agent A: system-ops** (Arbeitstitel – aus system-control + system-manager)

Kern: Der eine Agent, der das gesamte System kennt, steuert und darüber berichten kann. Zwei Modi:

**Modus 1 – Bericht / Briefing**
Wird nach Bericht gefragt → liefert vollständige Analyse für den TM. Inhalt je nach Kontext, aber deckt immer ab: Systemstatus (Docker, Services, Netzwerk), Log-Übersicht (wo wird was geloggt, aktuelle Auffälligkeiten), Agenten-/Skill-Empfehlung (wer sollte in welcher Reihenfolge ran), Strategie-Vorschlag. Nicht overcomplicated, aber nichts auslassen.

**Modus 2 – Dokument-Ergänzung**
Bekommt ein vorhandenes Dokument → analysiert den Fokus des Dokuments, prüft was fehlt oder falsch ist, ergänzt/korrigiert an der richtigen Stelle. Keine eigene Report-Struktur, sondern Integration in das bestehende Dokument.

**Modus 3 – Ausführung**
Direkte System-Steuerung wie bisher system-control: Docker, curl, MQTT, Flash, Hardware-Resets, lokale Tests starten, CI-Ergebnisse auswerten, Logs aus allen Quellen ziehen, Konfigurationen an Systemdateien vornehmen.

**Was system-ops wissen/können muss:**
- Komplette Netzwerkübersicht (Services, Ports, Container, Kommunikationswege)
- Alle Log-Quellen und wie man sie erreicht (Server, ESP32, MQTT, Frontend, Docker, CI)
- Docker-Stack vollständig (Container, Volumes, Netzwerke, Compose-Struktur)
- Alle Befehle für Hardware-Resets, Flashing, Monitoring
- Test-Infrastruktur (pytest, Vitest, Playwright, Wokwi, CI-Pipeline)
- Debug-Strukturen (welche Debug-Agenten existieren, was sie können)
- Wer der Technical Manager ist und wie die Kommunikation läuft
- Alle Agenten und Skills nach Bereich, Rolle und Reihenfolge
- Referenzdokumente: welche existieren, wo, wofür

**Abgrenzung:** system-ops führt aus, analysiert, berichtet – aber ändert keine Agent-/Skill-Definitionen unter `.claude/`. Das bleibt beim agent-manager.

---

**Agent B: agent-manager** (bleibt separat)

Kern: Prüft und korrigiert die Agenten-/Skill-Struktur unter `.claude/`. Der 8-Phasen-Workflow bleibt als Basis erhalten. agent-manager existiert weiterhin als Agent + Skill.

Keine größeren Änderungen geplant – wird bei AP1 nur soweit angepasst, dass die Referenzen auf den neuen system-ops stimmen und kein Verweis mehr auf den alten system-manager / system-control existiert.

---

**AP1 Umsetzungsschritte:**
1. system-ops Rollenbeschreibung finalisieren (mit Robin)
2. Referenz-Liste zusammenstellen (welche Referenzen braucht system-ops)
3. Agent-Datei schreiben
4. Skill-Datei(en) prüfen – system-control Skill und System Manager Skill zusammenführen?
5. agent-manager anpassen (Referenzen aktualisieren)
6. Alle anderen Agenten prüfen die auf system-control oder system-manager verweisen → Referenzen umbiegen

---

### AP2 – Debug-Agenten

**Agenten:** esp32-debug, server-debug, mqtt-debug, frontend-debug, db-inspector, meta-analyst

**Ziel:** Jeder Debug-Agent bekommt eine klare Arbeitsfolge, Full-Stack-Sicht in seinem Bereich und gezielte Querreferenzen zu anderen Debug-Agenten. Muster wie im Briefing beschrieben (Frage analysieren → Reports prüfen → Referenzen laden → eigenen Stack systematisch durcharbeiten → ggf. an Nachbaragenten delegieren).

**Umsetzung:** Wird erst im Detail geplant wenn AP1 abgeschlossen ist. Dann Agent für Agent durchgehen, Ist-Zustand lesen, Arbeitsfolge definieren, Querreferenzen ergänzen.

---

### AP3 – Dev-Agenten

**Agenten:** esp32-dev, server-dev, mqtt-dev, frontend-dev

**Ziel:** Pattern-Konsistenz über alle vier, saubere Querreferenzen (z.B. mqtt-dev ↔ server-dev ↔ esp32-dev), klare Abgrenzung zu den jeweiligen Debug-Agenten.

**Umsetzung:** Nach AP2. Fokus auf einheitliche Struktur und Zusammenspiel mit den Debug-Agenten.

---

### AP4 – Docs & Git

**Agenten/Skills:** updatedocs, collect-reports, git-commit, git-health, verify-plan

**Ziel:** Noch nicht im Detail besprochen. Wird nach AP3 geplant.

---

### Reihenfolge

```
AP1 (System) → AP2 (Debug) → AP3 (Dev) → AP4 (Docs/Git)
```

Jedes AP wird erst im Detail geplant wenn das vorherige abgeschlossen ist, damit Erkenntnisse einfließen.

---

Robin – passt der Plan so als Rahmen? Wenn ja, gehen wir in AP1 rein und ich formuliere die erste konkrete Nachricht an den VS Code Agent, um die Referenzen und Details zu sammeln die wir für system-ops brauchen.