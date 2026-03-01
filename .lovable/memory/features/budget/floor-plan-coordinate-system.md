# Memory: features/budget/floor-plan-coordinate-system
Updated: now

## Sistema Cartesiano 3D (XYZ)

El sistema de coordenadas usa un espacio 3D cartesiano con origen en (0,0,0):
- **X** (eje longitudinal, izquierda→derecha): escala = blockLengthMm (def. 625mm)
- **Y** (eje transversal, arriba→abajo): escala = blockLengthMm (def. 625mm)
- **Z** (eje vertical, abajo→arriba): escala = blockHeightMm (def. 250mm)

### Nomenclatura
Cada coordenada tiene: **nombre libre** (ej. "2A1") + **posición (X,Y,Z)** (ej. "(18,1,10)").
- Ejemplo: Coordenada "2A" → (1,1,10) = 1 bloque derecha, 1 bloque abajo, 10 bloques vertical (2.500mm altura).

### Internos vs Display
- Internamente `col` y `row` son 1-based para indexado de arrays.
- Display: **X = col-1**, **Y = row-1**, **Z = z** (todos 0-based).
- `formatCoord(col, row, prefix, z)` → `"(X,Y,Z)"`.
- `parseCoord("(18,1,10)")` → `{ col: 19, row: 2, z: 10 }`.
- Headers de cuadrícula: "X0, X1, X2..." y "Y0, Y1, Y2...".

### CustomCorner
Interfaz con campo `z?: number` (default 0). Persistido en `custom_corners` JSON de `budget_floor_plans`.

### Grid
totalCols y totalRows se calculan GLOBALMENTE desde TODAS las habitaciones de TODOS los niveles, asegurando alineamiento cross-level. El auto-init de esquinas principales A,B,C,D está DESACTIVADO — los usuarios colocan coordenadas manualmente.
