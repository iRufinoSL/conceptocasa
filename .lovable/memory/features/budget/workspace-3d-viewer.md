# Memory: features/budget/workspace-3d-viewer
Updated: now

El visor 3D interactivo (Three.js) proporciona una validación técnica del proyecto con las siguientes capacidades: 1) Referencia: ejes de origen (XYZ) con flechas y coordenadas en las 8 esquinas del prisma. 2) Mediciones: etiquetas de arista con longitud física (mm) y ruta de coordenadas (ej. X0→X10). 3) Navegación: órbita centrada, zoom suavizado (0.5), transparencia por proximidad para ver caras ocultas y modo pantalla completa. 4) Interactividad: etiquetas multi-línea (ID, Nombre, Área m²); doble clic para abrir el panel de propiedades (donde se pueden editar manualmente las coordenadas XYZ de los vértices o el tipo de pared) o saltar al editor 2D. 5) Edición: nodos superiores arrastrables para ajustar alturas Z en tiempo real. 6) Vistas: modos de 'Vivienda Completa', filtrado por 'Sección Z' y listado 'A-Z'.

### Sincronización Secciones 2D → Geometría 3D (per-vertex Z)
El visor 3D lee directamente los polígonos de las secciones transversales (X=val) y longitudinales (Y=val) almacenados en `customSections` para determinar la coordenada Z superior de cada vértice del polígono de planta. Para cada vértice (vx, vy), el sistema busca secciones que pasen por ese punto, localiza el polígono del espacio de trabajo en esa sección, e interpola la Z máxima. Esto permite representar correctamente geometrías no rectangulares (triángulos de áticos, hastiales, cubiertas inclinadas) sin depender exclusivamente de `wall.height`. Si no existe sección que pase por un vértice, se usa `wall.height` como fallback. La lógica reside en `workspace3dUtils.ts → computeVertexTopPositions()`.

### Navegación 3D → 2D (doble clic en cara)
Tanto en el visor individual como en el Listado 3D, hacer doble clic sobre una cara navega automáticamente al editor 2D correspondiente:
- **Suelo/Techo** → abre el editor de cuadrícula Z (polígono de planta)
- **Pared P#** → detecta la orientación de la arista (horizontal=Y, vertical=X), busca la sección Y/X más cercana y abre el editor de sección 2D
- Si no hay sección compatible, cae al editor Z como fallback
- El panel de propiedades 3D incluye un botón "📐 Editar en 2D" para la misma navegación

### Retorno automático al 3D
Al navegar desde el 3D al editor 2D (doble clic en cara), el sistema recuerda el origen (`returnTo3D` state: `list` o `single+workspaceId`). Al guardar o cancelar en el editor 2D, se restaura automáticamente la vista 3D desde la que se activó.

### Nodos arrastrables
Botón "🔵 Nodos" activa/desactiva esferas interactivas en cada vértice del prisma (base=verde, superior=azul). Los nodos superiores se pueden arrastrar libremente para modificar la altura/Z del vértice en tiempo real. El arrastre desactiva temporalmente OrbitControls y al soltar persiste el cambio vía onVertexEdit. Los nodos base son visibles pero actualmente solo informativos.

### Navegación mejorada
OrbitControls configurado con: zoomSpeed=0.5 (más suave), dampingFactor=0.15, rotateSpeed=0.8, panSpeed=0.6, target centrado en [0,0,0], rango de distancia 0.5-30.

### Doble clic en Listado 3D
En el `Workspace3DListView`, hacer doble clic sobre cualquier cara de un prisma emite un callback `onFaceDoubleClick` con workspaceId, workspaceName, faceType y faceIndex, que el componente padre usa para navegar al editor 2D correspondiente.
