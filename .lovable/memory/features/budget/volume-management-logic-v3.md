# Memory: features/budget/volume-management-logic-v3
Updated: now

## Espacios de Trabajo = Volúmenes

Los Espacios de trabajo son volúmenes geométricos cuya base/suelo es un **polígono de N vértices** (mínimo 3). El campo `floor_polygon` (JSONB) en `budget_floor_plan_rooms` almacena `[{x, y}, ...]` en metros. Los campos `length` y `width` se calculan del bounding box del polígono para retrocompatibilidad.

### Vinculación obligatoria a Sección Vertical
Cada Espacio DEBE pertenecer a una Sección Vertical (`vertical_section_id` text). Si no existen secciones verticales, el formulario permite crear una nueva inline. Los espacios se agrupan visualmente por su Sección Vertical.

### Geometría de caras
- **Suelo**: Polígono de N vértices → N aristas
- **Paredes**: Una pared por cada arista del polígono base (no fijo en 4). Cada pared muestra su longitud calculada.
- **Techo**: Una cara superior (Normal, Invisible, Compartido)
- Total de caras: N aristas + Suelo + Techo = N + 2

### Tipos de cara
- **Paredes**: Externa, Interna, Invisible, Externa compartida, Interna compartida
- **Suelo/Techo**: Normal, Invisible, Compartido

### Cálculos automáticos
- Área (m²): Fórmula del shoelace sobre el polígono base
- Volumen (m³): Área × altura Z
- Longitud de cada arista mostrada junto al tipo de pared

### Formas especiales en alzado
- **Cubo**: 8 vértices (base rectangular + techo plano)
- **Prisma**: 6 vértices (tejado a dos aguas)
- **Pirámide**: 5 vértices (punta central)

### Entrada de geometría
- Manual: Editor de vértices (X, Y) con preview SVG inline
- Interactivo: Dibujo sobre cuadrícula (futuro)

### Objetos y capas (futuro)
Dentro de cada Espacio habrá objetos organizados por capas.
