# Memory: features/budget/floor-plan-wall-styles
Updated: now

Las caras de los Espacios de trabajo muestran visualmente su tipo mediante colores, grosores y trazos específicos:

### Tipos de pared y códigos
1. **PE** — Pared Externa (Verde intenso, 3.5px)
2. **PEI** — Pared Externa Invisible (Gris discontinuo, 2.5px)
3. **PEC** — Pared Externa Compartida (Verde intenso, 3.5px)
4. **PI** — Pared Interna (Naranja, 2px)
5. **PII** — Pared Interna Invisible (Gris discontinuo, 1.5px)
6. **PIC** — Pared Interna Compartida (Naranja, 2px)
7. **T** — Tejado/Techo (Rojo #c45c5c, 4px)
8. **S** — Suelo (Marrón #a0522d / hsl(20,60%,40%), 4px)

### Códigos de pared
- Formato: Prefijo + Número → PE1, PEI2, PIC3, T1, S1
- Función centralizada `getWallCode(wallType, index)` en `src/utils/wallCodeUtils.ts`
- Se aplica uniformemente en: planos 2D, secciones, alzados, vistas 3D, paneles de propiedades

### Filtro visual de secciones
- Selector "Todo / Solo nombre / Solo código" controla qué información se muestra
- "Todo": nombres de espacio + códigos de pared
- "Solo nombre": solo nombres de espacio con superficie
- "Solo código": solo códigos de pared (oculta labels centrales)

### Borrado de reglas
- En secciones: borrado individual con botón ✕ por regla (ya existía)
- En alzados: selección visual (click) + botón "Borrar seleccionada" o "Borrar todas"
