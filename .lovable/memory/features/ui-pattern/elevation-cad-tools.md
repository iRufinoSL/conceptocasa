# Memory: features/ui-pattern/elevation-cad-tools
Updated: now

## CAD Ruler (Regla graduada)
- Componente React `CadRuler` muestra regla horizontal (arriba) y vertical (derecha) con marcas en mm.
- Visible en pantalla completa de alzados individuales y compuestos.
- También se inyecta en el SVG clonado durante exportación PDF mediante `injectCadRulerIntoSvg` (función DOM pura).
- Los SVGs llevan atributos `data-ruler-*` (rx, ry, rw, rh, wm, hm, scale) que el exportador PDF lee para inyectar la regla.

## Herramienta de medición interactiva
- Disponible en pantalla completa de alzados individuales (`cardRulerMode/Lines/Draw`) y compuestos (`rulerMode/Lines/Draw`).
- Click en dos puntos dibuja una línea de medición con distancia en mm.
- Las líneas permanecen hasta que el usuario las borre manualmente ("Borrar medidas").
- Componente `RulerLinesOverlay` renderiza las líneas y el punto activo de dibujo.
- Las líneas se incluyen en exportaciones PDF (forman parte del SVG en el momento del clone).
