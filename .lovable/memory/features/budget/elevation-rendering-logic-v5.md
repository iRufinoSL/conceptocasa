# Memory: features/budget/elevation-rendering-logic-v5
Updated: now

## Definición geométrica de Alzados
- Los alzados son polígonos con N coordenadas XYZ (mínimo 2=línea, 3=triángulo, 4=cuadrilátero, N=polígono).
- Pueden ser verticales o inclinados.
- Se dibujan por nivel (Nivel 1, Nivel 2/Cubierta) o como alzado total (multinivel).
- Ejemplo Cara Izquierda total Rodolfo_Carbayín: 1A(1,1,0)-1D(1,15,0)-2A(1,1,10)-2D(1,15,10)-CuA(1,9,19) → polígono de 5 vértices (pentágono con hastial).

## Alzados manuales (polígonos arbitrarios)
- Nuevo sistema para crear alzados de N vértices seleccionando coordenadas manualmente.
- Interfaz: botón "Nuevo alzado manual" en vista de "Alzados de coordenadas".
- Se seleccionan vértices de las coordenadas existentes en la cuadrícula.
- Renderizado como SVG poligonal con patrón de bloques (clipPath), etiquetas de vértices y medidas de aristas en mm.
- Almacenamiento: campo `custom_corners` de `budget_floor_plans` evoluciona de array plano a `{ corners: [...], manualElevations: [...] }` con retrocompatibilidad.
- Tipo `ManualElevation` en `useFloorPlan.ts`: id, name, vertexLabels[], floorId?.
- Componente `ManualElevationPolygonCard` proyecta los vértices 3D a 2D eligiendo el eje horizontal de mayor dispersión.

## Coordenadas editables en alzados manuales
- **En tarjeta (card)**: badges clicables con Popover que permiten editar X(col), Y(fila), Z(bloques) de cada vértice.
- **En fullscreen**: tabla de vértices con filas clicables → campos inline de edición (col, row, z).
- Ambos usan `onCustomCornersChange` para persistir cambios en `custom_corners`.
- Componentes: `EditableVertexRow` (tabla fullscreen), `EditableVertexBadge` (card compacto con Popover).

## Sistema de Capas (igual que Planos)
- Toda capa es la representación de un volumen, pero definida sólo por su profundidad/grosor.
- El orden de capas define su posición espacial relativa al plano/alzado padre.
- Existe una **capa principal (núcleo/core)** que define el punto espacial exacto XYZ del alzado.

## Representación gráfica de capas
- Paredes externas (capa de bloques): patrón de aparejo 625mm (horizontal) × 250mm (vertical).
- Cada capa se define por los Objetos que la componen.

## Vistas
- ElevationCardView: tarjetas individuales de pared
- TotalElevationCard: alzado total por lado (multinivel)
- CompositeWallCard: alzado por coordenadas
- ManualElevationPolygonCard: alzado manual poligonal (triángulo, pentágono, etc.)
- Fullscreen dialog: vista ampliada con coordenadas editables estilo Cuadrícula
