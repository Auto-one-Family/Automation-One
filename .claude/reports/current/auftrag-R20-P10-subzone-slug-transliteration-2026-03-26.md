# Auftrag R20-P10 — Subzone-Slug Deutsche Umlaute Transliteration

**Typ:** Bugfix / Haertung — Frontend (El Frontend) + optional Backend (El Servador)
**Schwere:** LOW
**Erstellt:** 2026-03-26
**Aktualisiert:** 2026-03-27 (Schicht-Korrektur nach Review)
**Ziel-Agent:** frontend-dev (auto-one)
**Aufwand:** ~20 Minuten (Kern: Test + Validierung, optional Backend-Haertung)
**Abhaengigkeit:** Keine — eigenstaendiger Fix

---

## Hintergrund und Root Cause (R20-13)

AutomationOne generiert fuer Subzonen automatisch einen URL-freundlichen Slug aus dem
Namen. Der Slug wird als `subzone_id` in der DB gespeichert und fuer MQTT-Topics und
API-Pfade genutzt.

**DB-Befund (2026-03-26):**
```
Subzone-Name: "Aussen"
Gespeicherter Slug: "au_en"  ← FALSCH
Erwarteter Slug:    "aussen" ← KORREKT
```

**Wichtige Erkenntnis nach Review (2026-03-27):**
Die Slug-Generierung findet im **Frontend** statt, NICHT im Backend. Die Funktion
heisst `slugifyGerman()` in `src/utils/subzoneHelpers.ts` (TypeScript). Das Backend
empfaengt `subzone_id` als fertigen String via API — es generiert keine Slugs selbst.

**Der aktuelle Code in `subzoneHelpers.ts` (Zeile 23-46) enthaelt bereits korrekte
Transliterationen:**
```typescript
const GERMAN_TRANSLITERATIONS: Record<string, string> = {
  'ae': 'ae', 'oe': 'oe', 'ue': 'ue', 'ss': 'ss',
  'Ae': 'Ae', 'Oe': 'Oe', 'Ue': 'Ue',
}
```
`slugifyGerman("Aussen")` ergibt `"aussen"` (korrekt).
`slugifyGerman("Aussen")` ergibt `"aussen"` (korrekt).

**Wahrscheinlicher Root Cause:** Die fehlerhaften DB-Eintraege (`"au_en"`) stammen aus
einer aelteren Version, BEVOR `slugifyGerman()` eingefuehrt wurde. Die alte Slug-Logik
hat Umlaute/Sonderzeichen vermutlich zeichenweise ersetzt oder mit Underscore getrennt.
Mit dem aktuellen Code ist der Bug **nicht mehr reproduzierbar**.

---

## Vorbedingung: Reproduzierbarkeit pruefen

**BEVOR mit dem Fix begonnen wird**, muss geprueft werden ob der Bug noch aktiv ist:

1. `slugifyGerman("Aussen")` aufrufen — erwartet: `"aussen"` (nicht `"au_en"`)
2. `slugifyGerman("Gruen-Zone")` aufrufen — erwartet: `"gruen-zone"`
3. Eine neue Subzone mit Umlaut-Name ueber das Frontend anlegen und DB-Eintrag pruefen

**Wenn der Bug NICHT reproduzierbar ist** (wahrscheinlich): Direkt zu den Aufgaben
2 und 3 springen (Test + Backend-Haertung). Der Frontend-Code braucht dann keinen Fix.

**Wenn der Bug reproduzierbar ist:** Den Code in `slugifyGerman()` analysieren und
die Transliteration korrigieren — die GERMAN_TRANSLITERATIONS Map sollte dann alle
Faelle abdecken (ae, oe, ue, ss + Grossbuchstaben-Varianten + Unicode ä, ö, ü, ß).

---

## IST-Zustand

### Frontend (primaerer Code-Pfad)

**Datei:** `src/utils/subzoneHelpers.ts`, Funktion `slugifyGerman()` (Zeile 36)

**Einziger Aufrufer:** `src/composables/useSubzoneCRUD.ts` (Zeile 80):
```typescript
const subzoneId = slugifyGerman(newSubzoneName.value)
```
Dieser Wert wird dann als `subzone_id` an die API gesendet.

**Aktuelles Verhalten (vermutlich bereits korrekt):**
```typescript
slugifyGerman("Aussen")    // → "aussen" ✅
slugifyGerman("Innen")     // → "innen"  ✅
slugifyGerman("Pflanze 1") // → "pflanze-1" ✅
```

### Backend (Empfaenger, keine eigene Slug-Generierung)

**Pydantic-Validator:** `src/schemas/subzone.py` (Zeile 80-86) nutzt `str.isalnum()`
fuer die `subzone_id`-Validierung. `isalnum()` akzeptiert Unicode-Zeichen (ae, oe, ue, ss)
als gueltig — wenn jemand per API direkt `"Aussen"` als `subzone_id` sendet (ohne
Frontend), wird es durchgereicht ohne Transliteration.

**Normalisierer:** `src/utils/subzone_helpers.py`, Funktion `normalize_subzone_id()`
normalisiert nur `__none__` und leere Strings — keine Transliteration.

---

## SOLL-Zustand (3 Aufgaben)

### Aufgabe 1: Unit-Tests fuer `slugifyGerman()` schreiben

Es existieren keine Tests fuer die Slug-Funktion. Tests hinzufuegen die alle
relevanten Faelle abdecken:

```typescript
// In einer neuen Test-Datei, z.B. src/utils/__tests__/subzoneHelpers.spec.ts

describe('slugifyGerman', () => {
  // Umlaute (Unicode-Zeichen)
  it('transliteriert ae', () => expect(slugifyGerman('Aussen')).toBe('aussen'))
  it('transliteriert oe', () => expect(slugifyGerman('Hoehe')).toBe('hoehe'))
  it('transliteriert ue', () => expect(slugifyGerman('Gruen')).toBe('gruen'))
  it('transliteriert ss', () => expect(slugifyGerman('Aussen')).toBe('aussen'))

  // Grossbuchstaben-Umlaute
  it('transliteriert Ae', () => expect(slugifyGerman('Ae')).toBe('ae'))
  it('transliteriert Oe', () => expect(slugifyGerman('Oe')).toBe('oe'))
  it('transliteriert Ue', () => expect(slugifyGerman('Ue')).toBe('ue'))

  // Kombiniert
  it('behandelt Leerzeichen', () => expect(slugifyGerman('Pflanze 1')).toBe('pflanze-1'))
  it('behandelt keine Umlaute', () => expect(slugifyGerman('Innen')).toBe('innen'))
  it('behandelt mehrere Umlaute', () => expect(slugifyGerman('Uebergroesse')).toBe('uebergroesse'))

  // Edge Cases
  it('leerer String', () => expect(slugifyGerman('')).toBe(''))
  it('nur Sonderzeichen', () => expect(slugifyGerman('---')).toBe(''))
})
```

### Aufgabe 2: Backend-Validator haerten (Defense-in-Depth) — OPTIONAL

Die Pydantic-Validierung in `src/schemas/subzone.py` (Zeile 80-86) sollte eine
zusaetzliche ASCII-Pruefung bekommen. Aktuell akzeptiert `str.isalnum()` auch
Unicode-Zeichen wie ae, oe, ue, ss — wenn jemand per API direkt `"Aussen"` als
`subzone_id` sendet, wird es gespeichert.

**Warum:** Das Frontend transliteriert korrekt, aber direkte API-Aufrufe (z.B.
per curl, Postman, oder zukuenftige Integrationen) umgehen das Frontend. Eine
serverseitige Pruefung ist Defense-in-Depth.

**Moegliche Umsetzung in `validate_subzone_id_format()`:**
```python
# Zusaetzlich zu bestehenden Checks:
if not value.isascii():
    raise ValueError(
        'subzone_id must contain only ASCII characters. '
        'Use transliterated forms: ae→ae, oe→oe, ue→ue, ss→ss'
    )
```

**Alternativ:** Serverseitige Transliteration als Fallback (aufwaendiger, aber
toleranter gegenueber fehlerhaften Clients).

### Aufgabe 3: Alte DB-Eintraege korrigieren — OPTIONAL, SEPARATER AUFTRAG

Falls alte Slugs wie `"au_en"` in der DB stoeren, kann ein einmaliges
Migrations-Skript geschrieben werden. Das ist aber **kein Pflichtbestandteil**
dieses Auftrags — bestehende Slugs sind technisch funktionsfaehig.

**Wichtig:** Eine DB-Migration muss serverseitig passieren (Python/Alembic),
nicht ueber die Frontend-Funktion.

---

## Was NICHT geaendert werden darf

- Bestehende Subzone-Slugs in der DB (keine automatische Migration in diesem Auftrag)
- API-Endpoints fuer Subzonen
- MQTT-Topic-Struktur (`kaiser/{kaiser_id}/esp/{esp_id}/subzone/...`)
- Die Signatur von `slugifyGerman()` (Name, Parameter, Return-Typ)
- `useSubzoneCRUD.ts` — der Aufrufer bleibt unveraendert

---

## Akzeptanzkriterien

### Pflicht
- [ ] Unit-Tests fuer `slugifyGerman()` existieren und decken Umlaute, Grossbuchstaben, Leerzeichen und Edge Cases ab
- [ ] Alle Tests PASS
- [ ] `slugifyGerman("Aussen")` gibt `"aussen"` zurueck (nicht `"au_en"`)
- [ ] `slugifyGerman("Aussen")` gibt `"aussen"` zurueck (ss-Handling)
- [ ] `slugifyGerman("Innen")` gibt weiterhin `"innen"` zurueck (keine Regression)
- [ ] `slugifyGerman("Pflanze 1")` gibt `"pflanze-1"` zurueck
- [ ] Neue Subzones erhalten korrekte Slugs (manueller Test im Browser)

### Optional (Defense-in-Depth)
- [ ] Backend-Validator `validate_subzone_id_format()` prueft `isascii()` und lehnt Unicode-Slugs mit 422 ab
- [ ] Bestehende ASCII-Slugs (auch `"au_en"`) passieren den Validator weiterhin

---

> Erstellt von: automation-experte Agent
> Aktualisiert: 2026-03-27 — Schicht-Korrektur (Backend→Frontend), Funktion korrigiert (generate_slug→slugifyGerman), Agent korrigiert (backend→frontend-dev), Reproduzierbarkeits-Check ergaenzt, Backend-Haertung als optionale Defense-in-Depth hinzugefuegt
> Roadmap-Referenz: R20-P10, Bug R20-13 in `auftraege/roadmap-R20-bugfix-konsolidierung-2026-03-26.md`
> Aufwand: ~20min (Test + Validierung), +15min optional (Backend-Haertung)
