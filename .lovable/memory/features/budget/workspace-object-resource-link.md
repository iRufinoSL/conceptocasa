# Memory: features/budget/workspace-object-resource-link
Updated: just now

El selector de Recursos Externos en la gestión de objetos incluye un motor de búsqueda integrado. Al seleccionar un recurso enlazado, el sistema auto-rellena el **nombre** del objeto y sus **dimensiones** (ancho, alto, espesor) desde los campos `width_mm`, `height_mm` y `depth_mm` del recurso.

Los Recursos Externos (`external_resources`) tienen ahora tres campos de dimensiones:
- `width_mm`: Ancho (horizontal)
- `height_mm`: Alto (vertical)
- `depth_mm`: Profundidad (espesor)

Los objetos (`budget_wall_objects`) tienen campos adicionales:
- `coord_x`, `coord_y`, `coord_z`: Coordenadas XYZ de la esquina inferior izquierda. Cuando se definen las 3, auto-ajustan `sill_height` y `distance_to_wall`.
- `shown_in_section`: Boolean (default false). Si es `true`, el objeto se representa visualmente en las secciones técnicas (X, Y, Z) con sus dimensiones reales. Se puede arrastrar mm a mm con el cursor.

La representación en secciones usa color violeta (`hsl(270, 60%, 55%)`) para distinguirlos de huecos (naranja/azul).
