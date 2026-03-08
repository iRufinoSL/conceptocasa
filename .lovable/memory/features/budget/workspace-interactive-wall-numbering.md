# Memory: features/budget/workspace-interactive-wall-numbering
Updated: now

Los números identificativos de pared (1, 2, 3...) están sincronizados geométricamente en todas las representaciones (mini-plano, editor de cuadrícula y gestor de secciones). El sistema utiliza etiquetas posicionales sensibles al tipo de sección:

### Etiquetas según tipo de sección
- **Sección Z (Planta, origin top-left)**: P1=Superior, P2=Derecha, P3=Inferior, P4=Izquierda
- **Secciones Y/X (Longitudinal/Transversal, origin bottom-left)**: P1=Inferior, P2=Izquierda, P3=Superior, P4=Derecha (sentido horario desde abajo-izquierda)

Para polígonos con más de 4 lados, se usa `Pared N` sin etiqueta posicional.

### Editor inline de caras
Junto a cada cuadrícula (Z o Y/X), se muestra un panel compacto "Caras del volumen" con Suelo, todas las Paredes (con tipo editable) y Techo, evitando que el usuario tenga que desplazarse hasta el final de la pantalla para editar propiedades de las paredes.

### Interacción
En el editor de cuadrícula, pulsar sobre los números de pared selecciona y expande automáticamente el formulario de la pared correspondiente para su edición.
