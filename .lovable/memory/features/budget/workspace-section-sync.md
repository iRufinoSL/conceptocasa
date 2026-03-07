# Memory: features/budget/workspace-section-sync
Updated: now

Los Espacios de trabajo (Workspaces) están sincronizados en todas las vistas técnicas. En secciones verticales, los polígonos de suelo muestran etiquetas de superficie y números de pared interactivos. En secciones longitudinales (Y) y transversales (X), se muestran proyecciones verticales editables tanto desde la pestaña 'Espacios de trabajo' como directamente desde la pestaña 'Secciones'.

## Edición de polígonos en Secciones (v2)
- En la pestaña Secciones, al abrir la cuadrícula de una sección Y o X, se muestran TODOS los espacios de trabajo de TODOS los niveles que intersectan el plano de corte
- Cada espacio se renderiza como un polígono de N vértices (usando datos guardados en `section.polygons` o un rectángulo por defecto)
- Al pulsar sobre un espacio se activa el modo edición: arrastrar vértices, editar coordenadas numéricas, añadir/quitar vértices
- Los polígonos editados se guardan en `customSections[].polygons[]` del campo `custom_corners` del floor plan
- Botón "Resetear" restaura la proyección rectangular automática (hStart→hEnd × zBase→zTop)
- Las etiquetas de ejes muestran prefijos correctos (X0, Z0 para longitudinales; Y0, Z0 para transversales)
- Cotas perimetrales globales envuelven todos los espacios visibles
- Leyenda con botones por espacio para seleccionar cuál editar

## Visor 3D Isométrica (SVG)
- Proyección isométrica ligera en SVG, accesible desde botón "Vista 3D"
- Cada workspace se renderiza como un volumen con caras translúcidas
- Colores diferenciados por workspace con leyenda inferior
