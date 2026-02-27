# Memory: features/budget/roof-level-elevation-logic
Updated: now

En niveles bajo cubierta, las paredes perimetrales con altura 0 se omiten ('Sin pared — faldón'). Los cortes verticales (ej. 2A1-2B1) se tratan siempre como hastiales (gables), calculando un perfil triangular continuo que unifica todos los segmentos del tramo (ej. Ático + Porche) bajo una pendiente geométrica única. Los hastiales muestran dimensiones de hipotenusa (diagonal base→cumbrera) en color púrpura. Las secciones invisibles de gables usan fill="#ffffff" explícito (no CSS variables) para compatibilidad con serialización SVG en exportaciones PDF. El emparejamiento vertical cross-side en bajo cubierta requiere solo span ≥70% del ancho del edificio (sin restricción de clasificación de borde top/bottom).
