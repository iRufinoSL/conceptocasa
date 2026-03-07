# Memory: features/budget/workspace-section-sync
Updated: now

Los Espacios de trabajo (Workspaces) están integrados visualmente en todas las vistas técnicas de sección. En las 'Secciones Verticales', sus polígonos de suelo se muestran como superposiciones en azul cian (trazo discontinuo) con etiquetas de nombre y superficie (m²). Cada arista del polígono incluye un número de pared interactivo (1, 2, 3...) posicionado hacia el exterior. En las 'Secciones Longitudinales' y 'Transversales', los espacios se proyectan como cortes verticales calculados mediante la intersección de las aristas del polígono con el plano de la sección (Y=const o X=const), mostrando su ubicación, altura y límites exactos para garantizar la coherencia volumétrica en todo el juego de planos.

## Sincronización 3D entre secciones (v3)
- Cada workspace tiene coordenadas base (floor_polygon en unidades de cuadrícula) + altura Z (derivada del nivel/piso)
- Las coordenadas Z se calculan acumulando alturas de niveles en bloques (250mm/bloque)
- Para secciones longitudinales (Y=val): se calculan intersecciones del polígono con la recta Y=val, proyectando el rango X × Z
- Para secciones transversales (X=val): se calculan intersecciones con X=val, proyectando el rango Y × Z
- La función `findPolygonIntersections()` maneja tanto aristas que cruzan el eje como aristas colineales
- Se renderizan como rectángulos con color, nombre, dimensiones en mm y cotas exteriores

## Editor interactivo por sección en Espacios de trabajo (v1)
- Al expandir un Espacio de trabajo, aparecen botones para TODAS las secciones disponibles (Z, Y, X)
- Los botones Y/X solo aparecen si el polígono del workspace intersecta con ese plano de corte
- Para secciones Y/X: se genera un polígono proyectado por defecto (rectangular: hMin→hMax × zBase→zTop)
- Este polígono es editable con GridPolygonDrawer (arrastrar vértices, añadir/quitar)
- Los polígonos editados se guardan en `custom_corners.customSections[].polygons[]` indexados por roomId
- Botón "Resetear" restaura la proyección rectangular automática
- Se muestran otros workspaces como contexto (polígonos de fondo)
- Especialmente útil para tejados a dos aguas: editar la sección transversal para definir la pendiente

## Vista 3D Isométrica (SVG)
- Proyección isométrica ligera en SVG (sin Three.js), accesible desde botón "Vista 3D" en la pestaña Secciones
- Cada workspace se renderiza como un volumen con caras base, superior y laterales translúcidas
- Colores diferenciados por workspace con leyenda inferior
- Ejes X, Y, Z de referencia con escala en metros
