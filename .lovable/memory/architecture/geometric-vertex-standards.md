# Memory: architecture/geometric-vertex-standards
Updated: now

## Volúmenes
- 8 vértices XYZ → Paralelepípedo/Cubo
- 6 vértices XYZ → Prisma triangular (ej. tejado a dos aguas)
- 5 vértices XYZ → Pirámide

## Planos
- 4 coordenadas → Cuadrilátero (rectángulo típico)
- 3 coordenadas → Triángulo
- Cada plano tiene Capas (definidas como volúmenes), que crecen hacia arriba (Z+)

## Alzados
- N coordenadas → Polígono general (mínimo 2=línea, 3=triángulo, 4=rectángulo, 5+=polígono)
- Pueden ser verticales o inclinados
- Se dibujan por nivel o como alzado total multinivel
- Tienen Capas como los planos, pero crecen hacia adentro (paredes externas) o en sentido longitudinal
- Cada capa tiene una capa núcleo (core) que define la posición XYZ exacta

## Capas (común a Planos y Alzados)
- Una capa = representación de un volumen, definida por su profundidad/grosor
- Orden positivo/negativo relativo al núcleo
- Capa principal (núcleo) = punto espacial XYZ exacto
- Paredes externas: patrón de bloques 625×250mm
