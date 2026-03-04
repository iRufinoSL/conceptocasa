# Memory: features/budget/elevation-rendering-logic
Updated: now

Los Alzados se definen como polígonos de N vértices XYZ (verticales o inclinados) proyectados sobre un plano 2D. El sistema permite la generación automática perimetral y la creación de 'Alzados Manuales' mediante la selección secuencial de coordenadas.

## Alzados con 2 vértices (Líneas)
- Un alzado con exactamente 2 vértices se renderiza como una **línea** (no como polígono)
- Representa aristas de faldones inclinados, bordes de cubierta, etc.
- Muestra longitud en mm en lugar de superficie m²
- No muestra cuadrícula, bloques ni relleno de polígono
- Se identifica con badge "Línea 2v"

## Control de bloques (showBlocks)
- `ManualElevation.showBlocks?: boolean` (default true) controla si se muestra el patrón de bloques
- Las paredes sin núcleo de bloques deben tener `showBlocks: false` para mostrar solo el contorno
- Toggle "Con bloques / Sin bloques" disponible en la cabecera de cada alzado manual

## Cuadrícula XZ para alzados verticales
Los alzados manuales verticales (ManualElevationPolygonCard) muestran una cuadrícula graduada con ejes:
- **Eje horizontal (U)**: corresponde a X en alzados frontales (XZ) o Y en laterales (YZ)
- **Eje vertical (V)**: corresponde a Z (altura)
- **Toggle de escala**: Bloques (625×250mm) o milímetros reales

## Auto Z por faldón
- Función `interpolateZFromSlope(col, row, plan, rooms, baseZ)` en `floor-plan-calculations.ts`
- Calcula Z en unidades de bloque para cualquier posición XY según la geometría del tejado dos_aguas
- Flag `autoZSlope: boolean` en `CustomCorner` — cuando activo, Z se recalcula automáticamente
- Botón ⛰ junto a cada coordenada permite activar/desactivar el auto-cálculo
