# Memory: features/budget/workspace-geometry-editor
Updated: now

El editor geométrico de Espacios de trabajo es un sistema multi-vista (Z-Planta, X-Transversal, Y-Longitudinal) que permite definir geometrías de complejidad variable:

### Tipos de geometría soportados
- **Punto** (1 vértice): Representado como un círculo con coordenadas
- **Línea** (2 vértices): Línea con longitud en mm y coordenadas en los extremos
- **Triángulo** (3 vértices), **Cuadrilátero** (4 vértices), **Polígono** (N vértices): Polígono cerrado con área en m² y medidas de aristas

### Modo de ubicación
Al seleccionar un espacio para editar, se pregunta si la ubicación será:
- **Automática**: Usa la proyección rectangular por defecto (hStart→hEnd × zBase→zTop)
- **Manual**: El usuario hace clic en la cuadrícula para marcar vértices uno a uno. Doble clic cierra la figura.

### Modo dibujo interactivo
- Clic en la cuadrícula → añade vértice (snap a coordenadas)
- Doble clic → cierra la figura
- Cursor crosshair durante el dibujo
- Vista previa en tiempo real con líneas discontinuas y coordenadas

### Herramientas de cuadrícula
- **Regla (📏)**: Modo regla para trazar líneas de medición en color naranja (`hsl(30 90% 50%)`), distinguibles de los polígonos azules. Muestra longitud en mm. Las reglas persisten como referencia visual.
- **Modo Libre (🎯)**: Permite colocar vértices en posiciones arbitrarias de la cuadrícula (no solo en nodos/intersecciones). Útil para diagonales de hastiales, pendientes, etc. Los vértices se redondean a 0.1 unidades de cuadrícula.
- **Zoom** (1x-3x), fondo de ajedrez, expansión manual de cuadrícula

### Edición completa de Espacios hermanos
Al estar editando un Espacio de trabajo, los demás Espacios visibles en la misma cuadrícula son **completamente editables in-place**:
- **Vértices arrastrables**: Los vértices del Espacio seleccionado se renderizan EN CIMA de los nodos de la cuadrícula para garantizar interactividad (z-order superior en SVG)
- **Renombrar**: Icono ✏️ en la leyenda abre un campo inline
- **Propiedades completas**: Al seleccionar un hermano, se muestra un panel con sus caras (suelo, paredes, techo) para editar tipos de pared, suelo y techo sin salir del editor actual
- **Ir al espacio**: Icono ↗ para navegar al Espacio seleccionado

### Ejes y Escalas por tipo de sección
- **Sección Z (Planta)**: Fijo Z, dibuja (X,Y). Eje horizontal = X (625mm/bloque), Eje vertical = Y (625mm/bloque)
- **Sección Y (Longitudinal)**: Fijo Y, dibuja (X,Z). Eje horizontal = X (625mm/bloque), Eje vertical = Z (250mm/bloque)
- **Sección X (Transversal)**: Fijo X, dibuja (Y,Z). Eje horizontal = Y (625mm/bloque), Eje vertical = Z (250mm/bloque)

### Medidas diferenciadas
Las medidas en mm de cada arista se calculan usando escalas diferentes para cada eje (hScaleMm × vScaleMm). Las líneas de regla usan color naranja distinto al azul de los polígonos.

### Limpieza visual
- El perímetro de la sección se muestra como contorno discontinuo sin etiquetas de coordenadas en los vértices para evitar líneas huérfanas
- Solo se muestran medidas que correspondan a Espacios de trabajo definidos
