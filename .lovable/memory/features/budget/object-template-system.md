# Memory: features/budget/object-template-system
Updated: just now

El sistema distingue entre 'Objetos Modelo' (plantillas reutilizables) y las instancias colocadas en el presupuesto. Las plantillas almacenan dimensiones (Ancho, Alto, Espesor en mm), imágenes adjuntas (JPG, PDF), descripción técnica, unidad de medida (m², m³, ml, ud, kg, etc.) y datos financieros (precio de compra IVA incl., % IVA, margen de seguridad y de venta). Existe una sincronización bidireccional entre los objetos modelo y el catálogo global de Recursos Externos: cualquier cambio en un modelo se refleja en el recurso vinculado y es posible importar recursos existentes como plantillas del presupuesto.

**Huecos unificados como Objetos**: Los huecos (ventanas, puertas) ya NO son una entidad separada. Son objetos con object_type='hueco'. La tabla budget_floor_plan_openings se mantiene por compatibilidad legacy, pero los nuevos huecos se crean en budget_wall_objects con tipo 'hueco'. El panel WorkspacePropertiesPanel tiene solo 2 pestañas: Caras y Objetos (que incluye huecos).

Los objetos instalados (budget_wall_objects) tienen campos de posicionamiento:
- width_mm, height_mm: dimensiones del objeto
- position_x: posición horizontal en la cara (mm)
- sill_height: distancia al suelo (mm)
- distance_to_wall: distancia a la pared más cercana (mm)
- resource_id: vínculo a external_resources para enlazar con el catálogo de Recursos
- Controles de movimiento: flechas ←→↑↓ en incrementos de 50mm

Los objetos se organizan en tres vistas: orden alfabético, por Espacio de trabajo (indicando la cara/pared) y agrupados por tipo de objeto. Las ubicaciones posibles son: Paredes (P1, P2...), Suelo, Techo y Espacio.

El visor SectionAxisViewer lee huecos de AMBAS fuentes (budget_floor_plan_openings legacy + budget_wall_objects type='hueco') para la representación visual.
