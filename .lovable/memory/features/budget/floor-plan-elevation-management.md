# Memory: features/budget/floor-plan-elevation-management
Updated: now

Gestión de Alzados de Coordenadas:
1. Identificación: Etiquetas con guion y prefijo de nivel (ej. '1A-1A1'). Ordenamiento: siempre izquierda→derecha (horizontal) o arriba→abajo (vertical) para consistencia con la lectura del plano.
2. Emparejamiento: Cada marcador se convierte a posición métrica absoluta (absX, absY) usando reglas separadas por eje: X depende de side='right' (col*cell) vs otros ((col-1)*cell); Y depende de side='bottom' (row*cell) vs otros ((row-1)*cell). Marcadores con absX/absY cercanos (tolerancia = medio bloque) se emparejan para alzados verticales/horizontales respectivamente. Esto corrige el problema de col 17 side=right y col 18 side=bottom apuntando a la misma línea vertical.
3. Span: El barrido de habitaciones se restringe al intervalo [min, max] definido por los dos marcadores, evitando espacios fuera del tramo.
4. Huecos: Posicionamiento y filtrado mediante coordenadas absolutas (coord_inicio_habitación + posición_relativa_hueco) comparadas con los límites de la sección.
5. Integridad: Se generan alzados incluso para tramos con paredes 'invisible'. Se evitan duplicados contra perímetro y otros cross-side ya generados.
6. UI: Tarjetas con 'flex-wrap' y límites de ancho para badges para asegurar visibilidad del botón 'Ampliar'.
