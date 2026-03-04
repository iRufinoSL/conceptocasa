# Memory: features/budget/elevation-rendering-logic
Updated: now

Los Alzados se definen como polígonos de N vértices XYZ (verticales o inclinados). El sistema permite la generación automática perimetral y la creación de 'Alzados Manuales' mediante la selección secuencial de coordenadas. La visualización emplea el método de Newell para la proyección óptima y calcula la superficie (m2) mediante el producto cruzado 3D. Incluye edición directa de coordenadas XYZ mediante popovers o filas editables, con soporte para 'Z automática por faldón', donde la altura se calcula dinámicamente interpolando la posición XY entre el alero y la cumbrera de un faldón de referencia. Ofrece vista a pantalla completa, optimización para impresión y organización jerárquica por nivel (floorId).

## Cuadrícula XZ para alzados verticales
Los alzados manuales verticales (ManualElevationPolygonCard) muestran una cuadrícula graduada con ejes:
- **Eje horizontal (U)**: corresponde a X en alzados frontales (XZ) o Y en laterales (YZ)
- **Eje vertical (V)**: corresponde a Z (altura)
- **Toggle de escala**: Bloques (625×250mm) o milímetros reales
- Las etiquetas de la cuadrícula se muestran en los bordes izquierdo e inferior

## Auto Z por faldón
- Función `interpolateZFromSlope(col, row, plan, rooms, baseZ)` en `floor-plan-calculations.ts`
- Calcula Z en unidades de bloque para cualquier posición XY según la geometría del tejado dos_aguas
- Flag `autoZSlope: boolean` en `CustomCorner` — cuando activo, Z se recalcula automáticamente
- Botón ⛰ junto a cada coordenada permite activar/desactivar el auto-cálculo
- Disponible solo cuando hay tejado dos_aguas y habitaciones posicionadas
