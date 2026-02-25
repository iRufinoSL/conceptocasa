# Memory: features/budget/total-elevation-view
Updated: now

Alzados Totales: Nueva vista "Nivel Total" en el visor de alzados que apila verticalmente los niveles por fachada del edificio. Para cubierta a dos aguas:
1. Alzado Superior: Nivel 1 (1A-1B) abajo + Nivel 2 (2A-2B) arriba
2. Alzado Derecha: Nivel 1 (1B-1C) + Nivel 2 (2B-2C) con punto de cumbrera (hastial)
3. Alzado Inferior: Nivel 1 (1C-1D) + Nivel 2 (2C-2D)
4. Alzado Izquierdo: Nivel 1 (1D-1A) + Nivel 2 (2D-2A) con punto de cumbrera
El matching se hace por propiedad `side` de los CompositeWall de cada piso. Solo aparece el botón cuando hay ≥2 pisos con composites. Soporta vista compacta y pantalla completa. Incluye patrón de bloques, huecos, separadores de nivel, líneas de cota y etiquetas de esquinas.
