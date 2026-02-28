# Memory: features/budget/volume-layer-management-v2
Updated: now

El sistema de volúmenes utiliza un modelo de 6 caras por nivel (Suelo, Techo, y Caras superior/derecha/inferior/izquierda) para la definición de capas persistentes en 'budget_volume_layers'. En niveles bajo cubierta, se añaden los faldones (superior e inferior) como superficies independientes. Las capas siguen una dirección de crecimiento estricta: Suelo (hacia abajo), Techo/Cubierta (hacia arriba), y Caras (de fuera hacia adentro).

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
