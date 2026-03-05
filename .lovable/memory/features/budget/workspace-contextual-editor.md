# Memory: features/budget/workspace-contextual-editor
Updated: now

## Editor 'Sección Z' para Espacios de Trabajo

El editor de geometría de suelos utiliza la **cuadrícula real del plano** (no una genérica), calculando sus dimensiones y coordenadas desde las estancias colocadas en el FloorPlanGridView. Esto garantiza coherencia visual y posicional con el sistema de coordenadas XYZ del proyecto.

### Datos del Grid
- Consulta `budget_floor_plan_rooms` con `pos_x`/`pos_y` no nulos para obtener las estancias colocadas
- Calcula `gridBounds` (minCol, maxCol, minRow, maxRow) con 1 celda de margen
- Usa `scale_mode` y `block_length_mm` del `budget_floor_plans` para determinar `cellSizeM`
- Las etiquetas de ejes (X0, X1... Y0, Y1...) reflejan las coordenadas reales del plano

### Contexto Visual
- Las estancias colocadas en el plano aparecen como rectángulos de fondo (accent color, con nombre)
- Los polígonos de otros Espacios de trabajo se muestran como referencia traslúcida
- Se puede conmutar la edición entre espacios clicando sobre cualquier polígono del fondo

### Conversión de Unidades
- Las coordenadas del polígono se almacenan en unidades de cuadrícula
- `length`/`width` se guardan en metros (multiplicados por `cellSizeM`)
- Las medidas mostradas (aristas, área) se convierten a metros usando `cellSizeM`
