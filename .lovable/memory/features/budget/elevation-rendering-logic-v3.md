# Memory: features/budget/elevation-rendering-logic-v3
Updated: now

Los alzados presentan un sistema de gestión de coordenadas XYZ en las 4 esquinas de cada pared (A,B,C,D) mediante 'CornerEditBadge'. Las cabeceras de los alzados muestran dos filas interactivas: 'Sup' (Superior) e 'Inf' (Inferior).

## Etiquetado de esquinas
- Se usa `levelCornerLabel(letter, baseZ)` para generar etiquetas con prefijo de nivel: baseZ=0 → "1A", baseZ=10 → "11A"
- Se usa `topCornerLabel(label)` para incrementar el prefijo: "1A" → "2A"
- El Z-tope se calcula como `baseZ + (alturaPared / 250mm)`

## Guardado de coordenadas
- `CornerEditBadge` busca la coordenada por label en customCorners (tanto el label original como el editado)
- Si existe, actualiza; si no, crea una nueva entrada
- Las coordenadas superiores (Sup) se guardan como entradas independientes en customCorners

## Vista ampliada (Fullscreen)
- El diálogo de pantalla completa incluye las mismas coordenadas editables Sup/Inf en el header
- Los faldones inclinados muestran 4 vértices (V1-V4) con sus XYZ específicos (cumbrera vs base)

## Vistas con coordenadas
- ElevationCardView: tarjetas individuales de pared
- TotalElevationCard: alzado total por lado
- CompositeWallCard: alzado por coordenadas
- Fullscreen dialog: vista ampliada con coordenadas editables
