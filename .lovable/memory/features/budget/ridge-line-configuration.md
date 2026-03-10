# Memory: features/budget/ridge-line-configuration
Updated: now

La cumbrera se define como una línea libre entre dos puntos (x1,y1) → (x2,y2) en coordenadas de cuadrícula, almacenada en `custom_corners.ridgeLine` (JSON). La UI de configuración aparece en todas las secciones verticales (Z) con 4 campos numéricos (X₁, Y₁, X₂, Y₂). El botón "Crear Cumbrera" inicializa por defecto en el centro X del plano con rango completo Y. La visualización se muestra en: 1) Secciones Z: línea roja discontinua entre los dos puntos con marcadores circulares, 2) Secciones Y/X: marca vertical donde la cumbrera intersecta el plano de corte (cálculo paramétrico), 3) Vista 3D isométrica: línea roja a la altura máxima de los volúmenes. Persistencia gestionada por `useFloorPlan.updateRidgeLine()`.
