# Memory: features/budget/workspace-geometry-editor
Updated: now

El editor geométrico de Espacios de trabajo es un sistema multi-vista (Z-Planta, X-Transversal, Y-Longitudinal) que permite definir geometrías de complejidad variable:

### Cuadrícula con aspecto proporcional
Las celdas de la cuadrícula reflejan la proporción real entre ejes. En secciones transversales (X) y longitudinales (Y), donde el eje horizontal tiene 625mm y el vertical 250mm, las celdas son rectangulares (más anchas que altas). Se calcula `cellW` y `cellH` independientemente usando `scaleRatio = vScaleMm / hScaleMm`.

### Tipos de geometría soportados
- **Punto** (1 vértice), **Línea** (2 vértices), **Polígono** (N vértices): Polígono cerrado con área en m² y medidas de aristas

### Modo de ubicación
- **Automática**: Proyección rectangular por defecto
- **Manual**: Clic en cuadrícula para marcar vértices. Doble clic cierra la figura.

### Herramientas de cuadrícula
- **Regla (📏)**: Líneas de medición en naranja (`hsl(30 90% 50%)`), aísla interacción
- **Modo Libre (🎯)**: Vértices en posiciones arbitrarias (precisión 0.1 unidades)
- **Zoom** (1x-3x), fondo de ajedrez, expansión manual

### Anotaciones de pendiente/ángulo
Junto a cada medida en mm de los lados de polígonos y líneas de regla, se pueden mostrar opcionalmente:
- **Grados (º)**: Ángulo respecto a la horizontal
- **Porcentaje (%)**: Pendiente como ratio vertical/horizontal × 100
Los toggles `📐 º` y `📊 %` en la barra de herramientas controlan la visibilidad. Las medidas en mm siempre se muestran.

### Ejes y Escalas por tipo de sección
- **Sección Z (Planta)**: Fijo Z, dibuja (X,Y). Eje horizontal = X (625mm/bloque), Eje vertical = Y (625mm/bloque) → celdas cuadradas
- **Sección Y (Longitudinal)**: Fijo Y, dibuja (X,Z). Eje horizontal = X (625mm/bloque), Eje vertical = Z (250mm/bloque) → celdas rectangulares
- **Sección X (Transversal)**: Fijo X, dibuja (Y,Z). Eje horizontal = Y (625mm/bloque), Eje vertical = Z (250mm/bloque) → celdas rectangulares
