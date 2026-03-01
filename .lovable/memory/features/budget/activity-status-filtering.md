# Memory: features/budget/activity-status-filtering
Updated: just now

Las actividades en la pestaña 'QUÉ?' tienen un campo independiente `is_executed` (boolean, default true) que indica si la actividad se ejecuta (SÍ) o no (NO) en el presupuesto. Este campo es completamente independiente de `uses_measurement`, que controla la relación con mediciones.

**Implementado en DOS vistas:**

1. **BudgetActivitiesTab (vista tabla alfabética):** Columna "Ejecuta" con badges SÍ/NO clickables. Filtro global "Solo las que SÍ se ejecutan" / "Listar todas".

2. **TolosaBrainstormView (vista TO.LO.SA.systems 2.0):** Badge SÍ/NO clickable junto al nombre de cada ítem en el listado jerárquico. Filtro global igual. Campo `is_executed` en tabla `tolosa_items`.

**Visualización:** En ambos listados, cada actividad muestra a la derecha de su nombre un badge "SÍ" (verde/success) o "NO" (rojo/destructive) que es clickable para cambiar el estado.

**Filtro global:** Existe un botón toggle 'Solo las que SÍ se ejecutan' / 'Listar todas' que filtra las actividades según `is_executed`.

**Cascada jerárquica:** Si una actividad padre se marca como NO (is_executed=false), todos sus descendientes (por prefijo de código) se ocultan automáticamente cuando el filtro está activo, y se excluyen de los cálculos.

**Por defecto:** Toda actividad nueva tiene is_executed=true (SÍ).

**Tablas:** `budget_activities.is_executed` y `tolosa_items.is_executed`.
