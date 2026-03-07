# Memory: features/budget/workspace-geometry-editor
Updated: now

El editor geométrico de Espacios de trabajo es un sistema multi-vista (Z-Planta, X-Transversal, Y-Longitudinal) que permite definir volúmenes complejos mediante el dibujo interactivo de polígonos de N vértices. En la Sección Z (Z=0), el origen (0,0) se sitúa arriba a la izquierda con el eje X en la parte superior, mientras que en las secciones X e Y el origen está abajo a la izquierda para vistas de alzado.

### Ejes y Escalas por tipo de sección
- **Sección Z (Planta)**: Eje horizontal = X (625mm/bloque), Eje vertical = Y (625mm/bloque). Etiquetas: X0, X1... / Y0, Y1...
- **Sección Y (Longitudinal)**: Eje horizontal = X (625mm/bloque), Eje vertical = Z (250mm/bloque). Etiquetas: X0, X1... / Z0, Z1...
- **Sección X (Transversal)**: Eje horizontal = Y (625mm/bloque), Eje vertical = Z (250mm/bloque). Etiquetas: Y0, Y1... / Z0, Z1...

### Medidas diferenciadas
Las medidas en mm de cada arista se calculan usando escalas diferentes para cada eje (hScaleMm × vScaleMm), ya que un bloque horizontal (625mm) y uno vertical (250mm) tienen dimensiones distintas. Las cotas perimetrales externas también respetan estas escalas.

### Contexto visual en Y/X
Los límites de la cuadrícula se calculan a partir de TODAS las proyecciones de espacios que intersectan el plano de corte, no solo el activo. Permite la edición manual de vértices en los tres planos para definir caídas de tejados o alturas irregulares, con opción de zoom (1x-3x), fondo de ajedrez y expansión manual de la cuadrícula en cualquier dirección. Las etiquetas de vértices muestran las coordenadas con el prefijo de eje correcto (ej. X0,Z0 en lugar de genérico).
