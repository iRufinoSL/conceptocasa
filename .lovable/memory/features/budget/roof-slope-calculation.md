# Memory: features/budget/roof-slope-calculation
Updated: now

## Roof Slope (Faldón) Surface Calculation

Each roof slope (faldón) in a `dos_aguas` roof is a rectangle whose real surface uses the **hypotenuse** (not the horizontal projection):
- `projectedWidth` = distance from ridge to edge (including eave overhang)
- `hypotenuse` = √(projectedWidth² + ridgeHeight²)
- `slopeArea` = baseLength × hypotenuse (real inclined surface)

The `RoofSlopeDetail` interface stores per-slope data (name, side, dimensions, areas). The `calculateRoofSlopes()` function returns both slopes for `dos_aguas` roofs. The ridge is currently centered; asymmetric ridge support can be added later.

### Roof Layers (Future)
The roof volume has layers (from outside in): Tejado (tiles) → Estructura (structure). Currently simplified as name+surface only, no thickness/material detail yet.
