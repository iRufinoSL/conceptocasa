# Memory: features/budget/workspace-section-sync
Updated: now

Los Espacios de trabajo (Workspaces) están sincronizados en todas las vistas técnicas. En secciones longitudinales (Y) y transversales (X), el sistema proyecta todos los espacios que intersectan el plano actual, apilándolos verticalmente según su nivel. Los espacios pueden ser **ocultados** individualmente en cada sección Y/X mediante un marcador de vértices vacíos, con botón de ojo/papelera en la leyenda para ocultar/restaurar.

## Edición inline de otros Espacios en la cuadrícula
- Al estar editando un Espacio de trabajo, los demás Espacios visibles son editables in-place
- Los cambios se guardan automáticamente al soltar el vértice

## Etiquetas de aristas (Face Type Labels) en secciones Y/X
- Cada arista de un polígono standalone en secciones de elevación muestra una etiqueta clickeable: P1, P2, Suelo, Techo
- Al hacer clic, la etiqueta cicla entre `P#` → `Suelo` → `Techo` → `P#`
- Se almacena en `vertex.label` dentro de `SectionPolygon.vertices`
- Colores: Suelo=naranja, Techo=azul, P#=gris
- Permite identificar qué arista es suelo, techo o pared en figuras como triángulos (ej. Ático)

## Patrones visuales en polígonos standalone
- Los polígonos standalone en secciones Y/X aplican el patrón visual de la Superficie (Layer 0) del espacio de trabajo correspondiente
- La búsqueda se realiza por nombre del workspace → room → wallPatterns map
