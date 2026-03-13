# Memory: features/budget/xyz-workspace-projection-logic
Updated: now

El sistema proyecta automáticamente los Espacios de trabajo en las secciones transversales (X) y longitudinales (Y). Cuando una sección corta el plano de un espacio, el motor de geometría calcula la intersección y dibuja el perfil vertical del volumen utilizando las alturas reales (Z) de las paredes y el suelo/techo.

### Inversión del eje Y en secciones transversales
En el plano 2D, Y aumenta hacia abajo (Y=0 arriba, Y=max abajo). En las secciones transversales (corte en X), el eje horizontal representa Y pero invertido: `section_h = maxY - polygon_y`. Esto asegura que la posición visual en la sección coincida con la posición real del espacio en el edificio (ej. un espacio a Y=0-5 del plano se muestra en posición maxY-5 a maxY en la sección).

### Resolución de Z base con fallback
El zBase de cada espacio se determina mediante:
1. Coincidencia directa por `vertical_section_id`
2. Búsqueda en polígonos guardados de secciones verticales por ID del espacio
3. Búsqueda por nombre del espacio en secciones verticales
4. Fallback a Z=0

Esto previene que espacios con `vertical_section_id` obsoletos (apuntando a secciones eliminadas/renombradas) se proyecten incorrectamente a Z=0 cuando pertenecen a niveles superiores.
