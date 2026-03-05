# Memory: features/budget/volume-management-logic-v3
Updated: now

## Espacios de Trabajo = Volúmenes

Los Espacios de trabajo son volúmenes geométricos con tres formas posibles:
- **Cubo (8 vértices)**: 6 caras — Suelo + 4 paredes (Superior, Derecha, Inferior, Izquierda) + Techo
- **Prisma (6 vértices)**: Tejado a dos aguas (2 coordenadas superiores)
- **Pirámide (5 vértices)**: Punta central (1 coordenada superior)

### Vinculación obligatoria a Sección Vertical
Cada Espacio de trabajo DEBE pertenecer a una Sección Vertical. No se puede crear un Espacio sin asignar una Sección Vertical. El campo `vertical_section_id` (text) en `budget_floor_plan_rooms` almacena el ID de la sección vertical (del JSON `customSections` en `custom_corners`). Si no existen secciones verticales, el formulario permite crear una nueva inline.

Los espacios se agrupan visualmente por su Sección Vertical en el listado.

### Tipos de cara
- **Paredes**: Externa, Interna, Invisible, Externa compartida, Interna compartida
- **Suelo**: Normal, Invisible, Compartido
- **Techo**: Normal, Invisible, Compartido

### Nomenclatura de paredes
La posición (Superior/Derecha/Inferior/Izquierda) viene de la sección vertical del nivel correspondiente.

### Altura
Cada espacio puede tener su altura propia individual o heredar la altura por defecto del nivel. Las paredes compartidas se computan al 50% y los segmentos 'Invisibles' se excluyen de los totales.

### Objetos y capas (futuro)
Dentro de cada Espacio de trabajo habrá objetos organizados por capas (ej. Bloques 625×250×300 como volumen conjunto → m²/m³, o Vigas de madera/acero). Se definirán en una fase posterior.

### Definición de espacios
Los espacios se pueden definir desde las Secciones (coordenadas XYZ) o directamente en 3D proporcionando las coordenadas del volumen.
