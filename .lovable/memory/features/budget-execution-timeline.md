# Memory: features/budget-execution-timeline
Updated: just now

El sistema permite el seguimiento detallado de la ejecución real de las obras mediante los campos 'actual_start_date' y 'actual_end_date' en fases y actividades. Esta información se visualiza en un diagrama de Gantt jerárquico en la pestaña 'CUÁNDO? (Gantt)', que compara gráficamente la planificación prevista (barra clara) con la realidad (barra sólida). El componente soporta navegación descendente (drill-down) desde las fases a sus actividades y ofrece niveles de zoom por días o semanas.

En la vista 'Gestión Tiempo':
- Las fechas de inicio y fin reales son directamente editables inline mediante calendario popover, tanto para las fases como para las actividades
- Las fases y actividades se muestran en una jerarquía colapsable
- Cada actividad incluye un toggle SI/NO inline (basado en el campo 'uses_measurement') que determina si aparece activa en la planificación temporal
- Solo las actividades marcadas como SI muestran los campos de fecha real inline
- El contador de actividades muestra "X/Y activas" indicando cuántas están marcadas como SI del total

En la vista 'Lista Compra':
- Agrupación jerárquica expandible: Fase → Actividad (ActividadID) → Recursos
- Muestra nombre del recurso, tipo (Material, Mano de obra, etc.), proveedor, unidades, coste unitario y subtotal
- Incluye secciones para actividades sin fase y recursos sin actividad asignada
- Útil para planificación de compras y logística de obra

En la vista 'Presupuesto Estimado':
- Campo '€Presupuesto estimado' en sección CUÁNTO? para definir el valor estimado inicial del proyecto
- Campo '% Presupuesto estimado' por fase: porcentaje del presupuesto total asignado
- Campo '€Presupuesto estimado fase' por fase: calculado automáticamente (% × €Presupuesto estimado) o editable manualmente
- Tabla con listado de fases mostrando código, nombre, porcentaje y monto estimado
- Cabecera con total del presupuesto estimado y suma de lo asignado a fases con porcentaje de cumplimiento
