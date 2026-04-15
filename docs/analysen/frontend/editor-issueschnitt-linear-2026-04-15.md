# Editor Issue-Schnitt (linear, 2026-04-15)

**Ziel:** Direkt anlegefaehige, priorisierte Umsetzungstickets fuer lineare Abarbeitung.

---

## Cluster: Anzeigeort/SSOT

## Issue 01

1. **Titel:** `dashboard.store` - Kanonischen Placement-Resolver einfuehren  
2. **Problem/Nutzerwirkung:** Anzeigeort ist mehrfach codiert; Dashboards erscheinen unerwartet oder verschwinden.  
3. **Scope:** `El Frontend/src/shared/stores/dashboard.store.ts`, `El Frontend/src/api/dashboards.ts`  
4. **Technische Ursache:** Konkurrenz zwischen `scope/zoneId` und `target.view/placement`.  
5. **Loesungsansatz:** neues Placement-Objekt + zentrale `resolvePlacements(context)` Funktion; alte Filter auf Resolver umbauen.  
6. **Akzeptanzkriterien:** alle Renderlisten (`inline/side/bottom/hardware`) stammen nur aus Resolver; keine Legacy-Sonderfilter in Views.  
7. **Testplan (Mock+Echt):** Unit fuer Resolver-Matrix; Integration in Monitor/Hardware mit Fixture-Layouts; Echt-Sync ueber `/api/v1/dashboards`.  
8. **Risiko+Abhaengigkeiten:** hoher Refactor-Radius; Grundlage fuer Folgeissues.  
9. **Prioritaet:** P0  
10. **Aufwand:** L

## Issue 02

1. **Titel:** Editor-UI auf SSOT-Felder umstellen (Anzeigeort-Panel)  
2. **Problem/Nutzerwirkung:** User stellt Anzeigeort ein, aber Ergebnis ist wegen Feldduplikaten inkonsistent.  
3. **Scope:** `El Frontend/src/views/CustomDashboardView.vue`  
4. **Technische Ursache:** UI schreibt `target` und separat `scope/zoneId` ohne kanonische Validierung.  
5. **Loesungsansatz:** Editor schreibt nur neues Placement-Modell inkl. semantischer Validierung.  
6. **Akzeptanzkriterien:** jeder Save erzeugt valides Placement; Konflikte werden sofort sichtbar.  
7. **Testplan (Mock+Echt):** Component-Tests fuer Eingaben/Konflikte; E2E: Anzeigeort setzen -> Reload -> identische Renderung.  
8. **Risiko+Abhaengigkeiten:** Abhaengig von Issue 01.  
9. **Prioritaet:** P0  
10. **Aufwand:** M

---

## Cluster: Zone/Subzone-Widgets

## Issue 03

1. **Titel:** Dashboard-Placement um `subzone_id` erweitern  
2. **Problem/Nutzerwirkung:** Widgets koennen nicht explizit in Subzonen platziert werden.  
3. **Scope:** `dashboard.store.ts`, `api/dashboards.ts`, zugehoerige Types  
4. **Technische Ursache:** Layoutmodell kennt kein `subzoneId` als Platzierungsziel.  
5. **Loesungsansatz:** Placement-Feld `subzone_id` + Scope-Regeln `entity_scope=subzone`.  
6. **Akzeptanzkriterien:** Persistenz, Rehydrate und API-DTO transportieren `subzone_id` verlustfrei.  
7. **Testplan (Mock+Echt):** Unit fuer Scope-Validation; Integration mit Monitor-Subzone-Fakes; Echt-Roundtrip API.  
8. **Risiko+Abhaengigkeiten:** benoetigt Issue 01 als Basis.  
9. **Prioritaet:** P0  
10. **Aufwand:** M

## Issue 04

1. **Titel:** Monitor L2 - Subzone-Card-Slot fuer Dashboard-Widgets rendern  
2. **Problem/Nutzerwirkung:** Trotz Subzone-Kontext landen Inhalte nur zonenweit.  
3. **Scope:** `El Frontend/src/views/MonitorView.vue`, ggf. `InlineDashboardPanel.vue`  
4. **Technische Ursache:** kein Render-Slot pro Subzone fuer Dashboard-Widgets.  
5. **Loesungsansatz:** im Subzone-Accordion gezielte Renderung fuer `display_context=subzone_inline` + passende IDs.  
6. **Akzeptanzkriterien:** Widget erscheint nur in gewaehlter Subzone; keine Duplikate in anderen Subzonen/Zonen.  
7. **Testplan (Mock+Echt):** Integration mit mehreren Subzonen; E2E fuer Wechsel zwischen Subzonenfiltern.  
8. **Risiko+Abhaengigkeiten:** abhaengig von Issue 03.  
9. **Prioritaet:** P0  
10. **Aufwand:** M

---

## Cluster: ZoneTile-Harmonisierung

## Issue 05

1. **Titel:** ZoneTile-Semantik auf eine Quelle der Wahrheit umstellen  
2. **Problem/Nutzerwirkung:** ZoneTile ist teils doppelt konfiguriert und kann im falschen Kontext auftauchen.  
3. **Scope:** `MonitorView.vue`, `dashboard.store.ts`  
4. **Technische Ursache:** `scope='zone-tile'` und `target=monitor/inline` wirken parallel.  
5. **Loesungsansatz:** ZoneTile nur ueber `render_role=zone_tile` + `display_context=zone_inline` aufloesen.  
6. **Akzeptanzkriterien:** ZoneTile-Inhalte erscheinen nur im vorgesehenen L1/L2-Slot und nie als cross-zone Nebeneffekt.  
7. **Testplan (Mock+Echt):** Integration fuer Zone A/B mit ZoneTile-Widgets; E2E L1->L2 Navigation.  
8. **Risiko+Abhaengigkeiten:** abhaengig von Issue 01, beeinflusst Migration.  
9. **Prioritaet:** P0  
10. **Aufwand:** M

## Issue 06

1. **Titel:** ZoneTile-Migration ueber Store-Actions statt Direktmutation  
2. **Problem/Nutzerwirkung:** aeltere ZoneTile-Layouts koennen bei Reload wieder inkonsistent sein.  
3. **Scope:** `El Frontend/src/views/MonitorView.vue`, `dashboard.store.ts`  
4. **Technische Ursache:** direkte Objektmanipulation (`widgets`, `scope`, `target`) ohne Save/Sync-Pfad.  
5. **Loesungsansatz:** dedizierte Store-Actions fuer ZoneTile-Migration mit Persist+Sync.  
6. **Akzeptanzkriterien:** Migration ist idempotent, nachvollziehbar und reload-stabil.  
7. **Testplan (Mock+Echt):** Unit fuer Migration alter Layoutformen; E2E mit Legacy-Fixture.  
8. **Risiko+Abhaengigkeiten:** sollte vor finaler Datenmigration abgeschlossen sein.  
9. **Prioritaet:** P0  
10. **Aufwand:** M

---

## Cluster: Auto-Generierungsregeln

## Issue 07

1. **Titel:** Guardrails fuer Auto-Generierung in `generateZoneDashboard`  
2. **Problem/Nutzerwirkung:** Monitor wird mit auto Dashboards/Wigets ueberladen.  
3. **Scope:** `El Frontend/src/shared/stores/dashboard.store.ts`  
4. **Technische Ursache:** keine harten Mengen- oder Nutzwertgrenzen.  
5. **Loesungsansatz:** Limits + Duplicate-Check + "kein Inhalt, kein Auto-Create".  
6. **Akzeptanzkriterien:** pro Zone maximal ein auto Zone-Dashboard; leere/duplikate Layouts werden nicht erzeugt.  
7. **Testplan (Mock+Echt):** Unit fuer Limits; Integration mit vielen Sensoren; Echtlauf im Monitor.  
8. **Risiko+Abhaengigkeiten:** muss mit UX-Policy fuer Sichtbarkeit abgestimmt werden.  
9. **Prioritaet:** P0  
10. **Aufwand:** M

## Issue 08

1. **Titel:** Monitor-Watcher auf relevante Trigger begrenzen  
2. **Problem/Nutzerwirkung:** unnoetige Rebuilds erzeugen Last und Layout-Churn.  
3. **Scope:** `El Frontend/src/views/MonitorView.vue`  
4. **Technische Ursache:** Trigger auf grobe Device/Count-Signale statt fachlich relevante Aenderungen.  
5. **Loesungsansatz:** Triggerdifferenzierung (neu/weg Sensor-Aktor, nicht reine Reihenfolge).  
6. **Akzeptanzkriterien:** kein Auto-Rebuild ohne echte Nutzwertaenderung.  
7. **Testplan (Mock+Echt):** watcher-focused integration tests; E2E mit simulierter Device-Fluktuation.  
8. **Risiko+Abhaengigkeiten:** in enger Kopplung zu Issue 07.  
9. **Prioritaet:** P1  
10. **Aufwand:** M

---

## Cluster: Persistenz/Merge

## Issue 09

1. **Titel:** Conflict- und Dirty-State Recovery im Editor verhaerten  
2. **Problem/Nutzerwirkung:** User sieht nicht klar, warum Anzeige nach Reload abweicht.  
3. **Scope:** `dashboard.store.ts`, `CustomDashboardView.vue`  
4. **Technische Ursache:** Merge/Conflict vorhanden, aber UX-Fuehrung und Recovery noch unvollstaendig.  
5. **Loesungsansatz:** klarer Conflict-Banner mit "keep local/accept server/merge retry".  
6. **Akzeptanzkriterien:** Konfliktfaelle sind sichtbar, bedienbar und auditierbar.  
7. **Testplan (Mock+Echt):** Unit fuer Statusuebergaenge; E2E fuer Offline->Online Konflikt.  
8. **Risiko+Abhaengigkeiten:** sollte nach SSOT stabilisierung passieren.  
9. **Prioritaet:** P1  
10. **Aufwand:** M

## Issue 10

1. **Titel:** Identitaets-Dedupe aktivieren (`buildLayoutIdentityKey`)  
2. **Problem/Nutzerwirkung:** funktional gleiche Dashboards koennen mehrfach existieren.  
3. **Scope:** `dashboard.store.ts`  
4. **Technische Ursache:** Helper vorhanden, wird aber nicht in Create/Merge/Auto-Pfaden genutzt.  
5. **Loesungsansatz:** Dedupe bei Create, Auto-Create und Merge verbindlich anwenden.  
6. **Akzeptanzkriterien:** keine Mehrfachanlagen gleicher Identitaet.  
7. **Testplan (Mock+Echt):** Unit fuer Key/Matching; Integration bei wiederholten Triggern.  
8. **Risiko+Abhaengigkeiten:** beeinflusst bestehende Bestandsdaten (Migration erforderlich).  
9. **Prioritaet:** P1  
10. **Aufwand:** S

---

## Cluster: Tests/Regression

## Issue 11

1. **Titel:** Unit-Testpaket fuer Placement-Resolver und Mengenregeln  
2. **Problem/Nutzerwirkung:** ohne Tests kommen Anzeigeort-Regressionen schnell zurueck.  
3. **Scope:** `El Frontend` store test suites  
4. **Technische Ursache:** zentrale Logik heute nur partiell abgesichert.  
5. **Loesungsansatz:** Testmatrix fuer Context, Scope, Role, Limits, Kollisionen.  
6. **Akzeptanzkriterien:** alle P0-Regeln aus Paketen 1 und 3 als Unit-Tests vorhanden.  
7. **Testplan (Mock+Echt):** Mock-basierte Pinia-Store-Tests + CI.  
8. **Risiko+Abhaengigkeiten:** sollte parallel zu Paketimplementierung laufen.  
9. **Prioritaet:** P0  
10. **Aufwand:** M

## Issue 12

1. **Titel:** E2E + visuelle Regression fuer L1/L2 Anzeigeorte  
2. **Problem/Nutzerwirkung:** Layoutfehler fallen oft erst spaet auf.  
3. **Scope:** Frontend E2E/visual test setup  
4. **Technische Ursache:** fehlender automatischer UI-Regression-Schutz fuer Platzierungslogik.  
5. **Loesungsansatz:** Szenarien fuer ZoneTile, ZoneInline, SubzoneInline, Bottom/Side Panels mit Snapshotvergleich.  
6. **Akzeptanzkriterien:** reproduzierbare Screenshots/DOM-Assertions fuer Kernkontexte und Reload-Faelle.  
7. **Testplan (Mock+Echt):** Mock-Fixtures + optional echter API-Roundtrip in nightly job.  
8. **Risiko+Abhaengigkeiten:** stabile Testdaten benoetigt; folgt auf Issue 01-05.  
9. **Prioritaet:** P1  
10. **Aufwand:** L

---

## Empfohlene lineare Abarbeitung

1. Issue 01  
2. Issue 02  
3. Issue 05  
4. Issue 06  
5. Issue 03  
6. Issue 04  
7. Issue 07  
8. Issue 08  
9. Issue 09  
10. Issue 10  
11. Issue 11  
12. Issue 12

