# Memory: features/budget/elevation-rendering-logic-v5
Updated: now

## Definición geométrica de Alzados
- Los alzados son polígonos con N coordenadas XYZ (mínimo 2=línea, 3=triángulo, 4=cuadrilátero, N=polígono).
- Pueden ser verticales o inclinados.
- Se dibujan por nivel (Nivel 1, Nivel 2/Cubierta) o como alzado total (multinivel).
- Ejemplo Cara Izquierda total Rodolfo_Carbayín: 1A(1,1,0)-1D(1,15,0)-2A(1,1,10)-2D(1,15,10)-CuA(1,9,19) → polígono de 5 vértices (pentágono con hastial).

## Coordenadas editables
- En vista ampliada (fullscreen), las coordenadas se gestionan igual que en Cuadrícula: edición cómoda de nombre y valores XYZ por cada vértice.

## Sistema de Capas (igual que Planos)
- Toda capa es la representación de un volumen, pero definida sólo por su profundidad/grosor.
- El orden de capas define su posición espacial relativa al plano/alzado padre:
  - Planos: capas crecen hacia arriba (Z+).
  - Alzados exteriores: capas crecen hacia adentro.
  - Alzados longitudinales: capas crecen en sentido longitudinal.
  - Orden negativo permitido (capas exteriores al núcleo).
- Existe una **capa principal (núcleo/core)** que define el punto espacial exacto XYZ del alzado.
- Todas las demás capas se posicionan relativas al núcleo.

## Representación gráfica de capas
- Paredes externas (capa de bloques): patrón de aparejo 625mm (horizontal) × 250mm (vertical), coherente con la escala del sistema.
- Otras capas: representación figurada pero realista (a definir por tipo de material).
- Cada capa se define por los Objetos que la componen (sin implementar grosor 3D por ahora).

## Vistas
- ElevationCardView: tarjetas individuales de pared
- TotalElevationCard: alzado total por lado (multinivel)
- CompositeWallCard: alzado por coordenadas
- Fullscreen dialog: vista ampliada con coordenadas editables estilo Cuadrícula
