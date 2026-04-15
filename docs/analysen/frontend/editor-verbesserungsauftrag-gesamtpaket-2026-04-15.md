# Editor Verbesserungsauftrag - Gesamtpaket (2026-04-15)

**Ziel:** Operativ umsetzbarer Gesamtauftrag fuer Anzeigeort-SSOT, Zone/Subzone-Einbindung, Mengenkontrolle und Persistenzhaertung.

---

## 1) Umsetzungsstrategie

1. **Zuerst Semantik stabilisieren** (Paket 1), damit alle Folgepakete dieselbe Sprache nutzen.  
2. **Dann Platzierungsfaehigkeit erweitern** (Paket 2) fuer Zone/Subzone-Cards.  
3. **Parallel begrenzen** (Paket 3), um Ueberflutung sofort einzudaemmen.  
4. **Persistenz robust machen** (Paket 4), um stille Verluste zu stoppen.  
5. **Legacy migrieren** (Paket 5), inkl. ZoneTile-Sonderfall.  
6. **Absichern** (Paket 6) mit Unit/Integration/E2E + visuelle Regression.

---

## 2) Paket 1 - Anzeigeort-SSOT

## Ziel

- Feldmodell harmonisieren
- Doppelkonfiguration aufloesen
- eindeutige Renderentscheidung

## Scope

- `dashboard.store.ts` (Filter + Resolver)
- `CustomDashboardView.vue` (Editor-Controls)
- `MonitorView.vue` (Renderquellen)
- `api/dashboards.ts` (DTO-Erweiterung)

## Kernarbeit

1. Einfuehrung kanonischer Platzierungsstruktur (`display_context`, `entity_scope`, `render_role`, `placement_priority`).  
2. Zentraler Resolver im Store (`resolvePlacements(context)`).  
3. Entkopplung alter Konkurrenzsignale (`scope`+`target`) aus Renderpfaden.

## Akzeptanz

- Jede Anzeigeentscheidung laeuft ueber eine zentrale Resolverfunktion.
- Keine View-seitigen Sonderfilter auf Legacy-Felder.
- Dokumentierte Konfliktmeldung bei Kollision.

## Test

- Unit: Resolver liefert deterministische Resultate.
- Integration: L1/L2 zeigen erwartete Panels je Kontext.
- E2E: Editor-Setzung bleibt nach Reload/Sync stabil.

## Risiko

- Hohe Breitenwirkung auf bestehende Layouts.

## Abhaengigkeit

- Startpaket, keine Vorbedingungen.

---

## 3) Paket 2 - Zone/Subzone-Widget-Einbindung

## Ziel

- Editor-UI fuer Zone/Subzone-Auswahl
- Widget-Rendering als Card im Zielkontext
- Kollisionen und Sortierung

## Scope

- Editor-Target-UI (`CustomDashboardView.vue`)
- Monitor L2 Subzone-Bloecke (`MonitorView.vue`)
- Store/DTO um `subzone_id` ergaenzen

## Kernarbeit

1. Subzone als explizites Ziel im Placement-Modell.  
2. Renderer-Slot in Subzone-Accordion fuer `render_role=widget_card`.  
3. Sortierregel mit `placement_priority`.

## Akzeptanz

- User kann im Editor Zone und Subzone als Ziel waehlen.
- Widget erscheint genau im gewaehlten Subzone-Block.
- Kein Doppelrendering in Zone und Subzone gleichzeitig ohne explizite Konfiguration.

## Test

- Unit: Placement-Validierung scope=zone/subzone.
- Integration: Subzone-Renderung bei Datenwechsel stabil.
- E2E: Create->Save->Reload->Render in gleicher Subzone.

## Risiko

- Subzone-IDs aus Backend koennen sich dynamisch aendern.

## Abhaengigkeit

- Paket 1 abgeschlossen (Resolver + Modell).

---

## 4) Paket 3 - Dashboard-Mengenbegrenzung

## Ziel

- Auto-Generierung einschraenken
- sinnlose Erzeugung verhindern
- Hauptansicht entlasten

## Scope

- Auto-Generatoren im Store + Monitor-Watcher
- Cleanup-Logik und Sichtbarkeitspriorisierung

## Kernarbeit

1. Harte Limits (`max_auto_dashboards_per_zone`, `max_widgets_per_auto_dashboard`).  
2. Guardrails: keine Erzeugung bei leerem/duplikatem Inhalt.  
3. Sichtbarkeitsregel: Hauptansicht priorisieren, Rest unten.

## Akzeptanz

- Keine ungebremste Dashboardskalierung bei vielen Zonen/Sensoren.
- Auto-Generator erzeugt nur bei Nutzwert.
- Sichtbare Dashboardanzahl bleibt kontrolliert.

## Test

- Unit: Limit- und Skip-Regeln.
- Integration: Watcher triggern nur relevante Rebuilds.
- E2E: Lasttest mit vielen Zonen ohne Panelflut.

## Risiko

- Zu harte Limits koennen gewuenschte Inhalte ausblenden.

## Abhaengigkeit

- Paket 1 empfohlen, kann teilweise parallel laufen.

---

## 5) Paket 4 - Persistenzhaertung

## Ziel

- Save/Sync/Reload stabilisieren
- no-silent-loss
- Konflikterkennung und Recovery

## Scope

- Store-Patchpfad erzwingen
- direkte Mutationen in Views eliminieren
- Conflict- und Retry-UX verbessern

## Kernarbeit

1. Verbot direkter Layout-Mutation ausserhalb Store-Actions.  
2. Alle Migrationen ueber `applyLayoutPatch`/dedizierte Actions.  
3. Conflict-Status im Editor klar anzeigen und aufloesen.

## Akzeptanz

- Keine persistenzkritische View-Mutation mehr.
- Reload reproduziert exakt den letzten bestaetigten Zustand.
- Konfliktpfad ist fuer User sichtbar und aufloesbar.

## Test

- Unit: dirty/conflict/local_only Uebergaenge.
- Integration: offline->online sync.
- E2E: race condition bei schnellem Wechsel und gleichzeitigen Saves.

## Risiko

- Nebenwirkungen in bestehenden Auto-Migrationsrouten.

## Abhaengigkeit

- Kann parallel zu Paket 3 laufen.

---

## 6) Paket 5 - Migration + Rueckwaertskompatibilitaet

## Ziel

- Alt-Daten sicher ueberfuehren
- ZoneTile konsistent migrieren
- Rollout ohne harte Brueche

## Scope

- Migrationsskript/Store-Migration fuer Legacy-Felder
- Kompatibilitaets-Layer fuer alte DTOs

## Kernarbeit

1. Legacy-Mapping `scope/target -> placement`.  
2. ZoneTile-Sonderfall klar transformieren (`render_role=zone_tile`).  
3. Stufenrollout mit Feature-Flag.

## Akzeptanz

- Alte Layouts bleiben nutzbar.
- Keine versteckten Duplikate nach Migration.
- Downgrade/Read-Compatibility fuer begrenzten Zeitraum.

## Test

- Unit: Mappingmatrix alt->neu.
- Integration: gemischte Datenbestaende.
- E2E: Altbestand importieren, korrekt rendern.

## Risiko

- Historische Sonderfaelle (manuell geaenderte auto-layouts).

## Abhaengigkeit

- Paket 1 und 4 vorausgesetzt.

---

## 7) Paket 6 - Test- und Regressionsschutz

## Ziel

- Unit, Integration, E2E
- Mock/Echt-Pruefung
- visuelle Regression fuer Anzeigeorte

## Scope

- Store-Tests
- View/Renderer-Integrationstests
- E2E-Szenarien fuer L1/L2/Editor
- Snapshot/visual diff fuer Platzierung

## Kernarbeit

1. Tests fuer Resolver, Limits, Persistenzstatus.  
2. End-to-End Flows Create->Configure->Reload->Render fuer zone/subzone.  
3. Visual-baselines fuer L1 ZoneTile, L2 Subzone-Cards, Bottom/Side-Panels.

## Akzeptanz

- Kritische Flows sind testabgedeckt.
- Neue Regressionen in Anzeigeort/Menge werden frueh erkannt.

## Risiko

- Testsetup fuer visuelle Vergleiche braucht stabile Fixture-Daten.

## Abhaengigkeit

- Begleitet alle Pakete, finaler Gate vor Rollout.

---

## 8) Reihenfolge und Priorisierung

1. Paket 1 (P0)  
2. Paket 4 (P0)  
3. Paket 3 (P0)  
4. Paket 2 (P1)  
5. Paket 5 (P1)  
6. Paket 6 (P0 als laufender Schutz, finaler Gate)

---

## 9) Mock- und Echtpfade fuer Umsetzung

## Mock

- lokale Frontend-Store-Daten
- kontrollierte Fixture-Zonen/Subzonen fuer deterministische Tests

## Echt

- `dashboardsApi` Sync gegen `/api/v1/dashboards`
- Monitor-L2 Daten ueber `/zone/{zone_id}/monitor-data`
- Reload/Conflict-Tests mit echten Serverantworten

---

## 10) Lieferzustand nach Abschluss

Ein erfolgreicher Abschluss des Gesamtpakets liefert:

1. eindeutige SSOT-Platzierung ohne konkurrierende Felder  
2. echte Zone/Subzone-Card-Zuordnung  
3. kontrollierte Dashboardmenge statt Ueberflutung  
4. robuste Persistenz ohne stille Desyncs  
5. rueckwaertskompatible Migration inkl. ZoneTile  
6. belastbaren Regressionsschutz fuer weitere Iterationen

