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

### Ejes y Escalas por tipo de sección
- **Sección Z (Planta)**: Fijo Z, dibuja (X,Y). Eje horizontal = X (625mm/bloque), Eje vertical = Y (625mm/bloque)
- **Sección Y (Longitudinal)**: Fijo Y, dibuja (X,Z). Eje horizontal = X (625mm/bloque), Eje vertical = Z (250mm/bloque)
- **Sección X (Transversal)**: Fijo X, dibuja (Y,Z). Eje horizontal = Y (625mm/bloque), Eje vertical = Z (250mm/bloque)

### Medidas diferenciadas
Las medidas en mm de cada arista se calculan usando escalas diferentes para cada eje (hScaleMm × vScaleMm), ya que un bloque horizontal (625mm) y uno vertical (250mm) tienen dimensiones distintas.

### Funcionalidades
- Zoom (1x-3x), fondo de ajedrez, expansión manual de cuadrícula
- Edición numérica de coordenadas de cada vértice
- Botón "Dibujar" para entrar en modo manual desde edición existente
- Botón "Resetear" para restaurar la proyección rectangular por defecto
- Etiquetas con tipo de geometría (Punto/Línea/Triángulo/Polígono) en la leyenda
