# Memory: features/budget/floor-plan-elevation-management
Updated: now

Gestión de Alzados:
1. Identificación '1A-1B' y dirección L-R/T-B (vista INTERIOR).
2. Clasificación automática por caras y 'Caras internas'.
3. En Nivel 2 (Bajo Cubierta / Cubierta), los cortes interiores requieren marcadores en bordes opuestos y un intervalo >70% del ancho.
4. El sistema 'effectiveWallType' asegura que tramos visibles de paredes 'invisibles' rendericen bloques.
5. Línea de Cumbrera: En tejados a dos aguas, se marca con una línea horizontal roja intensa (2.5px, #dc2626, 0.9 opacidad, dashed) en el punto medio de la longitud (Y = length/2), visible en alzados y vistas 2D/cuadrícula con la etiqueta '▲ Cumbrera'.
6. Nomenclatura: Los alzados de faldones se etiquetan como "Tejado" (antes "Bajo cubierta"). Los faldones usan coordenadas CuA→CuB (vértices de la cumbrera en los hastiales).
7. Hastiales: Muestran 4 medidas obligatorias: base inferior, hipotenusa izquierda, hipotenusa derecha, y altura base→cumbrera. Las esquinas se etiquetan CuA (izq) y CuB (der).
8. Faldones: Movidos a la pestaña "Volúmenes" — ya no se muestran en Alzados.
9. Coordenadas: El separador de nivel usa ":" en lugar de "-" (ej. "2:0101" en lugar de "2-0101"). Se mantiene retrocompatibilidad en parseCoord.
10. Composites completos: Cuando hay coordenadas intermedias (A1, B1, etc.), se generan TANTO los sub-tramos (A-A1, A1-B) como el composite completo (A-B) con la medida total del lado.
11. Intermedios en bajo cubierta: Los marcadores intermedios ahora generan sub-composites también en el Nivel 2 (cubierta), no solo en Nivel 1.
