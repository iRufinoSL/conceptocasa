# Memory: features/budget/workspace-3d-viewer
Updated: now

El visor 3D interactivo (Three.js) proporciona una verificación espacial completa del Espacio de trabajo en modo ventana o pantalla completa. Permite visualizar las coordenadas XYZ en las 8 esquinas del prisma, longitudes de arista en tiempo real (mm) y etiquetas descriptivas de cada cara (S1, P1-Pn, T1) incluyendo el nombre y superficie (m²). Mediante doble clic sobre una cara, se accede a un panel de propiedades que habilita la edición técnica de tipos de pared, alturas y coordenadas numéricas exactas de los vértices.

### Nodos arrastrables
Botón "🔵 Nodos" activa/desactiva esferas interactivas en cada vértice del prisma (base=verde, superior=azul). Los nodos superiores se pueden arrastrar libremente para modificar la altura/Z del vértice en tiempo real. El arrastre desactiva temporalmente OrbitControls y al soltar persiste el cambio vía onVertexEdit. Los nodos base son visibles pero actualmente solo informativos.

### Navegación mejorada
OrbitControls configurado con: zoomSpeed=0.5 (más suave), dampingFactor=0.15, rotateSpeed=0.8, panSpeed=0.6, target centrado en [0,0,0], rango de distancia 0.5-30.

### Doble clic en Listado 3D
En el `Workspace3DListView`, hacer doble clic sobre cualquier cara de un prisma emite un callback `onFaceDoubleClick` con workspaceId, workspaceName, faceType y faceIndex, permitiendo al componente padre navegar al espacio de trabajo o abrir el panel de propiedades correspondiente.
