# Memory: features/budget/wall-objects-system
Updated: now

Cada pared de un Espacio de trabajo puede contener múltiples **objetos/capas** almacenados en la tabla `budget_wall_objects` (vinculada a `budget_floor_plan_walls` via `wall_id`). Los objetos tienen:
- `layer_order`: Nº de orden (en paredes exteriores, de exterior a interior). Varios objetos pueden compartir el mismo nº.
- `name`, `description`, `object_type` (material, bloque, aislamiento, revestimiento, estructura, instalación, otro)
- `is_core`: Flag de núcleo estructural — determina la representación visual (ej. bloques = cuadrícula)
- `surface_m2`, `volume_m3`, `length_ml`: Mediciones
- `visual_pattern`: Patrón visual (ej. 'blocks_625x250')

### Registro de nuevos objetos
Se pueden crear objetos de dos formas:
1. **Panel lateral (Sheet)**: Al seleccionar una pared con el Puntero (🔍) en la cuadrícula, se abre el panel donde se pueden añadir objetos con el botón +.
2. **Listado global de Objetos**: Botón "+Añadir objeto" disponible en todas las pestañas, permite seleccionar la pared destino y completar todos los campos del objeto.

### Acceso
- **Panel lateral (Sheet)**: Se abre al seleccionar una pared con el **Puntero (🔍)** en la cuadrícula. Permite editar el tipo de pared y gestionar objetos/capas (CRUD completo).
- **Detección de pared**: En modo Puntero, al hacer clic cerca de una arista del polígono (distancia < 2 unidades), se identifica la pared más cercana mediante distancia punto-segmento.

### Listado global (Objetos tab en Planos)
El componente `WallObjectsList` muestra todos los objetos del presupuesto con tres agrupaciones:
- **Por espacio de trabajo**: Agrupa por workspace/room con totales de m², m³, ml
- **Por sección**: Agrupa por sección vertical del espacio
- **Por objeto**: Agrupa alfabéticamente por nombre del objeto, consolidando cantidades
Todas las pestañas incluyen el botón "+Añadir objeto" para crear objetos directamente.

### Números de pared en cuadrículas
Los badges con el número de pared (1, 2, 3...) se muestran tanto en el polígono activo como en todos los polígonos hermanos (siblings) visibles en la cuadrícula, para que siempre sea posible identificar cada lado en cualquier vista (Z, Y, X). Los polígonos base (perímetro) no muestran badges.

RLS: Acceso controlado mediante cadena `wall → room → floor_plan → budget` usando `has_presupuesto_access()`.
