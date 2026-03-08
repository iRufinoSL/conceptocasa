# Memory: features/budget/donde-tab-structure
Updated: now

La pestaña 'DÓNDE?' centraliza la gestión espacial en cuatro secciones: 1) Plano (con sub-nodos Variables, Volúmenes, Secciones y Resumen Mediciones), 2) Áreas de trabajo, 3) Espacios y 4) Espacios de trabajo. 

El listado de 'Espacios de trabajo' se organiza con una jerarquía de tres niveles:
- **Nivel 1**: Tipo de Sección (Verticales Z, Longitudinales Y, Transversales X) — desplegable
- **Nivel 2**: Sección concreta (ej. 'Nivel 1 Z=0', 'Fachada Norte Y=5') — desplegable
- **Nivel 3**: Espacios de trabajo pertenecientes a esa sección

Para secciones Y/X, los espacios se asignan automáticamente por intersección geométrica del polígono de suelo con el eje de la sección.

Los nombres de los espacios de trabajo son editables inline: al hacer clic en el nombre, se convierte en un campo de texto editable con confirmación por Enter o botón Guardar.

Cuando se trabaja en un espacio, el editor de cuadrícula muestra todos los demás espacios de la misma sección como polígonos de contexto clicables para conmutación rápida.

Las sub-secciones se muestran expandidas por defecto para agilizar el acceso técnico. El sistema permite alternar la visibilidad de grupos y restaura el contexto del usuario al navegar.
