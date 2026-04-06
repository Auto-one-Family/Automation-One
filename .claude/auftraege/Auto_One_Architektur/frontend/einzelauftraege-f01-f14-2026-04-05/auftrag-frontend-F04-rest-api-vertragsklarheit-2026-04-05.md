# Auftrag F04: REST-API-Schicht, Fehlervertrag, Auth-Retry

## Ziel
Mache die REST-Vertragsrealitaet transparent: Endpunkte, Fehlerpfade, Retry-Semantik und UI-Auswirkungen.

## IST-Wissen aus dem Frontend
- API-Module sind breit in `src/api/*.ts` verteilt.
- `index.ts` traegt Interceptors und Token-Handling.
- Fehleraufbereitung laeuft ueber `parseApiError` plus Translatoren.

## Scope
- `El Frontend/src/api/*.ts`
- `El Frontend/src/api/index.ts`
- `El Frontend/src/api/parseApiError.ts`
- `El Frontend/src/utils/errorCodeTranslator.ts`

## Analyseaufgaben
1. Erstelle Modulkarte aller API-Dateien nach Ressource und Wirkung.
2. Zerlege Fehlerfluss (HTTP -> Parser -> Store/UI) fuer 4xx/5xx/Netzwerk.
3. Analysiere Token-Refresh/Retry-Lebenszyklus inkl. Abbruchfaellen.
4. Markiere Pfade, die nur Dispatch-Erfolg zeigen statt echte Finalitaet.

## Pflichtnachweise
- Ablauf: View Action -> API -> Erfolg/Fehler -> Nutzerfeedback.
- Ablauf: 401/403 -> Interceptor -> Session-/Routing-Effekt.

## Akzeptanzkriterien
- Jeder schreibende API-Pfad hat dokumentiertes Fehlerverhalten.
- Auth-Retry-Risiken bei Parallelitaet sind explizit bewertet.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F04-rest-api-vertragsklarheit-2026-04-05.md`
