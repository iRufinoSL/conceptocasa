# Memory: features/budget/inclined-sections-system
Updated: now

## Planos/Alzados Inclinados

Los Espacios de trabajo soportan alturas individuales por pared (P1, P2, P3...) definidas en el panel "Caras del volumen". Cada pared tiene un badge `↕` editable que muestra su altura en mm (por defecto hereda la del espacio).

### Comportamiento al definir alturas diferentes
1. En las **Secciones Y/X**, las paredes automáticas con alturas distintas generan **diagonales** (líneas entre dos puntos a distinta altura Z) en la proyección por defecto (`computeDefaultProjection`).
2. El sistema **auto-genera Secciones Inclinadas** al detectar pares de paredes adyacentes con diferentes alturas. Estas secciones se persisten en `custom_corners.customSections[]` con `sectionType: 'inclined'`.

### Secciones Inclinadas
- **Tipo**: `CustomSection` con `sectionType: 'inclined'`
- **Cuadrícula**: Eje horizontal = longitud real del plano inclinado (hipotenusa), Eje vertical = perpendicular al plano
- **`inclinedMeta`**: Contiene `workspaceId`, `workspaceName`, `wallHeights[]`, `realLengthMm` y `slopeAngleDeg`
- **Auto-gestión**: Se regeneran automáticamente al cambiar alturas de paredes; se eliminan si todas las alturas son iguales
- **ID**: `inclined_{roomId}_p{i}_p{j}` para garantizar unicidad

### Almacenamiento
- Altura por pared: campo `height` (en metros) en tabla `budget_floor_plan_walls`
- Valor `null` o `0` = hereda la altura del Espacio de trabajo
- La altura se introduce en **mm** en la UI y se convierte a metros para el almacenamiento

### FaceRow mejorado
El componente `FaceRow` ahora acepta props opcionales `heightMm`, `defaultHeightMm` y `onHeightChange` para edición inline de alturas.
