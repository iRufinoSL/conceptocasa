# Memory: features/budget/xyz-workspace-projection-logic
Updated: now

El sistema proyecta automáticamente los Espacios de trabajo en las secciones transversales (X) y longitudinales (Y) cuando intersectan el plano de corte. Solo se proyectan espacios que existen en alguna sección Z (vertical), filtrando espacios eliminados o fantasma.

### Deduplicación de espacios por nombre
Cuando existen múltiples rooms en la base de datos con el mismo nombre normalizado, el sistema deduplica: prioriza los rooms cuyo ID coincide con un polígono de sección vertical (canónicos). Solo si no hay ninguno canónico se usa el más recientemente actualizado. Esto evita que duplicados de otras secciones generen polígonos extra.

### Escala Z en secciones X/Y
El eje vertical (Z) en secciones X/Y usa unidades de 250mm (block_height_mm). El placeholder del input de escala vertical sugiere 250mm para estas secciones, diferente de los 625mm de las secciones Z.

### Inversión del eje Y en secciones transversales
En el plano 2D, Y aumenta hacia abajo (Y=0 arriba, Y=max abajo). En las secciones transversales (corte en X), el eje horizontal representa Y pero invertido: `section_h = maxY - polygon_y`. El cálculo de globalMaxY solo considera rooms elegibles (presentes en secciones Z).

### Resolución de Z base con fallback (6 niveles)
El zBase de cada espacio se determina mediante:
1. Coincidencia directa por `floor_id` → `floorZBaseMap`
2. Coincidencia por room ID en polígonos de secciones verticales
3. Coincidencia por nombre del espacio
4. ID de sección vertical directo
5. Inferencia por mayoría en secciones heredadas (legacy)
6. Normalización de nombres (eliminando acentos y términos descriptivos)

### Edición de vértices en secciones X/Y
El botón "Modificar" activa el modo de edición de vértices:
- **Arrastrar vértices**: los puntos se agrandan y se pueden arrastrar a nuevas posiciones (snap a nodos)
- **Insertar vértices**: botones "+" en el punto medio de cada arista
- **Eliminar vértices**: doble clic en un vértice (mínimo 3 vértices)
- Los cambios se guardan automáticamente al pulsar "Listo"
