# Memory: features/budget/floor-plan-architecture
Updated: now

Arquitectura de planos: Soporta múltiples niveles (Nivel 0: Cimentación, Nivel 1, Nivel 2: Bajo cubierta). Cuadrícula de 1m² con expansión dinámica y coordenadas A01, B02... Flujo: espacios 'Sin colocar' (posX: -1) se mueven al plano vía coordenada. Perímetro: fusión de segmentos colineales e invisibilización de paredes internas. Cálculo: superficies de paredes excluyen hastiales (gables). Nivel 2 (Bajo cubierta) genera hastiales automáticamente basándose en el perímetro del Nivel 1 y la pendiente del tejado. Visualización: Muros proporcionales, aperturas (cyan/ámbar) en huecos blancos y etiquetas adaptativas.

## Propiedad de segmentos compartidos
Las paredes compartidas entre porches (invisible) y casa principal (visible) usan propiedad basada en visibilidad: la pared visible siempre es la "propietaria" del segmento, no por ID. Así los porches no añaden área exterior extra. Las paredes de porche compartidas deben ser `exterior_invisible` en BD.

## Correcciones de paredes internas (Feb 2026)
1. **Bug ambos-invisibles**: Cuando ambos lados de una pared compartida son `_invisible`, se usa fallback ID-based para que un lado cuente el área.
2. **Paredes intra-grupo**: Rectángulos del mismo `groupId` (mismo espacio lógico) generan paredes `interior_invisible` automáticamente, evitando contar paredes ficticias entre partes de la misma habitación.
3. **Interior_invisible = sin pared física**: Cuando CUALQUIER lado de una pared interior compartida tiene `interior_invisible` manual, AMBOS lados quedan invisibles (no se cuenta m²). Esto permite modelar planta abierta (cocina-salón, distribuidor-salón). El fallback ID-based solo aplica para `exterior_invisible` (porches).
