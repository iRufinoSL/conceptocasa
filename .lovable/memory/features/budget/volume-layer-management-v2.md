# Memory: features/budget/volume-layer-management-v2
Updated: now

El sistema de volúmenes utiliza un modelo de 6 caras por nivel (Suelo, Techo, y Caras superior/derecha/inferior/izquierda) para la definición de capas persistentes en 'budget_volume_layers'. En niveles bajo cubierta, se añaden los faldones (superior e inferior) como superficies independientes. Las capas siguen una dirección de crecimiento estricta: Suelo (hacia abajo), Techo/Cubierta (hacia arriba), y Caras (de fuera hacia adentro).

### Jerarquía de capas
- `parent_layer_id`: UUID nullable que referencia a otra capa del mismo surface_type. NULL = capa raíz, valor = sub-capa.
- Las capas padre se muestran como encabezados colapsables. Al colapsar un padre, sus sub-capas se ocultan.
- Solo las capas hoja (sin hijos) contribuyen a los cálculos de volumen y superficie.
- Al eliminar un padre, se eliminan también todas sus sub-capas (ON DELETE CASCADE en DB).
- La relación capa↔alzado se establece a través del `surface_type`: cada sub-capa hereda el tipo de superficie del padre (ej: cubierta_superior = Faldón superior/Tejado 1).

### Guardado en dos pasadas
El save usa dos INSERT: primero capas raíz (sin parent), luego capas hijas con el parent_layer_id resuelto a los nuevos IDs de DB.

### Campos por capa
- `layer_order` (orderIndex): Orden definido por el usuario; el listado se ordena de mayor a menor (abajo→arriba físicamente en tejados).
- `measurement_type`: 'area' (m², superficie×espesor→volumen) o 'linear' (ml, objetos longitudinales con sección, orientación y separación).
- `section_width_mm`, `section_height_mm`: Sección transversal para capas lineales (ej: vigueta 100×150mm).
- `orientation`: 'parallel_ridge' (∥ cumbrera) o 'crossed_ridge' (⊥ cumbrera), determina dirección de las piezas.
- `spacing_mm`: Separación entre piezas lineales; se calcula nº piezas y longitud total (ml).
- `group_tag`: Capas con el mismo group_tag comparten el espesor (se usa el máximo del grupo para el espesor total, ej: viguetas+aislamiento).
- `extra_surface_name`: Etiqueta personalizada del toggle de superficie adicional (por defecto 'Aleros' en cubiertas, 'Ext.' en otros).
- `include_non_structural`: Toggle para incluir superficie de elementos no estructurales (aleros, aceras, etc.).

### Cabecera del listado
Orden | Nombre | Tipo | Largo (m) | Ancho (m) | Alto/Espesor (mm) | Sup m² / ml | Vol m³ | +[Etiqueta]
