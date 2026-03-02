# Memory: features/budget/elevation-rendering-logic-v2
Updated: now

La vista 'Nivel Vivienda' unifica niveles en 4 caras cardinales. Los alzados muestran coordenadas editables tanto para la parte INFERIOR (Inf) como SUPERIOR (Sup) en las cabeceras de cada tarjeta, usando 'CornerEditBadge'. La etiqueta superior se genera automáticamente incrementando el dígito de nivel (ej. '1A' → '2A'). El Z inferior = baseZ del nivel, el Z superior = baseZ + (alturaPared / blockHeightMm). Esto aplica a ElevationCardView, CompositeWallCard y TotalElevationCard. Superficies inclinadas (faldones) muestran 4 vértices (V1-V4) con sus XYZ correspondientes (cumbrera vs base). Incluyen sumatorios de m² por sección, cota vertical total a la derecha y cortes interiores automáticos.
