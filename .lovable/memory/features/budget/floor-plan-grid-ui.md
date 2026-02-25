# Memory: features/budget/floor-plan-grid-ui
Updated: now

Visualización de la Cuadrícula: 
1. Celdas: De 625x625mm, representadas individualmente. La cuadrícula se ajusta dinámicamente al bounding box exacto de las habitaciones (ej. 20x14), eliminando celdas sobrantes para que las cotas perimetrales coincidan con los muros exteriores.
2. Estética: Rejilla de alta intensidad con bordes en verde puro (rgba(0,128,0,0.7)) de 1.5px de grosor. Fondo ajedrezado con opacidad 0.18 en celdas impares y un tinte sutil de 0.04 en las pares. El color verde intenso es una exigencia del usuario para garantizar la visibilidad como apoyo visual en todos los niveles.
3. Modo Pantalla Completa: Usa márgenes ampliados (+200px horizontal, +120px vertical) y un factor de relleno de 8 columnas adicionales para evitar el truncamiento de las cotas en la cara derecha.
4. Marcadores de Alero (isEave): Los marcadores Al2A, Al2B, etc. se filtran SIEMPRE de las líneas de cota y de la generación de alzados de coordenadas. Solo los marcadores ABCD principales y los custom (no-eave) participan en mediciones y elevaciones.
5. Bajo cubierta: Las paredes con altura 0 (borde del edificio) ya NO se omiten de los alzados; se calculan con calcBajoCubiertaWallHeight para generar todos los alzados de coordenadas completos.
