# Memory: features/budget/floor-plan-architecture
Updated: now

Arquitectura de planos: Cuadrícula de 1m² con expansión dinámica y coordenadas A01, B02... Flujo de colocación: los espacios inician 'Sin colocar' (posX: -1) en una cabecera y se mueven al plano al asignarles coordenada. Perímetro: fusión de segmentos colineales e invisibilización automática de paredes internas en grupos para espacios no rectangulares. Cálculo de superficies: Los totales de paredes (bruto/neto) excluyen estrictamente las áreas de hastiales (gables), las cuales se reportan por separado para evitar duplicidad. Visualización: Muros proporcionales al grosor (0.25m/0.13m), aperturas (cyan/ámbar) centradas en huecos blancos y etiquetas adaptativas.

## Multi-nivel (Niveles)
El sistema soporta múltiples niveles (antes llamados "Plantas"). Terminología: "Nivel" en vez de "Planta". Nivel 0 = Cimentación, Nivel 1 = principal, Nivel 2 = Bajo cubierta. Cada nivel tiene su propio plano 2D editable con espacios. La UI permite añadir, renombrar y eliminar niveles desde el panel "Gestionar Niveles". Los espacios se asignan a un nivel al crearlos. Los tabs de la cuadrícula siempre muestran los niveles disponibles. Los hastiales son las paredes externas del nivel "Bajo cubierta" (futuro: auto-generación desde perímetro + pendiente).
