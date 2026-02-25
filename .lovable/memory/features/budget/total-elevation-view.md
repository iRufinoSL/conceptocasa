# Memory: features/budget/total-elevation-view
Updated: now

Alzados Totales: Vista "Nivel Total" que apila verticalmente los niveles por fachada del edificio.

Reglas clave:
1. **Hastiales (lados derecha/izquierda)**: Un ÚNICO triángulo que abarca todo el ancho del nivel bajo cubierta (de esquina a esquina), NO triángulos independientes por sección. Incluye patrón de bloques clippeado al triángulo, líneas de faldón gruesas, y marcador "CUMBRERA".
2. **Secciones invisibles**: Se muestran vacías (sin relleno ni bloques), solo un contorno discontinuo tenue. En hastiales se "recortan" del triángulo con un rect blanco. En alzados de coordenadas, sin huecos ni bloques. En fullscreen block grid, invisible sections get early return with dashed outline only.
3. **Bloques en todos los faldones**: Tanto en los niveles normales como en bajo cubierta, las secciones visibles muestran patrón de bloques según su tipo (exterior/interior).
4. **Coordenadas intermedias**: Etiquetas de sección (ej. 1D1, 2D1) aparecen en las fronteras entre niveles.
5. **Matching por `side`** de los CompositeWall de cada piso. Solo aparece el botón cuando hay ≥2 pisos con composites. Soporta vista compacta y pantalla completa.
6. **Lados top/bottom (no hastiales)**: Las secciones de bajo cubierta se renderizan como rectángulos con su altura calculada por la pendiente; se dibuja una línea de pendiente conectando los techos.
7. **Filtrado de interiores**: Los cortes interiores se clasifican usando `isExterior === false` del CompositeWall, NO por heurística de etiquetas. Esto maneja correctamente marcadores "In" y cualquier marcador intermedio.
8. **Organización por caras**: Los alzados de coordenadas se agrupan por cara (Superior/Derecha/Inferior/Izquierda) y luego "Cara interna N" para los cortes interiores. Cada grupo tiene flechas de apertura/cierre (Collapsible). Los cortes interiores se agrupan automáticamente por marcadores compartidos en caras internas separadas.
9. **Medidas verticales**: Font size aumentado para mejor legibilidad (10-14px según contexto).
10. **Asignación de cara para cross-side**: Los alzados verticales interiores se asignan a 'left' o 'right' según si su posición X está más cerca del borde izquierdo o derecho del edificio. Análogamente, horizontales a 'top' o 'bottom'.
11. **Línea de cumbrera**: Línea de trazos rojos tenue que marca la altura de la cumbrera en todos los niveles de los alzados de coordenadas, incluyendo fullscreen block grid.
12. **Bajo cubierta — perímetro**: Solo usa esquinas principales ABCD (sin intermedios) → alzados de cara completa (2A-2B, 2B-2C, 2C-2D, 2A-2D). No se añade ewt.
13. **Bajo cubierta — interiores**: Solo pares cross-side donde ambos marcadores están en bordes OPUESTOS del edificio (top↔bottom para verticales, left↔right para horizontales) y cubren ≥70% de la dimensión. Filtra pares parciales como 2A2-2In1, 2D1-2In1. Resultado: 2A2-2C1 y 2D1-2B1.
14. **effectiveWallType**: Cada sección de CompositeWall tiene un `effectiveWallType` resuelto usando `segment_type_overrides` y `computeWallSegments`. Así la detección de paredes invisibles respeta los overrides por segmento, no solo el wallType base.
15. **Altura uniforme en cortes horizontales interiores**: Para bajo cubierta, los cortes horizontales interiores (ej. 2D1-2B1) usan una altura uniforme (máximo de las alturas calculadas) para que todos los segmentos visibles tengan la misma altura de bloques.
