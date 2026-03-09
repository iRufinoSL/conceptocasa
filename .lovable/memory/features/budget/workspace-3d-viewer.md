# Memory: features/budget/workspace-3d-viewer
Updated: now

El visor 3D interactivo (Three.js) proporciona una verificación espacial completa del Espacio de trabajo en modo ventana o pantalla completa. Permite visualizar las coordenadas XYZ en las 8 esquinas del prisma, longitudes de arista en tiempo real (mm) y etiquetas descriptivas de cada cara (S1, P1-Pn, T1) incluyendo el nombre y superficie (m²). Mediante doble clic sobre una cara, se accede a un panel de propiedades que habilita la edición técnica de tipos de pared, alturas y coordenadas numéricas exactas de los vértices.

### Navegación 3D → 2D (doble clic en cara)
Tanto en el visor individual como en el Listado 3D, hacer doble clic sobre una cara navega automáticamente al editor 2D correspondiente:
- **Suelo/Techo** → abre el editor de cuadrícula Z (polígono de planta)
- **Pared P#** → detecta la orientación de la arista (horizontal=Y, vertical=X), busca la sección Y/X más cercana y abre el editor de sección 2D
- Si no hay sección compatible, cae al editor Z como fallback
- El panel de propiedades 3D incluye un botón "📐 Editar en 2D" para la misma navegación

### Nodos arrastrables
Botón "🔵 Nodos" activa/desactiva esferas interactivas en cada vértice del prisma (base=verde, superior=azul). Los nodos superiores se pueden arrastrar libremente para modificar la altura/Z del vértice en tiempo real. El arrastre desactiva temporalmente OrbitControls y al soltar persiste el cambio vía onVertexEdit. Los nodos base son visibles pero actualmente solo informativos.

### Navegación mejorada
OrbitControls configurado con: zoomSpeed=0.5 (más suave), dampingFactor=0.15, rotateSpeed=0.8, panSpeed=0.6, target centrado en [0,0,0], rango de distancia 0.5-30.

### Doble clic en Listado 3D
En el `Workspace3DListView`, hacer doble clic sobre cualquier cara de un prisma emite un callback `onFaceDoubleClick` con workspaceId, workspaceName, faceType y faceIndex, que el componente padre usa para navegar al editor 2D correspondiente.
