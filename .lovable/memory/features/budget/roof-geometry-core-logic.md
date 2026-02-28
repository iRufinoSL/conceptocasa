# Memory: features/budget/roof-geometry-core-logic
Updated: now

El motor de cálculo proyecta el centro global del edificio para determinar la posición de la cumbrera (ridgeRatio) en cada tramo de alzado. Prioriza el campo ridgeHeight (m) definido por el usuario sobre los cálculos basados en porcentaje de pendiente para garantizar precisión milimétrica y coherencia entre vistas. CRÍTICO: El centro del edificio (buildingCenterY) se calcula EXCLUYENDO habitaciones no estructurales (aceras, aleros, eaves) para evitar desplazamientos de la cumbrera. La misma lógica de filtrado se aplica en la cuadrícula (FloorPlanGridView) y en los alzados (ElevationsGridViewer). La función calcBajoCubiertaWallHeight ya usa getIgnoredRoofElevationRoomIds que filtra correctamente estos elementos.
