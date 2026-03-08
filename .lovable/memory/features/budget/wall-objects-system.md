# Memory: features/budget/wall-objects-system
Updated: now

El listado de Objetos muestra un desglose **automático** de todas las caras/ámbitos de cada Espacio de trabajo (Prisma), sin necesidad de alta manual. Cada espacio genera automáticamente:
- **Suelo**: superficie m² (polígono Shoelace × cellSizeM²)
- **Pared 1..N**: superficie m² (longitud arista × altura)
- **Techo**: superficie m² (igual al suelo)
- **Espacio**: volumen m³ (área suelo × altura)

### Dos vistas de listado
1. **Por espacio**: Agrupa por workspace (Baño 1, Cocina, etc.) mostrando sus ámbitos ordenados (Suelo → Paredes → Techo → Espacio) con totales.
2. **Alfabético**: Lista plana ordenada alfabéticamente por nombre de ámbito, con columna de Espacio al que pertenece y medición.

Ambas vistas incluyen búsqueda por nombre de espacio o ámbito.

### Objetos adicionales (capas constructivas)
Además de las mediciones automáticas de Superficie, cada pared/cara puede contener múltiples **objetos/capas** almacenados en `budget_wall_objects` (vinculada a `budget_floor_plan_walls` via `wall_id`). Los objetos tienen:
- `layer_order`, `name`, `description`, `object_type`, `is_core`, `surface_m2`, `volume_m3`, `length_ml`, `visual_pattern`

### Acceso al panel de objetos
- **Panel lateral (Sheet)**: Se abre al seleccionar una pared con el Puntero (🔍) en la cuadrícula.
- **Detección de pared**: En modo Puntero, clic cerca de una arista (distancia < 2 unidades) identifica la pared más cercana.

### Números de pared en cuadrículas
Los badges con el número de pared se muestran en todos los polígonos visibles (activo y hermanos) en las tres vistas (Z, Y, X). Los polígonos base (perímetro) no muestran badges.

RLS: Acceso controlado mediante cadena `wall → room → floor_plan → budget` usando `has_presupuesto_access()`.
