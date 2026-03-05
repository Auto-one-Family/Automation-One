# Auftrag: Frontend V1.2 Email-Retry — Analyse aller Stellen und exakte Umsetzung

**Ziel-Repo:** Auto-one (Frontend-Root: `El Frontend/`)  
**Kontext:** Backend V1.2 Email-Retry ist abgeschlossen. Neuer Status `permanently_failed` und `retry_count` kommen aus der API. Das Frontend muss alle Stellen finden, an denen Email-Log/Status genutzt werden, und dort die V1.2-Unterstützung ergänzen.  
**Priorität:** Mittel  
**Datum:** 2026-03-05

---

## Ziel des Auftrags

1. **Phase 1 — Analyse:** Im Frontend (El Frontend/) **alle vorhandenen Stellen** finden und dokumentieren, an denen
   - Email-Log-Daten (EmailLogEntry, getEmailLog, getEmailLogStats) genutzt werden,
   - Email-Status (sent, failed, pending) angezeigt oder gefiltert werden,
   - Status-Labels, -Farben oder -CSS für E-Mail-Log verwendet werden.
2. **Phase 2 — Umsetzung:** An den **korrekten Stellen** (aus Phase 1) den neuen Status `permanently_failed` und die Anzeige von `retry_count` implementieren — ohne Duplikate, ohne fehlende Stellen.

**Ergebnis:** Ein kurzer Analyse-Report (z. B. im Repo oder als Checkliste) mit allen betroffenen Dateien und Zeilenbereichen; danach vollständige Frontend-Anpassung für V1.2.

---

## Backend-Kontext (V1.2 abgeschlossen)

- Retry-Job läuft alle 5 Minuten; Einträge mit `status='failed'` und `retry_count < 3` werden erneut versendet.
- Nach dem 3. Fehlversuch: `status = 'permanently_failed'`, kein weiterer Retry.
- API liefert für Email-Log-Einträge: `status: 'sent' | 'failed' | 'pending' | 'permanently_failed'`, `retry_count: number`.
- Filter `GET /api/v1/notifications/email-log?status=...` akzeptiert auch `permanently_failed`.
- Stats `by_status` können `permanently_failed` enthalten.

---

## Phase 1: Analyse — Alle Frontend-Stellen finden

Der Auftragnehmer durchsucht das Frontend-Repo systematisch und trägt jede relevante Stelle ein. Keine Implementierung vor Abschluss der Analyse.

### Suchbegriffe (Grep/Glob)

- `EmailLogEntry` | `EmailLog` | `email-log` | `emailLog` | `getEmailLog` | `getEmailLogStats`
- `email_status` | `emailStatus` | `email_status_label` | `emailStatusLabel`
- `sent` | `failed` | `pending` (im Kontext von E-Mail/Notification, nicht generisch)
- `drawer__email` | `email-dot` | Klassen/CSS die E-Mail-Status darstellen
- `retry_count` (falls bereits irgendwo genutzt)
- `notifications/` Komponenten: NotificationDrawer, NotificationItem, ggf. NotificationPreferences

### Zu dokumentierende Stellen (Pro Fundort)

Für **jede** gefundene Datei/Stelle:

| # | Datei (Pfad ab El Frontend/) | Zeilen (ca.) | Was ist dort? (Kurz) | V1.2-Anpassung nötig? |
|---|------------------------------|--------------|----------------------|------------------------|
| 1 | src/api/notifications.ts | 139–165 | EmailLogEntry-Interface, status nur sent/failed/pending; retry_count vorhanden | Ja: status um permanently_failed erweitern |
| 2 | src/components/notifications/NotificationDrawer.vue | 105–112, 242–265, 543–560 | emailStatusLabel(), Email-Log-Liste mit Dot/Status, CSS drawer__email-dot--* | Ja: Label, CSS, optional retry_count |
| 3 | src/components/notifications/NotificationItem.vue | 167–170, 418–435 | metadata.email_status Inline-Label, CSS item__email-status--* | Ja: permanently_failed Label + CSS |

### Konkret zu prüfen (Checkliste Analyse)

- [ ] **API-Typ/Interface:** Wo ist `EmailLogEntry` oder der Response-Typ für Email-Log definiert? Enthält er `status` (Union) und `retry_count`? → Erweiterung auf `'permanently_failed'`.
- [ ] **API-Aufrufe:** Wo werden `getEmailLog()` und `getEmailLogStats()` aufgerufen? (z. B. NotificationDrawer, eine Admin-Seite.) → Prüfen ob Filter-Parameter `status` übergeben wird; ggf. Option `permanently_failed` ergänzen.
- [ ] **Status-Label-Funktion:** Gibt es eine zentrale Funktion oder ein Mapping, die aus `status` ein Anzeige-Label macht (z. B. "Zugestellt", "Fehlgeschlagen")? Wo steht sie? → `permanently_failed` → "Dauerhaft fehlgeschlagen".
- [ ] **Status-Darstellung (CSS/Icon):** Wo wird visuell zwischen sent/failed/pending unterschieden (Dot, Badge, Icon)? Welche CSS-Klassen oder Varianten? → Neue Variante für `permanently_failed` (z. B. stärkerer Fehler-Stil).
- [ ] **Einzeleintrag-Anzeige:** Wo wird ein einzelner Email-Log-Eintrag gerendert (z. B. Zeile in einer Tabelle/Liste im Drawer)? → Dort `retry_count` anzeigen (optional) und neuen Status berücksichtigen.
- [ ] **Filter-UI:** Gibt es eine Dropdown/Filter-Leiste für den Email-Log (z. B. "Alle / Sent / Failed")? → Option "Dauerhaft fehlgeschlagen" bzw. `permanently_failed` ergänzen.
- [ ] **Stats-Anzeige:** Wird `getEmailLogStats()` oder `by_status` irgendwo angezeigt? → `permanently_failed` in der Anzeige aufnehmen.
- [ ] **NotificationItem (pro Notification):** Zeigt NotificationItem `metadata.email_status`? Wenn ja: Backend kann bei Retry weiterhin nur sent/failed liefern; `permanently_failed` betrifft primär die Email-Log-Liste, nicht zwingend die einzelne Notification. Trotzdem prüfen, ob dort ein Fall für "unbekannten" Status fehlt (default-Label).

### Analyse-Report (Ausgabe Phase 1)

- Tabelle aller Fundorte (wie oben).
- Kurze Empfehlung: "Implementierung in Datei X Zeile Y: Label; in Datei Z: CSS-Klasse; …".
- Bestätigung: "Keine weiteren Stellen gefunden" (nach Grep/Glob und manueller Prüfung der notification-bezogenen Komponenten).

---

## Phase 2: Umsetzung — Exakte Anpassungen (V1.2 Frontend-Briefing)

Alle Änderungen beziehen sich auf die in Phase 1 dokumentierten Stellen. Pfade relativ zu **El Frontend/**.

### 1. TypeScript-Interface (API)

**Datei:** `src/api/notifications.ts` (oder dort, wo EmailLogEntry definiert ist)

- **Status-Union erweitern:**  
  `status: 'sent' | 'failed' | 'pending'` → `status: 'sent' | 'failed' | 'pending' | 'permanently_failed'`
- **Sicherstellen:** `retry_count: number` ist im Interface vorhanden (Backend liefert es bereits).
- Keine Änderung an den Endpoint-URLs; optional: bei Aufruf von `getEmailLog(params)` den Parameter `status` so dokumentieren oder typisieren, dass `'permanently_failed'` erlaubt ist.

### 2. Status-Labels (zentrale Funktion)

**Typische Datei:** `src/components/notifications/NotificationDrawer.vue` (oder wo die Email-Log-Liste/Footer gerendert wird)

- **Funktion erweitern** (z. B. `emailStatusLabel(status: string): string`):
  - `'sent'` → "Zugestellt"
  - `'failed'` → "Fehlgeschlagen (Retry läuft)" (IST: aktuell nur "Fehlgeschlagen" – optional präzisieren)
  - `'pending'` → "Ausstehend"
  - **`'permanently_failed'` → "Dauerhaft fehlgeschlagen"** (NEU)
  - `default` → `status` zurückgeben (für zukünftige Werte)
- Alle Stellen, die ein lesbares Label für den Email-Status brauchen, sollen diese Funktion nutzen (kein zweites Mapping an anderer Stelle, außer bewusst gewollt).

### 3. CSS für Status-Darstellung (Dot/Badge)

**Datei:** `NotificationDrawer.vue` (oder die Komponente, in der die Email-Log-Einträge mit Status-Dot gerendert werden)

- **Neue Klasse** für `permanently_failed`, z. B.:
  - `.drawer__email-dot--permanently_failed` mit `background: var(--color-error);` (Korrektur: `--color-danger` existiert nicht in `tokens.css`; das Projekt nutzt `--color-error` für Fehler, siehe `drawer__email-dot--failed`).
- **Template:** Der Status-Dot/Klasse wird aus `entry.status` abgeleitet; Fall für `permanently_failed` ergänzen (z. B. gleiche BEM-Variante wie für `failed` und `sent`).

### 4. Anzeige von retry_count (optional)

**Stelle:** Dort, wo ein einzelner Email-Log-Eintrag (`entry`) gerendert wird (z. B. im Drawer-Footer, Liste "Letzte 5 Emails")

- **Bedingung:** Nur anzeigen, wenn `entry.status === 'failed' || entry.status === 'permanently_failed'`.
- **Beispiel:**  
  `<span v-if="..." class="drawer__email-retry">({{ entry.retry_count }}/3 Versuche)</span>`
- Keine Änderung an der API-Struktur; nur Anzeige.

### 5. Filter für Email-Log (optional)

- **IST:** NotificationDrawer ruft `getEmailLog({ page_size: 5 })` ohne status-Filter auf – keine Filter-UI vorhanden.
- Falls künftig eine Filter-UI ergänzt wird: Option **"Dauerhaft fehlgeschlagen"** bzw. `getEmailLog({ status: 'permanently_failed', ... })` aufrufen.
- **getEmailLogStats:** Wird aktuell nirgends im Frontend aufgerufen – keine Stats-Anzeige. Falls später implementiert: Key `permanently_failed` in `by_status` berücksichtigen.

### 6. NotificationItem (metadata.email_status)

- **IST:** NotificationItem zeigt `metadata.email_status` in Zeile 167–169 mit Inline-Mapping: `sent`→"Zugestellt", `failed`→"Fehlgeschlagen", sonst→"Ausstehend". **Problem:** `permanently_failed` fällt aktuell in "Ausstehend" – falsch!
- **Anpassung:** Fall `permanently_failed` → "Dauerhaft fehlgeschlagen" ergänzen. Zusätzlich CSS-Klasse `item__email-status--permanently_failed` hinzufügen (analog zu `--sent`, `--failed`, `--pending`; Farbe: `var(--color-error)`).
- **Empfehlung:** Shared util `emailStatusLabel()` in z. B. `src/utils/formatters.ts` oder `src/utils/emailStatus.ts` auslagern, damit NotificationDrawer und NotificationItem dieselbe Funktion nutzen (DRY).

---

## Dateien-Übersicht (verifiziert gegen Codebase 2026-03-05)

| Datei | Änderung |
|-------|----------|
| `src/api/notifications.ts` | `EmailLogEntry.status` um `'permanently_failed'` erweitern (Zeile 146); `EmailLogListFilters.status` optional typisieren |
| `src/components/notifications/NotificationDrawer.vue` | `emailStatusLabel()` um `permanently_failed` (Zeile 105–112); CSS `.drawer__email-dot--permanently_failed` (nach Zeile 558); optional `retry_count` pro Eintrag (Zeile 262–265) |
| `src/components/notifications/NotificationItem.vue` | Inline-Label (Zeile 169) um `permanently_failed`; CSS `.item__email-status--permanently_failed` (nach Zeile 435) |
| Weitere | Keine: Keine separate Email-Log-View, keine Stats-Komponente; `getEmailLogStats` wird nicht aufgerufen |

---

## Status-Logik (Referenz)

| Status | Bedeutung |
|--------|-----------|
| `pending` | Noch nicht versendet (z. B. in Queue) |
| `sent` | Erfolgreich zugestellt |
| `failed` | Fehlgeschlagen, wird noch automatisch wiederholt (retry_count < 3) |
| `permanently_failed` | Nach 3 Versuchen endgültig fehlgeschlagen, kein weiterer Retry |

---

## Akzeptanzkriterien

- [ ] Phase 1: Alle Stellen, an denen Email-Log oder Email-Status vorkommt, sind dokumentiert (Datei + Zeilenbereich + kurze Beschreibung).
- [ ] `EmailLogEntry.status` enthält `'permanently_failed'`.
- [ ] Es gibt ein einheitliches Label für `permanently_failed` (z. B. "Dauerhaft fehlgeschlagen") an allen Anzeige-Stellen.
- [ ] Es gibt eine visuelle Unterscheidung für `permanently_failed` (CSS-Klasse/Dot), wo Status visuell dargestellt wird.
- [ ] Optional: `retry_count` wird bei `failed`/`permanently_failed` angezeigt (z. B. "(1/3 Versuche)").
- [ ] Optional: Filter und Stats unterstützen `permanently_failed`.
- [ ] `vue-tsc --noEmit` und Vitest grün; keine Regression bei bestehenden Tests.

---

## Checkliste für den Frontend-Entwickler (nach Analyse)

- [ ] Phase 1 Analyse abgeschlossen; Report/Tabelle der Fundorte erstellt.
- [ ] `EmailLogEntry.status` um `'permanently_failed'` erweitert.
- [ ] `emailStatusLabel()` für `permanently_failed` implementiert.
- [ ] CSS `.drawer__email-dot--permanently_failed` (oder äquivalent) hinzugefügt.
- [ ] Optional: `retry_count` in der UI angezeigt.
- [ ] Optional: Filter für `permanently_failed` ergänzt.
- [ ] `vue-tsc --noEmit` und Vitest ausgeführt; alle grün.

---

## /verify-plan Ergebnis (2026-03-05)

**Geprüft:** 3 Pfade, API-Endpoints, Design-Tokens

### ✅ Bestätigt
- `src/api/notifications.ts`, `NotificationDrawer.vue`, `NotificationItem.vue` existieren
- REST `/notifications/email-log` und `/notifications/email-log/stats` in Referenz
- `retry_count` bereits im EmailLogEntry-Interface
- BEM-Klassen `drawer__email-dot--*`, `item__email-status--*` vorhanden

### ⚠️ Korrekturen (eingearbeitet)
- **Design-Token:** `--color-danger` existiert nicht → `--color-error` verwenden
- **NotificationItem:** Inline-Label zeigt `permanently_failed` aktuell als "Ausstehend"; CSS-Klasse `item__email-status--permanently_failed` fehlt
- **getEmailLogStats:** Wird nirgends aufgerufen – keine Stats-UI

### 💡 Ergänzungen
- Shared `emailStatusLabel()` als util empfohlen (DRY für Drawer + Item)
