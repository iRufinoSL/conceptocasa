# Memory: features/budget/bajo-cubierta-geometry
Updated: now

En niveles 'bajo cubierta' (detectados por floor.level='bajo_cubierta' O floor.name incluyendo 'bajo cubierta' O room.height===0):
1. Las paredes tienen alturas variables calculadas por `calcBajoCubiertaWallHeight` según la pendiente del tejado y la posición relativa a la cumbrera.
2. Paredes de hastial (wallIndex 2/4): altura = peak triangular, se renderizan como triángulo.
3. Paredes horizontales (wallIndex 1/3): altura media entre los dos extremos según pendiente.
4. La superficie de los hastiales se calcula estrictamente entre paredes del perímetro (excluyendo aleros).
5. Al crear un nivel bajo cubierta, el level se establece como 'bajo_cubierta' y la altura de las habitaciones se fija en 0.
6. Soporta edición bidireccional entre Pendiente (º/%) y Altura de Cumbrera (ridge_height).
7. Los tipos de pared son editables en los alzados de bajo cubierta igual que en otros niveles.
