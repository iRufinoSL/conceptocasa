import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTabVisibility, TabVisibilitySettings as TabVisibilitySettingsType } from '@/hooks/useTabVisibility';
import { Save, Loader2 } from 'lucide-react';

const ALL_TABS = [
  { id: 'anteproyecto', label: 'Ante-proyecto', description: 'Referencias catastrales, planos y documentos visuales' },
  { id: 'cuanto-cuesta', label: 'Cuánto cuesta?', description: 'Resumen de costes del presupuesto' },
  { id: 'actividades', label: 'Qué?', description: 'Actividades del presupuesto' },
  { id: 'zonas', label: 'Dónde?', description: 'Zonas de trabajo' },
  { id: 'fases', label: 'Cómo?', description: 'Fases del proyecto' },
  { id: 'timeline', label: 'Cuándo?', description: 'Línea de tiempo del proyecto' },
  { id: 'mediciones', label: 'Mediciones', description: 'Mediciones del presupuesto' },
  { id: 'espacios', label: 'Espacios', description: 'Espacios del proyecto' },
  { id: 'documentos', label: 'Documentos', description: 'Documentos del proyecto vinculados al presupuesto' },
  { id: 'resumen', label: 'Resumen', description: 'Resumen visual del presupuesto' },
  { id: 'contactos', label: 'Quién?', description: 'Contactos asociados al presupuesto' },
  { id: 'config', label: 'Config', description: 'Configuración del presupuesto' },
  { id: 'recursos', label: 'Recursos (CÓMO?)', description: 'Recursos y materiales' },
];

const ROLES = [
  { id: 'administrador' as const, label: 'Administrador', description: 'Acceso completo al sistema' },
  { id: 'colaborador' as const, label: 'Colaborador', description: 'Puede gestionar presupuestos asignados' },
  { id: 'cliente' as const, label: 'Cliente', description: 'Acceso limitado a presupuestos asignados' },
];

export function TabVisibilitySettingsComponent() {
  const { toast } = useToast();
  const { settings, isLoading, updateSettings, refetch } = useTabVisibility();
  const [localSettings, setLocalSettings] = useState<TabVisibilitySettingsType>(settings);
  const [isSaving, setIsSaving] = useState<string | null>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleToggleTab = (role: keyof TabVisibilitySettingsType, tabId: string) => {
    setLocalSettings(prev => {
      const currentTabs = prev[role];
      const newTabs = currentTabs.includes(tabId)
        ? currentTabs.filter(t => t !== tabId)
        : [...currentTabs, tabId];
      return { ...prev, [role]: newTabs };
    });
  };

  const handleSaveRole = async (role: keyof TabVisibilitySettingsType) => {
    setIsSaving(role);
    const success = await updateSettings(role, localSettings[role]);
    setIsSaving(null);
    
    if (success) {
      toast({
        title: 'Guardado',
        description: `Configuración de pestañas para ${ROLES.find(r => r.id === role)?.label} actualizada`,
      });
      refetch();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar la configuración',
      });
    }
  };

  const hasChanges = (role: keyof TabVisibilitySettingsType) => {
    const original = settings[role];
    const current = localSettings[role];
    if (original.length !== current.length) return true;
    return !original.every(tab => current.includes(tab));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Visibilidad de Pestañas por Rol</h3>
        <p className="text-sm text-muted-foreground">
          Configura qué pestañas del presupuesto son visibles para cada rol de usuario.
        </p>
      </div>

      <div className="grid gap-6">
        {ROLES.map(role => (
          <Card key={role.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{role.label}</CardTitle>
                  <CardDescription>{role.description}</CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSaveRole(role.id)}
                  disabled={!hasChanges(role.id) || isSaving === role.id}
                >
                  {isSaving === role.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {ALL_TABS.map(tab => {
                  const isChecked = localSettings[role.id].includes(tab.id);
                  const isDisabled = role.id === 'administrador' && ['actividades', 'config'].includes(tab.id);
                  
                  return (
                    <div key={tab.id} className="flex items-start space-x-3">
                      <Checkbox
                        id={`${role.id}-${tab.id}`}
                        checked={isChecked}
                        onCheckedChange={() => handleToggleTab(role.id, tab.id)}
                        disabled={isDisabled}
                      />
                      <div className="grid gap-0.5 leading-none">
                        <Label
                          htmlFor={`${role.id}-${tab.id}`}
                          className={`text-sm font-medium cursor-pointer ${isDisabled ? 'text-muted-foreground' : ''}`}
                        >
                          {tab.label}
                        </Label>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {tab.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
