
# Plan: Módulo de Partes de Trabajo

## Resumen

Implementar un sistema de **Partes de Trabajo** dentro de la pestaña "Agenda de Gestión" de cada presupuesto. Este módulo permitirá registrar diariamente los trabajos realizados, incluyendo:

- Titulo y fecha del parte
- Uno o varios trabajos concretos con descripcion, actividad vinculada y fotografias
- Asignacion de trabajadores (usuarios del sistema con rol colaborador/administrador)
- Captura de fotos directamente desde el movil (usando la camara del dispositivo)

---

## Estructura de Datos

Se crearan las siguientes tablas:

```text
+----------------------+        +------------------------+
|   work_reports       |        |  work_report_entries   |
+----------------------+        +------------------------+
| id (PK)              |<------>| id (PK)                |
| budget_id (FK)       |   1:N  | work_report_id (FK)    |
| title                |        | description            |
| report_date          |        | activity_id (FK, null) |
| created_by (FK)      |        | created_at             |
| created_at           |        +------------------------+
| updated_at           |                   |
+----------------------+                   | 1:N
         |                                 v
         | 1:N              +---------------------------+
         v                  | work_report_entry_images  |
+------------------------+  +---------------------------+
| work_report_workers    |  | id (PK)                   |
+------------------------+  | entry_id (FK)             |
| id (PK)                |  | file_name                 |
| work_report_id (FK)    |  | file_path                 |
| profile_id (FK)        |  | file_size                 |
| created_at             |  | file_type                 |
+------------------------+  | uploaded_by (FK, null)    |
                            | created_at                |
                            +---------------------------+
```

### Campos principales:

**work_reports** (Cabecera del Parte):
- `id`: UUID
- `budget_id`: Vinculo al presupuesto
- `title`: Titulo/resumen del parte del dia
- `report_date`: Fecha del parte (default: hoy)
- `created_by`: Usuario que creo el parte
- `created_at`, `updated_at`: Marcas de tiempo

**work_report_workers** (Trabajadores asignados):
- `id`: UUID
- `work_report_id`: Vinculo al parte
- `profile_id`: Vinculo al perfil del trabajador (tabla `profiles`)

**work_report_entries** (Trabajos concretos):
- `id`: UUID
- `work_report_id`: Vinculo al parte padre
- `description`: Descripcion del trabajo realizado
- `activity_id`: Vinculo opcional a la actividad del presupuesto

**work_report_entry_images** (Fotografias):
- `id`: UUID
- `entry_id`: Vinculo a la entrada de trabajo
- `file_name`, `file_path`, `file_size`, `file_type`: Metadatos del archivo
- `uploaded_by`: Usuario que subio la imagen

---

## Integracion con Sistema Actual

### Trabajadores ("QUIEN")

Los trabajadores se obtienen de la tabla `profiles`, filtrados por usuarios con rol `administrador` o `colaborador` en `user_roles`. Esto permite:
- Mostrar lista de personal disponible
- Seleccion multiple de trabajadores por parte
- Nombre completo visible desde el perfil

### Captura de Fotos desde Movil

El sistema actual ya soporta subida de imagenes con `<input type="file" accept="image/*" capture>`. En dispositivos moviles, esto abre directamente la camara. La implementacion:

1. Usar atributo `capture="environment"` para camara trasera
2. Subir imagenes al bucket `resource-images` existente
3. Registrar metadatos en `work_report_entry_images`

---

## Flujo de Usuario

1. Usuario accede a **Presupuesto > Agenda de Gestion**
2. Nuevo boton **"+ Nuevo Parte de Trabajo"** junto a Tarea/Cita
3. Formulario modal con:
   - Campo titulo (breve resumen)
   - Fecha (default: hoy, editable)
   - Selector multiple de trabajadores (lista de colaboradores/admins)
   - Seccion "Trabajos realizados" con boton "+ Anadir trabajo"
4. Cada trabajo incluye:
   - Descripcion (textarea)
   - Selector de ActividadID del presupuesto
   - Boton de camara/galeria para fotos (multiples)
5. Guardar crea el parte con todos sus trabajos e imagenes

---

## Componentes a Crear

| Componente | Descripcion |
|------------|-------------|
| `WorkReportForm.tsx` | Formulario principal del parte de trabajo |
| `WorkReportEntryForm.tsx` | Sub-formulario para cada trabajo concreto |
| `WorkReportWorkerSelect.tsx` | Selector multiple de trabajadores |
| `WorkReportsList.tsx` | Vista de lista de partes en la agenda |
| `WorkReportCard.tsx` | Tarjeta visual para mostrar un parte |

---

## Modificaciones a Archivos Existentes

1. **BudgetAgendaTab.tsx**: Anadir pestana/seccion "Partes de Trabajo"
2. **TaskForm.tsx**: Servira como referencia para el patron de formulario
3. Reutilizar logica de subida de imagenes existente

---

## Detalles Tecnicos

### Migracion de Base de Datos

```sql
-- Tabla principal de partes de trabajo
CREATE TABLE public.work_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trabajadores asignados al parte
CREATE TABLE public.work_report_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(work_report_id, profile_id)
);

-- Entradas/trabajos individuales
CREATE TABLE public.work_report_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  activity_id UUID REFERENCES budget_activities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Imagenes por entrada
CREATE TABLE public.work_report_entry_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES work_report_entries(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE work_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_report_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_report_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_report_entry_images ENABLE ROW LEVEL SECURITY;

-- Politicas basadas en acceso al presupuesto
CREATE POLICY "Users can view work reports for accessible budgets"
  ON work_reports FOR SELECT
  USING (
    budget_id IN (
      SELECT budget_id FROM user_budget_access WHERE user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'
    )
  );

CREATE POLICY "Users can insert work reports for accessible budgets"
  ON work_reports FOR INSERT
  WITH CHECK (
    budget_id IN (
      SELECT budget_id FROM user_budget_access WHERE user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'
    )
  );

CREATE POLICY "Users can update their own work reports"
  ON work_reports FOR UPDATE
  USING (
    created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'
    )
  );

CREATE POLICY "Users can delete their own work reports"
  ON work_reports FOR DELETE
  USING (
    created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrador'
    )
  );

-- Politicas similares para tablas relacionadas
CREATE POLICY "View workers" ON work_report_workers FOR SELECT
  USING (work_report_id IN (SELECT id FROM work_reports));

CREATE POLICY "Manage workers" ON work_report_workers FOR ALL
  USING (work_report_id IN (SELECT id FROM work_reports));

CREATE POLICY "View entries" ON work_report_entries FOR SELECT
  USING (work_report_id IN (SELECT id FROM work_reports));

CREATE POLICY "Manage entries" ON work_report_entries FOR ALL
  USING (work_report_id IN (SELECT id FROM work_reports));

CREATE POLICY "View images" ON work_report_entry_images FOR SELECT
  USING (entry_id IN (SELECT id FROM work_report_entries));

CREATE POLICY "Manage images" ON work_report_entry_images FOR ALL
  USING (entry_id IN (SELECT id FROM work_report_entries));
```

### Captura de Camara Movil

```tsx
// Input con captura directa de camara
<input
  type="file"
  accept="image/*"
  capture="environment"
  multiple
  onChange={handleImageCapture}
/>
```

El atributo `capture="environment"` abre la camara trasera en dispositivos moviles. En desktop, funciona como selector de archivos normal.

### Obtencion de Trabajadores

```tsx
const fetchWorkers = async () => {
  const { data } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      user_roles!inner(role)
    `)
    .in('user_roles.role', ['administrador', 'colaborador']);
  
  return data;
};
```

---

## Casos de Uso Movil

La PWA ya instalada permite:

1. **Acceso offline parcial**: Service worker cachea la app
2. **Camara nativa**: Input file con capture abre camara del dispositivo
3. **Geolocalizacion**: Podria anadirse coordenadas a las fotos
4. **Notificaciones**: Recordatorios de completar partes diarios

---

## Pasos de Implementacion

1. Crear migracion de base de datos con las 4 tablas
2. Aplicar politicas RLS
3. Crear componente `WorkReportForm.tsx` con formulario completo
4. Crear componentes auxiliares (selector trabajadores, entrada de trabajo)
5. Integrar en `BudgetAgendaTab.tsx` como nueva vista/pestana
6. Probar captura de imagenes en movil
7. Anadir vista de lista de partes existentes

---

## Consideraciones Adicionales

- **Almacenamiento de imagenes**: Usar bucket existente `resource-images`
- **Tamano de archivos**: Limitar a 10MB por imagen
- **Compresion**: Considerar comprimir imagenes en cliente antes de subir
- **Firma digital**: Posibilidad futura de firmar partes

