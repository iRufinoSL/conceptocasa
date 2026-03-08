# Memory: features/budget/workspace-section-sync
Updated: now

Los Espacios de trabajo (Workspaces) están sincronizados en todas las vistas técnicas. En secciones verticales, los polígonos de suelo muestran etiquetas de superficie, volumen ($m^3$) y números de pared interactivos. En secciones longitudinales (Y) y transversales (X), se muestran proyecciones verticales editables. Para facilitar el alineamiento, el editor visualiza simultáneamente todos los espacios que cortan el plano actual como contexto de fondo. El visor oculta automáticamente fondos de habitación residuales ('placed_rooms') si existe un polígono definido. Incluye una 'Vista 3D' isométrica (SVG) con volumetría translúcida y leyenda por colores.

## Edición inline de otros Espacios en la cuadrícula
- Al estar editando un Espacio de trabajo, los demás Espacios visibles en la misma cuadrícula son **editables in-place**:
  - **Selección**: Click en el polígono o en la leyenda para seleccionar otro Espacio (borde más grueso, color primary, sin dash)
  - **Arrastrar vértices**: Los vértices del Espacio seleccionado se convierten en puntos arrastrables (igual que el activo)
  - **Renombrar**: Icono ✏️ en la leyenda abre un campo inline para cambiar el nombre directamente
  - **Ir al espacio**: Icono ↗ para navegar/conmutar al listado del Espacio seleccionado
- Los cambios se guardan automáticamente al soltar el vértice (mouseUp) y se persisten:
  - En sección Z: se actualiza `floor_polygon`, `length`, `width` y se reconstruyen paredes
  - En sección Y/X: se actualiza el polígono en `customSections[].polygons[]` de `custom_corners`
- El renombrado se aplica directamente a `budget_floor_plan_rooms.name`
