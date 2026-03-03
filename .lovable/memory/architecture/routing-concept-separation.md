# Memory: architecture/routing-concept-separation
Updated: now

## Entry Points
- `/` — Landing page pública "Concepto To.Lo.Sa." con enlace "Acceso" a `/auth`
- `/sistemas` — Portal original Soluciones (azul)
- `/auth` — Login. Tras autenticarse redirige a `/brain` (o a `last_route` si estaba en un presupuesto)
- `/brain` — **Punto de entrada principal** tras login para todos los roles

## Modelo de Navegación por Rol
### Administrador / Director
- Ve el universo completo de To.Lo.Sa.systems en Brain: todos los módulos, todos los Proyectos, todos los Presupuestos
- Acceso a CRM, Recursos, Usuarios, Configuración, Administración, etc.

### Cliente / Colaborador
- Ve solo sus Proyectos asignados y los Presupuestos dentro de ellos
- Los nodos de módulos no accesibles (Recursos, Usuarios, Config, Admin) quedan ocultos
- Filtrado implementado en Brain.tsx usando `userPresupuestos` del AuthContext

## Auto-navegación
- Al entrar en Brain, si `last_route` del perfil apunta a un presupuesto (`/presupuestos/:id`), se redirige directamente
- `ProtectedRoute` guarda `last_route` con debounce de 2s

## Modelo de Datos: Proyecto → Presupuestos
- `projects.housing_profile` (JSONB) almacena el perfil constructivo completo de la vivienda
- `presupuestos.project_id` vincula cada presupuesto a su proyecto padre
- Un Proyecto empieza con el perfil de vivienda y luego se desarrollan Presupuestos específicos
