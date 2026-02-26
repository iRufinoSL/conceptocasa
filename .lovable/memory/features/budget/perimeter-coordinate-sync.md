# Memory: features/budget/perimeter-coordinate-sync
Updated: now

Sincronización de Perímetro A-D: Los marcadores principales (A, B, C, D) representan los límites físicos del perímetro de la vivienda (cara exterior del bloque núcleo). Tanto los marcadores visuales como las líneas de cota usan las posiciones col/row ALMACENADAS (no el bounding box), permitiendo que el perímetro sea independiente del origen de la cuadrícula o de elementos no constructivos (como aceras). El auto-init crea los marcadores A-D a partir del bounding box de todas las habitaciones del nivel (incluyendo aceras); el usuario debe ajustar manualmente A al perímetro real si hay habitaciones no constructivas. shiftGrid desplaza TODOS los marcadores (todos los niveles) junto con las habitaciones.
