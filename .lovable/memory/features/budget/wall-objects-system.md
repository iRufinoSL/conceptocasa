# Memory: features/budget/wall-objects-system
Updated: now

El sistema de objetos de pared gestiona las capas constructivas (budget_wall_objects) y genera automáticamente entradas de medición para cada uno de los 7+ ámbitos de un espacio de trabajo (Suelo, Paredes P1-PN, Techo y Espacio).

### Capa automática Superficie (Orden 0)
Cada cara/ámbito tiene un objeto automático obligatorio con `layer_order = 0` y `name = 'Superficie'`. Este objeto:
- Se crea automáticamente al acceder por primera vez a cualquier cara
- Contiene la medición calculada (m² para suelos/paredes/techos, m³ para Espacio)
- Su `description` contiene el identificador único: `{faceName}/{workspaceName}` (ej: "Suelo/Baño 1", "Pared 3/Cocina")
- No se puede eliminar ni editar desde el panel
- Se muestra con badge "Auto" y estilo diferenciado

### Tipos de superficie
- **Paredes**: exterior, interior, ext. invisible, ext. compartida, int. compartida, int. invisible
- **Suelos**: suelo_basico, suelo_compartido, suelo_invisible
- **Techos**: techo_basico, techo_compartido, techo_invisible

### Dos vistas de listado
1. **Por espacio**: Agrupa por workspace colapsable con tabla redimensionable
2. **Alfabético**: Lista plana ordenada con tabla redimensionable

### Objetos adicionales (capas constructivas)
Cada pared/cara puede contener múltiples objetos/capas (order >= 1) en `budget_wall_objects`. Campos: `layer_order`, `name`, `description`, `object_type`, `is_core`, `surface_m2`, `volume_m3`, `length_ml`, `visual_pattern`.

RLS: Acceso controlado mediante cadena `wall → room → floor_plan → budget` usando `has_presupuesto_access()`.
