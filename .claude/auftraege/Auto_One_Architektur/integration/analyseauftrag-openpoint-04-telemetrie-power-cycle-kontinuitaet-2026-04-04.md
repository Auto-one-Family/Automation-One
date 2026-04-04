# Analyseauftrag Open Point 04: Telemetrie-Kontinuitaet ueber Reboot und Power-Cycle

**Typ:** Eigenstaendiger Analyseauftrag  
**Prioritaet:** P2  
**Ziel:** Maschinenlesbare, segmentierte KPI-Auswertung ueber lange Laufzeiten mit Neustarts.

## 1) Problemkern

Counter allein reichen nicht, wenn Bootgrenzen nicht explizit markiert sind.  
Ohne Segmentierung sind 24h-Auswertungen mehrdeutig und schwer verifizierbar.

## 2) Zielzustand

Jeder Telemetrie-Block ist eindeutig einem Bootsegment zugeordnet:

- `boot_sequence_id`
- `reset_reason`
- `segment_start_ts`
- `metrics_schema_version`

## 3) Pflichtanalyse

1. Definiere Segmentierungsmodell fuer Neustarts.
2. Pruefe Backward-Kompatibilitaet fuer bestehende Consumer.
3. Definiere Upgradepfad:
   - neue Felder optional,
   - danach harte Pflicht mit Vertragsversion.

## 4) Fixanforderungen

1. Segmentfelder in Heartbeat/Diagnostik payload verankern.
2. Aggregationsregel fuer Langlauf-KPIs dokumentieren.
3. Alarmregeln auf Segmentgrenzen robust machen.

## 5) Abnahmekriterien

- [ ] 24h-Auswertung bleibt trotz Power-Cycles konsistent.
- [ ] Segmentgrenzen sind maschinell eindeutig.
- [ ] Vertragsupgrade bricht bestehende Consumer nicht.
- [ ] KPI-Interpretation ist reproduzierbar dokumentiert.

