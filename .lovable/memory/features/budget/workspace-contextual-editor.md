# Memory: features/budget/workspace-contextual-editor
Updated: now

## Editor 'Sección Z' para Espacios de Trabajo

El editor de geometría de suelos utiliza el **polígono perímetro de la Sección Vertical** asociada al espacio de trabajo como base de la cuadrícula. Esto garantiza que la cuadrícula refleje exactamente el contorno definido por el usuario en la sección (ej. (0,0)→(10,0)→(10,9)→(0,9)).

### Perímetro de Sección
- Se extrae del primer polígono (`polygons[0]`) de la `CustomSection` vinculada vía `vertical_section_id`
- Los vértices XYZ de la sección se proyectan a XY para definir el perímetro 2D
- El perímetro se dibuja con línea discontinua gruesa (color primary) y marcadores en cada vértice con sus coordenadas
- Los `gridBounds` se calculan a partir del bounding box del perímetro + 1 celda de margen

### Datos del Grid (fallback)
- Si no hay sección vinculada, consulta `budget_floor_plan_rooms` con `pos_x`/`pos_y` no nulos
- Usa `scale_mode` y `block_length_mm` del `budget_floor_plans` para determinar `cellSizeM`
- Las etiquetas de ejes (X0, X1... Y0, Y1...) reflejan las coordenadas reales del plano

### Contexto Visual
- El perímetro de la sección aparece como polígono de fondo (traslúcido con borde primary)
- Las estancias colocadas en el plano aparecen como rectángulos de fondo (accent color, con nombre)
- Los polígonos de otros Espacios de trabajo se muestran como referencia traslúcida
- Se puede conmutar la edición entre espacios clicando sobre cualquier polígono del fondo

### Conversión de Unidades
- Las coordenadas del polígono se almacenan en unidades de cuadrícula
- `length`/`width` se guardan en metros (multiplicados por `cellSizeM`)
- Las medidas mostradas (aristas, área) se convierten a metros usando `cellSizeM`
