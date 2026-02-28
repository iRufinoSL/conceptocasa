# Memory: features/budget/volume-layer-management
Updated: now

Los volúmenes se gestionan en una pestaña específica organizada por niveles, con datos persistidos en la tabla `budget_volume_layers` (floor_plan_id, floor_id, surface_type, layer_order, name, thickness_mm, include_non_structural). Las superficies de cubierta se dividen en `cubierta_superior` y `cubierta_inferior` (un faldón cada una), calculando la superficie real como base × hipotenusa. El campo `include_non_structural` permite al usuario decidir por capa si incluir aleros/aceras en el cálculo de superficie. La función `calculateRoofSlopes` filtra espacios no estructurales del bounding box para evitar medidas incorrectas de base y proyección.
