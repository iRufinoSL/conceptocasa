# Memory: features/budget/floor-plan-architecture
Updated: now

Arquitectura de planos: Soporta múltiples niveles (Nivel 0: Cimentación, Nivel 1, Nivel 2: Bajo cubierta). Cuadrícula de 1m² con expansión dinámica y coordenadas A01, B02... Flujo: espacios 'Sin colocar' (posX: -1) se mueven al plano vía coordenada. Perímetro: fusión de segmentos colineales e invisibilización de paredes internas. Cálculo: superficies de paredes excluyen hastiales (gables). Nivel 2 (Bajo cubierta) genera hastiales automáticamente basándose en el perímetro del Nivel 1 y la pendiente del tejado. Visualización: Muros proporcionales, aperturas (cyan/ámbar) en huecos blancos y etiquetas adaptativas.

## Propiedad de segmentos compartidos
Las paredes compartidas entre porches (invisible) y casa principal (visible) usan propiedad basada en visibilidad: la pared visible siempre es la "propietaria" del segmento, no por ID. Así los porches no añaden área exterior extra. Las paredes de porche compartidas deben ser `exterior_invisible` en BD.

## Correcciones de paredes internas (Feb 2026)
1. **Bug ambos-invisibles**: Cuando ambos lados de una pared compartida son `_invisible`, se usa fallback ID-based para que un lado cuente el área.
2. **Paredes intra-grupo**: Rectángulos del mismo `groupId` (mismo espacio lógico) generan paredes `interior_invisible` automáticamente, evitando contar paredes ficticias entre partes de la misma habitación.
3. **Interior_invisible = sin pared física**: Cuando CUALQUIER lado de una pared interior compartida tiene `interior_invisible` manual, AMBOS lados quedan invisibles (no se cuenta m²). Esto permite modelar planta abierta (cocina-salón, distribuidor-salón). El fallback ID-based solo aplica para `exterior_invisible` (porches).

## Coordenadas con prefijo de nivel (Feb 2026)
Cuando hay múltiples niveles, las coordenadas incluyen el número de nivel: Nivel 1 → "1-A01", "1-B02" (columnas), "1-1", "1-2" (filas). Nivel 2 → "2-A01", "2-1". El prefijo se determina por `orderIndex + 1` del floor. Si solo hay un nivel, no se muestra prefijo. **parseCoord** acepta tanto "A01" como "2-A01" (strip del prefijo automático).

## Ghost underlay (Feb 2026)
Al visualizar un nivel superior (ej. Nivel 2), las habitaciones del nivel inmediatamente inferior se renderizan como siluetas muy tenues (borde dashed 15% opacidad, fondo 3% opacidad) con el nombre del espacio en texto casi invisible. Esto permite orientarse sin estorbar los datos del nivel actual.

## Auto-switch tras crear nivel (Feb 2026)
`addFloor` retorna el ID del nuevo floor. Tras creación, `FloorPlanGridView` recibe `forceActiveFloorId` para cambiar automáticamente a la pestaña del nuevo nivel.

## Eliminación segura de niveles (Feb 2026)
"Eliminar plano" cuando hay múltiples niveles solo borra el nivel activo y sus espacios (no todo el plano). Cuando solo hay un nivel, borra el plano completo. Se usa `activeGridFloorId` rastreado vía callback desde FloorPlanGridView (no DOM queries).

## Asignación de espacios a niveles (Feb 2026)
Al añadir un nuevo espacio, se usa por defecto el nivel actualmente visible en la cuadrícula (`activeGridFloorId`), no siempre el primer nivel.

## Deshacer (Undo)
Limitado a 3 snapshots de posiciones (posX, posY, width, length). No cubre borrado de habitaciones ni niveles completos. Botón visible solo cuando hay snapshots disponibles.
