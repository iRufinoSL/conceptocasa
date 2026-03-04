# Memory: features/budget/elevation-rendering-logic
Updated: now

Los Alzados se definen como polígonos de N vértices XYZ proyectados sobre un plano 2D mediante el método de Newell, calculando superficies mediante producto cruzado 3D. Los vértices se ordenan automáticamente en sentido antihorario (CCW) usando ángulos desde el centroide del polígono (robusto para vértices colineales), y luego se rota la secuencia para que comience por el vértice inferior izquierdo. El sistema soporta líneas (2 vértices) y polígonos complejos, permitiendo alternar el patrón de bloques ('showBlocks') y aplicar un enmascarado inteligente que oculta los bloques en segmentos de pared marcados como 'invisibles'. Incluye una cuadrícula XZ graduable (bloques vs. mm), visualización de distancias entre todos los pares de vértices (diagonales), creación de nuevas coordenadas y edición directa de XYZ. La función 'Z automática por faldón' (icono de montaña) interpola alturas dinámicamente detectando la orientación de la cumbrera (X o Y) para evitar inversiones geométricas. Los alzados se organizan jerárquicamente por nivel, ofrecen vista a pantalla completa y están optimizados para impresión.

## Cuadrícula seccional absoluta
- La cuadrícula SVG muestra la **sección completa del edificio** (desde 0 hasta el máximo de todas las coordenadas).
- El polígono del alzado se dibuja en su posición absoluta XYZ dentro de la sección.
- Los ejes muestran coordenadas absolutas: X0, X1, X2... y Z0, Z1, Z2... (en unidades de bloque).
- Esto permite situar visualmente cada alzado en su posición real dentro de la estructura.

## Alzados con 2 vértices (Líneas)
- Un alzado con exactamente 2 vértices se renderiza como una **línea** (no como polígono)
- Representa aristas de faldones inclinados, bordes de cubierta, etc.
- Muestra longitud en mm en lugar de superficie m²

## Control de bloques (showBlocks)
- `ManualElevation.showBlocks?: boolean` (default true) controla si se muestra el patrón de bloques

## Auto Z por faldón
- Función `interpolateZFromSlope(col, row, plan, rooms, baseZ)` en `floor-plan-calculations.ts`
- Calcula Z en unidades de bloque para cualquier posición XY según la geometría del tejado dos_aguas
- Detecta automáticamente la orientación de la cumbrera (spanX vs spanY)
- Flag `autoZSlope: boolean` en `CustomCorner` — cuando activo, Z se recalcula automáticamente

## Ordenamiento CCW
- Centroide-based: calcula ángulos atan2 desde el centroide del polígono (evita problemas con vértices colineales que ocurrían con el método origin-based)
- Rota la secuencia para que comience por el vértice inferior izquierdo (min V, min U)
