# BELEG — MultispeQ-005: Dashboard Neue Widget-Typen

**run_id:** gar-005-multispeq-2026-04-30
**finding_id:** multispeq-005
**datum:** 2026-04-30
**kategorie:** tracing-gap (fehlende Visualisierungstypen fuer Vergleichs-/Korrelationsdaten)
**layer:** Frontend
**linear:** AUT-215

## Befund

Kein Bestands-Widget kann Boxplot-Vergleich (mehrere Standorte/Zonen in einem Chart) oder XY-Korrelationsplot darstellen. Diese sind fuer Grow-Off-Standortvergleich und Bachelorarbeit-Datensatz-Auswertung noetig.

## Kanonische Stelle

useDashboardWidgets.ts (4-Stellen-Registrierung). Neue Vue-Komponenten BoxplotWidget.vue + CorrelationScatterWidget.vue.
Memory: "4 Stellen-Registrierung in useDashboardWidgets.ts (widgetComponentMap, WIDGET_TYPE_META, WIDGET_DEFAULT_CONFIGS, mountWidgetToElement)."

## Technische Grundlage (Beleg)

Chart.js (via vue-chartjs) unterstuetzt scatter chart nativ.
chartjs-chart-boxplot Plugin (MIT-Lizenz, https://github.com/sgratzl/chartjs-chart-boxplot) -- analog chartjs-chart-matrix das laut Memory bereits fuer Heatmap erwaehnt wurde.
