# Memory: features/budget/floor-plan-wall-styles
Updated: now

Las caras de los Espacios de trabajo muestran visualmente su tipo mediante colores, grosores y trazos específicos:

### Tipos de pared
1. **Paredes Exteriores** (Negro/Verde intenso, 4-5px)
2. **Paredes Interiores** (Naranja, 2-2.5px)
3. **Paredes Invisibles** (Gris discontinuo)
4. **Ext. compartida** (Azul, 5px)
5. **Int. compartida** (Verde, 2.5px)
6. **Tejado** (Rojo #c45c5c, 4px) — Usa prefijo **T** (T1, T2, etc.)
7. **Suelo** (Marrón #a0522d / hsl(20,60%,40%), 4px) — Nuevo tipo para caras de suelo

### Etiquetas
- Las paredes normales usan prefijo `P` (P1, P2, P3...)
- Las paredes tipo **Tejado** usan prefijo `T` (T1, T2, T3...)
- Las paredes tipo **Suelo** se etiquetan como `S` en secciones
- En secciones transversales/longitudinales, las caras se etiquetan automáticamente como `S` (Suelo) o `T` (Techo) según su posición vertical
- En el CustomSectionManager, el ciclo de etiquetas incluye: P# → Suelo → Techo → T# (Tejado)

### Ámbitos de Suelo y Techo
Disponen de clasificaciones propias (Básico, Compartido e Invisible) para determinar su comportamiento métrico y visibilidad, manteniendo la coherencia visual en todas las vistas técnicas (Z, Y, X). Las paredes compartidas se identifican automáticamente cuando dos espacios comparten una arista.
