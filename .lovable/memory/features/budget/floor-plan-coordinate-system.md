# Memory: features/budget/floor-plan-coordinate-system
Updated: now

## Sistema Cartesiano 3D (XYZ) — v2

El sistema de coordenadas usa un espacio 3D cartesiano con origen nombrado (default "1A") en (0,0,0):
- **X** (eje longitudinal, izquierda→derecha): escala = blockLengthMm (def. 625mm). Positivo a la derecha, negativo a la izquierda.
- **Y** (eje transversal, arriba→abajo en plano 2D): escala = blockLengthMm (def. 625mm). Positivo hacia abajo, negativo hacia arriba.
- **Z** (eje vertical, abajo→arriba): escala = blockHeightMm (def. 250mm). Positivo hacia arriba, negativo hacia abajo.

### Coordenadas Negativas
El sistema soporta coordenadas negativas en los tres ejes. Ejemplo: (-1,0,0) está un bloque a la izquierda del origen.

### Habitaciones No Colocadas
`posX = null, posY = null` indica que la habitación no está posicionada en la cuadrícula. Anteriormente se usaba `posX < 0` como marcador; ahora `null` es el indicador. La función `isRoomPlaced(room)` centraliza esta comprobación. La columna DB `pos_x`/`pos_y` es nullable.

### Nomenclatura
Cada coordenada tiene: **nombre libre** (ej. "1A") + **posición (X,Y,Z)** (ej. "(0,0,0)").

### Internos vs Display
- Internamente `col` y `row` usan offset +1 (col = X+1, row = Y+1) para indexado.
- Display: **X = col-1**, **Y = row-1**, **Z = z**.
- `formatCoord(col, row, prefix, z)` → `"(X,Y,Z)"`.
- `parseCoord("(-1,2,10)")` → `{ col: 0, row: 3, z: 10 }`. Soporta negativos.
- Headers de cuadrícula: "X0, X1, X2..." y "Y0, Y1, Y2...".

### Planos y Alzados
- **Plano 2D (cuadrícula)**: Z constante para todo el nivel.
- **Alzado recto**: Y constante, varían X y Z.
- **Plano inclinado** (ej. faldón): X, Y, Z variables — definido por 4 vértices XYZ arbitrarios (Fase 2).

### Grid Bounds
El grid se calcula con min/max de todas las coordenadas (incluidas negativas), no asumiendo origen en (1,1). `gridBounds = { minCol, maxCol, minRow, maxRow }`.

### CustomCorner
Interfaz con campo `z?: number` (default 0). Persistido en `custom_corners` JSON de `budget_floor_plans`.

### Grid
totalCols y totalRows se calculan GLOBALMENTE desde TODAS las habitaciones de TODOS los niveles. El auto-shift que impedía coordenadas negativas ha sido ELIMINADO.
