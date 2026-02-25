# Memory: features/budget/floor-plan-grid-ui
Updated: now

Visualización de la Cuadrícula: 
1. Estructura: Celdas de 625x625mm ajustadas al bounding box de las habitaciones.
2. Estética: Rejilla verde muy sutil (1.5px, opacidad 0.25) con fondo ajedrezado de mínima intensidad (impares 0.06, pares 0.015). Ajustado progresivamente desde valores altos tras múltiples iteraciones del usuario.
3. Capas: El grid usa z-index 15 para ser visible sobre los fondos de las habitaciones en todos los niveles.
4. Pantalla Completa: Márgenes amplios (+200px horiz) para evitar truncar cotas laterales.
5. Bajo cubierta: Alzados cross-side verticales interiores (no perimetrales) usan altura uniforme calculada por la pendiente del faldón en la posición X del corte, NO como hastial.
