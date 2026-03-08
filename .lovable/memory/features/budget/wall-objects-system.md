# Memory: features/budget/wall-objects-system
Updated: now

El sistema de objetos de pared gestiona las capas constructivas (budget_wall_objects) y genera automáticamente entradas de medición para cada uno de los 7+ ámbitos de un espacio de trabajo (Suelo, Paredes P1-PN, Techo y Espacio).

### Capa automática Superficie (Orden 0)
Cada cara/ámbito tiene un objeto automático obligatorio con `layer_order = 0` y `name = 'Superficie'`. Este objeto:
- Se crea automáticamente al acceder por primera vez a cualquier cara
- Contiene la medición calculada (m² para suelos/paredes/techos, m³ para Espacio)
- Su `description` contiene el identificador único: `{faceName}/{workspaceName}` (ej: "Suelo/Baño 1", "Pared 3/Cocina")
- No se puede eliminar ni editar desde el panel (excepto el patrón visual)
- Se muestra con badge "Auto" y estilo diferenciado
- **Permite asignar un patrón visual** haciendo clic → selector inline con dropdown de patrones

### Patrones visuales (visual_pattern)
Campo `visual_pattern` en `budget_wall_objects` almacena el ID del patrón SVG. Catálogo definido en `src/lib/visual-patterns.ts` con 18 patrones en 6 categorías:
- **Estructura**: bloques, ladrillo, hormigón, hormigón armado, madera, piedra
- **Aislamiento**: aislante térmico, lana mineral, poliestireno (EPS)
- **Revestimiento**: yeso/enlucido, cerámica/azulejo, vidrio
- **Suelo**: tierra/relleno, grava
- **Cubierta**: membrana impermeable, teja
- **Varios**: metal/acero, aire/cámara, vacío/sin relleno

El selector muestra miniaturas SVG inline. Los patrones se renderizan como `<pattern>` en el SVG de las secciones y se aplican como `fill="url(#wall-pattern-{id})"` a los polígonos de los espacios de trabajo en secciones Y/X y verticales Z.

### Tipos de superficie
- **Paredes**: exterior, interior, ext. invisible, ext. compartida, int. compartida, int. invisible
- **Suelos**: suelo_basico, suelo_compartido, suelo_invisible
- **Techos**: techo_basico, techo_compartido, techo_invisible

### Dos vistas de listado
1. **Por espacio**: Agrupa por workspace colapsable con tabla redimensionable
2. **Alfabético**: Lista plana ordenada con tabla redimensionable

### Objetos adicionales (capas constructivas)
Cada pared/cara puede contener múltiples objetos/capas (order >= 1) en `budget_wall_objects`. Campos: `layer_order`, `name`, `description`, `object_type`, `is_core`, `surface_m2`, `volume_m3`, `length_ml`, `thickness_mm`, `visual_pattern`.

RLS: Acceso controlado mediante cadena `wall → room → floor_plan → budget` usando `has_presupuesto_access()`.
