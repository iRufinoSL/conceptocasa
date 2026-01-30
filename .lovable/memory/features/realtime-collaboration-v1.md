# Memory: features/realtime-collaboration-v1
Updated: 2026-01-30

## Sincronización en Tiempo Real y Control de Acceso Concurrente

### Sistema de Presencia (useBudgetPresence)
- Rastrea usuarios activos en cada presupuesto via Supabase Realtime Presence
- Muestra indicador visual en el header con avatares de usuarios conectados
- Notifica entrada/salida de usuarios al presupuesto
- Permite bloquear entidades en edición (activity, resource, phase, work_area)
- Método `isEntityLocked()` verifica si otro usuario está editando

### Sistema de Broadcast (useBudgetBroadcast)
- Canal de broadcast dedicado por presupuesto para propagación instantánea de cambios
- Latencia típica: 50-100ms (vs 200-500ms de postgres_changes)
- Eventos: activity-changed, resource-changed, phase-changed, work-area-changed, measurement-changed
- Flujo: Mutación → Refetch inmediato local → Broadcast a otros clientes

### Indicadores Visuales
- BudgetPresenceIndicator: Muestra usuarios activos con colores por nombre
- EntityLockIndicator: Badge de bloqueo cuando otro usuario edita
- Tooltips con información de pestaña activa y entidad en edición

### Patrón de Actualización Inmediata
1. Ejecutar mutación en base de datos
2. `await fetchData()` - Refetch inmediato para estado local
3. `broadcastXxxChange()` - Notificar a otros clientes
4. Otros clientes reciben broadcast y ejecutan su propio refetch

### Archivos Clave
- `src/hooks/useBudgetPresence.ts` - Hook de presencia
- `src/hooks/useBudgetBroadcast.ts` - Hook de broadcast
- `src/components/presupuestos/BudgetPresenceIndicator.tsx` - Componentes visuales
